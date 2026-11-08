package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.CaptureRequestProbe;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupApplicationJournalTest {
	@Test void acceptedNativeActionAppendsOneSmallRecordInsteadOfRewritingHistory() throws Exception {
		assertEquals(1, exercise(true).get("values").asObject().getInt("checkpointPath", -1));
	}

	@Test void fullCheckpointFallbackIsNotReportedAsJournalCompaction() throws Exception {
		assertEquals(3, exercise(false).get("values").asObject().getInt("checkpointPath", -1));
	}

	private JsonObject exercise(boolean journal) throws Exception {
		SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
		engine.advanceToTurn(); engine.session.startSaveResumeRetention(System.currentTimeMillis());
		String id = engine.document.matchId;
		Memory recovery = new Memory(new RecoveryRepository.Record(id, 1, engine.session.recoveryArtifact()));
		recovery.journal = journal;
		MatchService matches = mock(MatchService.class);
		when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
		when(matches.load("away", id)).thenReturn(new MatchService.Result(engine.document, false));
		SetupApplication application = new SetupApplication(engine.server, matches, recovery);
		JsonObject ready = application.handle("home", new JsonObject().add("version", 1).add("type", "setup")
			.add("operation", "load").add("requestId", "load").add("matchId", id)).get("state").asObject();
		JsonObject endTurn = null;
		for (JsonValue value : ready.get("actions").asArray())
			if ("endTurn".equals(value.asObject().getString("kind", null))) endTurn = value.asObject();
		JsonObject request = engine.request("action", "journal-turn", ready).add("actionId", endTurn.get("id"));
		JsonObject trace = new CaptureRequestProbe().details(request, () -> {
			JsonObject response = application.handle(ready.getString("actor", null), request);
			assertEquals("ACCEPTED", response.getString("code", null));
			return response;
		});
		assertEquals(journal ? 1 : 0, recovery.appends, "Journal-capable repositories append ordinary actions");
		assertEquals(journal ? 0 : 1, recovery.saves, "Other repositories retain the full checkpoint fallback");
		return trace;
	}

	private static final class Memory implements RecoveryRepository {
		Record record; int saves, appends; boolean journal = true;
		Memory(Record record) { this.record = record; }
		@Override public Record find(String id) { return record; }
		@Override public boolean supportsJournal() { return journal; }
		@Override public boolean append(Record next, long expected) { appends++; return true; }
		@Override public boolean save(Record next, long expected) {
			assertEquals(record.generation, expected); record = next; saves++; return true;
		}
	}
}
