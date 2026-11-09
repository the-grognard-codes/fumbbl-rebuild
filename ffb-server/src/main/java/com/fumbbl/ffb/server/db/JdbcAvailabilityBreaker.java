package com.fumbbl.ffb.server.db;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.SQLTransientConnectionException;
import java.util.function.LongSupplier;

/** One dependency-wide availability breaker; ordinary row contention is not an outage. */
public final class JdbcAvailabilityBreaker {
	private static final int FAILURE_THRESHOLD = 3;
	private static final long COOLDOWN_NANOS = 5_000_000_000L;
	private final LongSupplier nanos;
	private int failures;
	private long opened;
	private long version;
	private boolean open, probing;

	public JdbcAvailabilityBreaker() { this(System::nanoTime); }
	JdbcAvailabilityBreaker(LongSupplier nanos) { this.nanos = nanos; }
	synchronized void requireAvailable() throws Unavailable {
		if (open && (probing || nanos.getAsLong() - opened < COOLDOWN_NANOS)) throw new Unavailable();
	}
	synchronized Lease acquire() throws Unavailable {
		requireAvailable();
		boolean probe = open;
		if (probe) probing = true;
		return new Lease(probe);
	}
	public static final class Unavailable extends SQLTransientConnectionException {
		Unavailable() { super("Database temporarily unavailable", "08001"); }
	}
	final class Lease {
		private final boolean probe;
		private final long admittedVersion = version;
		private boolean finished;
		Lease(boolean probe) { this.probe = probe; }
		void success() { synchronized (JdbcAvailabilityBreaker.this) {
			if (finished) return;
			finished = true;
			if (admittedVersion == version) { failures = 0; open = false; probing = false; }
		} }
		void abandon() { synchronized (JdbcAvailabilityBreaker.this) {
			if (!finished && probe) probing = false;
			finished = true;
		} }
		void failure(SQLException failure) { synchronized (JdbcAvailabilityBreaker.this) {
			if (finished) return;
			if (!availabilityFailure(failure)) return;
			finished = true;
			version++;
			if (probe || ++failures >= FAILURE_THRESHOLD) { open = true; opened = nanos.getAsLong(); }
			probing = false;
		} }
	}
	boolean availabilityFailure(SQLException failure) {
		if (failure instanceof JdbcRequestConnections.NotStarted || failure instanceof Unavailable) return false;
		if (failure.getErrorCode() == 1205 || failure.getErrorCode() == 1213) return false;
		String state = failure.getSQLState();
		if (failure instanceof SQLTimeoutException || state != null && state.startsWith("08")) return true;
		for (Throwable cause = failure.getCause(); cause != null; cause = cause.getCause())
			if (cause instanceof java.net.SocketException || cause instanceof java.net.SocketTimeoutException) return true;
		return false;
	}
}
