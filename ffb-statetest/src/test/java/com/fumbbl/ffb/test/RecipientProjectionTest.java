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
			keys(view, "matchId", "revision", "callerRole", "phase", "actor", "prompt", "players", "weather", "homeRerolls", "awayRerolls",
				"actions", "turn", "turnMode", "ball", "activePlayerId", "half", "homeTurn", "awayTurn", "homeScore", "awayScore", "drive");
			for (JsonValue value : view.get("players").asArray()) keys(value.asObject(), "id", "name", "slot", "role", "state", "x", "y");
			keys(view.get("prompt").asObject(), "id", "actor", "kind", "options");
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
