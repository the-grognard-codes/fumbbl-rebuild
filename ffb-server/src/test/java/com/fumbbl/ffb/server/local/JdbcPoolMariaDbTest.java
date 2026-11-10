package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.db.JdbcFaultProxy;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import java.net.URI;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JdbcPoolMariaDbTest {
	private String url, password;
	private boolean initialized;
	private final CaptureRequestProbe requests = new CaptureRequestProbe();
	@BeforeAll void schema() throws Exception {
		String base = System.getenv("JDBC_BOUNDS_TEST_URL"); password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit synthetic JDBC bounds database required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		url = base + "?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1,sql_mode='STRICT_ALL_TABLES'";
		try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertTrue(!rows.next(), "Schema must start empty"); }
			sql.execute("CREATE TABLE pool_synthetic(id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB");
			sql.executeUpdate("INSERT INTO pool_synthetic VALUES (1,0)"); initialized = true;
		}
	}
	@AfterAll void clean() throws Exception { if (initialized) try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) { sql.execute("DROP TABLE pool_synthetic"); } }
	@Test void bufferedRowsDecodeLocallyButStreamingNextStillHasAnActualDeadline() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			requests.within(() -> {
				try (Connection connection = pool.open(); Statement sql = connection.createStatement(); var rows = sql.executeQuery("SELECT seq FROM seq_1_to_1000")) {
					long sum = 0;
					while (rows.next()) sum += ((Number) rows.getObject(1)).longValue();
					assertEquals(500500, sum);
				}
				return null;
			});
		}
		int port = URI.create(url.substring(5)).getPort();
		try (JdbcFaultProxy relay = new JdbcFaultProxy(port, JdbcFaultProxy.Fault.STREAM_ROW_STALLED);
			JdbcRequestConnections source = new JdbcRequestConnections(url.replace(":" + port + "/", ":" + relay.port() + "/"), "root", password, true)) {
			long started = System.nanoTime();
			assertThrows(JdbcConnections.DeadlineExpired.class, () -> requests.within(() -> {
				try (Connection connection = source.open(); Statement sql = connection.createStatement()) {
					sql.setFetchSize(1);
					try (var rows = sql.executeQuery("SELECT 101 AS synthetic_stream UNION ALL SELECT 202")) {
						assertTrue(rows.next()); assertEquals(101, rows.getInt(1));
						Thread.sleep(1100); rows.next();
					}
				}
				return null;
			}));
			assertTrue(relay.injected());
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 2000);
		}
	}
	@Test void deadIdleSessionsReconnectBeforeApplicationWorkWithoutPoisoningTheBreakerOrLeakingSlots() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			try (Connection first = pool.open(); Connection second = pool.open()) { assertTrue(!first.isClosed()); assertTrue(!second.isClosed()); }
			try (Connection administrator = DriverManager.getConnection(url, "root", password); Statement sql = administrator.createStatement()) {
				java.util.List<Long> ids = new java.util.ArrayList<>();
				try (var rows = sql.executeQuery("SELECT ID FROM information_schema.PROCESSLIST WHERE DB='ffb_jdbc_bounds_test' AND COMMAND='Sleep' AND ID<>CONNECTION_ID()")) {
					while (rows.next()) ids.add(rows.getLong(1));
				}
				assertEquals(2, ids.size());
				for (long id : ids) sql.execute("KILL CONNECTION " + id);
			}
			Thread.sleep(1100); // Exercise the pool's configured idle validation interval.
			for (int repeat = 0; repeat < 2; repeat++) requests.within(() -> {
				try (Connection connection = pool.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT 1")) { assertTrue(row.next()); }
				return null;
			});
			assertEquals(4, pool.connectionAttempts());
			// If either stale validation had counted, this genuine cap timeout would trip the circuit.
			assertThrows(SQLException.class, () -> requests.within(() -> {
				try (Connection connection = pool.open(); Statement sql = connection.createStatement()) { sql.executeQuery("SELECT SLEEP(3)"); }
				return null;
			}));
			requests.within(() -> { try (Connection connection = pool.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT 1")) { assertTrue(row.next()); } return null; });
			try (Connection first = pool.open(); Connection second = pool.open()) { assertTrue(!first.isClosed()); assertTrue(!second.isClosed()); }
		}
	}
	@Test void capacityIsTwoExhaustionIsImmediateAndClosedHandlesCannotTouchTheNextLease() throws Exception {
		try (JdbcRequestConnections pool = pool(); Connection first = pool.open(); Connection second = pool.open()) {
			Statement old = first.createStatement();
			long started = System.nanoTime();
			assertThrows(SQLException.class, pool::open);
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 100);
			first.close();
			try (Connection next = pool.open(); Statement sql = next.createStatement(); var row = sql.executeQuery("SELECT 1")) {
				assertTrue(row.next());
				assertTrue(first.isClosed()); assertTrue(old.isClosed());
				assertThrows(SQLException.class, () -> old.executeQuery("SELECT 2"));
				assertThrows(SQLException.class, () -> first.prepareStatement("SELECT 2"));
				assertEquals(2, pool.connectionAttempts());
			}
		}
	}
	@Test void returnRollsBackTransactionsAndRestoresSessionPolicyCatalogAndIsolation() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			requests.within(() -> {
				try (Connection connection = pool.open(); Statement sql = connection.createStatement()) {
					connection.setAutoCommit(false); sql.executeUpdate("UPDATE pool_synthetic SET value=99 WHERE id=1");
					sql.execute("SET SESSION innodb_lock_wait_timeout=7"); sql.execute("SET @synthetic_private=7");
					sql.execute("SET SESSION sql_mode='NO_ZERO_DATE'");
					connection.setTransactionIsolation(Connection.TRANSACTION_SERIALIZABLE);
					connection.setCatalog("information_schema");
				}
				return null;
			});
			requests.within(() -> {
				try (Connection connection = pool.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery(
					"SELECT @@autocommit,@@session.innodb_lock_wait_timeout,@synthetic_private,@@tx_isolation,DATABASE(),@@sql_mode,(SELECT value FROM pool_synthetic WHERE id=1)")) {
					assertTrue(row.next()); assertEquals(1, row.getInt(1)); assertEquals(1, row.getInt(2)); assertNull(row.getString(3));
					assertEquals("REPEATABLE-READ", row.getString(4)); assertEquals("ffb_jdbc_bounds_test", row.getString(5));
					assertEquals("STRICT_ALL_TABLES", row.getString(6)); assertEquals(0, row.getInt(7));
				}
				return null;
			});
			assertEquals(2, pool.connectionAttempts(), "Changed sessions are discarded, so the next lease has the complete original baseline");
		}
	}
	@Test void timeoutDiscardsThePhysicalConnectionAndTheNextRequestSucceeds() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			assertThrows(SQLException.class, () -> requests.within(() -> {
				try (Connection connection = pool.open(); Statement sql = connection.createStatement()) { sql.executeQuery("SELECT SLEEP(3)"); }
				return null;
			}));
			requests.within(() -> { try (Connection connection = pool.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT 1")) { assertTrue(row.next()); } return null; });
			assertEquals(2, pool.connectionAttempts());
		}
	}
	@Test void reusedConnectionUsesTheCurrentRequestDeadlineAndLateBorrowDoesNotRenewIt() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			requests.within(() -> { try (Connection connection = pool.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT 1")) { assertTrue(row.next()); } return null; });
			long started = System.nanoTime();
			assertThrows(SQLException.class, () -> requests.within(() -> {
				Thread.sleep(1100);
				try (Connection connection = pool.open(); Statement sql = connection.createStatement()) {
					assertTrue(connection.getNetworkTimeout() < 850);
					sql.executeQuery("SELECT SLEEP(1.2)");
				}
				return null;
			}));
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 2000);
			assertEquals(1, pool.connectionAttempts());
		}
	}
	@Test void sqlUseAndAbortNeverReturnTheirPhysicalSessionToAnotherBorrower() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			try (Connection first = pool.open(); Statement sql = first.createStatement()) { sql.execute("USE information_schema"); }
			try (Connection next = pool.open(); Statement sql = next.createStatement(); var row = sql.executeQuery("SELECT DATABASE()")) {
				row.next(); assertEquals("ffb_jdbc_bounds_test", row.getString(1));
			}
			long before = pool.connectionAttempts();
			Connection aborted = pool.open(); aborted.abort(Runnable::run); assertTrue(aborted.isClosed());
			try (Connection next = pool.open()) { assertTrue(!next.isClosed()); }
			assertTrue(pool.connectionAttempts() > before);
		}
	}
	@Test void clientInfoIsDefensiveAndChangedClientStateIsNeverReused() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			java.util.Properties escaped;
			try (Connection first = pool.open()) { escaped = first.getClientInfo(); escaped.setProperty("synthetic", "private"); }
			try (Connection next = pool.open()) {
				assertNull(next.getClientInfo("synthetic")); assertEquals(1, pool.connectionAttempts());
				next.setClientInfo("synthetic", "private");
			}
			try (Connection next = pool.open()) { escaped.setProperty("synthetic", "again"); assertNull(next.getClientInfo("synthetic")); }
			assertEquals(2, pool.connectionAttempts());
		}
	}
	@Test void configuredIsolationSurvivesByEvictingChangedSessions() throws Exception {
		String configured = url + "&transactionIsolation=SERIALIZABLE";
		try (JdbcRequestConnections pool = new JdbcRequestConnections(configured, "root", password, true)) {
			try (Connection first = pool.open(); Statement sql = first.createStatement()) {
				first.setAutoCommit(false); sql.executeUpdate("UPDATE pool_synthetic SET value=99 WHERE id=1");
			}
			try (Connection next = pool.open(); Statement sql = next.createStatement(); var row = sql.executeQuery("SELECT @@tx_isolation,value FROM pool_synthetic WHERE id=1")) {
				row.next(); assertEquals("SERIALIZABLE", row.getString(1)); assertEquals(0, row.getInt(2));
			}
			assertEquals(2, pool.connectionAttempts());
		}
	}
	@Test void quotedAndQualifiedStoredFunctionsCannotLeakSessionState() throws Exception {
		try (Connection administrator = DriverManager.getConnection(url, "root", password); Statement sql = administrator.createStatement()) {
			sql.execute("CREATE FUNCTION synthetic_mutate() RETURNS INT BEGIN SET @synthetic_private=7; RETURN 1; END");
			sql.execute("CREATE FUNCTION `COUNT`() RETURNS INT BEGIN SET @synthetic_private=7; RETURN 1; END");
			sql.execute("CREATE FUNCTION side_effect$() RETURNS INT BEGIN SET @synthetic_private=7; RETURN 1; END");
			sql.execute("CREATE FUNCTION 1COUNT() RETURNS INT BEGIN SET @synthetic_private=7; RETURN 1; END");
			try {
				for (String query : new String[] {"SELECT `synthetic_mutate`()", "SELECT ffb_jdbc_bounds_test.COUNT()", "SELECT side_effect$()", "SELECT 1COUNT()"}) {
					try (JdbcRequestConnections pool = pool()) {
						try (Connection first = pool.open(); Statement invoke = first.createStatement(); var row = invoke.executeQuery(query)) { assertTrue(row.next()); }
						try (Connection next = pool.open(); Statement inspect = next.createStatement(); var row = inspect.executeQuery("SELECT @synthetic_private")) { row.next(); assertNull(row.getString(1)); }
						assertEquals(2, pool.connectionAttempts());
					}
				}
			} finally { sql.execute("DROP FUNCTION synthetic_mutate"); sql.execute("DROP FUNCTION `COUNT`"); sql.execute("DROP FUNCTION side_effect$"); sql.execute("DROP FUNCTION 1COUNT"); }
		}
	}
	@Test void updatableResultsEvictTheirWrittenSession() throws Exception {
		try (JdbcRequestConnections pool = pool()) {
			try (Connection first = pool.open(); Statement sql = first.createStatement(java.sql.ResultSet.TYPE_SCROLL_INSENSITIVE, java.sql.ResultSet.CONCUR_UPDATABLE);
				var row = sql.executeQuery("SELECT id,value FROM pool_synthetic")) {
				assertTrue(row.next()); row.updateInt("value", 13); row.updateRow();
			}
			try (Connection next = pool.open(); Statement sql = next.createStatement(); var row = sql.executeQuery("SELECT value FROM pool_synthetic")) {
				row.next(); assertEquals(13, row.getInt(1)); assertEquals(2, pool.connectionAttempts());
			}
		} finally {
			try (Connection administrator = DriverManager.getConnection(url, "root", password); Statement sql = administrator.createStatement()) { sql.executeUpdate("UPDATE pool_synthetic SET value=0"); }
		}
	}
	@Test void namedCallableSettersTightenLimitsBeforeTheirHiddenParameterMetadataQuery() throws Exception {
		try (Connection administrator = DriverManager.getConnection(url, "root", password); Statement sql = administrator.createStatement()) {
			sql.execute("CREATE PROCEDURE synthetic_named(IN named INT) SELECT named");
			try (JdbcRequestConnections pool = pool()) {
				requests.within(() -> {
					try (Connection connection = pool.open(); var call = connection.prepareCall("{call synthetic_named(?)}")) {
						Thread.sleep(1100);
						call.setInt("named", 1);
						assertTrue(connection.getNetworkTimeout() < 850);
					}
					return null;
				});
			} finally { sql.execute("DROP PROCEDURE synthetic_named"); }
		}
	}
	private JdbcRequestConnections pool() { return new JdbcRequestConnections(url, "root", password, true); }
}
