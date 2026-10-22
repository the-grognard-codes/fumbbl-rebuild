package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupApplicationJournalTest {
	@Test void acceptedNativeActionAppendsOneSmallRecordInsteadOfRewritingHistory() throws Exception {
		SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
		engine.advanceToTurn(); engine.session.startSaveResumeRetention(System.currentTimeMillis());
		String id = engine.document.matchId;
		Memory recovery = new Memory(new RecoveryRepository.Record(id, 1, engine.session.recoveryArtifact()));
		MatchService matches = mock(MatchService.class);
		when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
		when(matches.load("away", id)).thenReturn(new MatchService.Result(engine.document, false));
		SetupApplication application = new SetupApplication(engine.server, matches, recovery);
		JsonObject ready = application.handle("home", new JsonObject().add("version", 1).add("type", "setup")
			.add("operation", "load").add("requestId", "load").add("matchId", id)).get("state").asObject();
		JsonObject endTurn = null;
		for (JsonValue value : ready.get("actions").asArray())
			if ("endTurn".equals(value.asObject().getString("kind", null))) endTurn = value.asObject();
		JsonObject response = application.handle(ready.getString("actor", null), engine.request("action", "journal-turn", ready)
			.add("actionId", endTurn.get("id")));
		assertEquals("ACCEPTED", response.getString("code", null));
		assertEquals(1, recovery.appends, "The durable action must append a journal entry");
		assertEquals(0, recovery.saves, "Ordinary actions must not rewrite full history");
	}

	private static final class Memory implements RecoveryRepository {
		Record record; int saves, appends;
		Memory(Record record) { this.record = record; }
		@Override public Record find(String id) { return record; }
		@Override public boolean supportsJournal() { return true; }
		@Override public boolean append(Record next, long expected) { appends++; return true; }
		@Override public boolean save(Record next, long expected) {
			assertEquals(record.generation, expected); record = next; saves++; return true;
		}
	}
}
