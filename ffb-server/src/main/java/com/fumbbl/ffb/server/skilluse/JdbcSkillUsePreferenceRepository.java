package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;
import com.fumbbl.ffb.server.db.JdbcRequestConnections.NotStarted;
import com.fumbbl.ffb.server.db.JdbcRequestConnections.CleanupNotStarted;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/** One row per account/use case prevents concurrent devices overwriting unrelated settings. */
public final class JdbcSkillUsePreferenceRepository implements SkillUsePreferenceRepository {
	private final JdbcMatchMembershipRepository.Connections connections;
	public JdbcSkillUsePreferenceRepository(JdbcMatchMembershipRepository.Connections connections) { this.connections = connections; }
	@Override public SkillUsePreferences load(String accountId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT use_case,mode FROM ffb_v2_skill_use_preferences WHERE account_id=?")) {
			query.setString(1, accountId);
			SkillUsePreferences result = SkillUsePreferences.defaults();
			try (ResultSet rows = query.executeQuery()) {
				while (rows.next()) {
					try { result = result.with(SkillUsePreferences.UseCase.fromKey(rows.getString(1)), SkillUsePreferences.Mode.fromKey(rows.getString(2))); }
					catch (IllegalArgumentException corrupt) { throw new SQLException("Invalid stored skill use preference", corrupt); }
				}
			}
			return result;
		}
	}
	@Override public void update(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) throws SQLException {
		boolean uncertain = false;
		try (Connection connection = connections.open()) {
			boolean autoCommit = connection.getAutoCommit();
			try {
				try (PreparedStatement update = connection.prepareStatement(
					"INSERT INTO ffb_v2_skill_use_preferences(account_id,use_case,mode) VALUES (?,?,?) ON DUPLICATE KEY UPDATE mode=VALUES(mode)")) {
					update.setString(1, accountId); update.setString(2, useCase.key()); update.setString(3, mode.key());
					uncertain = autoCommit;
					update.executeUpdate();
				}
				if (!autoCommit) { uncertain = true; connection.commit(); }
			} catch (SQLException failure) {
				if (!autoCommit) try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
				throw failure;
			}
		} catch (SQLException failure) {
			if (failure instanceof NotStarted && !(failure instanceof CleanupNotStarted) || !uncertain) throw failure;
			if (failure.getErrorCode() == 1205 || "40001".equals(failure.getSQLState())) throw failure;
			if (failure.getSQLState() != null && failure.getSQLState().startsWith("23")) throw failure;
			try { if (confirmed(accountId, useCase, mode)) return; }
			catch (SQLException readback) { failure.addSuppressed(readback); }
			throw new OutcomeUnknown(failure);
		}
	}
	private boolean confirmed(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT mode FROM ffb_v2_skill_use_preferences WHERE account_id=? AND use_case=?")) {
			query.setString(1, accountId); query.setString(2, useCase.key());
			try (ResultSet rows = query.executeQuery()) { return rows.next() && mode.key().equals(rows.getString(1)); }
		}
	}
}
