package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.db.JdbcConnections.CleanupNotStarted;
import com.fumbbl.ffb.server.db.JdbcConnections.NotStarted;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Short JDBC operations over the v2 copied-storage membership table. */
public final class JdbcMatchMembershipRepository implements MatchMembershipRepository {
	private final JdbcConnections connections;

	public JdbcMatchMembershipRepository(JdbcConnections connections) { this.connections = connections; }

	@Override public MatchMembership find(String matchId, String accountId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT matchid,account_id,role FROM ffb_v2_match_members WHERE matchid=? AND account_id=?")) {
			query.setString(1, matchId); query.setString(2, accountId);
			try (ResultSet rows = query.executeQuery()) {
				return rows.next() ? new MatchMembership(rows.getString(1), rows.getString(2), rows.getString(3)) : null;
			}
		}
	}

	@Override public String accountForRole(String matchId, String role) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT account_id FROM ffb_v2_match_members WHERE matchid=? AND role=?")) {
			query.setString(1, matchId); query.setString(2, role);
			try (ResultSet rows = query.executeQuery()) { return rows.next() ? rows.getString(1) : null; }
		}
	}

	@Override public boolean hasMatch(String matchId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT 1 FROM ffb_v2_match_members WHERE matchid=? LIMIT 1")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) { return rows.next(); }
		}
	}

	@Override public java.util.List<String> activeMatches() throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT p.match_id FROM ffb_prepared_matches p JOIN ffb_v2_match_members m ON m.matchid=p.match_id "
			+ "WHERE p.document_version=3 GROUP BY p.match_id HAVING COUNT(*)=2 ORDER BY p.match_id LIMIT 100")) {
			java.util.List<String> result = new java.util.ArrayList<>();
			try (ResultSet rows = query.executeQuery()) { while (rows.next()) result.add(rows.getString(1)); }
			return result;
		}
	}

	@Override public boolean isActive(String matchId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT COUNT(*) FROM ffb_v2_match_members m JOIN ffb_prepared_matches p ON p.match_id=m.matchid WHERE m.matchid=? AND p.document_version=3")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) { return rows.next() && rows.getInt(1) == 2; }
		}
	}

	@Override public List<MatchMembership> unfinishedMatches(String accountId, String afterMatchId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT m.matchid,m.role FROM ffb_v2_match_members m FORCE INDEX (ffb_v2_match_members_account) JOIN ffb_prepared_matches p ON p.match_id=m.matchid "
				+ "WHERE m.account_id=? AND m.matchid>? AND p.document_version BETWEEN 1 AND 3 ORDER BY m.matchid LIMIT 101")) {
			query.setString(1, accountId);
			query.setString(2, afterMatchId == null ? "" : afterMatchId);
			List<MatchMembership> result = new ArrayList<>();
			try (ResultSet rows = query.executeQuery()) {
				while (rows.next()) result.add(new MatchMembership(rows.getString(1), accountId, rows.getString(2)));
			}
			return result;
		}
	}

	/**
	 * Ensures this exact durable membership, including an ordinary identical duplicate.
	 * This permits exact retries across requests after an acknowledgement is lost;
	 * conflicting roles retain the duplicate-key failure and are never overwritten.
	 */
	@Override public void insert(MatchMembership membership) throws SQLException {
		boolean uncertain = false;
		try (Connection connection = connections.open()) {
			boolean autoCommit = connection.getAutoCommit();
			try {
				try (PreparedStatement statement = connection.prepareStatement("INSERT INTO ffb_v2_match_members(matchid,account_id,role) VALUES (?,?,?)")) {
					statement.setString(1, membership.matchId); statement.setString(2, membership.accountId); statement.setString(3, membership.role);
					uncertain = autoCommit;
					if (statement.executeUpdate() != 1) throw new SQLException("Unexpected membership write count");
				}
				if (!autoCommit) { uncertain = true; connection.commit(); }
			} catch (SQLException failure) {
				if (!autoCommit) try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
				throw failure;
			}
		} catch (SQLException failure) {
			if (failure instanceof NotStarted && !(failure instanceof CleanupNotStarted)) throw failure;
			if (failure.getErrorCode() == 1205 || "40001".equals(failure.getSQLState())) throw failure;
			boolean duplicate = "23000".equals(failure.getSQLState()) && failure.getErrorCode() == 1062;
			if (!duplicate && failure.getSQLState() != null && failure.getSQLState().startsWith("23")) throw failure;
			if (!uncertain && !duplicate) throw failure;
			// One bounded readback; no write is blindly repeated inside this request.
			try {
				MatchMembership durable = find(membership.matchId, membership.accountId);
				if (durable != null && membership.role.equals(durable.role)) return;
			} catch (SQLException readback) { failure.addSuppressed(readback); }
			if (duplicate) throw failure;
			throw new OutcomeUnknown(failure);
		}
	}
}
