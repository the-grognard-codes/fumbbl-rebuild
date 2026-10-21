package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;

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
		try (Connection connection = connections.open(); PreparedStatement update = connection.prepareStatement(
			"INSERT INTO ffb_v2_skill_use_preferences(account_id,use_case,mode) VALUES (?,?,?) ON DUPLICATE KEY UPDATE mode=VALUES(mode)")) {
			update.setString(1, accountId); update.setString(2, useCase.key()); update.setString(3, mode.key());
			update.executeUpdate();
			// Production connection factories disable autocommit; acknowledge only durable writes.
			if (!connection.getAutoCommit()) connection.commit();
		}
	}
}
