package com.fumbbl.ffb.server.local;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Read-only structural verification for the separately provisioned marker-6 database. */
final class Marker6Schema {
	void verify(Connection connection) throws SQLException {
		verifyMarker(connection);
		verifyTable(connection, "ffb_v2_match_members",
			new String[] {"matchid|char(36)|NO|ascii|ascii_bin", "account_id|char(36)|NO|ascii|ascii_bin", "role|enum('home','away')|NO|ascii|ascii_bin"},
			set("PRIMARY|0|matchid", "PRIMARY|0|account_id", "ffb_v2_match_members_role|0|matchid", "ffb_v2_match_members_role|0|role"), set(), set());
		verifyTable(connection, "ffb_v2_account",
			new String[] {"account_id|char(36)|NO|ascii|ascii_bin", "state|enum('ACTIVE','DISABLED')|NO|ascii|ascii_bin"},
			set("PRIMARY|0|account_id"), set(), set());
		verifyTable(connection, "ffb_v2_identity",
			new String[] {"issuer|varchar(255)|NO|ascii|ascii_bin", "subject|varchar(255)|NO|ascii|ascii_bin", "account_id|char(36)|NO|ascii|ascii_bin", "state|enum('ACTIVE','REVOKED')|NO|ascii|ascii_bin"},
			set("PRIMARY|0|issuer", "PRIMARY|0|subject", "ffb_v2_identity_account|1|account_id"), set(), set("account_id|ffb_v2_account|account_id"));
		verifyTable(connection, "ffb_v2_account_scope",
			new String[] {"account_id|char(36)|NO|ascii|ascii_bin", "scope|enum('PLAYER','SPECTATOR','OWNER','ADMINISTRATOR')|NO|ascii|ascii_bin"},
			set("PRIMARY|0|account_id", "PRIMARY|0|scope"), set(), set("account_id|ffb_v2_account|account_id"));
		verifyTable(connection, "ffb_v2_saved_teams",
			new String[] {"team_id|char(36)|NO|ascii|ascii_bin", "owner_subject|char(36)|NO|ascii|ascii_bin", "document_version|int|NO|null|null", "catalog_version|varchar(80)|NO|ascii|ascii_bin", "document_json|text|NO|utf8mb4|utf8mb4_bin"},
			set("PRIMARY|0|team_id", "saved_team_owner|1|owner_subject"),
			set("document_versionbetween1and2147483646", "octet_lengthdocument_json<=16384"), set("owner_subject|ffb_v2_account|account_id"));
		verifyTable(connection, "ffb_v2_preparation_invites",
			new String[] {"matchid|char(36)|NO|ascii|ascii_bin", "token_hash|char(64)|NO|ascii|ascii_bin", "creator_account_id|char(36)|NO|ascii|ascii_bin", "expires_at_epoch_ms|bigint|NO|null|null", "generation|bigint|NO|null|null", "state|enum('ACTIVE','ACCEPTED','REVOKED')|NO|ascii|ascii_bin", "accepted_account_id|char(36)|YES|ascii|ascii_bin"},
			set("PRIMARY|0|matchid", "token_hash|0|token_hash"),
			set("expires_at_epoch_ms>0", "generation>0", "state='accepted'=accepted_account_idisnotnull"), set());
		verifyTable(connection, "ffb_v2_preparation_requests",
			new String[] {"matchid|char(36)|NO|ascii|ascii_bin", "account_id|char(36)|NO|ascii|ascii_bin", "request_id|varchar(100)|NO|ascii|ascii_bin", "fingerprint|varchar(255)|NO|ascii|ascii_bin"},
			set("PRIMARY|0|matchid", "PRIMARY|0|account_id", "PRIMARY|0|request_id"), set("octet_lengthfingerprintbetween1and255"), set());
	}

	private void verifyMarker(Connection connection) throws SQLException {
		try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery("SELECT version FROM ffb_local_schema")) {
			if (!rows.next() || rows.getInt(1) != 7 || rows.next()) throw new SQLException("Named-team schema version 7 is required");
		}
	}

	private void verifyTable(Connection connection, String name, String[] expectedColumns, Set<String> expectedIndexes, Set<String> expectedChecks, Set<String> expectedReferences) throws SQLException {
		try (Statement statement = connection.createStatement()) {
			try (ResultSet table = statement.executeQuery("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='" + name + "'")) {
				if (!table.next() || !"InnoDB".equalsIgnoreCase(table.getString(1)) || table.next()) throw new SQLException("Marker-6 table missing or has the wrong engine: " + name);
			}
			try (ResultSet columns = statement.executeQuery("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='" + name + "' ORDER BY ORDINAL_POSITION")) {
				for (String expected : expectedColumns) {
					if (!columns.next()) throw new SQLException("Marker-6 columns missing: " + name);
					String actual = columns.getString(1) + "|" + normalizeType(columns.getString(2)) + "|" + columns.getString(3) + "|" + columns.getString(4) + "|" + columns.getString(5);
					if (!expected.equals(actual)) throw new SQLException("Marker-6 column mismatch: " + name);
				}
				if (columns.next()) throw new SQLException("Unexpected marker-6 column: " + name);
			}
			Set<String> indexes = new HashSet<>();
			try (ResultSet rows = statement.executeQuery("SELECT INDEX_NAME,NON_UNIQUE,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='" + name + "'")) {
				while (rows.next()) indexes.add(rows.getString(1) + "|" + rows.getInt(2) + "|" + rows.getString(3));
			}
			if (!indexes.equals(expectedIndexes)) throw new SQLException("Marker-6 index mismatch: " + name);
			Set<String> checks = new HashSet<>();
			try (ResultSet rows = statement.executeQuery("SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='" + name + "'")) {
				while (rows.next()) checks.add(normalizeCheck(rows.getString(1)));
			}
			if (!checks.equals(expectedChecks)) throw new SQLException("Marker-6 constraint mismatch: " + name);
			Set<String> references = new HashSet<>();
			try (ResultSet rows = statement.executeQuery("SELECT COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='" + name + "' AND REFERENCED_TABLE_NAME IS NOT NULL")) {
				while (rows.next()) references.add(rows.getString(1) + "|" + rows.getString(2) + "|" + rows.getString(3));
			}
			if (!references.equals(expectedReferences)) throw new SQLException("Marker-6 foreign-key mismatch: " + name);
			try (ResultSet rows = statement.executeQuery("SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='" + name + "'")) {
				if (!rows.next() || rows.getInt(1) != 0) throw new SQLException("Unexpected marker-6 trigger: " + name);
			}
		}
	}

	private String normalizeType(String value) { return value.replace("int(11)", "int").replace("bigint(20)", "bigint"); }
	private String normalizeCheck(String value) { return value.toLowerCase(Locale.ROOT).replaceAll("[\\s`()]+", ""); }
	private Set<String> set(String... values) { return new HashSet<>(Arrays.asList(values)); }
}
