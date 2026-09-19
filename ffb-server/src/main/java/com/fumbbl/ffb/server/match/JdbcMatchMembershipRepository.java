package com.fumbbl.ffb.server.match;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/** Short JDBC operations over the v2 copied-storage membership table. */
public final class JdbcMatchMembershipRepository implements MatchMembershipRepository {
	public interface Connections { Connection open() throws SQLException; }
	private final Connections connections;

	public JdbcMatchMembershipRepository(Connections connections) { this.connections = connections; }

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

	@Override public void insert(MatchMembership membership) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement statement = connection.prepareStatement(
			"INSERT INTO ffb_v2_match_members(matchid,account_id,role) VALUES (?,?,?)")) {
			statement.setString(1, membership.matchId); statement.setString(2, membership.accountId); statement.setString(3, membership.role);
			if (statement.executeUpdate() != 1) throw new SQLException("Unexpected membership write count");
		}
	}
}
