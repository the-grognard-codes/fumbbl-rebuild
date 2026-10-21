package com.fumbbl.ffb.test;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HailMaryBombAllowanceTest {

	private final MatchLogPresentationTest log = new MatchLogPresentationTest();

	@Test void allYouCanEatRetainsSecondBombModeChoiceAndSharedAllowanceAfterRecovery() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			for (boolean secondHailMary : new boolean[] {true, false}) {
				String role = home ? "home" : "away";
				GameState state = fixture(home);
				// This existing special action is declared through its native skill flow.
				StepEngine.respond(state, Commands.selectPlayer("actor", PlayerAction.ALL_YOU_CAN_EAT));
				assertEquals(Boolean.TRUE, state.getPassState().getThrowTwoBombs());
				SetupSession session = log.session(state);
				log.submit(session, role, "hailMaryBombMode", null);
				assertEquals("hailMaryBomb", view(session, role).getString("activePlayerAction", null));
				TestRolls.on(state).general(6);
				northScatter(state);
				log.submit(session, role, "bomb-25-0", null);

				assertEquals(StepId.INIT_PASSING, state.getCurrentStep().getId());
				assertEquals(Boolean.FALSE, state.getPassState().getThrowTwoBombs());
				assertEquals("actor", state.getGame().getActingPlayer().getPlayerId());
				assertTrue(state.getGame().getActingPlayer().hasPassed());
				assertLimits(state);
				assertEquals(1, passReports(session).size());

				JsonObject checkpoint = view(session, role);
				GameState restored = new GameState(state.getServer()) {
					@Override public boolean usesLegacyPersistence() { return false; }
					@Override public boolean consumesDeclaredActions() { return true; }
				};
				restored.initFrom(state.getGame().getRules(), state.toJsonValue());
				restored.initCommandNrGenerator(state.getLastCommandNr());
				UtilSkillBehaviours.registerBehaviours(restored.getGame(), restored.getServer().getDebugLog());
				Field engine = SetupSession.class.getDeclaredField("state");
				engine.setAccessible(true);
				engine.set(session, restored);
				state = restored;
				assertEquals(checkpoint, view(session, role));
				assertNotNull(view(session, role).get("passing"));
				assertEquals('B', range(session, role, 25, 0));

				log.submit(session, role, "hailMaryBombMode", null);
				assertEquals("throwBomb", view(session, role).getString("activePlayerAction", null));
				assertFalse(has(view(session, role), "bomb-25-0"));
				assertEquals('-', range(session, role, 25, 0));
				assertLimits(state);
				log.submit(session, role, "hailMaryBombMode", null);
				assertEquals("hailMaryBomb", view(session, role).getString("activePlayerAction", null));
				assertTrue(has(view(session, role), "bomb-25-0"));
				assertEquals('B', range(session, role, 25, 0));
				if (!secondHailMary) log.submit(session, role, "normalBombMode", null);

				TestRolls.on(state).general(6, 6);
				if (secondHailMary) northScatter(state);
				else state.getDiceRoller().addTestRoll("n", state.getGame(), state.getGame().getActingTeam());
				log.submit(session, role, secondHailMary ? "bomb-25-0" : "bomb-14-7", null);
				JsonArray passes = passReports(session);
				assertEquals(2, passes.size());
				assertTrue(passes.get(0).asObject().getBoolean("hailMaryPass", false));
				assertEquals(secondHailMary, passes.get(1).asObject().getBoolean("hailMaryPass", false));
				assertNull(state.getGame().getActingPlayer().getPlayer(), "Second throw completion: role=" + role
					+ ", hmp=" + secondHailMary + ", step=" + state.getCurrentStep().getId()
					+ ", turn=" + state.getGame().getTurnMode() + ", dialog=" + state.getGame().getDialogParameter()
					+ ", action=" + state.getGame().getActingPlayer().getPlayerAction()
					+ ", pass=" + state.getPassState().toJsonValue());
				JsonObject skillRoll = log.reports(log.records(session)).values().stream().map(JsonValue::asObject)
					.filter(report -> "allYouCanEat".equals(report.getString("reportId", null))).findFirst().get();
				assertEquals(6, skillRoll.getInt("roll", 0));
				assertTrue(skillRoll.getBoolean("successful", false));
				assertLimits(state);
				JsonObject completed = view(session, role);
				assertFalse(has(completed, "hailMaryBombMode"));
				assertFalse(has(completed, "declareBomb"));
				assertFalse(has(completed, "declareHailMaryBomb"));
				assertFalse(has(completed, "bomb-25-0"));
				assertTrue(has(completed, "declarePass"), "Bombs must leave the ball-pass allowance available");
				assertFalse(state.getGame().getPlayerById("actor").hasUnused(
					state.getGame().getPlayerById("actor").getSkillWithProperty(NamedProperties.canUseThrowBombActionTwice)));
			}
		}
	}

	private GameState fixture(boolean home) throws Exception {
		GameState state = new GameState(new TestServer().getServer()) {
			@Override public boolean usesLegacyPersistence() { return false; }
			@Override public boolean consumesDeclaredActions() { return true; }
		};
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(10, 7)
			.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 3, 3, 3, 9)
				.skill("Hail Mary Pass").skill("Bombardier").skill("All You Can Eat"))
				.player("mate", player -> player.at(10, 10).stats(6, 3, 3, 3, 9)))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(24, 12).stats(6, 3, 3, 3, 9)))
			.build();
		state.getGame().setHomePlaying(home);
		StepEngine.start(state);
		return state;
	}

	private void northScatter(GameState state) {
		Game game = state.getGame();
		// HMP scatters three times; the first northward square already leaves the pitch.
		for (int i = 0; i < 3; i++) state.getDiceRoller().addTestRoll("n", game, game.getActingTeam());
	}

	private void assertLimits(GameState state) {
		assertTrue(state.getGame().getTurnData().isBombUsed());
		assertFalse(state.getGame().getTurnData().isPassUsed());
	}

	private JsonArray passReports(SetupSession session) {
		JsonArray reports = new JsonArray();
		for (JsonValue value : log.reports(log.records(session))) {
			if ("passRoll".equals(value.asObject().getString("reportId", null))) reports.add(value);
		}
		return reports;
	}

	private JsonObject view(SetupSession session, String role) { return log.view(session, role); }
	private char range(SetupSession session, String role, int x, int y) {
		return view(session, role).get("passing").asObject().get("ranges").asArray().get(x).asString().charAt(y);
	}
	private boolean has(JsonObject view, String key) {
		for (JsonValue value : view.get("actions").asArray()) {
			JsonObject action = value.asObject();
			if (key.equals(action.getString("kind", null)) || action.getString("id", "").endsWith(":" + key)) return true;
		}
		return false;
	}
}
