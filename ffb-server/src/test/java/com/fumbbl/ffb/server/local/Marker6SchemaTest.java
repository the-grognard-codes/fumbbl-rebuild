package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.DbConnectionManager;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Scanner;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class Marker6SchemaTest {
	@Test
	void missingMarkerSixTableFailsClosedWithoutWriting() throws Exception {
		Connection connection = mock(Connection.class); Statement statement = mock(Statement.class); ResultSet version = mock(ResultSet.class), table = mock(ResultSet.class);
		when(connection.createStatement()).thenReturn(statement); when(statement.executeQuery(anyString())).thenReturn(version, table);
		when(version.next()).thenReturn(true, false); when(version.getInt(1)).thenReturn(6); when(table.next()).thenReturn(false);

		assertThrows(SQLException.class, () -> new Marker6Schema().verify(connection));

		verify(statement, never()).executeUpdate(anyString());
	}

	@Test
	void requiresExactlyMarkerSixBeforeInspectingTables() throws Exception {
		Connection connection = mock(Connection.class); Statement statement = mock(Statement.class); ResultSet version = mock(ResultSet.class);
		when(connection.createStatement()).thenReturn(statement); when(statement.executeQuery(anyString())).thenReturn(version);
		when(version.next()).thenReturn(true, false); when(version.getInt(1)).thenReturn(5);

		assertThrows(SQLException.class, () -> new Marker6Schema().verify(connection));

		verify(statement, never()).executeUpdate(anyString());
	}

	@Test
	void markerVerifierTargetsTheTablesAndRequestColumnsDeclaredByMigrationResources() throws Exception {
		Set<String> tables = new HashSet<>();
		for (String resource : new String[] {"/local-schema/006-v2-membership.sql", "/local-schema/006-v2-saved-teams.sql", "/local-schema/006-v2-invitations.sql"}) {
			String ddl = resource(resource); Matcher matcher = Pattern.compile("CREATE TABLE ([a-z0-9_]+)").matcher(ddl);
			while (matcher.find()) tables.add(matcher.group(1));
		}
		assertEquals(set("ffb_v2_match_members", "ffb_v2_account", "ffb_v2_identity", "ffb_v2_account_scope", "ffb_v2_saved_teams", "ffb_v2_preparation_invites", "ffb_v2_preparation_requests"), tables);
		String requests = resource("/local-schema/006-v2-invitations.sql");
		assertTrue(requests.contains("request_id VARCHAR(100)"));
		assertTrue(requests.contains("fingerprint VARCHAR(255)"));
		assertFalse(requests.contains("invitation_code"));
	}

	@Test
	void verifiesOptInMarkerSixMariaDbTargetReadOnly() throws Exception {
		String url = System.getenv("M6_TEST_JDBC_URL");
		String passwordFile = System.getenv("M6_TEST_PASSWORD_FILE");
		Assumptions.assumeTrue((url != null && !url.trim().isEmpty()) || (passwordFile != null && !passwordFile.trim().isEmpty()),
			"Marker-6 MariaDB target is not configured");
		assertTrue(url != null && !url.trim().isEmpty(), "Marker-6 MariaDB JDBC URL is required");
		assertTrue(passwordFile != null && !passwordFile.trim().isEmpty(), "Marker-6 MariaDB password file is required");
		assertTrue(Files.isRegularFile(Paths.get(passwordFile)), "Marker-6 MariaDB password file is unavailable");
		String password = new String(Files.readAllBytes(Paths.get(passwordFile)), StandardCharsets.UTF_8).trim();
		Assumptions.assumeTrue(!password.isEmpty(), "Marker-6 MariaDB password is empty");
		try (Connection connection = DriverManager.getConnection(url, "root", password)) { new Marker6Schema().verify(connection); }
		DbConnectionManager manager = new DbConnectionManager(mock(com.fumbbl.ffb.server.FantasyFootballServer.class));
		manager.setDbUrl(url); manager.setDbUser("root"); manager.setDbPassword(password); manager.setDbType("mariadb");
		new LocalSchema().initialize(manager, "unused", true);
	}

	private String resource(String name) throws Exception {
		try (InputStream input = Marker6SchemaTest.class.getResourceAsStream(name); Scanner scanner = new Scanner(input, "UTF-8").useDelimiter("\\A")) { return scanner.next(); }
	}
	private Set<String> set(String... values) { Set<String> result = new HashSet<>(); for (String value : values) result.add(value); return result; }
}
