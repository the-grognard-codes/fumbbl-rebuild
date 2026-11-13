package com.fumbbl.ffb.server.match;

import java.sql.SQLException;
import java.util.Set;
import java.util.logging.Logger;

/** Match diagnostics keep driver text, SQL, parameters and exception causes out of logs. */
public final class MatchPersistenceLog {
	private static final Logger LOG = Logger.getLogger("com.fumbbl.ffb.server.match.persistence");
	private static final Set<String> SAFE_MESSAGES = Set.of(
		"JDBC allowance exhausted before operation", "Request deadline expired during JDBC I/O",
		"JDBC acquisition exceeded its deadline", "JDBC I/O exceeded its allowance",
		"JDBC connection cleanup exceeded its deadline", "Database temporarily unavailable",
		"JDBC connection pool exhausted", "JDBC connection lease is closed",
		"JDBC connection boundary is closed", "Local publication authorization is unavailable",
		"Invalid stored skill use preference", "Recovery journal byte limit", "Recovery schema unavailable",
		"Unexpected recovery write count", "Unexpected recovery journal write count", "Unexpected lobby recovery row count");

	public void rejected(String phase, String matchId, String requestId, SQLException failure) {
		write("PERSISTENCE_FAILED", phase, matchId, requestId, failure);
	}

	void completionPending(String matchId, String requestId, SQLException failure) {
		write("COMPLETION_PENDING", "completion", matchId, requestId, failure);
	}

	void pendingCompletionFailed(String matchId, Exception failure) {
		write("PERSISTENCE_FAILED", "pending-completion", matchId, null, failure);
	}

	private void write(String code, String phase, String matchId, String requestId, Exception failure) {
		String message = failure.getMessage();
		String sql = failure instanceof SQLException sqlFailure
			? " sqlState=" + correlation(sqlFailure.getSQLState(), "[0-9A-Z]{5}") + " errorCode=" + sqlFailure.getErrorCode()
			: "";
		LOG.warning(code + " phase=" + phase
			+ " matchId=" + correlation(matchId, "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
			+ " requestId=" + correlation(requestId, "[A-Za-z0-9_-]{1,100}")
			+ " exception=" + failure.getClass().getSimpleName()
			+ sql
			+ " message=" + (message != null && SAFE_MESSAGES.contains(message) ? message : "[redacted]"));
	}

	private String correlation(String value, String pattern) {
		return value != null && value.matches(pattern) ? value : "unavailable";
	}
}
