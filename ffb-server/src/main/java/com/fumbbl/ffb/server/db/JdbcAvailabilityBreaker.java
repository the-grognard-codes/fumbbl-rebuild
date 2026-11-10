package com.fumbbl.ffb.server.db;

import com.fumbbl.ffb.server.db.JdbcConnections.DeadlineExpired;
import com.fumbbl.ffb.server.db.JdbcConnections.Unavailable;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.function.LongSupplier;

/** One dependency-wide availability breaker; ordinary row contention is not an outage. */
public final class JdbcAvailabilityBreaker {
	private static final int FAILURE_THRESHOLD = 3;
	private static final long COOLDOWN_NANOS = 5_000_000_000L;
	private final LongSupplier nanos;
	private int failures;
	private long opened;
	private long version;
	private boolean open;
	private Probe probe;

	public JdbcAvailabilityBreaker() { this(System::nanoTime); }
	JdbcAvailabilityBreaker(LongSupplier nanos) { this.nanos = nanos; }
	synchronized void requireAvailable() throws Unavailable { requireAvailable(null); }
	synchronized void requireAvailable(Object owner) throws Unavailable {
		if (open && (nanos.getAsLong() - opened < COOLDOWN_NANOS
			|| probe != null && (owner == null || owner != probe.owner))) throw new Unavailable();
	}
	synchronized Lease acquire() throws Unavailable { return acquire(null); }
	synchronized Lease acquire(Object owner) throws Unavailable {
		requireAvailable(owner);
		if (open && probe == null) probe = new Probe(owner);
		Probe admitted = open ? probe : null;
		if (admitted != null) admitted.leases++;
		return new Lease(admitted);
	}
	private final class Probe {
		private final Object owner;
		private int leases;
		private boolean successful;
		Probe(Object owner) { this.owner = owner; }
	}
	final class Lease {
		private final Probe admittedProbe;
		private final long admittedVersion = version;
		private boolean finished;
		Lease(Probe admittedProbe) { this.admittedProbe = admittedProbe; }
		void success() { synchronized (JdbcAvailabilityBreaker.this) {
			if (finished) return;
			finished = true;
			if (admittedProbe != null) finishProbe(true);
			else if (admittedVersion == version) { failures = 0; open = false; }
		} }
		void abandon() { synchronized (JdbcAvailabilityBreaker.this) {
			if (!finished && admittedProbe != null) finishProbe(false);
			finished = true;
		} }
		void failure(SQLException failure) { synchronized (JdbcAvailabilityBreaker.this) {
			if (finished) return;
			if (!availabilityFailure(failure)) return;
			finished = true;
			if (admittedProbe != null) admittedProbe.leases--;
			version++;
			if (admittedProbe != null || ++failures >= FAILURE_THRESHOLD) { open = true; opened = nanos.getAsLong(); }
			probe = null;
		} }
		private void finishProbe(boolean successful) {
			admittedProbe.successful |= successful;
			if (--admittedProbe.leases == 0 && probe == admittedProbe && admittedVersion == version) {
				probe = null;
				if (admittedProbe.successful) { failures = 0; open = false; }
			}
		}
	}
	boolean availabilityFailure(SQLException failure) {
		if (failure instanceof JdbcConnections.NotStarted || failure instanceof DeadlineExpired || failure instanceof Unavailable) return false;
		if (failure.getErrorCode() == 1205 || failure.getErrorCode() == 1213) return false;
		String state = failure.getSQLState();
		if (failure instanceof SQLTimeoutException || state != null && state.startsWith("08")) return true;
		for (Throwable cause = failure.getCause(); cause != null; cause = cause.getCause())
			if (cause instanceof java.net.SocketException || cause instanceof java.net.SocketTimeoutException) return true;
		return false;
	}
}
