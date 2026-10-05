package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PassingDistance;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PassRangeProjectionTest {

	@Test void nativeRangesWeatherAndMovementArePublicForBothCoaches() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] {true, false}) for (Weather weather : Weather.values()) {
			GameState state = new GameState(new TestServer().getServer()) {
				@Override public boolean usesLegacyPersistence() { return false; }
			};
			new GameStateBuilder(state).withRule("BB2025").withWeather(weather).withBallAt(10, 7)
				.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 3, 3, 3, 9))
					.player("mate", player -> player.at(14, 7)))
				.withTeam(!home, team -> team.player("opponent", player -> player.at(23, 12))).build();
			Game game = state.getGame();
			game.setHomePlaying(home);
			StepEngine.start(state);
			SetupSession session = new SetupSessionTest().session(11, true);
			Field engine = SetupSession.class.getDeclaredField("state");
			engine.setAccessible(true);
			engine.set(session, state);
			String role = home ? "home" : "away";
			JsonArray frames = new JsonArray();
			capture(session, frames, role, "ready");
			assertNull(view(session, role).get("passing"));
			submit(session, role, "declarePass");
			JsonObject declared = view(session, role);
			JsonValue projection = declared.get("passing");
			assertNotNull(projection, "Declared Pass must project native passing ranges");
			verify(game, projection.asObject(), 10);
			assertEquals('Q', range(projection.asObject(), 13, 7));
			assertEquals('S', range(projection.asObject(), 14, 7));
			assertEquals(weather == Weather.BLIZZARD ? '-' : 'L', range(projection.asObject(), 17, 7));
			assertEquals(weather == Weather.BLIZZARD ? '-' : 'B', range(projection.asObject(), 21, 7));
			assertEquals('-', range(projection.asObject(), 24, 7));
			assertEquals(weather == Weather.BLIZZARD ? '-' : 'B', range(projection.asObject(), 22, 10));
			if (weather == Weather.BLIZZARD) {
				assertFalse(hasPass(declared, 17, 7));
				JsonObject forbidden = request(declared).add("actionId", declared.getInt("revision", -1) + ":pass-17-7");
				assertEquals("INVALID_OPTION", assertThrows(MatchService.Failure.class, () -> session.apply(role, forbidden)).code);
			}
			capture(session, frames, role, "declared");
			if (weather == Weather.NICE) {
				Method compare = SetupSession.class.getDeclaredMethod("matchesRecoveredView", JsonObject.class, String.class);
				compare.setAccessible(true);
				Method order = SetupSession.class.getDeclaredMethod("ordered", JsonValue.class);
				order.setAccessible(true);
				JsonObject saved = (JsonObject) order.invoke(session, declared);
				assertTrue((Boolean) compare.invoke(session, saved, role), "Current passing checkpoint matches");
				saved.get("passing").asObject().set("version", 2);
				assertFalse((Boolean) compare.invoke(session, saved, role), "Unknown guidance cannot match a checkpoint");
				saved.remove("passing");
				assertTrue((Boolean) compare.invoke(session, saved, role), "Existing checkpoints without passing still match");
			}
			// A native weather change is reflected by the next accepted movement snapshot.
			if (weather == Weather.NICE) game.getFieldModel().setWeather(Weather.VERY_SUNNY);
			submit(session, role, "move-11-7");
			JsonObject moved = view(session, role);
			verify(game, moved.get("passing").asObject(), 11);
			assertEquals('S', range(moved.get("passing").asObject(), 17, 7));
			capture(session, frames, role, "moved");
			submit(session, role, "endAction");
			assertNull(view(session, role).get("passing"));
			capture(session, frames, role, "ended");
			journeys.add(new JsonObject().add("role", role).add("weather", weather.name()).add("frames", frames));
		}
		Files.createDirectories(Paths.get("target"));
		String json = journeys.toString();
		Files.write(Paths.get("target", "adr0003-pass-ranges.json"), json.getBytes(StandardCharsets.UTF_8));
		assertEquals(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures",
			"adr0003-pass-ranges.json")), StandardCharsets.UTF_8), json);
	}

	private void verify(Game game, JsonObject passing, int fromX) {
		assertEquals(1, passing.getInt("version", -1));
		assertEquals("actor", passing.getString("playerId", null));
		assertEquals(new JsonObject().add("x", fromX).add("y", 7), passing.get("from"));
		assertEquals(game.getFieldModel().getWeather() == Weather.VERY_SUNNY ? 1 : 0, passing.getInt("weatherPenalty", -1));
		assertEquals(game.getFieldModel().getWeather() == Weather.BLIZZARD, passing.getBoolean("rangeLimited", false));
		PassMechanic mechanic = game.getMechanic(Mechanic.Type.PASS);
		for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
			PassingDistance nativeRange = mechanic.findPassingDistance(game, new FieldCoordinate(fromX, 7), new FieldCoordinate(x, y), false);
			assertEquals(x == fromX && y == 7 || nativeRange == null ? '-' : nativeRange.getShortcut(), range(passing, x, y));
		}
	}
	private char range(JsonObject passing, int x, int y) { return passing.get("ranges").asArray().get(x).asString().charAt(y); }
	private JsonObject view(SetupSession session, String role) { return session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }
	private void capture(SetupSession session, JsonArray frames, String role, String checkpoint) {
		JsonObject actor = view(session, role);
		assertEquals(actor.get("passing"), session.spectatorView().get("passing"));
		actor.set("matchId", "00000000-0000-0000-0000-000000000115");
		frames.add(new JsonObject().add("checkpoint", checkpoint).add("actor", actor));
	}
	private boolean hasPass(JsonObject view, int x, int y) {
		for (JsonValue item : view.get("actions").asArray()) if (item.asObject().getString("id", "").endsWith(":pass-" + x + "-" + y)) return true;
		return false;
	}
	private JsonObject request(JsonObject view) {
		return new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString()).add("expectedRevision", view.get("revision"));
	}
	private void submit(SetupSession session, String role, String kindOrId) {
		JsonObject view = view(session, role);
		for (JsonValue item : view.get("actions").asArray()) {
			JsonObject action = item.asObject();
			if (kindOrId.equals(action.getString("kind", null)) || action.getString("id", "").endsWith(":" + kindOrId)) {
				assertEquals("ACCEPTED", session.apply(role, request(view).add("actionId", action.get("id"))).getString("code", null));
				return;
			}
		}
		throw new AssertionError("Missing " + kindOrId);
	}
}
