package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcFaultProxy;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JdbcRecoveryBudgetMariaDbTest {
	private String base, password;
	private int port;
	private boolean initialized;
	private final CaptureRequestProbe requests = new CaptureRequestProbe();
	@BeforeAll void schema() throws Exception {
		base = System.getenv("JDBC_BOUNDS_TEST_URL"); password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit synthetic JDBC bounds database required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		port = URI.create(base.substring(5)).getPort();
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next()); }
			initialized = true;
			sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (8)");
			resource(sql, "/local-schema/005-match-recovery.sql"); resource(sql, "/local-schema/009-recovery-journal.sql");
		}
	}
	@AfterAll void clean() throws Exception {
		if (!initialized) return;
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			for (String table : new String[] {"ffb_match_recovery_journal", "ffb_match_recovery", "ffb_local_schema"}) sql.execute("DROP TABLE IF EXISTS " + table);
		}
	}
	@Test void bothRealCommitOutcomesPreserveExactRetryRestorationAndLaterMutation() throws Exception {
		for (JdbcFaultProxy.Fault fault : new JdbcFaultProxy.Fault[] {JdbcFaultProxy.Fault.COMMIT_COMMITTED, JdbcFaultProxy.Fault.COMMIT_UNCOMMITTED}) {
			SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
			engine.advanceToTurn(); engine.session.startSaveResumeRetention(System.currentTimeMillis());
			String id = engine.document.matchId, initial = engine.session.recoveryArtifact();
			try (JdbcRequestConnections healthy = bounded(port)) {
				JdbcRecoveryRepository repository = new JdbcRecoveryRepository(healthy::open, true);
				assertTrue(requests.within(() -> repository.save(new RecoveryRepository.Record(id, 1, initial), 0)));
				RecoveryJournal journal = new RecoveryJournal();
				RecoveryRepository.Record before = requests.within(() -> repository.find(id));
				JsonObject firstRequest = endTurnRequest(engine.session, id, "lost-ack");
				String owner = engine.session.reply("view", "ACCEPTED", false, "home").get("state").asObject().getString("actor", null);
				assertEquals("ACCEPTED", engine.session.apply(owner, firstRequest).getString("code", null));
				RecoveryJournal.Change change = journal.change(engine.session, journal.cursor(before), 1);
				assertFalse(change.compact);
				RecoveryRepository.Record attempted = new RecoveryRepository.Record(id, 2, change.json);
				try (JdbcFaultProxy relay = new JdbcFaultProxy(port, fault); JdbcRequestConnections failing = bounded(relay.port())) {
					JdbcRecoveryRepository uncertain = new JdbcRecoveryRepository(failing::open, true);
					assertThrows(RecoveryRepository.OutcomeUnknown.class, () -> requests.within(() -> uncertain.append(attempted, 1)));
					assertTrue(relay.injected());
				}
				RecoveryRepository.Record durable = requests.within(() -> repository.find(id));
				boolean committed = fault == JdbcFaultProxy.Fault.COMMIT_COMMITTED;
				assertEquals(committed ? 2 : 1, durable.generation);
				SetupSession restored = new SetupSession(engine.server, engine.document, durable.json);
				assertEquals(durable.json, restored.recoveryArtifact());
				String prior = restored.recoveryArtifact();
				JsonObject retry = restored.apply(owner, firstRequest);
				assertEquals("ACCEPTED", retry.getString("code", null));
				assertEquals(committed, retry.getBoolean("duplicate", false));
				if (committed) {
					assertEquals(prior, restored.recoveryArtifact(), "An accepted command is not reexecuted");
					assertFalse(requests.within(() -> repository.append(attempted, 1)));
				} else {
					RecoveryJournal.Change accepted = journal.change(restored, journal.cursor(durable), 1);
					assertTrue(requests.within(() -> repository.append(new RecoveryRepository.Record(id, 2, accepted.json), 1)));
					assertTrue(restored.apply(owner, firstRequest).getBoolean("duplicate", false));
				}
				assertEquals(1, journalCount());
				RecoveryRepository.Record accepted = requests.within(() -> repository.find(id));
				JsonObject nextRequest = endTurnRequest(restored, id, "later-action");
				String nextOwner = restored.reply("view", "ACCEPTED", false, "home").get("state").asObject().getString("actor", null);
				assertEquals("ACCEPTED", restored.apply(nextOwner, nextRequest).getString("code", null));
				RecoveryJournal.Change next = journal.change(restored, journal.cursor(accepted), 2);
				assertTrue(requests.within(() -> repository.append(new RecoveryRepository.Record(id, 3, next.json), 2)));
				assertEquals(2, journalCount());
				assertEquals(restored.recoveryArtifact(), requests.within(() -> repository.find(id)).json);
			}
			try (Connection connection = direct(); Statement sql = connection.createStatement()) { sql.executeUpdate("DELETE FROM ffb_match_recovery"); }
		}
	}
	private JsonObject endTurnRequest(SetupSession session, String id, String requestId) {
		JsonObject state = session.reply("view", "ACCEPTED", false, "home").get("state").asObject();
		for (JsonValue value : state.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", null)))
			return new JsonObject().add("version", 1).add("type", "setup").add("operation", "action").add("requestId", requestId)
				.add("matchId", id).add("expectedRevision", state.getInt("revision", -1)).add("actionId", value.asObject().get("id"));
		throw new AssertionError("Expected a regular end turn");
	}
	private int journalCount() throws Exception { try (Connection connection = direct(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT COUNT(*) FROM ffb_match_recovery_journal")) { row.next(); return row.getInt(1); } }
	private Connection direct() throws Exception { return DriverManager.getConnection(base + "?connectTimeout=500&socketTimeout=1500", "root", password); }
	private JdbcRequestConnections bounded(int targetPort) { return new JdbcRequestConnections("jdbc:mariadb://127.0.0.1:" + targetPort + "/ffb_jdbc_bounds_test?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1", "root", password); }
	private void resource(Statement sql, String name) throws Exception { try (InputStream input = getClass().getResourceAsStream(name)) { for (String statement : new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";")) if (!statement.isBlank()) sql.execute(statement); } }
}
