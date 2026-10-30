package com.fumbbl.ffb.test;

import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.json.IJsonOption;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
class SecureBallRerollTest {

	@Test void secureBallExcludesSureHandsAndRetainsTeamRerollsAcrossRecovery() throws Exception {
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home, 1);
			TestRolls.on(state).general(1, 6, 6);
			performKind(state, "secureBall"); performId(state, "move-9-7");
			assertFalse(actions(state).stream().anyMatch(action -> action.id.equals("reroll:skill")));
			assertTrue(actions(state).stream().anyMatch(action -> action.id.equals("reroll:team")));
			state = recover(state);
			TestRolls.on(state).general(6, 6);
			performId(state, "reroll:team");
			assertFalse(state.getGame().getFieldModel().isBallMoving());
			assertEquals(0, home ? state.getGame().getTurnDataHome().getReRolls() : state.getGame().getTurnDataAway().getReRolls());
			assertFalse(actions(state).stream().anyMatch(action -> action.kind.equals("reroll")));
		}
	}

	@Test void secureBallWithoutATeamSourceFailsWhileOrdinaryPickupStillUsesSureHands() throws Exception {
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home, 0);
			TestRolls.on(state).general(1, 6, 6, 6);
			performKind(state, "secureBall"); performId(state, "move-9-7");
			assertFalse(actions(state).stream().anyMatch(action -> action.id.equals("reroll:skill")));
			assertEquals(!home, state.getGame().isHomePlaying());
			state = fixture(home, 1);
			TestRolls.on(state).general(1, 6, 6);
			performKind(state, "select"); performId(state, "move-9-7");
			assertFalse(state.getGame().getFieldModel().isBallMoving());
			assertEquals(1, state.getGame().getTurnData().getReRolls());
		}
	}

	@Test void anObsoleteSavedSureHandsChoiceRefreshesThePromptWithoutRerolling() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean teamAvailable : new boolean[] { true, false }) {
			GameState state = fixture(home, 1);
			TestRolls.on(state).general(1, 6, 6, 6);
			performKind(state, "secureBall"); performId(state, "move-9-7");
			Skill sureHands = state.getGame().getRules().getSkillFactory().forName("Sure Hands");
			JsonObject obsolete = state.getGame().getDialogParameter().toJsonValue();
			IJsonOption.SKILL.addTo(obsolete, sureHands);
			state.getGame().setDialogParameter(new DialogReRollPropertiesParameter().initFrom(state.getGame().getRules(), obsolete));
			state.getGame().getTurnData().setReRolls(teamAvailable ? 1 : 0);
			state = recover(state);
			TestRolls.on(state).general(6, 6, 6);
			JsonObject before = state.toJsonValue();
			state.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(sureHands, true, "actor", ReRolledActions.PICK_UP, false), !home));
			assertEquals(before, state.toJsonValue(), "The other coach cannot refresh or resolve a saved prompt");
			state.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(sureHands, true, "actor", ReRolledActions.PICK_UP, false), home));
			assertFalse(actions(state).stream().anyMatch(action -> action.id.equals("reroll:skill")));
			if (teamAvailable) {
				assertEquals(3, state.getDiceRoller().getTestRolls().get("General").size());
				assertEquals(1, state.getGame().getTurnData().getReRolls());
				assertTrue(state.getGame().getFieldModel().isBallMoving());
				performId(state, "reroll:team");
				assertFalse(state.getGame().getFieldModel().isBallMoving());
				assertEquals(0, state.getGame().getTurnData().getReRolls());
			} else assertEquals(!home, state.getGame().isHomePlaying());
		}
	}

	private GameState fixture(boolean home, int rerolls) throws Exception {
		GameState state = new GameState(new TestServer().getServer());
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(9, 7)
			.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 3, 3, 3, 9).skill("Sure Hands")))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(20, 7).stats(6, 3, 3, 4, 9))).build();
		state.getGame().setHomePlaying(home); state.getGame().getFieldModel().setBallMoving(true);
		state.getGame().getTurnData().setReRolls(rerolls); StepEngine.start(state); return state;
	}

	private GameState recover(GameState original) {
		GameState restored = new GameState(original.getServer());
		restored.initFrom(original.getGame().getRules(), original.toJsonValue());
		restored.initCommandNrGenerator(original.getLastCommandNr());
		UtilSkillBehaviours.registerBehaviours(restored.getGame(), restored.getServer().getDebugLog());
		assertEquals(original.toJsonValue(), restored.toJsonValue()); return restored;
	}

	private List<Action> actions(GameState state) {
		List<Action> actions = new CorePromptActions(state).actions();
		return actions.isEmpty() ? new CoreTurnActions(state).actions() : actions;
	}

	private void performKind(GameState state, String kind) {
		perform(state, actions(state).stream().filter(action -> action.kind.equals(kind)).findFirst()
			.orElseThrow(() -> new AssertionError("Missing " + kind)));
	}

	private void performId(GameState state, String id) {
		perform(state, actions(state).stream().filter(action -> action.id.equals(id)).findFirst()
			.orElseThrow(() -> new AssertionError("Missing " + id)));
	}

	private void perform(GameState state, Action action) {
		state.handleCommand(new ReceivedCommand(action.command, "home".equals(action.role)));
	}
}
