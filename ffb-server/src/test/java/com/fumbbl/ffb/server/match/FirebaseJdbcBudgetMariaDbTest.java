package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.BrowserRequestTiming;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Opt-in actual DEV Firebase plus actual MariaDB; only an explicitly empty synthetic schema is writable. */
class FirebaseJdbcBudgetMariaDbTest {
	@Test void realProviderAndJdbcShareTheAbsoluteRequestDeadlineIncludingLateLockWait() throws Exception {
		String base = System.getenv("JDBC_BOUNDS_TEST_URL"), password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD"), tokenPath = System.getenv("FIREBASE_BOUNDS_TOKEN_FILE");
		Assumptions.assumeTrue(base != null && password != null && tokenPath != null, "Explicit synthetic database and real DEV Firebase acceptance token required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		Path file = Path.of(tokenPath);
		if (!file.isAbsolute()) throw new IllegalArgumentException("Absolute ignored token file required");
		JsonObject identity = JsonObject.readFrom(Files.readString(file)).get("home").asObject();
		if (!identity.getString("uid", "").matches("acceptance-home-[0-9a-f-]{36}")) throw new IllegalArgumentException("Only synthetic DEV acceptance identity allowed");
		String bearer = identity.getString("idToken", null);
		if (bearer == null) throw new IllegalArgumentException("Firebase ID token required");
		String url = base + "?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1";
		try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next(), "Synthetic schema must start empty"); }
		}
		try {
			try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
				sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (7)");
				try (InputStream resource = getClass().getResourceAsStream("/local-schema/006-v2-membership.sql")) {
					for (String command : new String(resource.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";")) if (!command.isBlank()) sql.execute(command);
				}
				sql.execute("CREATE TABLE budget_lock(id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB"); sql.executeUpdate("INSERT INTO budget_lock VALUES(1,0)");
			}
			AtomicLong nanos = new AtomicLong(); CaptureRequestProbe requests = new CaptureRequestProbe();
			try (JdbcRequestConnections connections = new JdbcRequestConnections(url, "root", password, true);
				FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(new FirebaseProviderRuntime("dev-moles-under-the-pitch-org"), "dev-moles-under-the-pitch-org",
					new JdbcV2PrincipalDirectory(connections::open, Clock.systemUTC()), Clock.systemUTC(), nanos::get)) {
				long coldStart = System.nanoTime();
				AuthenticatedPrincipal principal = requests.within(() -> verifier.authenticate(bearer));
				long coldMillis = (System.nanoTime() - coldStart) / 1_000_000;
				assertTrue(coldMillis < 2_000, "Cold provider plus first local account creation exceeded request deadline");
				nanos.set(FirebaseSessionVerification.VALIDITY_NANOS);
				long refreshStart = System.nanoTime(); requests.within(() -> verifier.reauthorize(principal));
				long refreshMillis = (System.nanoTime() - refreshStart) / 1_000_000;
				assertTrue(refreshMillis < 2_000);
				try (Connection blocker = DriverManager.getConnection(url, "root", password); Statement lock = blocker.createStatement()) {
					blocker.setAutoCommit(false); lock.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1");
					long started = System.nanoTime(); int[] jdbcAllowance = {0};
					nanos.addAndGet(FirebaseSessionVerification.VALIDITY_NANOS);
					assertThrows(JdbcConnections.DeadlineExpired.class, () -> requests.within(() -> {
						verifier.reauthorize(principal); // Actual Firebase lifecycle lookup and local SQL precede the lock.
						while (new BrowserRequestTiming().budget().remainingNanos() > 850_000_000L) Thread.sleep(1);
						try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
							jdbcAllowance[0] = connection.getNetworkTimeout();
							sql.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1");
						}
						return null;
					}));
					long lateMillis = (System.nanoTime() - started) / 1_000_000;
					assertTrue(jdbcAllowance[0] > 0 && jdbcAllowance[0] < 750);
					assertTrue(lateMillis < 2_000, "Real provider/JDBC late lock path returned in " + lateMillis);
					blocker.rollback();
					requests.within(() -> { try (Connection connection = connections.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT 1")) { assertTrue(row.next()); assertEquals(1, row.getInt(1)); } return null; });
					System.out.println("FIREBASE_JDBC_REAL coldMs=" + coldMillis + " refreshMs=" + refreshMillis + " lateLockMs=" + lateMillis + " jdbcAllowanceMs=" + jdbcAllowance[0]);
				}
			}
		} finally {
			try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
				for (String table : new String[] {"budget_lock", "ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members", "ffb_local_schema"}) sql.execute("DROP TABLE IF EXISTS " + table);
			}
		}
	}
}
