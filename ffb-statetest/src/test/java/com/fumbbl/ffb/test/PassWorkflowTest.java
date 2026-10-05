package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PassWorkflowTest {

	@Test void declarationMovementPickupAndConfirmedTargetRetainNativePassForBothCoaches() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] {true, false}) for (String mode : new String[] {"stationary", "move", "pickup", "pickup-reroll", "pickup-decline"}) {
			GameState state = new GameState(new TestServer().getServer()) {
				@Override public boolean usesLegacyPersistence() { return false; }
			};
			boolean pickup = mode.startsWith("pickup");
			new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(pickup ? 11 : 10, 7)
				.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 3, 3, 3, 9))
					.player("mate", player -> player.at(14, 7).stats(6, 3, 3, 4, 8)))
				.withTeam(!home, team -> team.player("opponent", player -> player.at(20, 12).stats(6, 3, 3, 4, 9))).build();
			Game game = state.getGame();
			game.setHomePlaying(home);
			game.getFieldModel().setBallMoving(pickup);
			game.getTurnData().setReRolls(2);
			StepEngine.start(state);
			SetupSession session = new SetupSessionTest().session(11, true);
			Field engine = SetupSession.class.getDeclaredField("state");
			engine.setAccessible(true);
			engine.set(session, state);
			String role = home ? "home" : "away";
			if (mode.equals("pickup-reroll")) TestRolls.on(state).general(1, 6, 6, 6);
			else if (mode.equals("pickup-decline")) TestRolls.on(state).general(1, 1);
			else TestRolls.on(state).general(6, 6, 6);
			JsonArray frames = new JsonArray();
			JsonObject routePreview = null;
			capture(session, frames, role, "ready");
			submit(session, role, "declarePass");
			assertEquals(PlayerAction.PASS_MOVE, game.getActingPlayer().getPlayerAction());
			capture(session, frames, role, "declared");
			if (!mode.equals("stationary")) {
				if (pickup) assertFalse(hasKind(view(session, role), "pass"), "No throw targets without possession");
				JsonObject selected = view(session, role);
				JsonArray points = new JsonArray().add(new JsonObject().add("x", 11).add("y", 7));
				JsonObject preview = session.routePreview(role, selected.getInt("revision", -1), points);
				routePreview = preview;
				assertEquals(1, preview.get("steps").asArray().size());
				JsonObject route = request(selected, "route").add("playerId", "actor").add("waypoints", points);
				assertEquals("ACCEPTED", session.apply(role, route).getString("code", null));
				assertTrue(session.apply(role, route).getBoolean("duplicate", false));
				if (mode.equals("pickup-reroll") || mode.equals("pickup-decline")) {
					capture(session, frames, role, "pickup-decision");
					assertFalse(hasKind(view(session, role), "pass"));
					submit(session, role, mode.equals("pickup-reroll") ? "reroll:team" : "reroll:none");
				}
				if (mode.equals("pickup-decline")) {
					assertEquals(!home, game.isHomePlaying());
					assertFalse(UtilPlayer.hasBall(game, game.getPlayerById("actor")));
					assertFalse(hasKind(view(session, role), "pass"));
					continue;
				}
				assertEquals(PlayerAction.PASS_MOVE, game.getActingPlayer().getPlayerAction());
				assertEquals(new FieldCoordinate(11, 7), game.getFieldModel().getPlayerCoordinate(game.getPlayerById("actor")));
				assertTrue(UtilPlayer.hasBall(game, game.getPlayerById("actor")));
				capture(session, frames, role, "moved");
			}
			JsonObject offered = view(session, role);
			JsonObject pass = find(offered, "pass-14-7");
			JsonObject throwRequest = request(offered, "action").add("actionId", pass.get("id"));
			assertEquals("WRONG_ACTOR", assertThrows(MatchService.Failure.class,
				() -> session.apply(home ? "away" : "home", throwRequest)).code);
			assertEquals("ACCEPTED", session.apply(role, throwRequest).getString("code", null));
			assertTrue(session.apply(role, throwRequest).getBoolean("duplicate", false));
			assertTrue(UtilPlayer.hasBall(game, game.getPlayerById("mate")));
			assertTrue(game.getTurnData().isPassUsed());
			capture(session, frames, role, "passed");
			assertEquals("STALE_REVISION", assertThrows(MatchService.Failure.class,
				() -> session.apply(role, JsonObject.readFrom(throwRequest.toString()).set("requestId", UUID.randomUUID().toString()))).code);
			journeys.add(new JsonObject().add("role", role).add("mode", mode)
				.add("route", routePreview == null ? JsonValue.NULL : routePreview).add("frames", frames));
		}
		Files.createDirectories(Paths.get("target"));
		Files.write(Paths.get("target", "adr0003-pass-workflow.json"), journeys.toString().getBytes(StandardCharsets.UTF_8));
		assertEquals(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures",
			"adr0003-pass-workflow.json")), StandardCharsets.UTF_8), journeys.toString());
	}

	private JsonObject view(SetupSession session, String role) {
		return session.reply("load", "ACCEPTED", false, role).get("state").asObject();
	}
	private void capture(SetupSession session, JsonArray frames, String role, String checkpoint) {
		JsonObject actor = view(session, role);
		JsonObject spectator = session.spectatorView();
		assertEquals(actor.get("players"), spectator.get("players"));
		assertEquals(actor.get("ball"), spectator.get("ball"));
		assertEquals(actor.get("actions"), spectator.get("actions"));
		actor.set("matchId", "00000000-0000-0000-0000-000000000114");
		frames.add(new JsonObject().add("checkpoint", checkpoint).add("actor", actor));
	}
	private boolean hasKind(JsonObject view, String kind) {
		for (JsonValue item : view.get("actions").asArray()) if (kind.equals(item.asObject().getString("kind", null))) return true;
		return false;
	}
	private JsonObject find(JsonObject view, String kindOrId) {
		for (JsonValue item : view.get("actions").asArray()) {
			JsonObject action = item.asObject();
			if (kindOrId.equals(action.getString("kind", null)) || action.getString("id", "").endsWith(":" + kindOrId)) return action;
		}
		throw new AssertionError("Missing " + kindOrId);
	}
	private JsonObject request(JsonObject view, String operation) {
		return new JsonObject().add("operation", operation).add("requestId", UUID.randomUUID().toString())
			.add("expectedRevision", view.get("revision"));
	}
	private void submit(SetupSession session, String role, String kindOrId) {
		JsonObject view = view(session, role);
		assertEquals("ACCEPTED", session.apply(role, request(view, "action").add("actionId", find(view, kindOrId).get("id"))).getString("code", null));
	}
}
