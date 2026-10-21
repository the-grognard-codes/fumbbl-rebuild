package com.fumbbl.ffb.server.step.bb2025.pass;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.mechanics.PassRangeService;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.TargetSelectionState;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandHandOver;
import com.fumbbl.ffb.net.commands.ClientCommandPass;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.AbstractStep;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepCommandStatus;
import com.fumbbl.ffb.server.step.StepException;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.UtilServerSteps;
import com.fumbbl.ffb.util.StringTool;
import com.fumbbl.ffb.util.UtilPlayer;
import com.fumbbl.ffb.util.UtilRangeRuler;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/**
 * Initialization step of the pass sequence.
 * <p>
 * Needs to be initialized with stepParameter GOTO_LABEL_ON_END. May be
 * initialized with stepParameter CATCHER_ID. May be initialized with
 * stepParameter HAIL_MARY_PASS. May be initialized with stepParameter
 * TARGET_COORDINATE.
 * <p>
 * Sets stepParameter CATCHER_ID for all steps on the stack. Sets stepParameter
 * END_PLAYER_ACTION for all steps on the stack. Sets stepParameter END_TURN for
 * all steps on the stack. Sets stepParameter TARGET_COORDINATE for all steps on
 * the stack.
 *
 * @author Kalimar
 */
@RulesCollection(RulesCollection.Rules.BB2025)
public final class StepInitPassing extends AbstractStep {

	private String goToLabelOnEnd;
	private String catcherId;
	private boolean endTurn;
	private boolean endPlayerAction;
	private final PassRangeService passRangeService = new PassRangeService();

	public StepInitPassing(GameState gameState) {
		super(gameState);
	}

	public StepId getId() {
		return StepId.INIT_PASSING;
	}

	@Override
	public void init(StepParameterSet parameterSet) {
		if (parameterSet != null) {
			Game game = getGameState().getGame();
			ActingPlayer actingPlayer = game.getActingPlayer();
			for (StepParameter parameter : parameterSet.values()) {
				switch (parameter.getKey()) {
					// mandatory
					case GOTO_LABEL_ON_END:
						goToLabelOnEnd = (String) parameter.getValue();
						break;
					// optional
					case TARGET_COORDINATE:
						if (parameter.getValue() != null) {
							FieldCoordinate targetCoordinate = (FieldCoordinate) parameter.getValue();
							TargetSelectionState targetSelectionState = game.getFieldModel().getTargetSelectionState();
							String defenderId = targetSelectionState != null ? targetSelectionState.getSelectedPlayerId() : (game.getDefender() != null ? game.getDefender().getId() : null);
							boolean dumpOff = defenderId != null && game.getDefenderAction() == PlayerAction.DUMP_OFF;
							String throwerId = dumpOff ? defenderId : actingPlayer.getPlayerId();
							PlayerAction action = dumpOff ? game.getDefenderAction() : actingPlayer.getPlayerAction();
							if (!isHailMaryTargetAllowed(targetCoordinate, throwerId, action)) {
								break;
							}
							game.setPassCoordinate(targetCoordinate);
							Player<?> catcher = game.getFieldModel().getPlayer(targetCoordinate);
							catcherId = catcher != null ? catcher.getId() : null;
							game.setThrowerId(throwerId);
							game.setThrowerAction(action);
						}
						break;
					default:
						break;
				}
			}
		}
		if (!StringTool.isProvided(goToLabelOnEnd)) {
			throw new StepException("StepParameter " + StepParameterKey.GOTO_LABEL_ON_END + " is not initialized.");
		}
	}

	@Override
	public void start() {
		super.start();
		executeStep();
	}

	@Override
	public StepCommandStatus handleCommand(ReceivedCommand receivedCommand) {
		StepCommandStatus commandStatus = super.handleCommand(receivedCommand);
		Game game = getGameState().getGame();
		ActingPlayer actingPlayer = game.getActingPlayer();
		if (commandStatus == StepCommandStatus.UNHANDLED_COMMAND && (UtilServerSteps.checkCommandIsFromCurrentPlayer(getGameState(), receivedCommand) || game.getTurnMode() == TurnMode.DUMP_OFF)) {
			switch (receivedCommand.getId()) {
				case CLIENT_PASS:
					ClientCommandPass passCommand = (ClientCommandPass) receivedCommand.getCommand();
					if (UtilServerSteps.checkCommandWithActingPlayer(getGameState(), passCommand)
						|| (game.getTurnMode() == TurnMode.DUMP_OFF)) {
						FieldCoordinate passCoordinate = passCommand.getTargetCoordinate() == null ? null
							: UtilServerSteps.checkCommandIsFromHomePlayer(getGameState(), receivedCommand)
							? passCommand.getTargetCoordinate()
							: passCommand.getTargetCoordinate().transform();
						TargetSelectionState targetSelectionState = game.getFieldModel().getTargetSelectionState();
						String defenderId = targetSelectionState != null ? targetSelectionState.getSelectedPlayerId() : (game.getDefender() != null ? game.getDefender().getId() : null);
						String throwerId;
						PlayerAction throwerAction;
						if ((defenderId != null) && (game.getDefenderAction() == PlayerAction.DUMP_OFF)) {
							throwerId = defenderId;
							throwerAction = game.getDefenderAction();
						} else {
							throwerId = actingPlayer.getPlayerId();
							throwerAction = actingPlayer.getPlayerAction();
						}
						// Guard against invalid (out of range) pass attempts from third party clients.
						// Such attempts are ignored and must not modify the data model.
						if (isPassTargetInRange(passCoordinate, throwerId, throwerAction)) {
							game.setPassCoordinate(passCoordinate);
							Player<?> catcher = game.getFieldModel().getPlayer(game.getPassCoordinate());
							catcherId = ((catcher != null) ? catcher.getId() : null);
							game.setThrowerId(throwerId);
							game.setThrowerAction(throwerAction);
							commandStatus = StepCommandStatus.EXECUTE_STEP;
						}
					}
					break;
				case CLIENT_HAND_OVER:
					ClientCommandHandOver handOverCommand = (ClientCommandHandOver) receivedCommand.getCommand();
					if (UtilServerSteps.checkCommandWithActingPlayer(getGameState(), handOverCommand)) {
						catcherId = handOverCommand.getCatcherId();
						Player<?> catcher = game.getPlayerById(catcherId);
						game.setPassCoordinate(game.getFieldModel().getPlayerCoordinate(catcher));
						game.setThrowerId(actingPlayer.getPlayerId());
						game.setThrowerAction(PlayerAction.HAND_OVER);
						commandStatus = StepCommandStatus.EXECUTE_STEP;
					}
					break;
				case CLIENT_ACTING_PLAYER:
					ClientCommandActingPlayer actingPlayerCommand = (ClientCommandActingPlayer) receivedCommand.getCommand();
					if (StringTool.isProvided(actingPlayerCommand.getPlayerId())) {
						UtilServerSteps.changePlayerAction(this, actingPlayerCommand.getPlayerId(),
							actingPlayerCommand.getPlayerAction(), actingPlayerCommand.isJumping());
					} else {
						endPlayerAction = true;
					}
					commandStatus = StepCommandStatus.EXECUTE_STEP;
					break;
				case CLIENT_END_TURN:
					if (UtilServerSteps.checkCommandIsFromCurrentPlayer(getGameState(), receivedCommand)) {
						endTurn = true;
						commandStatus = StepCommandStatus.EXECUTE_STEP;
					}
					break;
				default:
					break;
			}
		}
		if (commandStatus == StepCommandStatus.EXECUTE_STEP) {
			executeStep();
		}
		return commandStatus;
	}

	private boolean isPassTargetInRange(FieldCoordinate targetCoordinate, String throwerId, PlayerAction throwerAction) {
		Game game = getGameState().getGame();
		return isHailMaryTargetAllowed(targetCoordinate, throwerId, throwerAction)
			&& passRangeService.isInRange(game, game.getPlayerById(throwerId), targetCoordinate, throwerAction);
	}

	private boolean isHailMaryTargetAllowed(FieldCoordinate target, String throwerId, PlayerAction action) {
		if (action != PlayerAction.HAIL_MARY_PASS && action != PlayerAction.HAIL_MARY_BOMB) {
			return true;
		}
		Game game = getGameState().getGame();
		Player<?> thrower = game.getPlayerById(throwerId);
		if (thrower == null || !thrower.hasSkillProperty(NamedProperties.canPassToAnySquare)) {
			return false;
		}
		if (action == PlayerAction.HAIL_MARY_PASS && !UtilPlayer.hasBall(game, thrower)) {
			return false;
		}
		// A caught bomb may be thrown back by a player without Bombardier.
		if (action == PlayerAction.HAIL_MARY_BOMB && !game.getTurnMode().isBombTurn()
			&& !thrower.hasSkillProperty(NamedProperties.enableThrowBombAction)) {
			return false;
		}
		return passRangeService.isInRange(game, thrower, target, action);
	}

	private void executeStep() {
		Game game = getGameState().getGame();
		if (endTurn) {
			publishParameter(new StepParameter(StepParameterKey.END_TURN, true));
			getResult().setNextAction(StepAction.GOTO_LABEL, goToLabelOnEnd);
			return;
		}
		if (endPlayerAction) {
			publishParameter(new StepParameter(StepParameterKey.END_PLAYER_ACTION, true));
			getResult().setNextAction(StepAction.GOTO_LABEL, goToLabelOnEnd);
			return;
		}
		if ((game.getThrower() == null) || (game.getThrowerAction() == null)) {
			return;
		}
		if (!isHailMaryTargetAllowed(game.getPassCoordinate(), game.getThrowerId(), game.getThrowerAction())) {
			return;
		}
		Player<?> catcher = game.getPlayerById(catcherId);
		if (catcher != null) {
			publishParameter(new StepParameter(StepParameterKey.CATCHER_ID, catcher.getId()));
		}
		ActingPlayer actingPlayer = game.getActingPlayer();
		if ((game.getThrower() == actingPlayer.getPlayer()) && actingPlayer.isSufferingBloodLust()
			&& !actingPlayer.hasFed()) {
			getResult().setNextAction(StepAction.GOTO_LABEL, goToLabelOnEnd);
		} else {
			FieldCoordinate throwerCoordinate = game.getFieldModel().getPlayerCoordinate(game.getThrower());
			if ((PlayerAction.HAND_OVER == game.getThrowerAction()) && (game.getThrower() == actingPlayer.getPlayer())
				&& (catcher != null)) {
				actingPlayer.setHasPassed(true);
				game.setConcessionPossible(false);
				game.getTurnData().setHandOverUsed(true);
				game.getTurnData().setTurnStarted(true);
				getResult().setNextAction(StepAction.NEXT_STEP);
				return;
			}
			PassMechanic mechanic = (PassMechanic) game.getFactory(FactoryType.Factory.MECHANIC).forName(Mechanic.Type.PASS.name());
			if ((game.getPassCoordinate() != null) && (game.getThrower() == actingPlayer.getPlayer())
				&& ((PlayerAction.THROW_BOMB == game.getThrowerAction())
				&& (mechanic.findPassingDistance(game, throwerCoordinate, game.getPassCoordinate(), false) != null))
				|| (PlayerAction.HAIL_MARY_BOMB == game.getThrowerAction())) {
				actingPlayer.setHasPassed(true);
				game.getTurnData().setTurnStarted(true);
				game.setConcessionPossible(false);
				if (PlayerAction.THROW_BOMB == game.getThrowerAction()) {
					game.getFieldModel()
						.setRangeRuler(UtilRangeRuler.createRangeRuler(game, game.getThrower(), game.getPassCoordinate(), false));
				}
				getResult().setNextAction(StepAction.NEXT_STEP);
				return;
			}
			if ((game.getPassCoordinate() != null) && (game.getThrower() == actingPlayer.getPlayer())
				&& ((PlayerAction.PASS == game.getThrowerAction())
				&& (mechanic.findPassingDistance(game, throwerCoordinate, game.getPassCoordinate(), false) != null))
				|| (PlayerAction.HAIL_MARY_PASS == game.getThrowerAction())) {
				actingPlayer.setHasPassed(true);
				game.getTurnData().setTurnStarted(true);
				game.setConcessionPossible(false);
				game.getTurnData().setPassUsed(true);
				if (PlayerAction.PASS == game.getThrowerAction()) {
					game.getFieldModel()
						.setRangeRuler(UtilRangeRuler.createRangeRuler(game, game.getThrower(), game.getPassCoordinate(), false));
				}
				getResult().setNextAction(StepAction.NEXT_STEP);
				return;
			}
			if ((game.getPassCoordinate() != null)
				&& (((PlayerAction.THROW_BOMB == game.getThrowerAction())
				|| (PlayerAction.DUMP_OFF == game.getThrowerAction()))
				&& (mechanic.findPassingDistance(game, throwerCoordinate, game.getPassCoordinate(), false) != null))
				|| (PlayerAction.HAIL_MARY_BOMB == game.getThrowerAction())) {
				if (game.getThrower() == actingPlayer.getPlayer()) {
					actingPlayer.setHasPassed(true);
				}
				if (PlayerAction.HAIL_MARY_BOMB != game.getThrowerAction()) {
					game.getFieldModel()
						.setRangeRuler(UtilRangeRuler.createRangeRuler(game, game.getThrower(), game.getPassCoordinate(), false));
				}
				getResult().setNextAction(StepAction.NEXT_STEP);
			}
		}
	}

	// JSON serialization

	@Override
	public JsonObject toJsonValue() {
		JsonObject jsonObject = super.toJsonValue();
		IServerJsonOption.GOTO_LABEL_ON_END.addTo(jsonObject, goToLabelOnEnd);
		IServerJsonOption.CATCHER_ID.addTo(jsonObject, catcherId);
		IServerJsonOption.END_TURN.addTo(jsonObject, endTurn);
		IServerJsonOption.END_PLAYER_ACTION.addTo(jsonObject, endPlayerAction);
		return jsonObject;
	}

	@Override
	public StepInitPassing initFrom(IFactorySource source, JsonValue jsonValue) {
		super.initFrom(source, jsonValue);
		JsonObject jsonObject = UtilJson.toJsonObject(jsonValue);
		goToLabelOnEnd = IServerJsonOption.GOTO_LABEL_ON_END.getFrom(source, jsonObject);
		catcherId = IServerJsonOption.CATCHER_ID.getFrom(source, jsonObject);
		endTurn = IServerJsonOption.END_TURN.getFrom(source, jsonObject);
		endPlayerAction = IServerJsonOption.END_PLAYER_ACTION.getFrom(source, jsonObject);
		return this;
	}

}
