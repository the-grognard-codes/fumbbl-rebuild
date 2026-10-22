package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Scanner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Real transactions only in the explicitly provisioned, empty, loopback test database. */
class RecoveryJournalMariaDbTest {
	@Test void additiveMigrationCasCrashReconciliationAndCompactionPreserveNativeState() throws Exception {
		String url = System.getenv("RECOVERY_JOURNAL_TEST_JDBC_URL"), password = System.getenv("RECOVERY_JOURNAL_TEST_PASSWORD");
		Assumptions.assumeTrue(url != null && password != null, "Opt-in empty recovery journal test database required");
		if (!url.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_recovery_journal_test"))
			throw new IllegalArgumentException("Only the isolated recovery journal test database is allowed");
		JdbcRecoveryRepository.Connections connections = () -> DriverManager.getConnection(url, "root", password);
		try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
			try (ResultSet tables = sql.executeQuery("SHOW TABLES")) { assertFalse(tables.next(), "Test schema must be empty before any write"); }
		}
		try {
		try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
			resource(sql, "/local-schema/005-match-recovery.sql");
			sql.execute("CREATE TABLE ffb_local_schema (version INT NOT NULL PRIMARY KEY)");
			sql.execute("INSERT INTO ffb_local_schema VALUES (8)");
		}
		SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
		engine.advanceToTurn(); engine.session.startSaveResumeRetention(System.currentTimeMillis());
		String id = engine.document.matchId, initial = engine.session.recoveryArtifact();
		JdbcRecoveryRepository legacy = new JdbcRecoveryRepository(connections);
		assertTrue(legacy.save(new RecoveryRepository.Record(id, 1, initial), 0));
		String originalStored = scalar(connections, "SELECT artifact_json FROM ffb_match_recovery");
		try (Connection connection = connections.open(); Statement sql = connection.createStatement()) { resource(sql, "/local-schema/009-recovery-journal.sql"); }
		assertEquals(originalStored, scalar(connections, "SELECT artifact_json FROM ffb_match_recovery"), "Migration preserves original stored bytes");
		assertEquals("1", scalar(connections, "SELECT checkpoint_generation FROM ffb_match_recovery"));
		JdbcRecoveryRepository repository = new JdbcRecoveryRepository(connections, true);
		assertEquals(initial, repository.find(id).json);
		RecoveryJournal journal = new RecoveryJournal();
		RecoveryJournal.Cursor cursor = journal.cursor(repository.find(id));
		RecoveryRepository.Record first = next(engine, journal, cursor, 1, "first");
		assertTrue(repository.append(first, 1));
		assertFalse(repository.append(first, 1), "An exact CAS retry does not append twice");
		assertEquals("1", scalar(connections, "SELECT COUNT(*) FROM ffb_match_recovery_journal"));
		assertEquals(originalStored, scalar(connections, "SELECT artifact_json FROM ffb_match_recovery"), "Append does not rewrite the full artifact");
		assertNative(engine, repository.find(id));

		cursor = journal.cursor(repository.find(id));
		RecoveryRepository.Record second = next(engine, journal, cursor, 2, "second");
		JdbcRecoveryRepository interrupted = new JdbcRecoveryRepository(() -> fault(connections.open(), "INSERT INTO ffb_match_recovery_journal", false), true);
		assertThrows(SQLException.class, () -> interrupted.append(second, 2));
		assertEquals(Long.valueOf(2), repository.generation(id), "A crash before insert/commit rolls the head back too");
		assertEquals("1", scalar(connections, "SELECT COUNT(*) FROM ffb_match_recovery_journal"));
		assertTrue(repository.append(second, 2));
		assertNative(engine, repository.find(id));

		cursor = journal.cursor(repository.find(id));
		RecoveryRepository.Record third = next(engine, journal, cursor, 3, "third");
		JdbcRecoveryRepository unknown = new JdbcRecoveryRepository(() -> fault(connections.open(), null, true), true);
		assertThrows(RecoveryRepository.OutcomeUnknown.class, () -> unknown.append(third, 3));
		assertEquals(Long.valueOf(4), repository.generation(id), "Lost acknowledgement reconciles the committed action");
		assertNative(engine, repository.find(id));
		assertFalse(repository.append(third, 3));

		String full = engine.session.recoveryArtifact();
		RecoveryRepository.Record compact = new RecoveryRepository.Record(id, 5, full);
		JdbcRecoveryRepository failedCompaction = new JdbcRecoveryRepository(() -> fault(connections.open(), "DELETE FROM ffb_match_recovery_journal", false), true);
		assertThrows(SQLException.class, () -> failedCompaction.save(compact, 4));
		assertEquals(Long.valueOf(4), repository.generation(id));
		assertEquals("3", scalar(connections, "SELECT COUNT(*) FROM ffb_match_recovery_journal"));
		assertNative(engine, repository.find(id));
		assertTrue(repository.save(compact, 4));
		assertEquals("5", scalar(connections, "SELECT checkpoint_generation FROM ffb_match_recovery"));
		assertEquals("0", scalar(connections, "SELECT COUNT(*) FROM ffb_match_recovery_journal"));
		assertNative(engine, repository.find(id));

		cursor = journal.cursor(repository.find(id));
		RecoveryRepository.Record fourth = next(engine, journal, cursor, 5, "fourth");
		assertTrue(repository.append(fourth, 5));
		try (Connection connection = connections.open(); Statement sql = connection.createStatement()) { sql.executeUpdate("DELETE FROM ffb_match_recovery_journal"); }
		RecoveryRepository.CorruptRecord missing = assertThrows(RecoveryRepository.CorruptRecord.class, () -> repository.find(id));
		assertEquals(6, missing.generation, "Deleting the entire tail cannot silently restore an older state");
		assertTrue(repository.save(new RecoveryRepository.Record(id, 7, engine.session.recoveryArtifact()), 6));
		assertNative(engine, repository.find(id));
		} finally {
			try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
				for (String table : new String[] {"ffb_match_recovery_journal", "ffb_match_recovery", "ffb_local_schema"})
					sql.executeUpdate("DROP TABLE IF EXISTS " + table);
			}
		}
	}

	private RecoveryRepository.Record next(SetupSessionMovementTest.Fixture engine, RecoveryJournal journal,
		RecoveryJournal.Cursor cursor, long generation, String requestId) {
		JsonObject ready = engine.session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		JsonObject endTurn = null;
		for (JsonValue value : ready.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", null))) endTurn = value.asObject();
		JsonObject request = engine.request("action", requestId, ready).add("actionId", endTurn.get("id"));
		assertEquals("ACCEPTED", engine.session.apply(ready.getString("actor", null), request).getString("code", null));
		RecoveryJournal.Change change = journal.change(engine.session, cursor, generation);
		assertFalse(change.compact); return new RecoveryRepository.Record(engine.document.matchId, generation + 1, change.json);
	}
	private void assertNative(SetupSessionMovementTest.Fixture fixture, RecoveryRepository.Record record) {
		assertEquals(fixture.session.recoveryArtifact(), record.json);
		SetupSession restored = new SetupSession(fixture.server, fixture.document, record.json);
		assertEquals(record.json, restored.recoveryArtifact());
	}
	private String scalar(JdbcRecoveryRepository.Connections connections, String query) throws SQLException {
		try (Connection connection = connections.open(); Statement sql = connection.createStatement(); ResultSet rows = sql.executeQuery(query)) {
			assertTrue(rows.next()); return rows.getString(1);
		}
	}
	private void resource(Statement sql, String name) throws Exception {
		try (InputStream input = getClass().getResourceAsStream(name); Scanner scanner = new Scanner(input, StandardCharsets.UTF_8.name()).useDelimiter("\\A")) {
			String text = scanner.next().replaceAll("(?m)--[^\\r\\n]*", "");
			for (String statement : text.split(";")) if (!statement.trim().isEmpty()) sql.execute(statement.trim());
		}
	}
	private Connection fault(Connection connection, String failSql, boolean lostCommitAck) {
		return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (proxy, method, arguments) -> {
			try {
				Object result = method.invoke(connection, arguments);
				if (lostCommitAck && "commit".equals(method.getName())) throw new SQLException("Injected lost commit acknowledgement");
				if ("prepareStatement".equals(method.getName()) && failSql != null && ((String) arguments[0]).startsWith(failSql)) {
					PreparedStatement statement = (PreparedStatement) result;
					return Proxy.newProxyInstance(PreparedStatement.class.getClassLoader(), new Class<?>[] {PreparedStatement.class}, (ignored, call, values) -> {
						if ("executeUpdate".equals(call.getName())) throw new SQLException("Injected interruption before commit");
						try { return call.invoke(statement, values); } catch (InvocationTargetException failure) { throw failure.getCause(); }
					});
				}
				return result;
			} catch (InvocationTargetException failure) { throw failure.getCause(); }
		});
	}
}
