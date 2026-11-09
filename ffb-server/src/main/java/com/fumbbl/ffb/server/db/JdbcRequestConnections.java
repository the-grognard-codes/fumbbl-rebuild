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
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicLong;

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

	public JdbcRequestConnections(String url, String user, String password) {
		this(new JdbcRequestConfiguration(url, user, password), new JdbcAvailabilityBreaker());
	}
	JdbcRequestConnections(JdbcRequestConfiguration configuration, JdbcAvailabilityBreaker breaker) {
		this.configuration = configuration; this.breaker = breaker;
		timer.setRemoveOnCancelPolicy(true);
	}
	public long connectionAttempts() { return attempts.get(); }
	public long acquisitionNanos() { return acquisitionNanos.get(); }
	@Override public void requireAvailable() throws SQLException {
		allowance(timing.budget(), configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false);
		breaker.requireAvailable();
	}
	@Override public Connection open() throws SQLException {
		BrowserRequestTiming.Budget budget = timing.budget();
		int connect = allowance(budget, configuration.connectCapMillis(), WORK_RESERVE_MILLIS, false);
		int network = allowance(budget, configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false);
		JdbcAvailabilityBreaker.Lease lease = breaker.acquire();
		Connection raw = null;
		try (JdbcDeadlineSocketFactory.Open open = new JdbcDeadlineSocketFactory.Open(configuration, timer, connect, network)) {
			try {
				attempts.incrementAndGet();
				long began = System.nanoTime();
				try { raw = DriverManager.getConnection(configuration.url(), configuration.properties(connect, network)); }
				finally { acquisitionNanos.addAndGet(System.nanoTime() - began); }
				if (open.socket == null) throw new SQLException("Driver bypassed bounded socket factory", "08001");
				open.socket.disarm();
				sockets.add(open.socket);
				Bounded connection = new Bounded(raw, open.socket, budget, lease);
				raw.setNetworkTimeout(Runnable::run, allowance(budget, configuration.networkCapMillis(), WORK_RESERVE_MILLIS, false));
				return connection.proxy;
			} catch (SQLException | RuntimeException failure) {
				if (failure instanceof NotStarted) lease.abandon();
				else if (failure instanceof SQLException sql) lease.failure(sql);
				lease.abandon();
				if (open.socket != null) { hardClose(open.socket); sockets.remove(open.socket); }
				if (raw != null) try { raw.close(); } catch (SQLException close) { failure.addSuppressed(close); }
				throw failure;
			}
		}
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
		private final Connection raw;
		private final JdbcDeadlineSocketFactory.TimedSocket socket;
		private final BrowserRequestTiming.Budget budget;
		private final JdbcAvailabilityBreaker.Lease lease;
		private final Connection proxy;
		private boolean closed;
		Bounded(Connection raw, JdbcDeadlineSocketFactory.TimedSocket socket, BrowserRequestTiming.Budget budget, JdbcAvailabilityBreaker.Lease lease) {
			this.raw = raw; this.socket = socket; this.budget = budget; this.lease = lease;
			proxy = (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] { Connection.class },
				(self, method, arguments) -> {
					if ("close".equals(method.getName()) || "abort".equals(method.getName())) { close(); return null; }
					return call(self, raw, method, arguments, null);
				});
		}
		private Object wrap(Object result, Object statement) {
			if (result == raw) return proxy;
			if (result instanceof Statement sql) {
				Class<?> type = sql instanceof CallableStatement ? CallableStatement.class : sql instanceof PreparedStatement ? PreparedStatement.class : Statement.class;
				return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type }, (self, method, arguments) ->
					"getConnection".equals(method.getName()) ? proxy : call(self, sql, method, arguments, self));
			}
			if (result instanceof ResultSet rows) return Proxy.newProxyInstance(ResultSet.class.getClassLoader(), new Class<?>[] { ResultSet.class },
				(self, method, arguments) -> "getStatement".equals(method.getName()) && statement != null ? statement : call(self, rows, method, arguments, statement));
			if (result instanceof DatabaseMetaData metadata) return Proxy.newProxyInstance(DatabaseMetaData.class.getClassLoader(), new Class<?>[] { DatabaseMetaData.class },
				(self, method, arguments) -> "getConnection".equals(method.getName()) ? proxy : call(self, metadata, method, arguments, null));
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
			boolean cleanup = "close".equals(name) || "rollback".equals(name);
			boolean commit = "commit".equals(name);
			int cap = cleanup ? CLEANUP_CAP_MILLIS : configuration.networkCapMillis();
			int reserve = cleanup ? 0 : commit ? COMMIT_RESERVE_MILLIS : WORK_RESERVE_MILLIS;
			try {
				int millis = allowance(budget, cap, reserve, commit);
				if ("setNetworkTimeout".equals(name)) {
					int requested = (int) arguments[1];
					if (requested <= 0) throw new SQLException("Unlimited JDBC network timeout forbidden");
					millis = Math.min(millis, requested);
				}
				raw.setNetworkTimeout(Runnable::run, millis);
				socket.arm(millis);
				Object result;
				boolean expired;
				try {
					result = "setNetworkTimeout".equals(name) ? null : invoke(target, method, arguments);
				} finally { expired = socket.disarm(); }
				if (cleanup && expired) throw new SQLTimeoutException("JDBC cleanup exceeded its deadline", "08000");
				return wrap(result, statement);
			} catch (SQLException failure) {
				if (failure instanceof NotStarted) lease.abandon(); else lease.failure(failure);
				if (cleanup) hardClose(socket);
				if (cleanup && failure instanceof NotStarted) throw new CleanupNotStarted();
				throw failure;
			}
		}
		private void close() throws SQLException {
			if (closed) return;
			closed = true;
			try {
				int millis = allowance(budget, CLEANUP_CAP_MILLIS, 0, false);
				if (!raw.isClosed()) raw.setNetworkTimeout(Runnable::run, millis);
				socket.arm(millis);
				boolean expired;
				try { raw.close(); } finally { expired = socket.disarm(); }
				if (expired) throw new SQLTimeoutException("JDBC connection cleanup exceeded its deadline", "08000");
				lease.success();
			} catch (SQLException failure) {
				if (failure instanceof NotStarted) lease.abandon(); else lease.failure(failure);
				if (failure instanceof NotStarted) throw new CleanupNotStarted();
				throw failure;
			} finally {
				hardClose(socket); sockets.remove(socket);
				try { raw.close(); } catch (SQLException ignored) { /* Physical socket already terminated. */ }
				lease.abandon();
			}
		}
	}
	private Object invoke(Object target, Method method, Object[] arguments) throws Throwable {
		try { return method.invoke(target, arguments); }
		catch (InvocationTargetException failure) { throw failure.getCause(); }
	}
	private void hardClose(JdbcDeadlineSocketFactory.TimedSocket socket) {
		try { socket.close(); } catch (IOException ignored) { /* Native transport is already closed. */ }
	}
	@Override public void close() {
		for (JdbcDeadlineSocketFactory.TimedSocket socket : sockets) hardClose(socket);
		sockets.clear(); timer.shutdownNow();
	}
}
