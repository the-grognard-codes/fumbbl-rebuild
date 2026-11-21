package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.CaptureRequestProbe;
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
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Scanner;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
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
		JsonObject diagnosticRequest = new JsonObject().add("type", "setup").add("operation", "movement").add("requestId", "real-sql");
		JsonObject writeTrace = new CaptureRequestProbe().details(diagnosticRequest, () -> {
			try { assertTrue(repository.append(first, 1)); } catch (SQLException failure) { throw new AssertionError(failure); }
			return new JsonObject();
		});
		for (String phase : new String[] { "DB_CONNECT", "DB_READ", "DB_WRITE", "DB_COMMIT", "STORAGE_COMPRESSION" })
			assertTrue(writeTrace.get("totals").asObject().names().contains(phase), phase);
		JsonObject readTrace = new CaptureRequestProbe().details(diagnosticRequest, () -> {
			try { assertNative(engine, repository.find(id)); } catch (SQLException failure) { throw new AssertionError(failure); }
			return new JsonObject();
		});
		for (String phase : new String[] { "DB_CONNECT", "DB_READ", "DB_ROLLBACK", "STORAGE_DECODE", "STORAGE_DECOMPRESSION" })
			assertTrue(readTrace.get("totals").asObject().names().contains(phase), phase);
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

	@Test void savedComputerJobStaysOffTheInventoryAcrossRestartAndReturnsOnResume() throws Exception {
		String url = System.getenv("RECOVERY_JOURNAL_TEST_JDBC_URL"), password = System.getenv("RECOVERY_JOURNAL_TEST_PASSWORD");
		Assumptions.assumeTrue(url != null && password != null, "Opt-in empty recovery journal test database required");
		if (!url.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_recovery_journal_test"))
			throw new IllegalArgumentException("Only the isolated recovery journal test database is allowed");
		JdbcRecoveryRepository.Connections connections = () -> DriverManager.getConnection(url, "root", password);
		try (Connection connection = connections.open(); Statement sql = connection.createStatement();
			ResultSet tables = sql.executeQuery("SHOW TABLES")) {
			assertFalse(tables.next(), "Test schema must be empty before any write");
		}
		try {
			BogrukEngineFixture engine = new BogrukEngineFixture("human", "orc", 42);
			BogrukEngineFixture other = new BogrukEngineFixture("human", "orc", 42, "00000000-0000-0000-0000-000000000022");
			BogrukEngineFixture corrupt = new BogrukEngineFixture("human", "orc", 42, "00000000-0000-0000-0000-000000000023");
			BogrukEngineFixture wrongSeat = new BogrukEngineFixture("human", "orc", 42, "00000000-0000-0000-0000-000000000024");
			BogrukEngineFixture awaitingBackfill = new BogrukEngineFixture("human", "orc", 42, "00000000-0000-0000-0000-000000000025");
			ComputerOpponentService computers = new ComputerOpponentService(null);
			String id = engine.document.matchId;
			long now = 1_800_000_000_000L;
			engine.session.startSaveResumeRetention(now);
			other.session.startSaveResumeRetention(now);
			awaitingBackfill.session.startSaveResumeRetention(now);
			try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
				resource(sql, "/local-schema/003-prepared-matches.sql");
				resource(sql, "/local-schema/005-match-recovery.sql");
				resource(sql, "/local-schema/006-v2-membership.sql");
				sql.execute("CREATE TABLE ffb_local_schema (version INT NOT NULL PRIMARY KEY)");
				sql.execute("INSERT INTO ffb_local_schema VALUES (8)");
				resource(sql, "/local-schema/009-recovery-journal.sql");
				insertComputerMatch(connection, engine.document, computers.memberId());
				insertComputerMatch(connection, other.document, computers.memberId());
				insertComputerMatch(connection, corrupt.document, computers.memberId());
				insertComputerMatch(connection, wrongSeat.document, computers.memberId(), "home");
				insertComputerMatch(connection, awaitingBackfill.document, computers.memberId());
			}
			JdbcRecoveryRepository legacy = new JdbcRecoveryRepository(connections, true);
			assertTrue(legacy.save(new RecoveryRepository.Record(id, 1, engine.session.recoveryArtifact()), 0));
			RecoveryJournal journal = new RecoveryJournal();
			RecoveryJournal.Cursor base = journal.cursor(legacy.find(id));
			JsonObject save = consent(engine.session, "home", "saveRequest", "save", null, now);
			consent(engine.session, "away", "saveAccept", "accept-save", save.getString("proposalId", null), now + 1);
			RecoveryJournal.Change suspended = journal.change(engine.session, base, 1);
			assertFalse(suspended.compact);
			assertTrue(legacy.append(new RecoveryRepository.Record(id, 2, suspended.json), 1));
			JsonObject otherSave = consent(other.session, "home", "saveRequest", "save", null, now);
			consent(other.session, "away", "saveAccept", "accept-save", otherSave.getString("proposalId", null), now + 1);
			assertTrue(legacy.save(new RecoveryRepository.Record(other.document.matchId, 1, other.session.recoveryArtifact()), 0));
			String corruptId = corrupt.document.matchId;
			assertTrue(legacy.save(new RecoveryRepository.Record(corruptId, 1, "{}"), 0));
			assertTrue(legacy.save(new RecoveryRepository.Record(wrongSeat.document.matchId, 1, "{}"), 0));
			String activeId = awaitingBackfill.document.matchId;
			assertTrue(legacy.save(new RecoveryRepository.Record(activeId, 1, awaitingBackfill.session.recoveryArtifact()), 0));
			String baseBytesQuery = "SELECT artifact_json FROM ffb_match_recovery ORDER BY matchid LIMIT 1";
			String baseBytes = scalar(connections, baseBytesQuery);
			String tailBytes = scalar(connections, "SELECT record_json FROM ffb_match_recovery_journal");
			try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
				resource(sql, "/local-schema/010-computer-job-availability.sql");
			}
			assertEquals("10", scalar(connections, "SELECT version FROM ffb_local_schema"));
			assertEquals(baseBytes, scalar(connections, baseBytesQuery));
			assertEquals(tailBytes, scalar(connections, "SELECT record_json FROM ffb_match_recovery_journal"));

			JdbcRecoveryRepository repository = new JdbcRecoveryRepository(connections, true, true);
			Clock beforeResume = Clock.fixed(Instant.ofEpochMilli(now + 20), ZoneOffset.UTC);
			AtomicBoolean compete = new AtomicBoolean(true);
			V2PreparationService inventory = new V2PreparationService(
				() -> competingClassification(connections.open(), repository, id, compete), null, null, beforeResume, computers);
			assertEquals(new V2PreparationService.ComputerInventory(List.of(id, corruptId, activeId), true), inventory.activeComputerMatches(),
				"A lost CAS and jobs beyond the backfill limit are still included in the registration snapshot");
			assertFalse(compete.get());
			assertEquals("3", scalar(connections, "SELECT COUNT(*) FROM ffb_match_recovery WHERE computer_work_until_epoch_ms=0"));
			assertEquals("2", scalar(connections, "SELECT COUNT(*) FROM ffb_match_recovery WHERE computer_work_until_epoch_ms IS NULL"));
			V2PreparationService restartedInventory = new V2PreparationService(connections::open, null, null, beforeResume, computers);
			assertEquals(new V2PreparationService.ComputerInventory(List.of(corruptId, activeId), false), restartedInventory.activeComputerMatches(),
				"The next inventory observes the winning CAS and classifies the remaining head");
			assertNull(scalar(connections,
				"SELECT computer_work_until_epoch_ms FROM ffb_match_recovery WHERE matchid='" + corruptId + "'"));
			assertEquals(List.of(corruptId, activeId), inventory.activeComputerMatches().matches());
			RecoveryRepository.CorruptRecord failure = assertThrows(RecoveryRepository.CorruptRecord.class,
				() -> repository.find(corruptId));
			assertEquals(corruptId, failure.matchId);

			RecoveryJournal.Cursor paused = journal.cursor(repository.find(id));
			JsonObject resume = consent(engine.session, "home", "resumeRequest", "resume", null, now + 21);
			RecoveryJournal.Change proposed = journal.change(engine.session, paused, 2);
			assertFalse(proposed.compact);
			RecoveryRepository.Record pendingResume = new RecoveryRepository.Record(id, 3, proposed.json, engine.session.computerWorkUntil());
			JdbcRecoveryRepository interrupted = new JdbcRecoveryRepository(
				() -> fault(connections.open(), "INSERT INTO ffb_match_recovery_journal", false), true, true);
			assertThrows(SQLException.class, () -> interrupted.append(pendingResume, 2));
			assertEquals(List.of(corruptId, activeId), restartedInventory.activeComputerMatches().matches(), "Rolled-back journal leaves the match suspended");
			assertTrue(repository.append(pendingResume, 2));
			assertEquals(List.of(id, corruptId, activeId), restartedInventory.activeComputerMatches().matches());
			Clock atExpiry = Clock.fixed(Instant.ofEpochMilli(resume.getLong("expiresAt", -1)), ZoneOffset.UTC);
			assertEquals(List.of(corruptId, activeId), new V2PreparationService(connections::open, null, null, atExpiry, computers).activeComputerMatches().matches(),
				"A failed legacy classification must not drop the job while it waits for a normal worker load");

			SetupSession recovered = new SetupSession(engine.server, engine.document, repository.find(id).json);
			JsonObject resumed = consent(recovered, "away", "resumeAccept", "accept-resume",
				resume.getString("proposalId", null), now + 22);
			assertEquals("ACTIVE", resumed.getString("status", null));
			assertTrue(repository.save(new RecoveryRepository.Record(id, 4, recovered.recoveryArtifact(), recovered.computerWorkUntil()), 3));
			assertEquals(List.of(id, corruptId, activeId), new V2PreparationService(connections::open, null, null, atExpiry, computers).activeComputerMatches().matches());
		} finally {
			try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
				for (String table : new String[] {"ffb_match_recovery_journal", "ffb_match_recovery", "ffb_local_schema",
					"ffb_prepared_matches", "ffb_v2_match_members", "ffb_v2_identity", "ffb_v2_account_scope", "ffb_v2_account"})
					sql.executeUpdate("DROP TABLE IF EXISTS " + table);
			}
		}
	}

	private void insertComputerMatch(Connection connection, MatchDocument match, String computerAccount) throws SQLException {
		insertComputerMatch(connection, match, computerAccount, "away");
	}

	private void insertComputerMatch(Connection connection, MatchDocument match, String computerAccount, String computerRole) throws SQLException {
		try (PreparedStatement document = connection.prepareStatement("INSERT INTO ffb_prepared_matches VALUES (?,3,?)");
			PreparedStatement members = connection.prepareStatement("INSERT INTO ffb_v2_match_members VALUES (?,?,'home'), (?,?,'away')")) {
			document.setString(1, match.matchId);
			document.setString(2, new MatchJson().encode(match).toString());
			assertEquals(1, document.executeUpdate());
			members.setString(1, match.matchId);
			String human = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
			members.setString(2, "home".equals(computerRole) ? computerAccount : human);
			members.setString(3, match.matchId);
			members.setString(4, "away".equals(computerRole) ? computerAccount : human);
			assertEquals(2, members.executeUpdate());
		}
	}

	private Connection competingClassification(Connection connection, JdbcRecoveryRepository repository, String matchId, AtomicBoolean compete) {
		return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (proxy, method, arguments) -> {
			if ("prepareStatement".equals(method.getName()) && ((String) arguments[0]).startsWith("UPDATE ffb_match_recovery SET computer_work_until_epoch_ms=")
				&& compete.getAndSet(false)) {
				assertTrue(repository.backfillComputerWork(new JdbcRecoveryRepository.LegacyComputerWork(matchId, 2, 0)));
			}
			try { return method.invoke(connection, arguments); }
			catch (InvocationTargetException failure) { throw failure.getCause(); }
		});
	}

	private JsonObject consent(SetupSession session, String role, String operation, String requestId, String proposal, long now) {
		JsonObject request = new JsonObject().add("requestId", requestId).add("operation", operation).add("expectedRevision", session.revision());
		if (proposal != null) request.add("proposalId", proposal);
		JsonObject result = session.decorateSaveResume(session.saveResume(role, request, now));
		assertEquals("ACCEPTED", result.getString("code", null));
		return result.get("state").asObject().get("saveResume").asObject();
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
