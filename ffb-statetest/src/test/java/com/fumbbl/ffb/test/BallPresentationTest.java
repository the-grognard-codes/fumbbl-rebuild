package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.match.SetupSession;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BallPresentationTest {

	@Test void occupancyDoesNotInventPossessionAndNativeMovingFlagsDetermineTheCarrier() throws Exception {
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home);
			state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("actor"), new FieldCoordinate(9, 7));
			SetupSession session = session(state);
			assertTrue(view(session, home).get("ballState").asObject().get("carrierPlayerId").isNull());
			state.getGame().getFieldModel().setBallMoving(false);
			assertEquals("actor", view(session, home).get("ballState").asObject().getString("carrierPlayerId", null));
			state.getGame().getFieldModel().setBallInPlay(false);
			assertTrue(view(session, home).get("ballState").asObject().get("carrierPlayerId").isNull());
		}
	}

	@Test void nativePickupAndMovementPublishTheSameCarrierForBothCoachesAndSpectators() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home);
			BrowserActionEvidence evidence = new BrowserActionEvidence(true);
			TestRolls.on(state).general(6);
			evidence.perform(state, action(state, "select-actor"));
			String role = home ? "home" : "away";
			JsonArray frames = new JsonArray().add(evidence.snapshot(state, role));
			evidence.perform(state, action(state, "move-9-7")); frames.add(evidence.snapshot(state, role));
			assertEquals("actor", frames.get(1).asObject().get("state").asObject().get("ballState").asObject().getString("carrierPlayerId", null));
			evidence.perform(state, action(state, "move-8-7")); frames.add(evidence.snapshot(state, role));
			assertEquals(new FieldCoordinate(8, 7), state.getGame().getFieldModel().getBallCoordinate());
			SetupSession session = session(state);
			String unchanged = state.toJsonValue().toString();
			assertEquals(view(session, home).get("ballState"), view(session, !home).get("ballState"));
			assertEquals(view(session, home).get("ballState"), session.spectatorView().get("ballState"));
			assertEquals(unchanged, state.toJsonValue().toString());
			journeys.add(new JsonObject().add("role", role).add("frames", frames));
		}
		Files.write(Paths.get("target", "ball-presentation.json"), journeys.toString().getBytes(StandardCharsets.UTF_8));
	}
	@Test void oneCommittedPickupRouteAndFailedCarrierRushPublishOrderedNativeBallTransitions() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] { true, false }) for (boolean drop : new boolean[] { false, true }) {
			GameState state = fixture(home);
			if (drop) {
				state.getGame().getFieldModel().setBallCoordinate(new FieldCoordinate(10, 7));
				state.getGame().getFieldModel().setBallMoving(false);
				state.getGame().getTurnData().setReRolls(0);
			}
			SetupSession session = session(state);
			String role = home ? "home" : "away";
			JsonObject before = view(session, home);
			session.apply(role, new JsonObject().add("operation", "action").add("requestId", "select")
				.add("expectedRevision", before.get("revision")).add("actionId", before.getInt("revision", 0) + ":select-actor"));
			if (drop) {
				state.getGame().getActingPlayer().setCurrentMove(6);
				state.getGame().getActingPlayer().setGoingForIt(true);
				com.fumbbl.ffb.server.util.UtilServerPlayerMove.updateMoveSquares(state, false);
			}
			TestRolls.on(state).general(drop ? 1 : 6);
			JsonArray frames = new JsonArray().add(snapshot(session, home));
			JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", 9).add("y", 7));
			if (!drop) waypoints.add(new JsonObject().add("x", 8).add("y", 7)).add(new JsonObject().add("x", 7).add("y", 7));
			JsonObject request = new JsonObject().add("operation", "route").add("requestId", "route")
				.add("expectedRevision", view(session, home).get("revision")).add("playerId", "actor")
				.add("waypoints", waypoints);
			assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
			assertTrue(session.apply(role, request).getBoolean("duplicate", false));
			frames.add(snapshot(session, home));
			JsonObject ballState = view(session, home).get("ballState").asObject();
			if (drop) assertTrue(ballState.get("carrierPlayerId").isNull());
			else {
				assertEquals("actor", ballState.getString("carrierPlayerId", null));
				assertEquals(new FieldCoordinate(7, 7), state.getGame().getFieldModel().getBallCoordinate());
			}
			journeys.add(new JsonObject().add("role", role).add("drop", drop).add("frames", frames));
		}
		Files.write(Paths.get("target", "ball-route-presentation.json"), journeys.toString().getBytes(StandardCharsets.UTF_8));
	}
	private JsonObject snapshot(SetupSession session, boolean home) {
		return new JsonObject().add("state", view(session, home)).add("records", session.transcriptPage(0, 8).get("records"));
	}

	private CoreTurnActions.Action action(GameState state, String id) {
		return new CoreTurnActions(state).actions().stream().filter(action -> action.id.equals(id))
			.findFirst().orElseThrow(() -> new AssertionError("Missing " + id));
	}
	private JsonObject view(SetupSession session, boolean home) { return session.reply("inspect", "ACCEPTED", false, home ? "home" : "away").get("state").asObject(); }
	private SetupSession session(GameState state) throws Exception {
		SetupSession session = new SetupSessionTest().session(11, true);
		// Injected engines must continue the seed transcript's command cursor,
		// just as durable recovery does, so its first movement is captured.
		int cursor = JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject().get("transcript").asObject().getInt("nativeCursor", 0);
		state.initCommandNrGenerator(cursor);
		Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state); return session;
	}
	private GameState fixture(boolean home) throws Exception {
		GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(9, 7)
			.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 3, 3, 3, 9)))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(20, 7).stats(6, 3, 3, 3, 9))).build();
		state.getGame().setHomePlaying(home); state.getGame().getFieldModel().setBallMoving(true);
		state.getGame().getFieldModel().setBallInPlay(true); StepEngine.start(state); return state;
	}
}
