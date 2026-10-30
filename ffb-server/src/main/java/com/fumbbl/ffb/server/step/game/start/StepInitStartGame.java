package com.fumbbl.ffb.server.step.game.start;

import com.fumbbl.ffb.GameStatus;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.option.IGameOption;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerLogLevel;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.AbstractStep;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepCommandStatus;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.util.StringTool;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Date;
/**
 * Step to init the start game sequence.
 *
 * @author Kalimar
 */
@RulesCollection(RulesCollection.Rules.COMMON)
public final class StepInitStartGame extends AbstractStep {

	private boolean fStartedHome;
	private boolean fStartedAway;

	public StepInitStartGame(GameState pGameState) {
		super(pGameState);
		getResult().setSynchronize(false);
	}

	public StepId getId() {
		return StepId.INIT_START_GAME;
	}

	@Override
	public void start() {
		super.start();
		executeStep();
	}

	@Override
	public StepCommandStatus handleCommand(ReceivedCommand receivedCommand) {
		StepCommandStatus commandStatus = super.handleCommand(receivedCommand);
		if (commandStatus == StepCommandStatus.UNHANDLED_COMMAND) {
			Game game = getGameState().getGame();
			switch (receivedCommand.getId()) {
			case CLIENT_START_GAME:
				if (com.fumbbl.ffb.server.step.UtilServerSteps.checkCommandIsFromHomePlayer(getGameState(), receivedCommand)) fStartedHome = true;
				if (com.fumbbl.ffb.server.step.UtilServerSteps.checkCommandIsFromAwayPlayer(getGameState(), receivedCommand)) fStartedAway = true;
				if (fStartedHome && fStartedAway && (game.getStarted() == null)) {
					game.setStarted(new Date());
				}
				commandStatus = StepCommandStatus.EXECUTE_STEP;
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

	private void executeStep() {
		if (getGameState().getGame().getStarted() != null) leaveStep();
	}

	private void leaveStep() {
		Game game = getGameState().getGame();
		FantasyFootballServer server = getGameState().getServer();
		if ((game != null) && (game.getTeamHome() != null) && (game.getTeamAway() != null)) {
			getGameState().setStatus(GameStatus.ACTIVE);
			// log start game -->
			String logEntry = "START GAME " + StringTool.print(game.getTeamHome().getName()) + " vs. " +
				StringTool.print(game.getTeamAway().getName());
			server.getDebugLog().log(IServerLogLevel.WARN, getGameState().getId(), logEntry);
			if (game.getOptions() != null) {
				StringBuilder optionValues = new StringBuilder();
				for (IGameOption option : game.getOptions().getOptions()) {
					if (option.isChanged()) {
						if (optionValues.length() > 0) {
							optionValues.append(",");
						}
						optionValues.append(option.getId().getName()).append("=").append(option.getValueAsString());
					}
				}
				if (optionValues.length() > 0) {
					server.getDebugLog().log(IServerLogLevel.WARN, getGameState().getId(), "Options " + optionValues);
				} else {
					server.getDebugLog().log(IServerLogLevel.WARN, getGameState().getId(), "Default Options");
				}
			}
			// <-- log start game
		}
		getResult().setNextAction(StepAction.NEXT_STEP);
	}

	// JSON serialization

	@Override
	public JsonObject toJsonValue() {
		JsonObject jsonObject = super.toJsonValue();
		return jsonObject;
	}

	@Override
	public StepInitStartGame initFrom(IFactorySource source, JsonValue jsonValue) {
		super.initFrom(source, jsonValue);
		JsonObject jsonObject = UtilJson.toJsonObject(jsonValue);
		return this;
	}

}
