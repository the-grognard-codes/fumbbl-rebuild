package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.match.MatchService;

import java.util.Arrays;
import java.util.HashSet;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RecipientProjectionTest {
	@Test void nativeHomeAwayAndSpectatorShareOnlyTheExplicitPublicState() throws Exception {
		SetupSession session = new SetupSessionTest().session(11);
		JsonObject home = session.reply("contract", "ACCEPTED", false, "home").get("state").asObject();
		JsonObject away = session.reply("contract", "ACCEPTED", false, "away").get("state").asObject();
		JsonObject spectator = session.spectatorView();
		for (JsonObject view : Arrays.asList(home, away, spectator)) {
			keys(view, "projectionVersion", "matchId", "revision", "callerRole", "phase", "actor", "prompt", "players", "weather", "homeRerolls", "awayRerolls",
				"actions", "turn", "turnMode", "ball", "activePlayerId", "half", "homeTurn", "awayTurn", "homeScore", "awayScore", "drive",
				"homeTeamName", "awayTeamName", "homeTeamArt", "awayTeamArt", "homeResources", "awayResources");
			assertEquals(4, view.getInt("projectionVersion", 0));
			assertEquals("Home", view.getString("homeTeamName", null));
			assertEquals("Away", view.getString("awayTeamName", null));
			for (String field : Arrays.asList("homeTeamArt", "awayTeamArt")) {
				keys(view.get(field).asObject(), "rosterId", "league");
				assertEquals("human", view.get(field).asObject().getString("rosterId", null));
				assertEquals("Old World Classic", view.get(field).asObject().getString("league", null));
			}
			keys(view.get("homeResources").asObject(), "apothecaries", "assistantCoaches", "cheerleaders");
			for (JsonValue value : view.get("players").asArray()) {
				JsonObject player = value.asObject();
				keys(player, "id", "name", "slot", "role", "state", "status", "x", "y", "art", "number", "position", "positionRace", "positionRole", "ma", "st", "ag", "pa", "av", "skills", "offPitch");
				assertEquals(player.get("x").isNull() ? "reserve" : "pitch", player.getString("offPitch", null));
				assertEquals(6, player.getInt("ma", -1));
				keys(player.get("art").asObject(), "rosterId", "positionId");
				assertEquals("human", player.get("art").asObject().getString("rosterId", null));
				assertEquals("lineman", player.get("art").asObject().getString("positionId", null));
			}
			keys(view.get("prompt").asObject(), "id", "actor", "kind", "options");
			for (JsonValue value : view.get("actions").asArray()) assertEquals(true, value.asObject().get("sourcePlayerId") != null);
		}
		assertEquals(home, away.set("callerRole", "home"));
		assertEquals(home, spectator.set("callerRole", "home"));
		String actor = home.getString("actor", null);
		MatchService.Failure rejected = assertThrows(MatchService.Failure.class, () -> session.apply("home".equals(actor) ? "away" : "home", new JsonObject().add("requestId", "wrong-recipient")
			.add("operation", "choice").add("expectedRevision", home.get("revision")).add("promptId", home.get("prompt").asObject().get("id")).add("optionId", "heads")));
		assertEquals("WRONG_ACTOR", rejected.code);
		assertEquals(home, session.reply("after", "ACCEPTED", false, "home").get("state"));
	}
	private void keys(JsonObject object, String... fields) {
		assertEquals(new HashSet<>(Arrays.asList(fields)), new HashSet<>(object.names())); assertEquals(fields.length, object.size());
	}
}
