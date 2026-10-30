package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.db.DbConnectionManager;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;

/** Opt-in check against a dedicated empty schema; never touches the dev-local database. */
class BrowserSchemaMariaDbTest {

	@Test void freshBootstrapCreatesAndVerifiesOnlyBrowserTables() throws Exception {
		String url = System.getenv("BROWSER_ONLY_TEST_JDBC_URL");
		String passwordFile = System.getenv("BROWSER_ONLY_TEST_PASSWORD_FILE");
		Assumptions.assumeTrue(url != null && passwordFile != null, "Dedicated empty browser schema required");
		if (!url.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_browser_only_test"))
			throw new IllegalArgumentException("Only the isolated browser schema is allowed");
		DbConnectionManager manager = new DbConnectionManager(mock(FantasyFootballServer.class));
		manager.setDbUrl(url);
		manager.setDbUser("root");
		manager.setDbPassword(new String(Files.readAllBytes(Paths.get(passwordFile)), StandardCharsets.UTF_8).trim());
		try (Connection connection = manager.openDbConnection(); Statement sql = connection.createStatement();
			 ResultSet tables = sql.executeQuery("SHOW TABLES")) {
			assertFalse(tables.next(), "The test requires a fresh empty database before any write");
		}
		LocalAcceptanceBootstrap.bootstrap(manager);
		new LocalSchema().initialize(manager, true);
		Set<String> actual = new HashSet<>();
		try (Connection connection = manager.openDbConnection(); Statement sql = connection.createStatement()) {
			try (ResultSet tables = sql.executeQuery("SHOW TABLES")) { while (tables.next()) actual.add(tables.getString(1)); }
			try (ResultSet version = sql.executeQuery("SELECT version FROM ffb_local_schema")) {
				version.next();
				assertEquals(9, version.getInt(1));
			}
		}
		assertEquals(new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_saved_teams", "ffb_prepared_matches",
			"ffb_match_recovery", "ffb_match_recovery_journal", "ffb_v2_match_members", "ffb_v2_account",
			"ffb_v2_identity", "ffb_v2_account_scope", "ffb_v2_saved_teams", "ffb_v2_preparation_invites",
			"ffb_v2_preparation_requests", "ffb_v2_skill_use_preferences")), actual);
	}
}
