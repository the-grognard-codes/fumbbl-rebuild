package com.fumbbl.ffb.server.step.bb2025.block;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.PushbackMode;
import com.fumbbl.ffb.PushbackSquare;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.NetCommandId;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.report.ReportSkillUse;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.AbstractStep;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepCommandStatus;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.util.UtilServerDialog;
import com.fumbbl.ffb.server.util.UtilServerPushback;
import com.fumbbl.ffb.util.ArrayTool;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

@RulesCollection(RulesCollection.Rules.BB2025)
public class StepBlockDodge extends AbstractStep {
	public static class StepState {
		public Boolean usingDodge;
		public Boolean askForSkill;
		public PlayerState oldDefenderState;
		public boolean skillHooksComplete;
	}

	private final StepState state = new StepState();

	public StepBlockDodge(GameState gameState) { super(gameState); }

	@Override public StepId getId() { return StepId.BLOCK_DODGE; }

	@Override public void start() { super.start(); executeStep(); }

	@Override
	public StepCommandStatus handleCommand(ReceivedCommand receivedCommand) {
		StepCommandStatus status = super.handleCommand(receivedCommand);
		if (status == StepCommandStatus.UNHANDLED_COMMAND && receivedCommand.getId() == NetCommandId.CLIENT_USE_SKILL) {
			status = handleSkillCommand((ClientCommandUseSkill) receivedCommand.getCommand(), state);
		}
		if (status == StepCommandStatus.EXECUTE_STEP) executeStep();
		return status;
	}

	@Override
	public boolean setParameter(StepParameter parameter) {
		if (parameter != null && !super.setParameter(parameter) && parameter.getKey() == StepParameterKey.OLD_DEFENDER_STATE) {
			state.oldDefenderState = (PlayerState) parameter.getValue();
			return true;
		}
		return false;
	}

	private void executeStep() {
		Game game = getGameState().getGame();
		if (state.askForSkill == null) state.askForSkill = findDodgeChoice();
		UtilServerDialog.hideDialog(getGameState());
		if (!state.skillHooksComplete) {
			if (getGameState().executeStepHooks(this, state)) return;
			state.skillHooksComplete = true;
		}

		Player<?> defender = game.getDefender();
		boolean usesDodge = state.usingDodge == null && state.oldDefenderState != null
			? state.oldDefenderState.hasTacklezones() : Boolean.TRUE.equals(state.usingDodge);
		PushbackInitialization pushbackInitialization = new PushbackInitialization();
		Boolean useStripBall = pushbackInitialization.chooseStripBall(this);
		if (useStripBall == null) return;
		if (getGameState().getOptionalSkillUse().enabled() && state.usingDodge != null && defender != null) {
			for (Skill defenderSkill : defender.getSkills()) {
				if ("Dodge".equals(defenderSkill.getName())) {
					getResult().addReport(new ReportSkillUse(game.getDefenderId(), defenderSkill, usesDodge,
						state.oldDefenderState.hasTacklezones()
							? com.fumbbl.ffb.SkillUse.AVOID_FALLING : com.fumbbl.ffb.SkillUse.NO_TACKLEZONE));
					break;
				}
			}
		}
		if (usesDodge) {
			game.getFieldModel().setPlayerState(defender, state.oldDefenderState);
		} else {
			PlayerState defenderState = game.getFieldModel().getPlayerState(defender);
			game.getFieldModel().setPlayerState(defender, defenderState.changeBase(PlayerState.FALLING));
		}
		publishParameters(pushbackInitialization.initPushback(this, useStripBall));
		getResult().setNextAction(StepAction.NEXT_STEP);
	}

	private boolean findDodgeChoice() {
		boolean chainPush = false, sidelinePush = false, attackerHalfPush = false;
		Game game = getGameState().getGame();
		ActingPlayer actingPlayer = game.getActingPlayer();
		Player<?> attacker = actingPlayer.getPlayer();
		FieldCoordinate attackerCoordinate = game.getFieldModel().getPlayerCoordinate(attacker);
		FieldCoordinate defenderCoordinate = game.getFieldModel().getPlayerCoordinate(game.getDefender());
		PushbackSquare startingSquare = UtilServerPushback.findStartingSquare(attackerCoordinate, defenderCoordinate,
			game.isHomePlaying());
		if (startingSquare != null) {
			PushbackSquare[] regularSquares = UtilServerPushback.findPushbackSquares(game, startingSquare, PushbackMode.REGULAR);
			if (ArrayTool.isProvided(regularSquares)) {
				for (PushbackSquare square : regularSquares) if (game.getFieldModel().getPlayer(square.getCoordinate()) != null) chainPush = true;
			}
			PushbackSquare[] grabSquares = regularSquares;
			if (actingPlayer.getPlayerAction().isBlockOrSpecialAction()
				&& attacker.hasSkillProperty(NamedProperties.canPushBackToAnySquare)
				&& !game.getDefender().hasSkillProperty(NamedProperties.canChooseOwnPushedBackSquare)) {
				grabSquares = UtilServerPushback.findPushbackSquares(game, startingSquare, PushbackMode.GRAB);
			}
			if (ArrayTool.isProvided(grabSquares)) for (PushbackSquare square : grabSquares) {
				FieldCoordinate coordinate = square.getCoordinate();
				if (FieldCoordinateBounds.SIDELINE_LOWER.isInBounds(coordinate)
					|| FieldCoordinateBounds.SIDELINE_UPPER.isInBounds(coordinate)
					|| FieldCoordinateBounds.ENDZONE_HOME.isInBounds(coordinate)
					|| FieldCoordinateBounds.ENDZONE_AWAY.isInBounds(coordinate)) sidelinePush = true;
				if ((game.getTeamHome().hasPlayer(attacker) && FieldCoordinateBounds.HALF_HOME.isInBounds(coordinate)
					&& game.getTurnDataHome().isFirstTurnAfterKickoff())
					|| (game.getTeamAway().hasPlayer(attacker) && FieldCoordinateBounds.HALF_AWAY.isInBounds(coordinate)
					&& game.getTurnDataAway().isFirstTurnAfterKickoff())) attackerHalfPush = true;
			}
		}
		return chainPush || sidelinePush || attackerHalfPush;
	}

	@Override
	public JsonObject toJsonValue() {
		JsonObject json = super.toJsonValue();
		IServerJsonOption.USING_DODGE.addTo(json, state.usingDodge);
		IServerJsonOption.OLD_DEFENDER_STATE.addTo(json, state.oldDefenderState);
		IServerJsonOption.ASK_FOR_SKILL.addTo(json, state.askForSkill);
		json.add("skillHooksComplete", state.skillHooksComplete);
		return json;
	}

	@Override
	public StepBlockDodge initFrom(IFactorySource source, JsonValue value) {
		super.initFrom(source, value);
		JsonObject json = UtilJson.toJsonObject(value);
		state.usingDodge = IServerJsonOption.USING_DODGE.getFrom(source, json);
		state.oldDefenderState = IServerJsonOption.OLD_DEFENDER_STATE.getFrom(source, json);
		state.askForSkill = IServerJsonOption.ASK_FOR_SKILL.getFrom(source, json);
		state.skillHooksComplete = json.getBoolean("skillHooksComplete", false);
		return this;
	}
}
