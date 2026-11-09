package com.fumbbl.ffb.server.db;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;
import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;

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
public final class JdbcRequestConnections implements JdbcMatchMembershipRepository.Connections, AutoCloseable {
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
	private JdbcRequestConnections(JdbcRequestConfiguration configuration, JdbcAvailabilityBreaker breaker, boolean pooled) {
		this.configuration = configuration; this.breaker = breaker;
		this.pooled = pooled;
		timer.setRemoveOnCancelPolicy(true);
	}
	public long connectionAttempts() { return attempts.get(); }
	public long acquisitionNanos() { return acquisitionNanos.get(); }
	public long connectionAcquisitions() { return acquisitions.get(); }
	@Override public void requireAvailable() throws SQLException {
		allowance(timing.budget(), configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false);
		breaker.requireAvailable();
	}
	@Override public Connection open() throws SQLException {
		if (stopped) throw new SQLException("JDBC connection boundary is closed");
		BrowserRequestTiming.Budget budget = timing.budget();
		int connect = allowance(budget, configuration.connectCapMillis(), WORK_RESERVE_MILLIS, false);
		int network = allowance(budget, configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false);
		JdbcAvailabilityBreaker.Lease lease = breaker.acquire();
		Entry borrowed = null;
		boolean reserved = false;
		Connection raw = null;
		try (JdbcDeadlineSocketFactory.Open open = new JdbcDeadlineSocketFactory.Open(configuration, timer, connect, network)) {
			try {
				if (pooled) { borrowed = borrow(); reserved = true; }
				acquisitions.incrementAndGet();
				if (borrowed != null) {
					raw = borrowed.raw();
					Bounded connection = new Bounded(borrowed, budget, lease);
					if (raw.isClosed() || borrowed.socket().isClosed()) throw new SQLException("Pooled database transport is closed", "08000");
					if (System.nanoTime() - borrowed.returnedAt() >= VALIDATE_IDLE_NANOS) {
						connection.phaseCapMillis = configuration.connectCapMillis();
						try {
							try (Statement query = connection.proxy.createStatement(); ResultSet row = query.executeQuery("SELECT 1")) {
								if (!row.next()) throw new SQLException("Database validation failed", "08000");
							}
						} finally { connection.phaseCapMillis = configuration.networkCapMillis(); }
					}
					return connection.proxy;
				}
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
			} catch (SQLException | RuntimeException failure) {
				if (failure instanceof NotStarted) lease.abandon();
				else if (failure instanceof SQLException sql) lease.failure(sql);
				lease.abandon();
				if (open.socket != null) { hardClose(open.socket); sockets.remove(open.socket); }
				if (borrowed != null) { hardClose(borrowed.socket()); sockets.remove(borrowed.socket()); }
				if (raw != null) try { raw.close(); } catch (SQLException close) { failure.addSuppressed(close); }
				if (reserved) discardSlot();
				throw failure;
			}
		}
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
		int usable = budget == null ? cap : budget.allowanceMillis(cap, reserve);
		if (usable <= 0) { if (commit) throw new CommitNotStarted(); else throw new NotStarted(); }
		return usable;
	}
	/** This failure proves the operation was refused before contacting the database. */
	public static class NotStarted extends SQLTimeoutException {
		public NotStarted() { super("Request budget exhausted before JDBC operation", "HYT00"); }
	}
	/** Transaction repositories must not classify a refused COMMIT as an attempted commit. */
	public static final class CommitNotStarted extends NotStarted { public CommitNotStarted() { } }
	/** Cleanup refusal does not establish the outcome of preceding writes. */
	public static final class CleanupNotStarted extends NotStarted { public CleanupNotStarted() { } }

	private final class Bounded {
		private int phaseCapMillis = configuration.networkCapMillis();
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
			int cap = cleanup ? CLEANUP_CAP_MILLIS : Math.min(configuration.networkCapMillis(), phaseCapMillis);
			int reserve = cleanup ? 0 : commit ? COMMIT_RESERVE_MILLIS : WORK_RESERVE_MILLIS;
			try {
				int millis = allowance(budget, cap, reserve, commit);
				// These pinned-driver operations only touch bound parameters or an already-read row.
				// next()/execute/prepare/commit/cleanup remain actual I/O boundaries with fresh limits.
				if (target instanceof ResultSet && BUFFER_ACCESSORS.contains(name)
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
				boolean expired;
				try {
					result = "setNetworkTimeout".equals(name) ? null : invoke(target, method, arguments);
				} finally { expired = socket.disarm(); }
				if (cleanup && expired) throw new SQLTimeoutException("JDBC cleanup exceeded its deadline", "08000");
				if ("close".equals(name) && target instanceof Statement sql) statements.remove(sql);
				return wrap(result, statement);
			} catch (SQLException failure) {
				if (breaker.availabilityFailure(failure) || failure instanceof NotStarted) broken = true;
				if (failure instanceof NotStarted) lease.abandon(); else lease.failure(failure);
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
			try {
				if (broken || stopped) { lease.abandon(); return; }
				int millis = allowance(budget, CLEANUP_CAP_MILLIS, 0, false);
				if (!raw.isClosed()) networkTimeout(millis);
				socket.arm(millis);
				boolean expired;
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
				if (failure instanceof NotStarted) lease.abandon(); else lease.failure(failure);
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
