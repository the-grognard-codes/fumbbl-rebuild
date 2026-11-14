package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.CaptureRequestProbe;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupApplicationJournalTest {
	@Test void acceptedNativeActionAppendsOneSmallRecordInsteadOfRewritingHistory() throws Exception {
		assertEquals(1, exercise(true).get("values").asObject().getInt("checkpointPath", -1));
	}

	@Test void fullCheckpointFallbackIsNotReportedAsJournalCompaction() throws Exception {
		assertEquals(3, exercise(false).get("values").asObject().getInt("checkpointPath", -1));
	}

	@Test void compactionConflictAndWriteFailurePreserveTheCheckpointAndAllowOneDurableRetry() throws Exception {
		for (String failure : new String[] { "RECOVERY_CONFLICT", "PERSISTENCE_FAILED" }) {
			Fixture fixture = new Fixture(true);
			RecoveryRepository.Record original = fixture.recovery.record;
			// Start from the journal's compaction threshold without generating 31 extra turns.
			fixture.recovery.record = new RecoveryRepository.Record(original.matchId, original.generation, original.json,
				null, RecoveryJournal.MAX_ENTRIES - 1, 0);
			RecoveryRepository.Record before = fixture.recovery.record;
			JsonObject ready = fixture.load();
			JsonObject request = fixture.endTurn(ready);
			String owner = ready.getString("actor", null);
			fixture.recovery.saveFailure = failure;
			SetupApplication.HandleOutcome rejected = fixture.application.handleWithOutcome(owner, request);
			assertEquals(failure, rejected.response().getString("code", null));
			assertFalse(rejected.publish());
			assertSame(before, fixture.recovery.record);
			assertEquals(1, fixture.recovery.saveAttempts);
			assertEquals(0, fixture.recovery.appends);

			fixture.recovery.saveFailure = null;
			JsonObject accepted = fixture.application.handle(owner, request);
			assertEquals("ACCEPTED", accepted.getString("code", null));
			assertFalse(accepted.getBoolean("duplicate", true));
			assertEquals(before.generation + 1, fixture.recovery.record.generation);
			assertEquals(2, fixture.recovery.saveAttempts);
			assertEquals(1, fixture.recovery.saves);
			assertEquals(0, fixture.recovery.appends);

			SetupApplication restarted = new SetupApplication(fixture.engine.server, fixture.matches, fixture.recovery);
			JsonObject duplicate = restarted.handle(owner, request);
			assertEquals("ACCEPTED", duplicate.getString("code", null));
			assertTrue(duplicate.getBoolean("duplicate", false));
			assertEquals(accepted.get("state").asObject().get("revision"), duplicate.get("state").asObject().get("revision"));
			assertEquals(2, fixture.recovery.saveAttempts);
			assertEquals(0, fixture.recovery.appends);
		}
	}

	@Test void failedCompactionAfterGenuineAppendsReloadsTheChainAndRetriesExactlyOnce() throws Exception {
		for (String failure : new String[] { "RECOVERY_CONFLICT", "PERSISTENCE_FAILED" }) {
			Fixture fixture = new Fixture(true);
			long now = System.currentTimeMillis();
			JournalMemory recovery = new JournalMemory(fixture.recovery.record);
			Clock clock = Clock.fixed(Instant.ofEpochMilli(now), ZoneOffset.UTC);
			SetupApplication application = new SetupApplication(fixture.engine.server, fixture.matches, recovery, false, clock);
			JsonObject load = new JsonObject().add("version", 1).add("type", "setup").add("operation", "load")
				.add("requestId", "load-chain").add("matchId", fixture.id);
			JsonObject view = application.handle("home", load).get("state").asObject();
			RecoveryRepository.Record before = null, checkpoint = null;
			List<RecoveryRepository.Record> entries = null;
			JsonObject request = null;
			SetupApplication.HandleOutcome rejected = null;
			recovery.saveFailure = failure;
			for (int index = 0; index < RecoveryJournal.MAX_ENTRIES; index++) {
				before = recovery.find(fixture.id);
				entries = List.copyOf(recovery.entries);
				checkpoint = recovery.checkpoint;
				request = historyChange(fixture, view, "append-or-compact-" + index);
				rejected = application.handleWithOutcome("home", request);
				if (failure.equals(rejected.response().getString("code", null))) break;
				assertEquals("ACCEPTED", rejected.response().getString("code", null));
				view = rejected.response().get("state").asObject();
				assertEquals(index + 1, recovery.entries.size(), "Every entry is emitted by the real application journal path");
				assertEquals(index + 1, cursorEntries(application, fixture.id));
				assertEquals(0, recovery.saveAttempts);
			}
			assertTrue(entries.size() > 1, "Reach the real entry-count or byte compaction threshold through genuine appends");
			System.out.println("REAL_JOURNAL_COMPACTION failure=" + failure + " entries=" + entries.size() + " bytes=" + before.journalBytes);
			assertEquals(failure, rejected.response().getString("code", null));
			assertEquals(1, recovery.saveAttempts);
			assertFalse(rejected.publish());
			assertSame(checkpoint, recovery.checkpoint);
			assertEquals(entries, recovery.entries);
			assertEquals(before.json, recovery.find(fixture.id).json);
			assertEquals(before.generation, recovery.generation);
			assertEquals(-1, cursorEntries(application, fixture.id), "Failed compaction releases the live append cursor");
			recovery.saveFailure = null;
			JsonObject accepted = application.handle("home", request);
			assertEquals("ACCEPTED", accepted.getString("code", null));
			assertFalse(accepted.getBoolean("duplicate", true));
			assertEquals(before.generation + 1, recovery.generation);
			assertEquals(2, recovery.saveAttempts);
			assertEquals(0, recovery.entries.size());
			assertEquals(0, cursorEntries(application, fixture.id));
			SetupSession live = resident(application, fixture.id);
			SetupSession restored = new SetupSession(fixture.engine.server, fixture.engine.document, recovery.find(fixture.id).json);
			assertEquals(live.orderedRecoveryPayload(), restored.orderedRecoveryPayload(), "The compacted chain restores the complete live payload");
			SetupApplication restarted = new SetupApplication(fixture.engine.server, fixture.matches, recovery, false, clock);
			JsonObject duplicate = restarted.handle("home", request);
			assertEquals("ACCEPTED", duplicate.getString("code", null));
			assertTrue(duplicate.getBoolean("duplicate", false));
			assertEquals(accepted.get("state").asObject().get("revision"), duplicate.get("state").asObject().get("revision"));
			assertEquals(2, recovery.saveAttempts);
			assertEquals(entries.size(), recovery.appends);
			assertEquals(0, recovery.find(fixture.id).journalEntries);
		}
	}

	private JsonObject historyChange(Fixture fixture, JsonObject view, String requestId) {
		JsonObject status = view.get("saveResume").asObject();
		boolean pending = "SAVE_PENDING".equals(status.getString("status", null));
		JsonObject request = fixture.engine.request(pending ? "saveCancel" : "saveRequest", requestId, view);
		if (pending) request.add("proposalId", status.get("proposalId"));
		return request;
	}

	private int cursorEntries(SetupApplication application, String id) throws Exception {
		Field field = SetupApplication.class.getDeclaredField("journalCursors"); field.setAccessible(true);
		RecoveryJournal.Cursor cursor = (RecoveryJournal.Cursor) ((Map<?, ?>) field.get(application)).get(id);
		return cursor == null ? -1 : cursor.entries;
	}

	private SetupSession resident(SetupApplication application, String id) throws Exception {
		Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
		return (SetupSession) ((Map<?, ?>) field.get(application)).get(id);
	}

	private static final class JournalMemory implements RecoveryRepository {
		Record checkpoint;
		final List<Record> entries = new ArrayList<>();
		long generation;
		int appends, saveAttempts;
		String saveFailure;
		JournalMemory(Record checkpoint) { this.checkpoint = checkpoint; generation = checkpoint.generation; }
		@Override public Record find(String id) {
			return new RecoveryJournal().restore(id, generation, checkpoint.generation, checkpoint.json, entries);
		}
		@Override public boolean supportsJournal() { return true; }
		@Override public boolean append(Record next, long expected) {
			assertEquals(generation, expected);
			assertEquals(generation + 1, next.generation);
			entries.add(next); generation = next.generation; appends++; return true;
		}
		@Override public boolean save(Record next, long expected) throws SQLException {
			assertEquals(generation, expected); saveAttempts++;
			if ("RECOVERY_CONFLICT".equals(saveFailure)) return false;
			if ("PERSISTENCE_FAILED".equals(saveFailure)) throw new SQLException("Injected checkpoint failure");
			checkpoint = next; generation = next.generation; entries.clear(); return true;
		}
	}

	private JsonObject exercise(boolean journal) throws Exception {
		Fixture fixture = new Fixture(journal);
		JsonObject ready = fixture.load();
		JsonObject request = fixture.endTurn(ready);
		int[] responseRevision = new int[1];
		JsonObject trace = new CaptureRequestProbe().details(request, () -> {
			JsonObject response = fixture.application.handle(ready.getString("actor", null), request);
			assertEquals("ACCEPTED", response.getString("code", null));
			responseRevision[0] = response.get("state").asObject().getInt("revision", -1);
			return response;
		});
		assertEquals(journal ? 1 : 0, fixture.recovery.appends, "Journal-capable repositories append ordinary actions");
		assertEquals(journal ? 0 : 1, fixture.recovery.saves, "Other repositories retain the full checkpoint fallback");
		assertEquals(responseRevision[0], trace.get("values").asObject().getInt("revision", -1));
		return trace;
	}

	private static final class Fixture {
		final SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
		final String id = engine.document.matchId;
		final MatchService matches = mock(MatchService.class);
		final Memory recovery;
		final SetupApplication application;

		Fixture(boolean journal) throws Exception {
			engine.advanceToTurn();
			engine.session.startSaveResumeRetention(System.currentTimeMillis());
			recovery = new Memory(new RecoveryRepository.Record(id, 1, engine.session.recoveryArtifact()), journal);
			when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.loadForSetup("home", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.load("away", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.loadForSetup("away", id)).thenReturn(new MatchService.Result(engine.document, false));
			application = new SetupApplication(engine.server, matches, recovery);
		}

		JsonObject load() {
			return application.handle("home", new JsonObject().add("version", 1).add("type", "setup")
				.add("operation", "load").add("requestId", "load").add("matchId", id)).get("state").asObject();
		}

		JsonObject endTurn(JsonObject ready) {
			for (JsonValue value : ready.get("actions").asArray()) {
				JsonObject action = value.asObject();
				if ("endTurn".equals(action.getString("kind", null)))
					return engine.request("action", "journal-turn", ready).add("actionId", action.get("id"));
			}
			throw new AssertionError("Expected an end-turn action");
		}
	}

	private static final class Memory implements RecoveryRepository {
		Record record;
		final boolean journal;
		int saves, saveAttempts, appends;
		String saveFailure;
		Memory(Record record, boolean journal) { this.record = record; this.journal = journal; }
		@Override public Record find(String id) { return record; }
		@Override public boolean supportsJournal() { return journal; }
		@Override public boolean append(Record next, long expected) { appends++; return true; }
		@Override public boolean save(Record next, long expected) throws SQLException {
			assertEquals(record.generation, expected);
			saveAttempts++;
			if ("RECOVERY_CONFLICT".equals(saveFailure)) return false;
			if ("PERSISTENCE_FAILED".equals(saveFailure)) throw new SQLException("Injected checkpoint failure");
			record = next;
			saves++;
			return true;
		}
	}
}
