package com.fumbbl.ffb.server.db;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.SQLTransientConnectionException;

/** Repository connection/admission contract, independent of pooling and driver enforcement. */
@FunctionalInterface
public interface JdbcConnections {
	int WORK_RESERVE_MILLIS = 150; // 100 ms native/CPU plus 50 ms transaction/cleanup reserve.
	Connection open() throws SQLException;
	default void requireAvailable() throws SQLException { }

	/** The JDBC operation was refused before it started. */
	class NotStarted extends SQLTimeoutException {
		public NotStarted() { super("JDBC allowance exhausted before operation", "HYT00"); }
	}
	final class CommitNotStarted extends NotStarted { public CommitNotStarted() { } }
	/** Cleanup refusal does not establish the outcome of preceding writes. */
	final class CleanupNotStarted extends NotStarted { public CleanupNotStarted() { } }
	/** I/O started and may have committed; the request deadline is not a database outage. */
	final class DeadlineExpired extends SQLTimeoutException {
		public DeadlineExpired(SQLException cause) { super("Request deadline expired during JDBC I/O", "HYT00", cause); }
	}
	final class Unavailable extends SQLTransientConnectionException {
		public Unavailable() { super("Database temporarily unavailable", "08001"); }
	}
}
