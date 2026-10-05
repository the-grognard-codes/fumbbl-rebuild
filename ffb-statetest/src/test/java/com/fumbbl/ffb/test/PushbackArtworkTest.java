package com.fumbbl.ffb.test;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.match.FrozenTeam;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;
import com.fumbbl.ffb.server.team.bb2025.TeamValidation;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PushbackArtworkTest {

	@Test void nativeKnockdownPushRetainsFrozenArtThroughChainAndProneResolution() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean chain : new boolean[] {false, true}) {
			GameState state = new GameState(new TestServer().getServer()) {
				@Override public boolean usesLegacyPersistence() { return false; }
			};
			new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE)
				.withTeam(true, team -> team.player("home:1", player -> player.at(10, 7).stats(6, 3, 3, 5, 8)))
				.withTeam(false, team -> team.player("away:1", player -> player.at(11, 7).stats(6, 3, 3, 5, 8))
					.player("away:2", player -> player.at(chain ? 12 : 20, 6).stats(6, 3, 3, 5, 8))
					.player("away:3", player -> player.at(chain ? 12 : 20, 7).stats(6, 3, 3, 5, 8))
					.player("away:4", player -> player.at(chain ? 12 : 20, 8).stats(6, 3, 3, 5, 8))).build();
			StepEngine.start(state);
			RosterCatalog catalog = new RosterCatalog();
			MatchDocument document = new MatchDocument("00000000-0000-0000-0000-000000000113", 3, "home",
				MatchDocument.Lifecycle.ACTIVATED, new MatchDocument.Member("home", "home", frozen(catalog, "home", "human")),
				new MatchDocument.Member("away", "away", frozen(catalog, "away", "orc")));
			SetupSession session = new SetupSession(new TestServer().getServer(), document, -2);
			Field engine = SetupSession.class.getDeclaredField("state");
			engine.setAccessible(true);
			engine.set(session, state);
			TestRolls.on(state).block("pow").armor(2, 2);
			perform(session, "selectBlock");
			perform(session, "block");
			perform(session, "blockDie");
			assertEquals(PlayerState.FALLING, state.getGame().getFieldModel().getPlayerState(
				state.getGame().getPlayerById("away:1")).getBase());
			JsonArray frames = new JsonArray();
			capture(session, frames, "push-choice");
			perform(session, "push");
			if (chain) {
				assertTrue(actions(state).stream().anyMatch(action -> action.id.contains("away:2")), "Chain destination belongs to second player");
				capture(session, frames, "chain-choice");
				perform(session, "push");
			}
			capture(session, frames, "pushed");
			perform(session, "followUp");
			assertEquals(PlayerState.PRONE, state.getGame().getFieldModel().getPlayerState(
				state.getGame().getPlayerById("away:1")).getBase());
			capture(session, frames, "resolved");
			journeys.add(new JsonObject().add("chain", chain).add("frames", frames));
		}
		Files.createDirectories(Paths.get("target"));
		Files.write(Paths.get("target", "adr0003-push-artwork.json"), journeys.toString().getBytes(StandardCharsets.UTF_8));
		assertEquals(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures",
			"adr0003-push-artwork.json")), StandardCharsets.UTF_8), journeys.toString());
	}

	private FrozenTeam frozen(RosterCatalog catalog, String role, String roster) {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player(String.valueOf(slot), slot,
			"human".equals(roster) ? "lineman" : "orc-lineman", Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>();
		for (String key : catalog.getResources().keySet()) resources.put(key, "rerolls".equals(key) ? 2 : 0);
		TeamDraft draft = new TeamDraft(RosterCatalog.VERSION, "BB2025", roster, RosterCatalog.PRESET, "1", players, resources);
		TeamValidation.Evaluation evaluation = new TeamValidation(catalog).evaluate(draft);
		assertTrue(evaluation.isValid());
		return new FrozenTeam(role, 1, role, draft, evaluation.total, evaluation.skillPoints, catalog);
	}

	private void capture(SetupSession session, JsonArray frames, String checkpoint) {
		JsonObject home = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		JsonObject away = session.reply("load", "ACCEPTED", false, "away").get("state").asObject();
		JsonObject spectator = session.spectatorView();
		assertEquals(home.get("players"), away.get("players"));
		assertEquals(home.get("players"), spectator.get("players"));
		for (JsonValue item : home.get("players").asArray()) {
			JsonObject player = item.asObject();
			assertTrue(!player.get("art").isNull(), "Frozen art is available during every push checkpoint");
		}
		frames.add(new JsonObject().add("checkpoint", checkpoint).add("home", home).add("away", away).add("spectator", spectator));
	}

	private List<Action> actions(GameState state) {
		List<Action> prompts = new CorePromptActions(state).actions();
		return prompts.isEmpty() ? new CoreTurnActions(state).actions() : prompts;
	}

	private void perform(SetupSession session, String kind) {
		JsonObject view = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		JsonObject action = null;
		for (JsonValue item : view.get("actions").asArray()) {
			if (kind.equals(item.asObject().getString("kind", null))) { action = item.asObject(); break; }
		}
		assertTrue(action != null, "Missing " + kind);
		JsonObject request = new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString())
			.add("expectedRevision", view.get("revision")).add("actionId", action.get("id"));
		assertEquals("ACCEPTED", session.apply(action.getString("actor", null), request).getString("code", null));
	}
}
