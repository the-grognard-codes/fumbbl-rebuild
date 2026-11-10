package com.fumbbl.ffb.server.db;

import com.fumbbl.ffb.server.db.JdbcConnections.CleanupNotStarted;
import com.fumbbl.ffb.server.db.JdbcConnections.CommitNotStarted;
import com.fumbbl.ffb.server.db.JdbcConnections.DeadlineExpired;
import com.fumbbl.ffb.server.db.JdbcConnections.NotStarted;
import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import org.mariadb.jdbc.client.result.CompleteResult;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/** The sole runtime JDBC boundary: fresh properties, one request deadline and cancellable driver I/O. */
public final class JdbcRequestConnections implements JdbcConnections, AutoCloseable {
	static final int WORK_RESERVE_MILLIS = 150; // 100 ms native/CPU plus 50 ms transaction/cleanup reserve.
	static final int COMMIT_RESERVE_MILLIS = 50;
	static final int CLEANUP_CAP_MILLIS = 50;
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final JdbcRequestConfiguration configuration;
	private final JdbcAvailabilityBreaker breaker;
	private final ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1, work -> {
		Thread thread = new Thread(work, "jdbc-deadline-socket-close"); thread.setDaemon(true); return thread;
	});
	private final Set<JdbcDeadlineSocketFactory.TimedSocket> sockets = ConcurrentHashMap.newKeySet();
	private final AtomicLong attempts = new AtomicLong();
	private final AtomicLong acquisitionNanos = new AtomicLong();
	private final AtomicLong acquisitions = new AtomicLong();
	private final boolean pooled;
	private final ArrayDeque<Entry> idle = new ArrayDeque<>();
	private int allocated;
	private volatile boolean stopped;
	private static final int POOL_SIZE = 2;
	private static final long VALIDATE_IDLE_NANOS = 1_000_000_000L;
	private static final Pattern SQL_FUNCTION = Pattern.compile("([A-Z_0-9]+)\\s*\\(");
	private static final Set<String> PURE_SQL_FUNCTIONS = Set.of("COUNT", "SUM", "COALESCE", "IN", "EXISTS", "IFNULL", "MAX", "MIN", "AVG", "CAST", "CONVERT", "LENGTH", "OCTET_LENGTH", "ROUND");
	private static final Set<String> BUFFER_ACCESSORS = Set.of("getString", "getInt", "getLong", "getBoolean", "getDouble", "getFloat", "getShort", "getByte", "getBytes", "wasNull", "findColumn");
	private static final Set<String> COMPLETE_RESULT_ACCESSORS = Set.of("next", "getObject", "getTimestamp", "getDate", "getTime");
	private static final Set<String> PARAMETER_SETTERS = Set.of("setString", "setInt", "setLong", "setBoolean", "setDouble", "setFloat", "setShort", "setByte", "setBytes", "setNull");
	private static final Set<String> LOCAL_CONNECTION_ACCESSORS = Set.of("getAutoCommit", "isClosed", "getNetworkTimeout", "getClientInfo");
	private record Entry(Connection raw, JdbcDeadlineSocketFactory.TimedSocket socket, long returnedAt) { }

	public JdbcRequestConnections(String url, String user, String password) {
		this(url, user, password, false);
	}
	public JdbcRequestConnections(String url, String user, String password, boolean pooled) {
		this(new JdbcRequestConfiguration(url, user, password), new JdbcAvailabilityBreaker(), pooled);
	}
	JdbcRequestConnections(JdbcRequestConfiguration configuration, JdbcAvailabilityBreaker breaker) {
		this(configuration, breaker, false);
	}
	JdbcRequestConnections(JdbcRequestConfiguration configuration, JdbcAvailabilityBreaker breaker, boolean pooled) {
		this.configuration = configuration; this.breaker = breaker;
		this.pooled = pooled;
		timer.setRemoveOnCancelPolicy(true);
	}
	public long connectionAttempts() { return attempts.get(); }
	public long acquisitionNanos() { return acquisitionNanos.get(); }
	public long connectionAcquisitions() { return acquisitions.get(); }
	@Override public void requireAvailable() throws SQLException {
		allowance(timing.budget(), configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false);
		breaker.requireAvailable(timing.budget());
	}
	@Override public Connection open() throws SQLException {
		if (stopped) throw new SQLException("JDBC connection boundary is closed");
		BrowserRequestTiming.Budget budget = timing.budget();
		int connect = allowance(budget, configuration.connectCapMillis(), WORK_RESERVE_MILLIS, false);
		int network = allowance(budget, configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false);
		JdbcAvailabilityBreaker.Lease lease = breaker.acquire(budget);
		Entry borrowed = null;
		boolean reserved = false;
		Connection raw = null;
		try (JdbcDeadlineSocketFactory.Open open = new JdbcDeadlineSocketFactory.Open(configuration, timer, connect, network,
			budget != null && network < configuration.networkCapMillis())) {
			try {
				if (pooled) { borrowed = borrow(); reserved = true; }
				acquisitions.incrementAndGet();
				if (borrowed != null) {
					raw = borrowed.raw();
					Bounded connection = null;
					try {
						if (raw.isClosed() || borrowed.socket().isClosed()) throw new SQLException("Pooled database transport is closed", "08000");
						connection = new Bounded(borrowed, budget, lease);
						connection.validation = open;
						if (System.nanoTime() - borrowed.returnedAt() >= VALIDATE_IDLE_NANOS) {
							try (Statement query = connection.proxy.createStatement(); ResultSet row = query.executeQuery("SELECT 1")) {
								if (!row.next()) throw new SQLException("Database validation failed", "08000");
							}
						}
						connection.validation = null;
						return connection.proxy;
					} catch (SQLException stale) {
						// No application work has used this loan. Keep its reserved slot and
						// breaker lease for one fresh connection within this acquisition deadline.
						if (connection != null) connection.closed = true;
						discardPhysical(borrowed);
						borrowed = null; raw = null;
						if (stale instanceof NotStarted) throw stale;
					}
				}
				int remaining = open.remainingMillis();
				if (remaining <= 0) throw new NotStarted();
				connect = Math.min(remaining, allowance(budget, configuration.connectCapMillis(), WORK_RESERVE_MILLIS, false));
				network = Math.min(remaining, allowance(budget, configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false));
				attempts.incrementAndGet();
				long began = System.nanoTime();
				try { raw = DriverManager.getConnection(configuration.url(), configuration.properties(connect, network)); }
				finally { acquisitionNanos.addAndGet(System.nanoTime() - began); }
				if (open.socket == null) throw new SQLException("Driver bypassed bounded socket factory", "08001");
				if (open.socket.disarm() || open.socket.isClosed() || raw.isClosed())
					throw new SQLTimeoutException("JDBC acquisition exceeded its deadline", "08001");
				sockets.add(open.socket);
				Bounded connection = new Bounded(new Entry(raw, open.socket, System.nanoTime()), budget, lease);
				connection.networkTimeout(allowance(budget, configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false));
				return connection.proxy;
			} catch (SQLException | RuntimeException problem) {
				Exception failure = problem;
				if (failure instanceof SQLException && open.socket == null && open.remainingMillis() <= 0) {
					failure = new NotStarted(); failure.initCause(problem);
				}
				if (failure instanceof SQLException sql && !(failure instanceof NotStarted)
					&& requestExpiry(open.requestDeadlineLimited, open.socket != null && open.socket.disarm(), sql, budget, WORK_RESERVE_MILLIS))
					failure = new DeadlineExpired(sql);
				if (failure instanceof DeadlineExpired) lease.abandon();
				if (failure instanceof NotStarted) lease.abandon();
				else if (failure instanceof SQLException sql) lease.failure(sql);
				lease.abandon();
				if (open.socket != null) { hardClose(open.socket); sockets.remove(open.socket); }
				if (borrowed != null) { hardClose(borrowed.socket()); sockets.remove(borrowed.socket()); }
				if (raw != null) try { raw.close(); } catch (SQLException close) { failure.addSuppressed(close); }
				if (reserved) discardSlot();
				if (failure instanceof SQLException sql) throw sql;
				throw (RuntimeException) failure;
			}
		}
	}
	private void discardPhysical(Entry entry) {
		hardClose(entry.socket()); sockets.remove(entry.socket());
		try { entry.raw().close(); } catch (SQLException ignored) { /* Stale transport is already closed. */ }
	}
	private boolean requestExpiry(boolean limited, boolean expired, SQLException failure, BrowserRequestTiming.Budget budget, int reserve) {
		if (!limited) return false;
		// An actual server rejection remains definite even if cancellation races its reply.
		String state = failure.getSQLState();
		if (failure.getErrorCode() == 1205 || failure.getErrorCode() == 1213
			|| state != null && (state.startsWith("23") || state.startsWith("40"))) return false;
		if (expired) return true;
		if (budget == null || budget.allowanceMillis(Integer.MAX_VALUE, reserve) > 0) return false;
		for (Throwable cause = failure; cause != null; cause = cause.getCause())
			if (cause instanceof java.net.SocketTimeoutException) return true;
		return false;
	}
	/** Waiting for this worker to return its own leases would deadlock; exhaustion fails immediately. */
	private synchronized Entry borrow() throws SQLException {
		if (stopped) throw new SQLException("JDBC connection boundary is closed");
		Entry entry = idle.pollFirst();
		if (entry != null) return entry;
		if (allocated >= POOL_SIZE) throw new SQLException("JDBC connection pool exhausted");
		allocated++; return null;
	}
	private synchronized void discardSlot() { allocated--; }
	private synchronized boolean recycle(Entry entry) {
		if (stopped) return false;
		idle.addLast(new Entry(entry.raw(), entry.socket(), System.nanoTime())); return true;
	}
	private int allowance(BrowserRequestTiming.Budget budget, int cap, int reserve, boolean commit) throws NotStarted {
		int usable = cap <= 0 ? 0 : budget == null ? cap : budget.allowanceMillis(cap, reserve);
		if (usable <= 0) { if (commit) throw new CommitNotStarted(); else throw new NotStarted(); }
		return usable;
	}
	private final class Bounded {
		private JdbcDeadlineSocketFactory.Open validation;
		private final Connection raw;
		private final JdbcDeadlineSocketFactory.TimedSocket socket;
		private final BrowserRequestTiming.Budget budget;
		private final JdbcAvailabilityBreaker.Lease lease;
		private final Connection proxy;
		private final Entry entry;
		private final Set<Statement> statements = new HashSet<>();
		private boolean broken;
		private boolean reusable;
		private boolean closed;
		Bounded(Entry entry, BrowserRequestTiming.Budget budget, JdbcAvailabilityBreaker.Lease lease) throws SQLException {
			this.entry = entry; raw = entry.raw(); socket = entry.socket(); this.budget = budget; this.lease = lease;
			reusable = raw.getAutoCommit();
			proxy = (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] { Connection.class },
				(self, method, arguments) -> {
					if ("abort".equals(method.getName())) { broken = true; lease.abandon(); close(); return null; }
					if ("close".equals(method.getName())) { close(); return null; }
					return call(self, raw, method, arguments, null);
				});
		}
		private Object wrap(Object result, Object statement) {
			if (result instanceof Map<?, ?> map) return new HashMap<>(map);
			if (result == raw) return proxy;
			if (result instanceof Statement sql) {
				statements.add(sql);
				Class<?> type = sql instanceof CallableStatement ? CallableStatement.class : sql instanceof PreparedStatement ? PreparedStatement.class : Statement.class;
				return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type }, (self, method, arguments) ->
					"getConnection".equals(method.getName()) ? proxy : call(self, sql, method, arguments, self));
			}
			if (result instanceof ResultSet rows) return Proxy.newProxyInstance(ResultSet.class.getClassLoader(), new Class<?>[] { ResultSet.class },
				(self, method, arguments) -> "getStatement".equals(method.getName()) && statement != null ? statement : call(self, rows, method, arguments, statement));
			if (result instanceof DatabaseMetaData metadata) {
				reusable = false;
				return Proxy.newProxyInstance(DatabaseMetaData.class.getClassLoader(), new Class<?>[] { DatabaseMetaData.class },
					(self, method, arguments) -> "getConnection".equals(method.getName()) ? proxy : call(self, metadata, method, arguments, null));
			}
			return result;
		}
		private Object call(Object self, Object target, Method method, Object[] arguments, Object statement) throws Throwable {
			String name = method.getName();
			if (method.getDeclaringClass() == Object.class) return switch (name) {
				case "toString" -> "Bounded JDBC " + target.getClass().getSimpleName();
				case "hashCode" -> System.identityHashCode(self);
				case "equals" -> arguments[0] == self;
				default -> throw new IllegalStateException("Unsupported Object method");
			};
			if ("isWrapperFor".equals(name)) return ((Class<?>) arguments[0]).isInstance(self);
			if ("unwrap".equals(name)) {
				if (((Class<?>) arguments[0]).isInstance(self)) return self;
				throw new SQLException("Unwrapping would bypass JDBC request controls");
			}
			if (closed) {
				if ("close".equals(name)) return null;
				if ("isClosed".equals(name)) return true;
				throw new SQLException("JDBC connection lease is closed");
			}
			boolean cleanup = "close".equals(name) || "rollback".equals(name);
			boolean commit = "commit".equals(name);
			if (target instanceof ResultSet && (name.startsWith("update") || "insertRow".equals(name) || "deleteRow".equals(name))) reusable = false;
			if (target == raw && (name.startsWith("set") && !"setNetworkTimeout".equals(name) || commit || "rollback".equals(name))) reusable = false;
			if ((name.startsWith("prepare") || name.startsWith("execute") || "addBatch".equals(name))
				&& arguments != null && arguments.length > 0 && arguments[0] instanceof String sql && !pureRead(sql)) reusable = false;
			int cap = cleanup ? CLEANUP_CAP_MILLIS : validation == null ? configuration.networkCapMillis()
				: Math.min(configuration.connectCapMillis(), validation.remainingMillis());
			int reserve = cleanup ? 0 : commit ? COMMIT_RESERVE_MILLIS : WORK_RESERVE_MILLIS;
			boolean deadlineLimited = false, expired = false;
			try {
				int millis = allowance(budget, cap, reserve, commit);
				deadlineLimited = budget != null && millis < cap
					|| validation != null && validation.requestDeadlineLimited && cap < configuration.connectCapMillis();
				// These pinned-driver operations only touch bound parameters or an already-read row.
				// Only the exact pinned fully buffered result can advance without network I/O;
				// streaming/updatable next(), execute, prepare, commit and cleanup retain timers.
				if (target instanceof ResultSet && BUFFER_ACCESSORS.contains(name)
					|| target.getClass() == CompleteResult.class && COMPLETE_RESULT_ACCESSORS.contains(name)
					|| target instanceof PreparedStatement && !(target instanceof CallableStatement)
						&& PARAMETER_SETTERS.contains(name) && arguments != null && arguments[0] instanceof Integer
					|| target == raw && LOCAL_CONNECTION_ACCESSORS.contains(name)) {
					Object value = invoke(target, method, arguments);
					if (value instanceof Properties properties) { Properties copy = new Properties(); copy.putAll(properties); return copy; }
					return value;
				}
				if ("setNetworkTimeout".equals(name)) {
					int requested = (int) arguments[1];
					if (requested <= 0) throw new SQLException("Unlimited JDBC network timeout forbidden");
					millis = Math.min(millis, requested);
				}
				networkTimeout(millis);
				socket.arm(millis);
				Object result;
				try {
					result = "setNetworkTimeout".equals(name) ? null : invoke(target, method, arguments);
				} finally { expired = socket.disarm(); }
				if (expired) throw new SQLTimeoutException("JDBC I/O exceeded its allowance", "08000");
				if ("close".equals(name) && target instanceof Statement sql) statements.remove(sql);
				return wrap(result, statement);
			} catch (SQLException failure) {
				if (requestExpiry(deadlineLimited, expired, failure, budget, reserve)) failure = new DeadlineExpired(failure);
				if (breaker.availabilityFailure(failure) || failure instanceof NotStarted || failure instanceof DeadlineExpired) broken = true;
				if (validation == null) {
					if (failure instanceof NotStarted || failure instanceof DeadlineExpired) lease.abandon(); else lease.failure(failure);
				}
				if (cleanup) hardClose(socket);
				if (cleanup && failure instanceof NotStarted) throw new CleanupNotStarted();
				throw failure;
			}
		}
		private void networkTimeout(int millis) throws SQLException {
			// In pinned Connector/J this getter reads the client's current integer field.
			// Recompute every allowance, but avoid repeating the same native socket option.
			if (raw.getNetworkTimeout() != millis) raw.setNetworkTimeout(Runnable::run, millis);
		}
		private synchronized void close() throws SQLException {
			if (closed) return;
			closed = true;
			boolean recycled = false;
			boolean deadlineLimited = false, expired = false;
			try {
				if (broken || stopped) { lease.abandon(); return; }
				int millis = allowance(budget, CLEANUP_CAP_MILLIS, 0, false);
				deadlineLimited = budget != null && millis < CLEANUP_CAP_MILLIS;
				if (!raw.isClosed()) networkTimeout(millis);
				socket.arm(millis);
				try {
					for (Statement statement : statements) statement.close();
					statements.clear();
					if (pooled && reusable) raw.clearWarnings();
					else raw.close();
				} finally { expired = socket.disarm(); }
				if (expired) throw new SQLTimeoutException("JDBC connection cleanup exceeded its deadline", "08000");
				lease.success();
				if (pooled && reusable) recycled = recycle(entry);
			} catch (SQLException failure) {
				if (requestExpiry(deadlineLimited, expired, failure, budget, 0)) failure = new DeadlineExpired(failure);
				if (failure instanceof NotStarted || failure instanceof DeadlineExpired) lease.abandon(); else lease.failure(failure);
				if (failure instanceof NotStarted) throw new CleanupNotStarted();
				throw failure;
			} finally {
				if (!recycled) {
					hardClose(socket); sockets.remove(socket);
					try { raw.close(); } catch (SQLException ignored) { /* Physical socket already terminated. */ }
					if (pooled) discardSlot();
				}
				lease.abandon();
			}
		}
	}
	/** Only unchanged, side-effect-free autocommit reads can reuse a physical session. */
	private boolean pureRead(String sql) {
		String text = sql.stripLeading().toUpperCase(Locale.ROOT);
		if (text.chars().anyMatch(character -> character > 127)) return false;
		if (!(text.startsWith("SELECT ") || text.startsWith("SHOW ")) || text.contains("@") || text.contains("$") || text.contains(";") || text.contains("`") || text.contains("\"")
			|| text.contains("/*") || text.contains("--") || text.contains("#")) return false;
		var functions = SQL_FUNCTION.matcher(text);
		while (functions.find()) if (!PURE_SQL_FUNCTIONS.contains(functions.group(1))
			|| text.substring(0, functions.start()).stripTrailing().endsWith(".")) return false;
		return true;
	}
	private Object invoke(Object target, Method method, Object[] arguments) throws Throwable {
		try { return method.invoke(target, arguments); }
		catch (InvocationTargetException failure) { throw failure.getCause(); }
	}
	private void hardClose(JdbcDeadlineSocketFactory.TimedSocket socket) {
		try { socket.close(); } catch (IOException ignored) { /* Native transport is already closed. */ }
	}
	@Override public void close() {
		synchronized (this) { stopped = true; idle.clear(); }
		for (JdbcDeadlineSocketFactory.TimedSocket socket : sockets) hardClose(socket);
		sockets.clear(); timer.shutdownNow();
	}
}
