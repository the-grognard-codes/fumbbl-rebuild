package com.fumbbl.ffb.test;

import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class DiceProjectionTest {
	@Test void revealedDiceKeepNativeFacesAndChoiceIdentityForBothCoaches() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] {true, false}) for (int count : new int[] {0, 1, 2, 3}) {
			GameState state = new GameState(new TestServer().getServer()) {
				@Override public boolean usesLegacyPersistence() { return false; }
			};
			int strength = count == 1 ? 3 : count == 2 ? 4 : 7;
			new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(count == 0 ? 9 : 20, count == 0 ? 7 : 14)
				.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, strength, 3, 3, 9)))
				.withTeam(!home, team -> team.player("opponent", player -> player.at(count == 0 ? 20 : 11, 7).stats(6, 3, 3, 4, 9))).build();
			state.getGame().setHomePlaying(home);
			state.getGame().getFieldModel().setBallMoving(count == 0);
			state.getGame().getTurnData().setReRolls(1);
			StepEngine.start(state);
			TestRolls.on(state).block(Arrays.copyOf(new String[] {"skull", "pushback", "pow"}, count)).armor(1, 1).general(1, 6);
			SetupSession session = new SetupSessionTest().session(11, true);
			Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state);
			String role = home ? "home" : "away";
			if (count == 0) { submit(session, role, "declarePass"); submit(session, role, "move-9-7"); }
			else { submit(session, role, "selectBlock"); submit(session, role, "block"); }
			JsonObject offered = view(session, role);
			JsonArray faces = new JsonArray();
			for (JsonValue item : offered.get("actions").asArray()) if (item.asObject().getString("kind", "").equals("blockDie")) faces.add(item.asObject().get("label"));
			assertEquals(count, faces.size());
			if (count > 0) assertEquals("Choose SKULL (die 1)", faces.get(0).asString());
			if (count > 1) assertEquals("Choose PUSHBACK (die 2)", faces.get(1).asString());
			if (count > 2) assertEquals("Choose POW (die 3)", faces.get(2).asString());
			JsonObject spectator = session.spectatorView();
			assertEquals(offered.get("actions"), spectator.get("actions"));
			submit(session, role, count == 0 ? "reroll:team" : "block-die:" + (count - 1));
			JsonObject chosen = view(session, role);
			for (JsonValue item : chosen.get("actions").asArray()) assertFalse(item.asObject().getString("kind", "").equals("blockDie"));
			JsonArray reports = new JsonArray();
			JsonArray reportIds = new JsonArray();
			for (JsonValue record : session.transcriptPage(0, 8).get("records").asArray())
				for (JsonValue sync : record.asObject().get("native").asArray())
					for (JsonValue report : sync.asObject().get("reportList").asObject().get("reports").asArray()) {
						String id = report.asObject().getString("reportId", "");
						reportIds.add(id);
						if (id.equals("blockRoll") || id.equals("blockChoice") || id.equals("pickUpRoll")) reports.add(report);
					}
			assertEquals(2, reports.size(), reportIds.toString());
			journeys.add(new JsonObject().add("role", role).add("count", count).add("offered", offered).add("spectator", normalize(spectator)).add("chosen", chosen).add("reports", reports));
		}
		Files.createDirectories(Paths.get("target"));
		String json = journeys.toString();
		Files.write(Paths.get("target", "adr0003-dice.json"), json.getBytes(StandardCharsets.UTF_8));
		assertEquals(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures", "adr0003-dice.json")), StandardCharsets.UTF_8), json);
	}
	private JsonObject normalize(JsonObject view) { return view.set("matchId", "00000000-0000-0000-0000-000000000116"); }
	private JsonObject view(SetupSession session, String role) { return normalize(session.reply("load", "ACCEPTED", false, role).get("state").asObject()); }
	private void submit(SetupSession session, String role, String kindOrId) {
		JsonObject view = view(session, role);
		for (JsonValue item : view.get("actions").asArray()) {
			JsonObject action = item.asObject();
			if (kindOrId.equals(action.getString("kind", "")) || action.getString("id", "").endsWith(":" + kindOrId)) {
				JsonObject request = new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString())
					.add("expectedRevision", view.get("revision")).add("actionId", action.get("id"));
				assertEquals("ACCEPTED", session.apply(role, request).getString("code", null)); return;
			}
		}
		throw new AssertionError("Missing " + kindOrId);
	}
}
