package com.fumbbl.ffb.server.team;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Dedicated administrator connection. Locks each selected row before comparing its exact planned bytes. */
public final class JdbcObsoleteSavedTeamStore implements ObsoleteSavedTeamCleanup.Store {
	private final JdbcSavedTeamRepository.Connections connections;
	public JdbcObsoleteSavedTeamStore(JdbcSavedTeamRepository.Connections connections) { this.connections = connections; }

	@Override public int schemaVersion() throws SQLException {
		try (Connection connection = connections.open()) { return schemaVersion(connection, false); }
	}
	@Override public String databaseName() throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement("SELECT DATABASE()");
			ResultSet rows = query.executeQuery()) {
			if (!rows.next()) throw new SQLException("DATABASE_UNAVAILABLE");
			String name = rows.getString(1);
			if (name == null || rows.next()) throw new SQLException("DATABASE_UNAVAILABLE");
			return name;
		}
	}
	@Override public List<ObsoleteSavedTeamCleanup.Row> scan() throws SQLException {
		try (Connection connection = connections.open()) {
			preflight(connection, false);
			List<ObsoleteSavedTeamCleanup.Row> found = new ArrayList<>();
			for (ObsoleteSavedTeamCleanup.Table table : ObsoleteSavedTeamCleanup.Table.values()) {
				try (PreparedStatement query = connection.prepareStatement("SELECT team_id,owner_subject,document_version,catalog_version,document_json FROM " + table.sqlName + " ORDER BY team_id");
					ResultSet rows = query.executeQuery()) {
					while (rows.next()) found.add(new ObsoleteSavedTeamCleanup.Row(table, record(rows)));
				}
			}
			return found;
		}
	}
	@Override public ObsoleteSavedTeamCleanup.Result delete(List<ObsoleteSavedTeamCleanup.Entry> entries,
		ObsoleteSavedTeamCleanup.RowVerifier verifier) throws SQLException {
		boolean commitAttempted = false;
		boolean committed = false;
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				preflight(connection, true);
				int deleted = 0, absent = 0;
				for (ObsoleteSavedTeamCleanup.Entry entry : entries) {
					ObsoleteSavedTeamCleanup.Row row = locked(connection, entry);
					if (row == null) { absent++; continue; }
					if (!verifier.matches(entry, row)) throw new SQLException("PLAN_ROW_CHANGED");
					try (PreparedStatement statement = connection.prepareStatement("DELETE FROM " + entry.table.sqlName
						+ " WHERE team_id=? AND owner_subject=? AND document_version=? AND catalog_version=? AND document_json=?")) {
						statement.setString(1, entry.teamId); statement.setString(2, entry.owner);
						statement.setInt(3, entry.documentVersion); statement.setString(4, row.record.catalogVersion);
						statement.setString(5, row.record.json);
						if (statement.executeUpdate() != 1) throw new SQLException("PLAN_ROW_CHANGED");
						deleted++;
					}
				}
				commitAttempted = true;
				connection.commit();
				committed = true;
				return new ObsoleteSavedTeamCleanup.Result(deleted, absent);
			} catch (SQLException failure) {
				try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
				if (commitAttempted) throw new SQLException("COMMIT_OUTCOME_UNKNOWN", failure);
				throw failure;
			}
		} catch (SQLException failure) {
			if (committed) throw new SQLException("COMMIT_COMPLETED_CLOSE_FAILED", failure);
			throw failure;
		}
	}

	private ObsoleteSavedTeamCleanup.Row locked(Connection connection, ObsoleteSavedTeamCleanup.Entry entry) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement("SELECT team_id,owner_subject,document_version,catalog_version,document_json FROM "
			+ entry.table.sqlName + " WHERE team_id=? FOR UPDATE")) {
			query.setString(1, entry.teamId);
			try (ResultSet rows = query.executeQuery()) {
				if (!rows.next()) return null;
				ObsoleteSavedTeamCleanup.Row row = new ObsoleteSavedTeamCleanup.Row(entry.table, record(rows));
				if (rows.next()) throw new SQLException("PLAN_ROW_DUPLICATED");
				return row;
			}
		}
	}
	private SavedTeamRepository.Record record(ResultSet rows) throws SQLException {
		return new SavedTeamRepository.Record(rows.getString(1), rows.getString(2), rows.getInt(3), rows.getString(4), rows.getString(5));
	}
	private void preflight(Connection connection, boolean lock) throws SQLException {
		if (schemaVersion(connection, lock) != 7) throw new SQLException("SCHEMA_VERSION");
		try (PreparedStatement query = connection.prepareStatement(
			"SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=DATABASE()"
				+ " AND REFERENCED_TABLE_NAME IN ('ffb_saved_teams','ffb_v2_saved_teams')"); ResultSet rows = query.executeQuery()) {
			if (!rows.next() || rows.getInt(1) != 0 || rows.next()) throw new SQLException("DEPENDENT_TABLES_UNREVIEWED");
		}
		for (ObsoleteSavedTeamCleanup.Table table : ObsoleteSavedTeamCleanup.Table.values()) {
			try (PreparedStatement query = connection.prepareStatement(
				"SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?")) {
				query.setString(1, table.sqlName);
				try (ResultSet rows = query.executeQuery()) {
					if (!rows.next() || !"InnoDB".equalsIgnoreCase(rows.getString(1)) || rows.next()) throw new SQLException("TABLE_SHAPE");
				}
			}
		}
	}
	private int schemaVersion(Connection connection, boolean lock) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement("SELECT version FROM ffb_local_schema" + (lock ? " FOR UPDATE" : ""));
			ResultSet rows = query.executeQuery()) {
			if (!rows.next()) throw new SQLException("SCHEMA_VERSION");
			int version = rows.getInt(1);
			if (rows.next()) throw new SQLException("SCHEMA_VERSION");
			return version;
		}
	}
}
