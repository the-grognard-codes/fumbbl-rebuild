package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.action.common.StepBoneHead;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RerollChoiceProgressTest {
	@Test void successfulBoneHeadRerollConsumesTheOfferedChoiceInOneDecision() throws Exception {
		assertSuccessfulReroll(false, false);
	}

	@Test void successfulBoneHeadRerollWithPreferencesConsumesTheOfferedChoice() throws Exception {
		assertSuccessfulReroll(true, false);
	}

	@Test void recoveredBoneHeadRerollConsumesTheOfferedChoiceInOneDecision() throws Exception {
		assertSuccessfulReroll(false, true);
	}

	@Test void recoveredBoneHeadRerollWithPreferencesConsumesTheOfferedChoice() throws Exception {
		assertSuccessfulReroll(true, true);
	}

	private void assertSuccessfulReroll(boolean preferences, boolean restore) throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(2);
		fixture.advanceToTurn();
		Field field = SetupSession.class.getDeclaredField("state");
		field.setAccessible(true);
		GameState nativeState = (GameState) field.get(fixture.session);
		Game game = nativeState.getGame();
		game.setHomePlaying(true);
		game.getTurnData().setReRolls(2);
		game.getTurnData().setReRollsBrilliantCoachingOneDrive(0);
		Player<?> player = game.getTeamHome().getPlayers()[0];
		((RosterPlayer) player).addSkill(game.getRules().getSkillFactory().forName("Bone Head"));
		game.getActingPlayer().setPlayerId(player.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLITZ_MOVE);
		nativeState.getDiceRoller().setRecoveryRoll(sides -> 1);
		// Captured seed-73 continuation: successful Bone Head returns to initSelecting,
		// which waits for a command without hiding the preceding dialog.
		nativeState.getCurrentStep().setLabel("failed");
		nativeState.pushCurrentStepOnStack();
		StepBoneHead step = new StepBoneHead(nativeState);
		StepParameterSet parameters = new StepParameterSet();
		parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_FAILURE, "failed"));
		step.init(parameters);
		nativeState.getStepStack().push(step);
		nativeState.startNextStep();
		assertTrue(game.getDialogParameter() instanceof DialogReRollPropertiesParameter);
		SetupSession session = restore ? new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact()) : fixture.session;
		nativeState = (GameState) field.get(session);
		game = nativeState.getGame();
		if (preferences) session.configureSkillUsePreferences(SkillUsePreferences.defaults(), SkillUsePreferences.defaults());
		JsonObject view = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		// Pass Bone Head but fail the captain's 6+ resource-saving test.
		nativeState.getDiceRoller().setRecoveryRoll(sides -> 5);
		JsonObject choice = null;
		for (JsonValue value : view.get("actions").asArray())
			if (value.asObject().getString("id", "").endsWith(":reroll:team")) choice = value.asObject();
		assertNotNull(choice, "The failed Bone Head roll must offer a team reroll");
		JsonObject request = fixture.request("action", "answer", view).add("actionId", choice.get("id"));
		JsonObject response = session.apply("home", request);
		assertEquals("ACCEPTED", response.getString("code", null));
		assertFalse(game.getDialogParameter() instanceof DialogReRollPropertiesParameter,
			"Answering Bone Head must consume its native reroll dialog, not offer it at a new revision");
		assertEquals(1, game.getTurnData().getReRolls(), "One answer spends one team reroll");
		JsonObject repeated = session.apply("home", request);
		assertTrue(repeated.getBoolean("duplicate", false));
		assertEquals(response.get("state").asObject().get("revision"), repeated.get("state").asObject().get("revision"));
		assertEquals(1, game.getTurnData().getReRolls(), "An exact retry cannot spend another reroll");
	}
}
