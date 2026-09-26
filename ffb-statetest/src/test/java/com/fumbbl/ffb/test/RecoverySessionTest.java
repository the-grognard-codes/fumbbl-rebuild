package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecoverySessionTest {
	@Test void olderPresentationViewsRestoreWithoutWeakeningCurrentViewComparison() throws Exception {
		SetupSession fixture = new SetupSessionTest().session(11);
		Field documentField = SetupSession.class.getDeclaredField("document"); documentField.setAccessible(true);
		MatchDocument document = (MatchDocument) documentField.get(fixture);
		TestServer server = new TestServer();
		SetupSession original = new SetupSession(server.getServer(), document, -15, true);
		for (int version : new int[] {1, 2}) {
			JsonObject payload = JsonObject.readFrom(original.recoveryArtifact()).get("payload").asObject();
			for (String role : new String[] {"homeView", "awayView"}) {
				JsonObject saved = payload.get(role).asObject();
				if (version == 1) {
					saved.remove("projectionVersion");
					for (com.eclipsesource.json.JsonValue item : saved.get("players").asArray()) item.asObject().remove("art");
				} else saved.set("projectionVersion", 2);
				for (com.eclipsesource.json.JsonValue item : saved.get("actions").asArray()) item.asObject().remove("target");
			}
			SetupSession restored = new SetupSession(server.getServer(), document, signed(payload));
			assertEquals(3, view(restored, "home").getInt("projectionVersion", 0));
			assertEquals(view(original, "away"), view(restored, "away"));
		}
		JsonObject tampered = JsonObject.readFrom(original.recoveryArtifact()).get("payload").asObject();
		tampered.get("homeView").asObject().get("players").asArray().get(0).asObject().get("art").asObject().set("positionId", "private-change");
		assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class,
			() -> new SetupSession(server.getServer(), document, signed(tampered))).code);
	}
	@Test void fullRequestHistoryPreservesExactRetryAndRejectsNewWorkBeforeDice() throws Exception {
		SetupSession seed = new SetupSessionTest().session(11);
		Field documentField = SetupSession.class.getDeclaredField("document"); documentField.setAccessible(true);
		SetupSession session = new SetupSession(new TestServer().getServer(), (MatchDocument) documentField.get(seed), -8, true);
		JsonObject before = view(session, "home"); String role = before.getString("actor", null);
		JsonObject request = new JsonObject().add("operation", "choice").add("requestId", "accepted")
			.add("expectedRevision", before.get("revision")).add("promptId", before.get("prompt").asObject().get("id")).add("optionId", "heads");
		assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
		Field historyField = SetupSession.class.getDeclaredField("history"); historyField.setAccessible(true);
		@SuppressWarnings("unchecked") java.util.Map<String, Object> history = (java.util.Map<String, Object>) historyField.get(session);
		Object entry = history.values().iterator().next();
		for (int index = 1; index < 8192; index++) history.put(role + "\nfixture-" + index, entry);
		String artifact = session.recoveryArtifact();
		assertTrue(session.apply(role, request).getBoolean("duplicate", false));
		assertEquals("REQUEST_HISTORY_LIMIT", assertThrows(MatchService.Failure.class,
			() -> session.apply(role, JsonObject.readFrom(request.toString()).set("requestId", "new"))).code);
		assertEquals(artifact, session.recoveryArtifact());
	}
	@Test void prematchAndPlacementRestoreBothViewsAndCommittedRetryWithoutConsumingDice() throws Exception {
		SetupSession fixture = new SetupSessionTest().session(11);
		Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true);
		MatchDocument document = (MatchDocument) field.get(fixture);
		TestServer server = new TestServer();
		SetupSession original = new SetupSession(server.getServer(), document, -3, true);
		for (int decision = 0; decision < 2; decision++) {
			SetupSession restored = restore(server, document, original);
			JsonObject view = view(original, "home");
			JsonObject prompt = view.get("prompt").asObject();
			JsonObject request = new JsonObject().add("operation", "choice").add("requestId", "choice" + decision)
				.add("expectedRevision", view.get("revision")).add("promptId", prompt.get("id"))
				.add("optionId", decision == 0 ? "heads" : "receive");
			String role = view.get("actor").asString();
			assertEquals(original.apply(role, request), restored.apply(role, request));
			// Separate live executions have different elapsed times in model and log.
			// Restoration itself below still compares every field exactly.
			JsonObject continued = JsonObject.readFrom(original.recoveryArtifact()).get("payload").asObject();
			JsonObject continuedRestored = JsonObject.readFrom(restored.recoveryArtifact()).get("payload").asObject();
			removeElapsed(continued); removeElapsed(continuedRestored);
			compare(continued, continuedRestored, "continued");
			SetupSession after = restore(server, document, original);
			String beforeRetry = after.recoveryArtifact();
			assertTrue(after.apply(role, request).getBoolean("duplicate", false));
			assertEquals(beforeRetry, after.recoveryArtifact());
		}
		assertEquals("SETUP", view(original, "home").getString("phase", null));
		restore(server, document, original);
	}

	@Test void corruptArtifactFailsClosedAndLegacyLifetimeCannotBeUpgraded() throws Exception {
		SetupSession legacy = new SetupSessionTest().session(11);
		assertThrows(IllegalStateException.class, legacy::recoveryArtifact);
		Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true);
		MatchDocument document = (MatchDocument) field.get(legacy);
		assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class,
			() -> new SetupSession(new TestServer().getServer(), document, "{}")).code);
	}

	@Test void unsupportedVersionsAndUnknownRecoveryFieldsAreRejectedEvenWithValidChecksum() throws Exception {
		SetupSession fixture = new SetupSessionTest().session(11);
		Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true);
		MatchDocument document = (MatchDocument) field.get(fixture);
		TestServer server = new TestServer();
		String artifact = new SetupSession(server.getServer(), document, -4, true).recoveryArtifact();
		for (String version : new String[] {"recoveryVersion", "replayVersion", "runtimeVersion", "engineVersion"}) {
			JsonObject payload = JsonObject.readFrom(artifact).get("payload").asObject();
			if (version.endsWith("Version") && (version.equals("runtimeVersion") || version.equals("engineVersion"))) payload.set(version, "unknown");
			else payload.set(version, 99);
			assertEquals("RECOVERY_UNSUPPORTED", assertThrows(MatchService.Failure.class,
				() -> new SetupSession(server.getServer(), document, signed(payload))).code);
		}
		JsonObject extra = JsonObject.readFrom(artifact).get("payload").asObject().add("futureSemantics", true);
		assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class,
			() -> new SetupSession(server.getServer(), document, signed(extra))).code);
		JsonObject damaged = JsonObject.readFrom(artifact); damaged.get("payload").asObject().set("revision", 123);
		assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class,
			() -> new SetupSession(server.getServer(), document, damaged.toString())).code);
	}

	@Test void r41CheckpointRestoresMutualConsentAndRebasesOnlyThePausedTurnClock() throws Exception {
		SetupSession seed = new SetupSessionTest().session(11);
		Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true);
		MatchDocument document = (MatchDocument) field.get(seed);
		TestServer server = new TestServer();
		SetupSession session = new SetupSession(server.getServer(), document, -9, true, true, true);
		session.startSaveResumeRetention(1000L);
		Field state = SetupSession.class.getDeclaredField("state"); state.setAccessible(true);
		((com.fumbbl.ffb.server.GameState) state.get(session)).setTurnTimeStarted(100L);
		JsonObject view = view(session, "home");
		JsonObject request = save(view, "save-request", "saveRequest", null);
		assertEquals("ACCEPTED", session.saveResume("home", request, 2000L).getString("code", null));
		JsonObject payload = JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject();
		assertEquals(3, payload.getInt("recoveryVersion", -1));
		assertEquals(SetupSession.SAVE_RESUME_RUNTIME, payload.getString("runtimeVersion", null));
		String proposal = payload.get("saveResume").asObject().get("proposal").asObject().getString("id", null);
		JsonObject accept = save(view, "save-accept", "saveAccept", proposal);
		assertEquals("ACCEPTED", session.saveResume("away", accept, 2100L).getString("code", null));
		String suspended = session.recoveryArtifact();
		SetupSession restored = new SetupSession(server.getServer(), document, suspended);
		assertEquals(suspended, restored.recoveryArtifact());
		assertEquals("MATCH_SUSPENDED", assertThrows(MatchService.Failure.class,
			() -> restored.apply(view.getString("actor", null), JsonObject.readFrom(request.toString()).set("requestId", "blocked"))).code);
		JsonObject resume = save(view, "resume-request", "resumeRequest", null);
		assertEquals("ACCEPTED", restored.saveResume("away", resume, 3000L).getString("code", null));
		String resumeProposal = JsonObject.readFrom(restored.recoveryArtifact()).get("payload").asObject().get("saveResume").asObject().get("proposal").asObject().getString("id", null);
		JsonObject resumeAccept = save(view, "resume-accept", "resumeAccept", resumeProposal);
		assertEquals("ACCEPTED", restored.saveResume("home", resumeAccept, 5100L).getString("code", null));
		assertEquals(3100L, ((com.fumbbl.ffb.server.GameState) state.get(restored)).getTurnTimeStarted());
		String after = restored.recoveryArtifact();
		assertTrue(restored.saveResume("home", resumeAccept, 5200L).getBoolean("duplicate", false));
		assertEquals(after, restored.recoveryArtifact());
	}

	private String signed(JsonObject payload) throws Exception {
		byte[] bytes = java.security.MessageDigest.getInstance("SHA-256").digest(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
		StringBuilder checksum = new StringBuilder(); for (byte value : bytes) checksum.append(String.format("%02x", value & 255));
		return new JsonObject().add("payload", payload).add("sha256", checksum.toString()).toString();
	}
	private JsonObject save(JsonObject view, String requestId, String operation, String proposalId) {
		JsonObject request = new JsonObject().add("version", 1).add("type", "setup").add("requestId", requestId)
			.add("operation", operation).add("matchId", view.get("matchId")).add("expectedRevision", view.get("revision"));
		if (proposalId != null) request.add("proposalId", proposalId);
		return request;
	}

	private SetupSession restore(TestServer server, MatchDocument document, SetupSession original) {
		SetupSession restored = new SetupSession(server.getServer(), document, original.recoveryArtifact());
		assertEquals(view(original, "home"), view(restored, "home"));
		assertEquals(view(original, "away"), view(restored, "away"));
		assertArtifact(original, restored);
		return restored;
	}

	private JsonObject view(SetupSession session, String role) {
		return session.reply("inspect", "ACCEPTED", false, role).get("state").asObject();
	}

	private void assertArtifact(SetupSession original, SetupSession restored) {
		compare(JsonObject.readFrom(original.recoveryArtifact()).get("payload"), JsonObject.readFrom(restored.recoveryArtifact()).get("payload"), "payload");
	}
	private void compare(com.eclipsesource.json.JsonValue a, com.eclipsesource.json.JsonValue b, String path) {
		if (a.isObject() && b.isObject()) {
			assertEquals(a.asObject().names(), b.asObject().names(), path);
			for (String key : a.asObject().names()) compare(a.asObject().get(key), b.asObject().get(key), path + "/" + key);
		} else if (a.isArray() && b.isArray()) {
			assertEquals(a.asArray().size(), b.asArray().size(), path);
			for (int i = 0; i < a.asArray().size(); i++) compare(a.asArray().get(i), b.asArray().get(i), path + "/" + i);
		} else assertTrue(a.equals(b), path);
	}
	private void removeElapsed(com.eclipsesource.json.JsonValue value) {
		if (value.isObject()) {
			value.asObject().remove("gameTime");
			for (com.eclipsesource.json.JsonObject.Member member : value.asObject()) removeElapsed(member.getValue());
		} else if (value.isArray()) for (com.eclipsesource.json.JsonValue item : value.asArray()) removeElapsed(item);
	}
}
