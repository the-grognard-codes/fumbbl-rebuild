package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ComputerPolicyRecoveryTest {

	@Test void privatePreparedIdentityRoundTripsAndBindsTheFrozenClone() throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
		MatchJson json = new MatchJson();
		JsonObject stored = json.encode(fixture.document);
		MatchDocument restored = json.decode(stored.toString(), 3);
		assertEquals("coach-bogruk-weak", restored.computer.opponentId);
		assertEquals("bogruk-v1", restored.computer.policyVersion);
		assertEquals(42, restored.computer.seed);
		assertEquals(stored, json.encode(restored));
		assertNull(json.publicDocument(restored).get("computer"));
		JsonObject wrong = JsonObject.readFrom(stored.toString());
		wrong.get("computer").asObject().set("opponentId", ComputerOpponentService.BUGMAN_ID).set("policyVersion", "random-v1");
		assertThrows(MatchService.Failure.class, () -> json.decode(wrong.toString(), 3));
		MatchDocument ready = new MatchDocument(restored.matchId, 2, "away", MatchDocument.Lifecycle.AWAITING_SETUP,
			restored.home, restored.away).withComputer(restored.computer);
		assertEquals("coach-bogruk-weak", ready.activated("activate", "activate").computer.opponentId);
	}

	@Test void acceptedPolicyStateAndEngineActionCheckpointTogetherAndExactRetriesDoNotAdvanceEither() throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
		MemoryRecovery recovery = new MemoryRecovery(fixture.document.matchId, fixture.session.recoveryArtifact());
		MatchService matches = mock(MatchService.class);
		when(matches.load("away", fixture.document.matchId)).thenReturn(new MatchService.Result(fixture.document, false));
		when(matches.load("home", fixture.document.matchId)).thenReturn(new MatchService.Result(fixture.document, false));
		SetupApplication application = new SetupApplication(fixture.server, matches, recovery, true, true);
		JsonObject initial = application.handleComputerWithOutcome(load(fixture)).response().get("state").asObject();
		JsonObject prompt = initial.get("prompt").asObject();
		assertEquals("away", prompt.getString("actor", null));
		JsonObject request = load(fixture).set("operation", "choice").set("requestId", "decision-1")
			.add("expectedRevision", initial.getInt("revision", -1)).add("promptId", prompt.get("id"))
			.add("optionId", prompt.get("options").asArray().get(0)).add("computerDecision", decision(initial));
		assertEquals("INVALID_REQUEST", application.handle("away", request).getString("code", null));
		JsonObject malformed = JsonObject.readFrom(request.toString());
		malformed.get("computerDecision").asObject().get("nextPolicyState").asObject().set("actions", 257);
		assertEquals("INVALID_REQUEST", application.handleComputerWithOutcome(malformed).response().getString("code", null));
		assertEquals(1, recovery.record.generation);
		JsonObject accepted = application.handleComputerWithOutcome(request).response();
		assertEquals("ACCEPTED", accepted.getString("code", null));
		JsonObject memory = accepted.get("state").asObject().get("computer").asObject().get("policyState").asObject();
		assertTrue(memory.getBoolean("mistakeUsed", false));
		assertEquals(1, memory.getInt("actions", -1));
		assertEquals(2, recovery.record.generation);
		JsonObject duplicate = application.handleComputerWithOutcome(request).response();
		assertTrue(duplicate.getBoolean("duplicate", false));
		assertEquals(memory, duplicate.get("state").asObject().get("computer").asObject().get("policyState"));
		assertEquals(2, recovery.record.generation);
		SetupApplication restarted = new SetupApplication(fixture.server, matches, recovery, true, true);
		JsonObject recovered = restarted.handleComputerWithOutcome(request).response();
		assertEquals("ACCEPTED", recovered.getString("code", null));
		assertTrue(recovered.getBoolean("duplicate", false));
		JsonObject recoveredMemory = recovered.get("state").asObject().get("computer").asObject().get("policyState").asObject();
		for (String field : memory.names()) assertEquals(memory.get(field), recoveredMemory.get(field), field);
		assertEquals(2, recovery.record.generation);
		JsonObject home = restarted.handle("home", load(fixture)).get("state").asObject();
		assertNull(home.get("computer"));
		assertFalse(restarted.transcriptPage(fixture.document.matchId, 0, 8).toString().contains("computerDecision"));

		int revision = recovered.get("state").asObject().getInt("revision", -1);
		JsonObject save = load(fixture).set("operation", "saveRequest").set("requestId", "human-save").add("expectedRevision", revision);
		JsonObject proposed = restarted.handle("home", save);
		assertEquals("ACCEPTED", proposed.getString("code", null));
		String proposal = proposed.get("state").asObject().get("saveResume").asObject().getString("proposalId", null);
		JsonObject acceptSave = load(fixture).set("operation", "saveAccept").set("requestId", "bogruk-save")
			.add("expectedRevision", revision).add("proposalId", proposal);
		JsonObject rewrite = JsonObject.readFrom(acceptSave.toString()).add("computerDecision", decision(initial));
		assertEquals("INVALID_REQUEST", restarted.handleComputerWithOutcome(rewrite).response().getString("code", null));
		JsonObject suspended = restarted.handleComputerWithOutcome(acceptSave).response();
		assertEquals("SUSPENDED", suspended.get("state").asObject().get("saveResume").asObject().getString("status", null));
		SetupApplication resumedApplication = new SetupApplication(fixture.server, matches, recovery, true, true);
		JsonObject savedView = resumedApplication.handleComputerWithOutcome(load(fixture)).response().get("state").asObject();
		for (String field : memory.names()) assertEquals(memory.get(field), savedView.get("computer").asObject().get("policyState").asObject().get(field), field);
		JsonObject resume = load(fixture).set("operation", "resumeRequest").set("requestId", "human-resume").add("expectedRevision", revision);
		JsonObject resuming = resumedApplication.handle("home", resume);
		String resumeId = resuming.get("state").asObject().get("saveResume").asObject().getString("proposalId", null);
		JsonObject acceptResume = load(fixture).set("operation", "resumeAccept").set("requestId", "bogruk-resume")
			.add("expectedRevision", revision).add("proposalId", resumeId);
		JsonObject active = resumedApplication.handleComputerWithOutcome(acceptResume).response();
		assertEquals("ACTIVE", active.get("state").asObject().get("saveResume").asObject().getString("status", null));
		assertEquals(revision, active.get("state").asObject().getInt("revision", -1));
		long generation = recovery.record.generation;
		assertTrue(resumedApplication.handleComputerWithOutcome(acceptResume).response().getBoolean("duplicate", false));
		assertEquals(generation, recovery.record.generation);
		for (String field : memory.names()) assertEquals(memory.get(field), active.get("state").asObject().get("computer").asObject().get("policyState").asObject().get(field), field);
	}

	private JsonObject load(BogrukEngineFixture fixture) {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load")
			.add("requestId", "load").add("matchId", fixture.document.matchId);
	}

	private JsonObject decision(JsonObject state) {
		return new JsonObject().add("policyVersion", "bogruk-v1").add("reason", "Pursue the ball")
			.add("nextPolicyState", new JsonObject().add("version", 1)
				.add("turnKey", state.get("computer").asObject().get("progress").asObject().getString("turnKey", null))
				.add("actions", 1).add("mistakeUsed", true).add("plan", JsonValue.NULL));
	}

	private static final class MemoryRecovery implements RecoveryRepository {
		Record record;
		MemoryRecovery(String id, String artifact) { record = new Record(id, 1, artifact); }
		@Override public Record find(String matchId) { return record; }
		@Override public boolean save(Record next, long generation) {
			if (record.generation != generation) return false;
			record = next; return true;
		}
	}
}
