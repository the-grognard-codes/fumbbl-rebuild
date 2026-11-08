package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumSet;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Explicitly provisioned empty loopback schema; never uses application match/account tables. */
class JdbcAuthorizationMariaDbTest {
	private static final String ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private static final String OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

	@Test void joinedRefreshPreservesImmediatePermissionsAndReducesRoundTrips() throws Exception {
		String url = System.getenv("CAPTURE_AUTH_TEST_JDBC_URL"), password = System.getenv("CAPTURE_AUTH_TEST_PASSWORD");
		Assumptions.assumeTrue(url != null && password != null, "Opt-in empty capture authorization database required");
		if (!url.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_capture_auth_test"))
			throw new IllegalArgumentException("Only the isolated capture authorization test database is allowed");
		JdbcV2PrincipalDirectory.Connections connections = () -> DriverManager.getConnection(url, "root", password);
		try (Connection connection = connections.open(); Statement sql = connection.createStatement(); ResultSet rows = sql.executeQuery("SHOW TABLES")) {
			assertFalse(rows.next(), "Test schema must be empty before writes");
		}
		Clock clock = Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC);
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections, clock);
		VerifiedIdentity identity = new VerifiedIdentity("synthetic-issuer", "synthetic-subject", 2000, 500);
		AuthenticatedPrincipal principal = new AuthenticatedPrincipal(ACCOUNT, EnumSet.of(ApplicationScope.PLAYER), 2000,
			identity.issuer, identity.subject, identity.authenticationTimeMillis);
		try {
			try (Connection connection = connections.open(); Statement sql = connection.createStatement();
				InputStream input = getClass().getResourceAsStream("/local-schema/006-v2-membership.sql")) {
				String schema = new String(input.readAllBytes(), StandardCharsets.UTF_8);
				for (String statement : schema.split(";")) if (!statement.isBlank()) sql.execute(statement);
				sql.executeUpdate("INSERT INTO ffb_v2_account VALUES ('" + ACCOUNT + "','ACTIVE'),('" + OTHER + "','ACTIVE')");
				sql.executeUpdate("INSERT INTO ffb_v2_identity VALUES ('synthetic-issuer','synthetic-subject','" + ACCOUNT + "','ACTIVE')");
				sql.executeUpdate("INSERT INTO ffb_v2_account_scope VALUES ('" + ACCOUNT + "','PLAYER'),('" + ACCOUNT + "','SPECTATOR'),('" + OTHER + "','SPECTATOR')");
			}
			assertTrue(directory.reauthorize(principal).hasScope(ApplicationScope.PLAYER));
			assertTrue(directory.reauthorize(principal).hasScope(ApplicationScope.SPECTATOR));
			update(connections, "UPDATE ffb_v2_account SET state='DISABLED' WHERE account_id='" + ACCOUNT + "'");
			assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> directory.reauthorize(principal));
			update(connections, "UPDATE ffb_v2_account SET state='ACTIVE'");
			update(connections, "UPDATE ffb_v2_identity SET state='REVOKED'");
			assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> directory.reauthorize(principal));
			update(connections, "UPDATE ffb_v2_identity SET state='ACTIVE',account_id='" + OTHER + "'");
			assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> directory.reauthorize(principal));
			update(connections, "UPDATE ffb_v2_identity SET account_id='" + ACCOUNT + "'");
			update(connections, "DELETE FROM ffb_v2_account_scope WHERE scope='PLAYER'");
			assertFalse(directory.reauthorize(principal).hasScope(ApplicationScope.PLAYER));
			assertTrue(directory.reauthorize(principal).hasScope(ApplicationScope.SPECTATOR));
			update(connections, "DELETE FROM ffb_v2_account_scope");
			assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> directory.reauthorize(principal));
			update(connections, "INSERT INTO ffb_v2_account_scope VALUES ('" + ACCOUNT + "','PLAYER')");
			// Existing-account authenticate executes the same four SQL statements as the old
			// refresh path. No account creation or provider work participates in this comparison.
			for (int index = 0; index < 10; index++) { directory.authenticate(identity); directory.reauthorize(principal); }
			JsonArray runs = new JsonArray();
			for (int repeat = 1; repeat <= 3; repeat++) {
				JsonArray before = new JsonArray(), after = new JsonArray();
				for (int index = 0; index < 40; index++) {
					// Alternate order to avoid consistently giving one path the warmer connection.
					if (index % 2 == 0) {
						before.add(measure(() -> directory.authenticate(identity)));
						after.add(measure(() -> directory.reauthorize(principal)));
					} else {
						after.add(measure(() -> directory.reauthorize(principal)));
						before.add(measure(() -> directory.authenticate(identity)));
					}
				}
				runs.add(new JsonObject().add("repeat", repeat).add("fourQueryMs", before).add("oneQueryMs", after));
			}
			String output = System.getenv("CAPTURE_AUTH_TEST_OUTPUT");
			if (output != null) Files.writeString(Path.of(output), new JsonObject().add("version", 1)
				.add("securityChecks", "account disablement, identity revocation/ownership, scope removal and empty scopes passed")
				.add("limitations", "Real loopback MariaDB local directory only; existing-account authenticate supplies the legacy four-query baseline; excludes Firebase and transport")
				.add("runs", runs).toString());
			assertEquals(ACCOUNT, directory.reauthorize(principal).accountId());
		} finally {
			try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
				for (String table : new String[] { "ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members" })
					sql.executeUpdate("DROP TABLE IF EXISTS " + table);
			}
		}
	}

	private void update(JdbcV2PrincipalDirectory.Connections connections, String statement) throws Exception {
		try (Connection connection = connections.open(); Statement sql = connection.createStatement()) { sql.executeUpdate(statement); }
	}
	private double measure(Operation operation) throws Exception {
		long started = System.nanoTime(); operation.run(); return (System.nanoTime() - started) / 1_000_000.0;
	}
	@FunctionalInterface private interface Operation { void run() throws Exception; }
}
