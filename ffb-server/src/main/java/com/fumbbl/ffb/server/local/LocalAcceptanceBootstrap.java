package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.ServerMode;
import com.fumbbl.ffb.server.db.DbConnectionManager;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Properties;
import java.util.Scanner;
import java.util.Set;
import java.util.ArrayList;
import java.util.List;

/** Explicit, schema-only marker-5 to marker-7 bootstrap for the isolated acceptance profile. */
public final class LocalAcceptanceBootstrap {
	private static final Set<String> MARKER5_TABLES = new HashSet<>(Arrays.asList(
		"ffb_coaches", "ffb_games_info", "ffb_games_serialized", "ffb_player_markers", "ffb_team_setups",
		"ffb_user_settings", "ffb_local_schema", "ffb_saved_teams", "ffb_prepared_matches", "ffb_match_recovery"));
	private static final Set<String> MARKER7_TABLES = new HashSet<>(Arrays.asList(
		"ffb_coaches", "ffb_games_info", "ffb_games_serialized", "ffb_player_markers", "ffb_team_setups",
		"ffb_user_settings", "ffb_local_schema", "ffb_saved_teams", "ffb_prepared_matches", "ffb_match_recovery",
		"ffb_v2_match_members", "ffb_v2_account", "ffb_v2_identity", "ffb_v2_account_scope",
		"ffb_v2_saved_teams", "ffb_v2_preparation_invites", "ffb_v2_preparation_requests"));
	private static final Set<String> MARKER6_TABLES = new HashSet<>(MARKER7_TABLES);
	private static final String[] V2_MIGRATIONS = {
		"/local-schema/006-v2-membership.sql", "/local-schema/006-v2-saved-teams.sql", "/local-schema/006-v2-invitations.sql"
	};

	private LocalAcceptanceBootstrap() { }

	public static void main(String[] args) throws Exception {
		if (args.length != 1) throw new IllegalArgumentException("Expected acceptance server properties file");
		Properties properties = new Properties();
		try (InputStream input = Files.newInputStream(Paths.get(args[0]))) { properties.load(input); }
		LocalServerMain.validateProfile(properties);
		if (!LocalServerMain.ACCEPTANCE_DB_URL.equals(properties.getProperty("db.url"))
			|| !"true".equals(properties.getProperty("local.browser.v2.enabled"))) {
			throw new IllegalArgumentException("Schema bootstrap requires the dedicated v2 acceptance profile");
		}
		String password = readSecret(properties, "db.password.file");
		Class.forName(properties.getProperty("db.driver"));
		FantasyFootballServer server = new FantasyFootballServer(ServerMode.STANDALONE, properties);
		DbConnectionManager manager = new DbConnectionManager(server);
		manager.setDbUrl(properties.getProperty("db.url"));
		manager.setDbUser(properties.getProperty("db.user"));
		manager.setDbPassword(password);
		manager.setDbType("mariadb");
		bootstrap(manager);
		System.out.println("Acceptance database schema verified at marker 7; no records were imported.");
	}

	static void bootstrap(DbConnectionManager manager) throws SQLException {
		LocalSchema schema = new LocalSchema();
		Set<String> tables = tableNames(manager);
		if (tables.isEmpty()) {
			schema.initializeSchemaOnly(manager);
			tables = tableNames(manager);
		}
		int version = schemaVersion(manager);
		if (version == 7) {
			requireInventory(tables, MARKER7_TABLES);
			schema.initialize(manager, "", true);
			try (Connection connection = manager.openDbConnection()) { new Marker6Schema().ensureCurrentMatchIndex(connection); connection.commit(); }
			return;
		}
		if (version == 5) {
			requireInventory(tables, MARKER5_TABLES);
			requireNoRows(manager, MARKER5_TABLES);
			try (Connection connection = manager.openDbConnection(); Statement statement = connection.createStatement()) {
				for (String migration : V2_MIGRATIONS) executeResource(statement, migration);
				if (statement.executeUpdate("UPDATE ffb_local_schema SET version=6 WHERE version=5") != 1) {
					throw new SQLException("Acceptance schema marker conflict");
				}
				connection.commit();
			}
			tables = tableNames(manager);
			version = 6;
		}
		if (version == 6) {
			requireInventory(tables, MARKER6_TABLES);
			requireNoRows(manager, MARKER6_TABLES);
			try (Connection connection = manager.openDbConnection()) {
				schema.verifySavedTeams(connection);
				schema.verifyCompletedMatches(connection);
				schema.verifyRecovery(connection);
				new Marker6Schema().verifyTables(connection);
			}
			try (Connection connection = manager.openDbConnection(); Statement statement = connection.createStatement()) {
				executeResource(statement, "/local-schema/007-named-saved-teams.sql");
				connection.commit();
			}
			version = 7;
		}
		if (version != 7) throw new SQLException("Acceptance bootstrap accepts only empty or marker-5-through-7 databases");
		tables = tableNames(manager);
		requireInventory(tables, MARKER7_TABLES);
		schema.initialize(manager, "", true);
		try (Connection connection = manager.openDbConnection()) { new Marker6Schema().ensureCurrentMatchIndex(connection); connection.commit(); }
	}

	static void requireInventory(Set<String> actual, Set<String> expected) throws SQLException {
		if (!expected.equals(actual)) throw new SQLException("Acceptance database table inventory does not match its schema marker");
	}

	private static Set<String> tableNames(DbConnectionManager manager) throws SQLException {
		Set<String> tables = new HashSet<>();
		try (Connection connection = manager.openDbConnection(); Statement statement = connection.createStatement();
			 ResultSet rows = statement.executeQuery("SHOW TABLES")) {
			while (rows.next()) tables.add(rows.getString(1));
		}
		return tables;
	}

	private static int schemaVersion(DbConnectionManager manager) throws SQLException {
		try (Connection connection = manager.openDbConnection(); Statement statement = connection.createStatement();
			 ResultSet rows = statement.executeQuery("SELECT version FROM ffb_local_schema")) {
			if (!rows.next()) throw new SQLException("Missing acceptance schema version");
			int version = rows.getInt(1);
			if (rows.next()) throw new SQLException("Multiple acceptance schema versions");
			return version;
		}
	}

	static void requireNoRows(DbConnectionManager manager, Set<String> tables) throws SQLException {
		try (Connection connection = manager.openDbConnection(); Statement statement = connection.createStatement()) {
			for (String table : tables) {
				if ("ffb_local_schema".equals(table)) continue;
				try (ResultSet rows = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
					if (!rows.next() || rows.getLong(1) != 0) throw new SQLException("Acceptance marker-5 database is not empty");
				}
			}
		}
	}

	static void executeResource(Statement statement, String path) throws SQLException {
		try (InputStream source = LocalAcceptanceBootstrap.class.getResourceAsStream(path)) {
			if (source == null) throw new SQLException("Missing required acceptance migration");
			String ddl;
			try (Scanner scanner = new Scanner(source, StandardCharsets.UTF_8.name()).useDelimiter("\\A")) { ddl = scanner.next(); }
			for (String sql : splitStatements(ddl)) statement.execute(sql);
		} catch (IOException failure) { throw new SQLException("Unable to read required acceptance migration", failure); }
	}

	static List<String> splitStatements(String migration) {
		String withoutWholeLineComments = migration.replaceAll("(?m)^[\\t ]*--[^\\r\\n]*(?:\\r?\\n|$)", "");
		List<String> statements = new ArrayList<>();
		for (String sql : withoutWholeLineComments.split(";")) if (!sql.trim().isEmpty()) statements.add(sql.trim());
		return statements;
	}

	private static String readSecret(Properties properties, String key) throws Exception {
		String path = properties.getProperty(key);
		if (path == null) throw new IllegalArgumentException("Missing " + key);
		String secret = new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8).trim();
		if (secret.isEmpty()) throw new IllegalArgumentException("Empty " + key);
		return secret;
	}
}
