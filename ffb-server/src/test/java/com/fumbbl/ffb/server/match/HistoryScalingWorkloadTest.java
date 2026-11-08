package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.management.ManagementFactory;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Opt-in experiment: legal retained histories, identical current pitch and native target actions. */
@EnabledIfEnvironmentVariable(named = "HISTORY_SCALING_RUN", matches = "1")
class HistoryScalingWorkloadTest {

	private Path directory() { return Path.of(System.getenv().getOrDefault("HISTORY_SCALING_DIR", ".tools/history-scaling")).toAbsolutePath(); }
	private int[] levels() { return Arrays.stream(System.getenv().getOrDefault("HISTORY_SCALING_LEVELS", "0,32,128,512,1024").split(",")).mapToInt(Integer::parseInt).toArray(); }

	@Test void generateFixtures() throws Exception {
		Files.createDirectories(directory());
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		SetupSession builder = fixture.session;
		JsonObject view = advance(builder, fixture, true);
		String role = view.getString("actor", null);
		GameState engine = engine(builder);
		Game game = engine.getGame();
		Player<?> player = Arrays.stream(("home".equals(role) ? game.getTeamHome() : game.getTeamAway()).getPlayers())
			.filter(candidate -> FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(candidate))).findFirst().orElseThrow();
		FieldCoordinate origin = game.getFieldModel().getPlayerCoordinate(player), alternate = null;
		for (int x = "home".equals(role) ? 0 : 13; x < ("home".equals(role) ? 13 : 26) && alternate == null; x++)
			for (int y = 0; y < 15; y++) if (game.getFieldModel().getPlayer(new FieldCoordinate(x, y)) == null) { alternate = new FieldCoordinate(x, y); break; }
		assertTrue(alternate != null);
		JsonArray manifest = new JsonArray();
		String pitch = null;
		int added = 0;
		for (int level : levels()) {
			assertTrue(level >= added && level % 2 == 0 && level <= 7000);
			try {
				while (added < level) {
					FieldCoordinate to = added % 2 == 0 ? alternate : origin;
					JsonObject request = fixture.request("place", "history-" + added, view).add("playerId", player.getId())
						.add("to", new JsonObject().add("x", to.getX()).add("y", to.getY()));
					view = accepted(builder.apply(role, request));
					// Match the production boundary: freeze new native command JSON once.
					engine.getGameLog().recoveryJsonFrom(engine.getGameLog().size());
					added++;
				}
			} catch (MatchService.Failure limit) {
				manifest.add(new JsonObject().add("requestedAddedDecisions", level).add("admissionCode", limit.code).add("lastAcceptedAddedDecisions", added));
				break;
			}
			String setup = builder.recoveryArtifact();
			SetupSession session = new SetupSession(fixture.server, fixture.document, setup);
			JsonObject ready = advance(session, fixture, false);
			GameState targetEngine = engine(session);
			Game targetGame = targetEngine.getGame();
			Player<?> source = targetGame.getActingTeam().getPlayers()[0], receiver = targetGame.getActingTeam().getPlayers()[1];
			UtilBox.putAllPlayersIntoBox(targetGame);
			place(targetGame, source, 7, 7); place(targetGame, receiver, 12, 7);
			targetGame.getTurnData().setPassUsed(false);
			targetGame.getFieldModel().setBallCoordinate(new FieldCoordinate(7, 7));
			targetGame.getFieldModel().setBallMoving(false); targetGame.getFieldModel().setBallInPlay(true);
			List<DiceCategory> rolls = new ArrayList<>();
			for (int index = 0; index < 20; index++) { DiceCategory roll = new DiceCategory(); roll.parseCommand("6", targetGame, targetGame.getTeamHome()); rolls.add(roll); }
			targetEngine.getDiceRoller().getTestRolls().put("General", rolls);
			String targetRole = ready.getString("actor", null);
			ready = session.reply("ready", "ACCEPTED", false, targetRole).get("state").asObject();
			JsonObject declaration = null;
			for (JsonValue value : ready.get("actions").asArray())
				if ("declarePass".equals(value.asObject().getString("kind", null)) && source.getId().equals(value.asObject().getString("sourcePlayerId", null))) declaration = value.asObject();
			assertTrue(declaration != null, "Pass declaration must be offered");
			ready = accepted(session.apply(targetRole, fixture.request("action", "target-declaration", ready).add("actionId", declaration.get("id"))));
			String currentPitch = ready.get("players").toString() + ready.get("ball").toString();
			if (pitch == null) pitch = currentPitch; else assertEquals(pitch, currentPitch, "Only history may differ");
			session.startSaveResumeRetention(System.currentTimeMillis());
			String artifact = session.recoveryArtifact();
			assertEquals(artifact, new SetupSession(fixture.server, fixture.document, artifact).recoveryArtifact(), "Starting fixture must restore exactly");
			Path file = directory().resolve("history-" + level + ".json");
			Files.writeString(file, artifact);
			JsonObject payload = JsonObject.readFrom(artifact).get("payload").asObject();
			manifest.add(new JsonObject().add("addedDecisions", level).add("revision", ready.getInt("revision", -1))
				.add("artifactBytes", artifact.getBytes(StandardCharsets.UTF_8).length).add("sha256", new JsonDigest().sha256(artifact.getBytes(StandardCharsets.UTF_8)))
				.add("nativeCommands", payload.get("native").asObject().get("gameLog").asObject().get("commandArray").asArray().size())
				.add("transcriptRecords", payload.get("transcript").asObject().get("records").asArray().size())
				.add("source", source.getId()).add("receiver", receiver.getId()).add("role", targetRole).add("file", file.toString()));
			System.out.println("HISTORY_FIXTURE added=" + level + " bytes=" + artifact.getBytes(StandardCharsets.UTF_8).length);
		}
		Files.writeString(directory().resolve("fixtures.json"), new JsonObject().add("version", 1).add("fixtures", manifest)
			.add("limitations", "Synthetic history consists of real legal out-and-back setup placements; current two-player test pitch is held constant. History shape differs from a full competitive match.").toString());
	}

	@Test void measureFixtures() throws Exception {
		JsonArray fixtures = JsonObject.readFrom(Files.readString(directory().resolve("fixtures.json"))).get("fixtures").asArray();
		int repeat = Integer.parseInt(System.getenv().getOrDefault("HISTORY_SCALING_REPEAT", "1"));
		int samples = Integer.parseInt(System.getenv().getOrDefault("HISTORY_SCALING_SAMPLES", "4"));
		List<JsonObject> ordered = new ArrayList<>();
		for (JsonValue value : fixtures) if (value.asObject().get("file") != null) ordered.add(value.asObject());
		if (repeat % 2 == 0) java.util.Collections.reverse(ordered);
		else if (repeat > 1) java.util.Collections.rotate(ordered, 2);
		JsonArray results = new JsonArray();
		for (JsonObject fixture : ordered) {
			String artifact = Files.readString(Path.of(fixture.getString("file", null)));
			assertEquals(fixture.getString("sha256", null), new JsonDigest().sha256(artifact.getBytes(StandardCharsets.UTF_8)), "Retained fixture must match its manifest");
			for (String action : new String[] { "move", "pass" }) for (boolean journal : new boolean[] { true, false }) {
				JsonArray measurements = new JsonArray();
				for (int sample = -1; sample < samples; sample++) {
					JsonObject measured = measure(fixture, artifact, action, journal, false);
					// Dispose inline Mockito bookkeeping from this completed synthetic lifetime.
					// Otherwise the harness retains command arguments from earlier samples.
					org.mockito.Mockito.framework().clearInlineMocks();
					if (sample >= 0) measurements.add(measured);
				}
				results.add(new JsonObject().add("addedDecisions", fixture.getInt("addedDecisions", -1)).add("action", action)
					.add("storagePath", journal ? "journal" : "compaction").add("samples", measurements));
				System.out.println("HISTORY_MEASURE repeat=" + repeat + " added=" + fixture.getInt("addedDecisions", -1) + " action=" + action + " journal=" + journal);
				Files.writeString(directory().resolve("run-" + repeat + ".json"), new JsonObject().add("version", 1).add("repeat", repeat)
					.add("javaVersion", System.getProperty("java.version")).add("maxHeapBytes", Runtime.getRuntime().maxMemory()).add("results", results).toString());
			}
		}
	}

	@Test void verifyFixtures() throws Exception {
		JsonArray fixtures = JsonObject.readFrom(Files.readString(directory().resolve("fixtures.json"))).get("fixtures").asArray();
		JsonArray results = new JsonArray();
		for (JsonValue value : fixtures) {
			JsonObject fixture = value.asObject();
			if (fixture.get("file") == null) continue;
			String artifact = Files.readString(Path.of(fixture.getString("file", null)));
			for (String action : new String[] { "move", "pass" }) for (boolean journal : new boolean[] { true, false }) {
				measure(fixture, artifact, action, journal, true);
				org.mockito.Mockito.framework().clearInlineMocks();
				results.add(new JsonObject().add("addedDecisions", fixture.getInt("addedDecisions", -1)).add("action", action).add("journal", journal).add("verified", true));
			}
		}
		Files.writeString(directory().resolve("verification.json"), new JsonObject().add("maxHeapBytes", Runtime.getRuntime().maxMemory()).add("verified", results).toString());
	}

	private JsonObject measure(JsonObject metadata, String artifact, String action, boolean journal, boolean verify) throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		Memory recovery = new Memory(new RecoveryRepository.Record(fixture.document.matchId, 1, artifact), true);
		MatchService matches = mock(MatchService.class);
		for (String role : new String[] { "home", "away" }) when(matches.load(role, fixture.document.matchId)).thenReturn(new MatchService.Result(fixture.document, false));
		SetupApplication application = new SetupApplication(fixture.server, matches, recovery);
		long loadedAt = System.nanoTime();
		JsonObject view = accepted(application.handle(metadata.getString("role", null), new JsonObject().add("version", 1).add("type", "setup")
			.add("operation", "load").add("requestId", "initial-load").add("matchId", fixture.document.matchId)));
		double loadMs = (System.nanoTime() - loadedAt) / 1_000_000.0;
		if (!journal) {
			// Force the real resident journal boundary, without changing the retained
			// payload or target action. Production reaches this boundary after appends.
			Field cursorsField = SetupApplication.class.getDeclaredField("journalCursors"); cursorsField.setAccessible(true);
			@SuppressWarnings("unchecked") Map<String, RecoveryJournal.Cursor> cursors = (Map<String, RecoveryJournal.Cursor>) cursorsField.get(application);
			RecoveryJournal.Cursor before = cursors.get(fixture.document.matchId);
			cursors.put(fixture.document.matchId, new RecoveryJournal.Cursor(before.counts, before.signature, before.hash,
				RecoveryJournal.MAX_ENTRIES - 1, before.journalBytes, before.budget, before.nativeEpoch));
		}
		JsonArray points = new JsonArray();
		if ("move".equals(action)) points.add(new JsonObject().add("x", 8).add("y", 7));
		JsonObject request = fixture.request("movement", "measured-action", view).add("playerId", metadata.getString("source", null))
			.add("kind", action).add("targetPlayerId", JsonValue.NULL).add("waypoints", points);
		if ("pass".equals(action)) request.add("targetSquare", new JsonObject().add("x", 12).add("y", 7));
		long generation = recovery.generation, saves = recovery.saves;
		com.sun.management.ThreadMXBean allocations = (com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean();
		allocations.setThreadAllocatedMemoryEnabled(true);
		long allocated = allocations.getThreadAllocatedBytes(Thread.currentThread().threadId());
		CaptureRequestProbe.Measurement measurement = new CaptureRequestProbe().measure(request,
			() -> application.handle(metadata.getString("role", null), request));
		allocated = allocations.getThreadAllocatedBytes(Thread.currentThread().threadId()) - allocated;
		JsonObject response = measurement.response(); accepted(response); assertFalse(response.getBoolean("duplicate", false));
		assertTrue(recovery.generation > generation, "Acceptance follows repository commit");
		assertEquals(journal, recovery.saves == saves, "Measured storage path must match cohort");
		Field sessionsField = SetupApplication.class.getDeclaredField("sessions"); sessionsField.setAccessible(true);
		@SuppressWarnings("unchecked") Map<String, SetupSession> sessions = (Map<String, SetupSession>) sessionsField.get(application);
		Game game = engine(sessions.get(fixture.document.matchId)).getGame();
		Player<?> source = game.getPlayerById(metadata.getString("source", null));
		if ("move".equals(action)) assertEquals(new FieldCoordinate(8, 7), game.getFieldModel().getPlayerCoordinate(source));
		else assertEquals(game.getFieldModel().getPlayerCoordinate(game.getPlayerById(metadata.getString("receiver", null))), game.getFieldModel().getBallCoordinate());
		double validationMs = 0;
		if (verify) {
			long start = System.nanoTime();
			RecoveryRepository.Record stored = recovery.find(fixture.document.matchId);
			assertEquals(stored.json, new SetupSession(fixture.server, fixture.document, stored.json).recoveryArtifact());
			validationMs = (System.nanoTime() - start) / 1_000_000.0;
		}
		return new JsonObject().add("timing", measurement.timing()).add("allocatedBytes", allocated).add("coldLoadMs", loadMs).add("verifiedRecoveryMs", validationMs);
	}

	private JsonObject advance(SetupSession session, SetupSessionMovementTest.Fixture fixture, boolean stopAtSetup) {
		JsonObject view = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		for (int index = 0; index < 100; index++) {
			if (stopAtSetup && "SETUP".equals(view.getString("phase", null))) return view;
			JsonObject endTurn = null;
			for (JsonValue value : view.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", null))) endTurn = value.asObject();
			if (!stopAtSetup && "REGULAR".equals(view.getString("turnMode", null)) && endTurn != null) return view;
			JsonObject request = fixture.request("action", (stopAtSetup ? "opening-" : "play-") + index, view);
			if ("SETUP".equals(view.getString("phase", null))) request.set("operation", "confirm");
			else if (!view.get("prompt").isNull()) { JsonObject prompt = view.get("prompt").asObject(); request.set("operation", "choice").add("promptId", prompt.get("id")).add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive"); }
			else request.add("actionId", (endTurn == null ? view.get("actions").asArray().get(0).asObject() : endTurn).get("id"));
			view = accepted(session.apply(view.getString("actor", null), request));
		}
		throw new AssertionError("Could not reach target phase");
	}

	private JsonObject accepted(JsonObject response) { assertEquals("ACCEPTED", response.getString("code", null)); return response.get("state").asObject(); }
	private GameState engine(SetupSession session) throws Exception { Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session); }
	private void place(Game game, Player<?> player, int x, int y) { game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y)); game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true)); }

	private static final class Memory implements RecoveryRepository {
		private Record base;
		private final List<Record> entries = new ArrayList<>();
		private final boolean journal;
		private long generation;
		private int saves;
		Memory(Record initial, boolean journal) { base = initial; generation = initial.generation; this.journal = journal; }
		@Override public boolean supportsJournal() { return journal; }
		@Override public Long generation(String id) { return generation; }
		@Override public Record find(String id) { return entries.isEmpty() ? base : new RecoveryJournal().restore(id, generation, base.generation, base.json, entries); }
		@Override public boolean append(Record next, long expected) { if (expected != generation) return false; entries.add(next); generation = next.generation; return true; }
		@Override public boolean save(Record next, long expected) { if (expected != generation) return false; base = next; generation = next.generation; entries.clear(); saves++; return true; }
	}
}
