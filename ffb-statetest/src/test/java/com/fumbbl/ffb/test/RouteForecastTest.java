package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.util.UtilServerPlayerMove;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RouteForecastTest {

	@Test void nativeDodgeModifiersAreIndependentOfAgilityAndNaturalSixRemainsSuccessful() throws Exception {
		JsonArray cases = new JsonArray();
		for (int agility : new int[] {2, 4}) for (int penalty = 0; penalty <= 4; penalty++) {
			GameState state = fixture(agility, penalty, false);
			SetupSession session = session(state);
			String unchanged = state.toJsonValue().toString();
			JsonObject route = route(session, 9, 7), step = route.get("steps").asArray().get(0).asObject();
			assertEquals(3, route.getInt("routeVersion", 0));
			assertEquals(-penalty, step.getInt("dodgeModifier", 99));
			assertEquals(Math.min(6, agility + penalty), step.getInt("dodge", 0));
			assertEquals(0, step.getInt("rush", -1));
			assertEquals(unchanged, state.toJsonValue().toString(), "Forecast does not run or change the native engine");
			cases.add(new JsonObject().add("name", "AG" + agility + "-penalty" + penalty)
				.add("state", view(session)).add("route", route));
		}
		SetupSession bonusSession = session(fixture(4, 0, false, "Two Heads"));
		JsonObject bonusRoute = route(bonusSession, 9, 7), bonusStep = bonusRoute.get("steps").asArray().get(0).asObject();
		assertEquals(1, bonusStep.getInt("dodgeModifier", 99));
		assertEquals(3, bonusStep.getInt("dodge", 0));
		cases.add(new JsonObject().add("name", "AG4-bonus1").add("state", view(bonusSession)).add("route", bonusRoute));
		Files.write(Paths.get("target", "route-forecast-dodge.json"), cases.toString().getBytes(StandardCharsets.UTF_8));
	}

	@Test void safeDestinationDoesNotInheritAnEarlierSquaresDodge() throws Exception {
		SetupSession session = session(fixture(3, 0, false));
		JsonArray points = new JsonArray().add(point(9, 7)).add(point(8, 7));
		JsonObject route = session.routePreview("home", view(session).getInt("revision", -1), points);
		assertEquals(3, route.get("steps").asArray().get(0).asObject().getInt("dodge", 0));
		assertEquals(0, route.get("steps").asArray().get(1).asObject().getInt("dodge", -1));
		assertEquals(0, route.get("steps").asArray().get(1).asObject().getInt("dodgeModifier", 99));
		Files.write(Paths.get("target", "route-forecast-safe.json"), new JsonObject()
			.add("state", view(session)).add("route", route).toString().getBytes(StandardCharsets.UTF_8));
	}

	@Test void rushTargetsUseNativeWeatherDrunkardAndOpposingMolesWhileCombinedSquaresRetainDodge() throws Exception {
		JsonArray cases = new JsonArray();
		for (boolean drunkard : new boolean[] {false, true}) for (boolean blizzard : new boolean[] {false, true})
			for (boolean moles : new boolean[] {false, true}) {
				GameState state = fixture(3, 1, drunkard);
				SetupSession session = session(state);
				state.getGame().getFieldModel().setWeather(blizzard ? Weather.BLIZZARD : Weather.NICE);
				if (moles) state.getPrayerState().addMolesUnderThePitch(state.getGame().getTeamAway());
				state.getGame().getActingPlayer().setCurrentMove(6);
				state.getGame().getActingPlayer().setGoingForIt(true);
				UtilServerPlayerMove.updateMoveSquares(state, false);
				JsonObject route = route(session, 9, 7), step = route.get("steps").asArray().get(0).asObject();
				assertEquals(2 + (drunkard ? 1 : 0) + (blizzard ? 1 : 0) + (moles ? 1 : 0), step.getInt("rush", 0));
				assertEquals(4, step.getInt("dodge", 0));
				assertEquals(-1, step.getInt("dodgeModifier", 99));
				cases.add(new JsonObject().add("name", "drunkard" + drunkard + "-blizzard" + blizzard + "-moles" + moles)
					.add("state", view(session)).add("route", route));
			}
		GameState unmarked = fixture(3, 0, false);
		unmarked.getGame().getFieldModel().setPlayerCoordinate(unmarked.getGame().getPlayerById("start-marker"), new FieldCoordinate(20, 7));
		SetupSession rushSession = session(unmarked);
		unmarked.getGame().getActingPlayer().setCurrentMove(6);
		unmarked.getGame().getActingPlayer().setGoingForIt(true);
		UtilServerPlayerMove.updateMoveSquares(unmarked, false);
		JsonObject rushRoute = route(rushSession, 9, 7), rushStep = rushRoute.get("steps").asArray().get(0).asObject();
		assertEquals(0, rushStep.getInt("dodge", -1));
		assertEquals(2, rushStep.getInt("rush", 0));
		cases.add(new JsonObject().add("name", "unmarked-rush").add("state", view(rushSession)).add("route", rushRoute));
		Files.write(Paths.get("target", "route-forecast-rush.json"), cases.toString().getBytes(StandardCharsets.UTF_8));
	}

	private JsonObject route(SetupSession session, int x, int y) {
		JsonObject route = session.routePreview("home", view(session).getInt("revision", -1), new JsonArray().add(point(x, y)));
		JsonObject forecast = view(session).get("movementForecast").asObject();
		assertEquals(2, forecast.getInt("version", 0));
		assertEquals(route.get("playerId"), forecast.get("playerId"));
		JsonObject adjacent = null;
		for (com.eclipsesource.json.JsonValue value : forecast.get("steps").asArray())
			if (value.asObject().getInt("x", -1) == x && value.asObject().getInt("y", -1) == y) adjacent = value.asObject();
		for (com.eclipsesource.json.JsonValue value : view(session).get("actions").asArray()) {
			JsonObject action = value.asObject();
			if (action.getString("kind", "").equals("move") && action.get("target").asObject().getInt("x", -1) == x
				&& action.get("target").asObject().getInt("y", -1) == y) {
				String label = "Move to " + x + ", " + y;
				if (adjacent.getInt("dodge", 0) > 0) label += " (dodge " + adjacent.getInt("dodge", 0) + "+)";
				if (adjacent.getInt("rush", 0) > 0) label += " (rush " + adjacent.getInt("rush", 0) + "+)";
				assertEquals(label, action.getString("label", null));
			}
		}
		assertEquals(route.get("steps").asArray().get(0), adjacent, "Adjacent and planned checks use the same native conditions");
		assertEquals(forecast, session.reply("inspect", "ACCEPTED", false, "away").get("state").asObject().get("movementForecast"));
		assertEquals(forecast, session.spectatorView().get("movementForecast"));
		return route;
	}
	private JsonObject point(int x, int y) { return new JsonObject().add("x", x).add("y", y); }
	private JsonObject view(SetupSession session) { return session.reply("inspect", "ACCEPTED", false, "home").get("state").asObject()
		.set("matchId", "00000000-0000-0000-0000-000000000192"); }
	private SetupSession session(GameState state) throws Exception {
		SetupSession session = new SetupSessionTest().session(11, true);
		int cursor = JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject()
			.get("transcript").asObject().getInt("nativeCursor", 0);
		state.initCommandNrGenerator(cursor);
		Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state);
		JsonObject view = view(session);
		assertEquals("ACCEPTED", session.apply("home", new JsonObject().add("operation", "action").add("requestId", "select")
			.add("expectedRevision", view.get("revision")).add("actionId", view.getInt("revision", 0) + ":select-actor")).getString("code", null));
		return session;
	}
	private GameState fixture(int agility, int penalty, boolean drunkard, String... skills) throws Exception {
		GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE)
			.withTeam(true, team -> team.player("actor", player -> {
				player.at(10, 7).stats(6, 3, agility, 3, 9);
				if (drunkard) player.skill("Drunkard");
				for (String skill : skills) player.skill(skill);
			}))
			.withTeam(false, team -> {
				team.player("start-marker", player -> player.at(11, 7).stats(6, 3, 3, 3, 9));
				int[][] marked = {{8, 7}, {8, 6}, {8, 8}, {9, 6}};
				for (int index = 0; index < penalty; index++) {
					int x = marked[index][0], y = marked[index][1];
					team.player("destination-marker-" + index, player -> player.at(x, y).stats(6, 3, 3, 3, 9));
				}
			}).build();
		state.getGame().setHomePlaying(true);
		StepEngine.start(state);
		return state;
	}
}
