package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Recovery checkpoints at transitions that retain native step-local state. */
class RecoveryScenariosTest {
	@Test void prematchCheckpointRestoresInAnotherJvm() throws Exception { restore(recoverable()); }
	private int requestNumber;
	@Test
	void quickSnapCountsAcceptedPlayersAndRestoresLimitsAndEarlyFinish() throws Exception {
		SetupSession session = ready(recoverable());
		engine(session).getDiceRoller().clearTestRolls();
		TestRolls.on(engine(session)).general(1, 1, 4, 5, 1, 6, 6, 6, 6, 6, 6, 6);
		submit(session, view(session, "home").get("actions").asArray().get(82).asObject(), unique("quick-kick"));
		JsonObject initial = view(session, "home");
		assertEquals("QUICK_SNAP", initial.getString("turnMode", null));
		assertEquals(4, initial.get("kickoff").asObject().getInt("allowed", -1));
		assertEquals(0, initial.get("kickoff").asObject().getInt("completed", -1));
		JsonObject move = action(session, "kickoffMove");
		String role = move.getString("actor", null), movedPlayer = move.getString("sourcePlayerId", null);
		assertTrue(movedPlayer != null);
		Game game = engine(session).getGame();
		FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(game.getPlayerById(movedPlayer));
		JsonObject target = move.get("target").asObject();
		assertEquals(1, Math.max(Math.abs(from.getX() - target.getInt("x", -1)), Math.abs(from.getY() - target.getInt("y", -1))));
		JsonObject command = request(initial, "action", unique("quick-move")).add("actionId", move.get("id"));
		assertEquals("WRONG_ACTOR", assertThrows(MatchService.Failure.class,
			() -> session.apply("home".equals(role) ? "away" : "home", command)).code);
		assertEquals("ACCEPTED", session.apply(role, command).getString("code", null));
		JsonObject after = view(session, role);
		assertEquals(1, after.get("kickoff").asObject().getInt("completed", -1));
		for (JsonValue offered : after.get("actions").asArray())
			assertTrue(!JsonValue.valueOf(movedPlayer).equals(offered.asObject().get("sourcePlayerId")), "A moved player cannot move again");
		assertEquals(after.get("kickoff"), session.spectatorView().get("kickoff"));
		assertEquals(after.get("kickoff"), view(session, "home".equals(role) ? "away" : "home").get("kickoff"));
		SetupSession restored = restore(session);
		JsonObject legacy = JsonObject.readFrom(session.recoveryArtifact()), payload = legacy.get("payload").asObject();
		for (String key : new String[] { "homeView", "awayView" }) {
			JsonObject saved = payload.get(key).asObject(); saved.remove("kickoff");
			for (JsonValue offered : saved.get("actions").asArray()) if ("kickoffMove".equals(offered.asObject().getString("kind", null)))
				offered.asObject().set("sourcePlayerId", JsonValue.NULL);
		}
		byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(payload.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
		StringBuilder checksum = new StringBuilder();
		for (byte value : hash) checksum.append(String.format("%02x", value & 0xff));
		legacy.set("sha256", checksum.toString());
		SetupSession upgraded = new SetupSession(new TestServer().getServer(), document(session), legacy.toString());
		assertEquals(after, view(upgraded, role), "Old kickoff checkpoint views remain recoverable");
		assertTrue(restored.apply(role, command).getBoolean("duplicate", false));
		assertEquals(1, view(restored, role).get("kickoff").asObject().getInt("completed", -1));
		JsonObject stale = request(initial, "action", unique("stale-quick")).add("actionId", move.get("id"));
		assertEquals("STALE_REVISION", assertThrows(MatchService.Failure.class, () -> restored.apply(role, stale)).code);
		assertEquals(1, view(restored, role).get("kickoff").asObject().getInt("completed", -1));
		// An early finish remains offered; the same checkpoint can instead use its complete native allowance.
		submit(restored, action(restored, "kickoffChoice"), unique("finish-quick"));
		assertTrue(!"QUICK_SNAP".equals(view(restored, role).getString("turnMode", null)));
		for (int completed = 1; completed < 4; completed++) {
			submit(session, action(session, "kickoffMove"), unique("limit-move"));
			if (completed < 3) assertEquals(completed + 1, view(session, role).get("kickoff").asObject().getInt("completed", -1));
		}
		assertTrue(!"QUICK_SNAP".equals(view(session, role).getString("turnMode", null)));
		assertTrue(!hasAction(session, "kickoffMove"));
	}
	@Test
	void highKickAndTouchbackUseNativeReceivingPlayerTargets() throws Exception {
		SetupSession highKick = ready(recoverable());
		engine(highKick).getDiceRoller().clearTestRolls();
		TestRolls.on(engine(highKick)).general(1, 1, 2, 3, 6, 6, 6);
		submit(highKick, view(highKick, "home").get("actions").asArray().get(82).asObject(), unique("high-kick"));
		JsonObject highView = view(highKick, "home");
		assertEquals("HIGH_KICK", highView.getString("turnMode", null));
		assertEquals(1, highView.get("kickoff").asObject().getInt("allowed", -1));
		JsonObject redeploy = action(highKick, "kickoffMove");
		assertEquals(highView.get("ball"), redeploy.get("target"));
		String playerId = redeploy.get("sourcePlayerId").asString();
		submit(highKick, redeploy, unique("redeploy"));
		FieldCoordinate moved = engine(highKick).getGame().getFieldModel().getPlayerCoordinate(engine(highKick).getGame().getPlayerById(playerId));
		assertEquals(redeploy.get("target").asObject().getInt("x", -1), moved.getX());
		assertEquals(redeploy.get("target").asObject().getInt("y", -1), moved.getY());
		SetupSession touchback = ready(recoverable());
		engine(touchback).getDiceRoller().clearTestRolls();
		TestRolls.on(engine(touchback)).general(1, 6, 1, 1, 6, 6, 6);
		submit(touchback, view(touchback, "home").get("actions").asArray().get(0).asObject(), unique("out-kick"));
		assertEquals("TOUCHBACK", view(touchback, "home").getString("turnMode", null));
		JsonObject recipient = action(touchback, "touchback");
		String receiver = recipient.getString("actor", null);
		assertEquals(engine(touchback).getGame().isHomePlaying() ? "away" : "home", receiver);
		String recipientId = recipient.get("target").asObject().get("playerId").asString();
		submit(touchback, recipient, unique("assign-touchback"));
		Game game = engine(touchback).getGame();
		assertEquals(game.getFieldModel().getPlayerCoordinate(game.getPlayerById(recipientId)), game.getFieldModel().getBallCoordinate());
	}
	@Test
	void placementCheckpointRestoresBothViewsAndRetry() throws Exception {
		SetupSession session = recoverable(); choosePrematch(session);
		JsonObject snapshot = view(session, "home"); String role = snapshot.getString("actor", null);
		JsonObject player = firstPlayer(snapshot, role);
		JsonObject request = request(snapshot, "place", "placement").add("playerId", player.get("id"))
			.add("to", new JsonObject().add("x", "home".equals(role) ? 10 : 15).add("y", 4));
		assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
		assertRestoresAndRetries(session, role, request);
	}

	@Test
	void defendingTeamBlockDecisionCheckpointRestoresNativeState() throws Exception {
		SetupSession session = ready(recoverable()); advanceKickoff(session);
		String[] players = forceUphillBlock(session);
		submit(session, actionFor(session, "selectBlock", players[0]), "select-block");
		submit(session, actionFor(session, "block", players[1]), "block");
		JsonObject die = action(session, "blockDie");
		JsonObject request = request(view(session, "home"), "action", "defending-die").add("actionId", die.get("id"));
		Game game = engine(session).getGame();
		String active = game.getTeamHome().hasPlayer(game.getActingPlayer().getPlayer()) ? "home" : "away";
		assertTrue(!active.equals(die.getString("actor", null)), "An uphill block leaves die selection to the defending team: " + game.getDialogParameter().toJsonValue());
		SetupSession restored = restore(session);
		assertEquals(session.apply(die.getString("actor", null), request), restored.apply(die.getString("actor", null), request));
		String after = restored.recoveryArtifact();
		assertTrue(restored.apply(die.getString("actor", null), request).getBoolean("duplicate", false));
		assertEquals(after, restored.recoveryArtifact());
	}

	@Test
	void touchdownDriveAndTerminalCompletedMatchRestoreExactly() throws Exception {
		SetupSession session = ready(recoverable()); advanceKickoff(session);
		Game game = engine(session).getGame(); Player<?> scorer = game.getActingTeam().getPlayers()[0];
		boolean home = game.isHomePlaying(); FieldCoordinate at = new FieldCoordinate(home ? 24 : 1, 7);
		game.getFieldModel().setPlayerCoordinate(scorer, at); game.getFieldModel().setBallCoordinate(at);
		game.getFieldModel().setBallInPlay(true); game.getFieldModel().setBallMoving(false);
		game.getFieldModel().setWeather(Weather.SWELTERING_HEAT);
		JsonObject select = null;
		for (JsonValue item : view(session, "home").get("actions").asArray()) {
			JsonObject candidate = item.asObject();
			if ("select".equals(candidate.getString("kind", null)) && candidate.getString("id", "").endsWith(scorer.getId())) select = candidate;
		}
		assertTrue(select != null); submit(session, select, "score-select");
		JsonObject score = ending(session, ":move-" + (home ? 25 : 0) + "-7");
		JsonObject touchdown = request(view(session, "home"), "action", "touchdown").add("actionId", score.get("id"));
		assertEquals("ACCEPTED", session.apply(score.getString("actor", null), touchdown).getString("code", null));
		assertEquals("SETUP", view(session, "home").getString("phase", null));
		boolean exhausted = false;
		for (JsonValue value : view(session, "home").get("players").asArray())
			if ("Exhausted".equals(value.asObject().getString("status", null))) exhausted = true;
		assertTrue(exhausted, "The recovered drive must exercise unavailable setup players");
		assertRestoresAndRetries(session, score.getString("actor", null), touchdown);
		SetupSession terminal = playToFullTime(session);
		SetupSession restored = restore(terminal);
		assertEquals(terminal.completedMatch().json(), restored.completedMatch().json());
	}

	private SetupSession playToFullTime(SetupSession session) throws Exception {
		boolean restoredAtHalftime = false;
		JsonObject last = null; String role = null;
		for (int number = 0; number < 160 && !session.isComplete(); number++) {
			JsonObject snapshot = view(session, "home");
			if ("SETUP".equals(snapshot.getString("phase", null))) {
				if (snapshot.getInt("half", 0) == 2 && !restoredAtHalftime) {
					session = restore(session); restoredAtHalftime = true;
				}
				arrange(session); continue;
			}
			JsonObject selected;
			if ("READY_FOR_KICKOFF".equals(snapshot.getString("phase", null))) {
				engine(session).getDiceRoller().clearTestRolls();
				TestRolls.on(engine(session)).general(1, 1, 3, 3, 3, 3, 3, 3);
				selected = snapshot.get("actions").asArray().get(82).asObject();
			} else if (hasAction(session, "endTurn")) selected = action(session, "endTurn");
			else selected = snapshot.get("actions").asArray().get(0).asObject();
			last = request(view(session, "home"), "action", "full-" + number).add("actionId", selected.get("id"));
			role = selected.getString("actor", null);
			assertEquals("ACCEPTED", session.apply(role, last).getString("code", null));
		}
		assertTrue(session.isComplete()); assertTrue(restoredAtHalftime);
		String artifact = session.recoveryArtifact();
		assertTrue(session.apply(role, last).getBoolean("duplicate", false)); assertEquals(artifact, session.recoveryArtifact());
		return session;
	}

	private SetupSession ready(SetupSession session) { choosePrematch(session); arrange(session); arrange(session); return session; }
	private void choosePrematch(SetupSession session) {
		for (int i = 0; i < 2; i++) {
			JsonObject state = view(session, "home"), prompt = state.get("prompt").asObject();
			JsonObject command = request(state, "choice", "prematch-" + i).add("promptId", prompt.get("id")).add("optionId", prompt.get("options").asArray().get(0));
			assertEquals("ACCEPTED", session.apply(prompt.getString("actor", null), command).getString("code", null));
		}
	}
	private void arrange(SetupSession session) {
		JsonObject snapshot = view(session, "home"); String role = snapshot.getString("actor", null); int index = 0;
		for (JsonValue value : snapshot.get("players").asArray()) {
			JsonObject player = value.asObject(); if (!role.equals(player.getString("role", null))) continue;
			// Native setup retains exhausted/injured players on the roster but cannot place them.
			Player<?> nativePlayer = engine(session).getGame().getPlayerById(player.getString("id", null));
			if (!engine(session).getGame().getFieldModel().getPlayerState(nativePlayer).canBeMovedDuringSetup()) continue;
			int x = index < 3 ? 12 : 10; if ("away".equals(role)) x = 25 - x;
			JsonObject command = request(view(session, "home"), "place", unique("setup-" + role + "-" + index)).add("playerId", player.get("id"))
				.add("to", new JsonObject().add("x", x).add("y", index < 3 ? 6 + index : index + 1));
			assertEquals("ACCEPTED", session.apply(role, command).getString("code", null)); index++;
		}
		assertEquals("ACCEPTED", session.apply(role, request(view(session, "home"), "confirm", unique("confirm-" + role))).getString("code", null));
	}
	private void advanceKickoff(SetupSession session) {
		TestRolls.on(engine(session)).general(1, 1, 3, 3, 3, 3, 3, 3);
		submit(session, view(session, "home").get("actions").asArray().get(82).asObject(), "kickoff");
		for (int i = 0; i < 20 && !"REGULAR".equals(view(session, "home").getString("turnMode", null)); i++)
			submit(session, view(session, "home").get("actions").asArray().get(0).asObject(), "kickoff-next-" + i);
		assertEquals("REGULAR", view(session, "home").getString("turnMode", null));
	}
	private void assertRestoresAndRetries(SetupSession original, String role, JsonObject prior) throws Exception {
		SetupSession restored = restore(original); String before = restored.recoveryArtifact();
		assertTrue(restored.apply(role, prior).getBoolean("duplicate", false)); assertEquals(before, restored.recoveryArtifact());
	}
	private SetupSession restore(SetupSession original) throws Exception {
		java.nio.file.Path directory = java.nio.file.Paths.get("target", "r2-process-characterization");
		java.nio.file.Files.createDirectories(directory);
		java.nio.file.Path artifact = java.nio.file.Files.createTempFile(directory, "checkpoint-", ".json");
		java.nio.file.Files.write(artifact, new JsonObject().add("document", new com.fumbbl.ffb.server.match.MatchJson().encode(document(original)))
			.add("artifact", original.recoveryArtifact()).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
		String javaExecutable = java.nio.file.Paths.get(System.getProperty("java.home"), "bin", "java").toString();
		Process process = new ProcessBuilder(javaExecutable, "-cp", System.getProperty("surefire.test.class.path"),
			RecoveryProcessFixture.class.getName(), artifact.toAbsolutePath().toString()).redirectErrorStream(true).start();
		assertTrue(process.waitFor(45, java.util.concurrent.TimeUnit.SECONDS), "Separate recovery JVM timed out");
		String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
		assertEquals(0, process.exitValue(), output);
		SetupSession restored = new SetupSession(new TestServer().getServer(), document(original), original.recoveryArtifact());
		assertEquals(view(original, "home"), view(restored, "home")); assertEquals(view(original, "away"), view(restored, "away"));
		assertEquals(original.recoveryArtifact(), restored.recoveryArtifact()); return restored;
	}
	private SetupSession recoverable() throws Exception {
		MatchDocument seed = document(new SetupSessionTest().session(11));
		java.util.Map<String, MatchDocument.Request> requests = new java.util.LinkedHashMap<>();
		requests.put(seed.home.owner + "\ncreate", new MatchDocument.Request("create|" + seed.home.team.sourceTeamId + "|1|" + seed.away.owner));
		requests.put(seed.away.owner + "\njoin", new MatchDocument.Request("join|" + seed.matchId + "|1|" + seed.away.team.sourceTeamId + "|1"));
		requests.put(seed.home.owner + "\nactivate", new MatchDocument.Request("activate|" + seed.matchId + "|2"));
		MatchDocument document = new MatchDocument(seed.matchId, 3, seed.intendedOpponent, seed.lifecycle, seed.home, seed.away, requests);
		return new SetupSession(new TestServer().getServer(), document, -9, true);
	}
	private MatchDocument document(SetupSession session) throws Exception { Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true); return (MatchDocument) field.get(session); }
	private GameState engine(SetupSession session) { try { Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session); } catch (Exception failure) { throw new AssertionError(failure); } }
	private JsonObject view(SetupSession session, String role) { return session.reply("inspect", "ACCEPTED", false, role).get("state").asObject(); }
	private JsonObject firstPlayer(JsonObject state, String role) { for (JsonValue value : state.get("players").asArray()) if (role.equals(value.asObject().getString("role", null))) return value.asObject(); throw new AssertionError("No player"); }
	private String unique(String prefix) { return prefix + "-" + requestNumber++; }
	private String[] forceUphillBlock(SetupSession session) {
		Game game = engine(session).getGame(); Team attacker = game.isHomePlaying() ? game.getTeamHome() : game.getTeamAway();
		Team defender = game.isHomePlaying() ? game.getTeamAway() : game.getTeamHome();
		game.getTurnDataHome().setReRolls(0); game.getTurnDataAway().setReRolls(0);
		for (Player<?> player : attacker.getPlayers()) game.getFieldModel().setPlayerCoordinate(player, null);
		for (Player<?> player : defender.getPlayers()) game.getFieldModel().setPlayerCoordinate(player, null);
		Player<?> attackerPlayer = attacker.getPlayers()[1], target = defender.getPlayers()[0];
		// Explicit native-state fixture: an injured attacker facing a stronger defender.
		attackerPlayer.setStrength(1); target.setStrength(6);
		game.getFieldModel().setPlayerCoordinate(attackerPlayer, new FieldCoordinate(10, 7));
		game.getFieldModel().setPlayerCoordinate(target, new FieldCoordinate(11, 7));
		game.getFieldModel().setPlayerCoordinate(defender.getPlayers()[1], new FieldCoordinate(10, 6));
		game.getFieldModel().setPlayerCoordinate(defender.getPlayers()[2], new FieldCoordinate(10, 8));
		return new String[] { attackerPlayer.getId(), target.getId() };
	}
	private JsonObject request(JsonObject state, String operation, String id) { return new JsonObject().add("operation", operation).add("requestId", id).add("expectedRevision", state.get("revision")); }
	private JsonObject action(SetupSession session, String kind) { for (JsonValue value : view(session, "home").get("actions").asArray()) if (kind.equals(value.asObject().getString("kind", null))) return value.asObject(); throw new AssertionError("Missing " + kind); }
	private JsonObject actionFor(SetupSession session, String kind, String player) { for (JsonValue value : view(session, "home").get("actions").asArray()) { JsonObject action = value.asObject(); if (kind.equals(action.getString("kind", null)) && action.getString("id", "").endsWith(player)) return action; } throw new AssertionError("Missing " + kind + " for " + player); }
	private boolean hasAction(SetupSession session, String kind) { for (JsonValue value : view(session, "home").get("actions").asArray()) if (kind.equals(value.asObject().getString("kind", null))) return true; return false; }
	private JsonObject ending(SetupSession session, String ending) { for (JsonValue value : view(session, "home").get("actions").asArray()) if (value.asObject().getString("id", "").endsWith(ending)) return value.asObject(); throw new AssertionError("Missing " + ending); }
	private void submit(SetupSession session, JsonObject action, String id) { assertEquals("ACCEPTED", session.apply(action.getString("actor", null), request(view(session, "home"), "action", id).add("actionId", action.get("id"))).getString("code", null)); }
}
