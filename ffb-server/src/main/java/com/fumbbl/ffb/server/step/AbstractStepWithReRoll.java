package com.fumbbl.ffb.server.step;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledAction;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.mechanic.RollMechanic;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.skilluse.PendingSkillReroll;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.util.UtilServerDialog;
import com.fumbbl.ffb.util.UtilCards;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * @author Kalimar
 */
public abstract class AbstractStepWithReRoll extends AbstractStep implements HasIdForSingleUseReRoll {

	private ReRolledAction fReRolledAction;
	private ReRollSource fReRollSource;
	private String playerIdForSingleUseReRoll;
	private DeferredReRoll deferredReRoll;
	private PendingSkillReroll optionalSkillReroll;

	public AbstractStepWithReRoll(GameState pGameState) {
		super(pGameState);
	}

	public StepCommandStatus handleCommand(ReceivedCommand pReceivedCommand) {
		if (optionalSkillReroll != null && pReceivedCommand.getCommand() instanceof ClientCommandUseSkill) {
			ClientCommandUseSkill choice = (ClientCommandUseSkill) pReceivedCommand.getCommand();
			PendingSkillReroll offered = optionalSkillReroll;
			if (!isOptionalSkillOwner(pReceivedCommand, offered.playerId)) return StepCommandStatus.SKIP_STEP;
			Skill skill = offered.command.getReRollSource().getSkill(getGameState().getGame());
			if (offered.playerId.equals(choice.getPlayerId()) && skill.equals(choice.getSkill())) {
				optionalSkillReroll = null;
				UtilServerDialog.hideDialog(getGameState());
				setReRolledAction(offered.command.getReRolledAction());
				setReRollSource(choice.isSkillUsed() ? offered.command.getReRollSource() : null);
				if (!choice.isSkillUsed()
					&& !getGameState().getOptionalSkillUse().declineEndsRerollChoice(offered.command.getReRollSource(), offered.command.getReRolledAction())
					&& askForOtherRerolls(offered, null)) return StepCommandStatus.SKIP_STEP;
				return StepCommandStatus.EXECUTE_STEP;
			}
			return StepCommandStatus.SKIP_STEP;
		}
		// Browser policy also applies to the native Pass skill dialog.
		if (getGameState().getOptionalSkillUse().enabled() && pReceivedCommand.getCommand() instanceof ClientCommandUseSkill
			&& getGameState().getGame().getDialogParameter() instanceof DialogSkillUseParameter) {
			ClientCommandUseSkill choice = (ClientCommandUseSkill) pReceivedCommand.getCommand();
			DialogSkillUseParameter dialog = (DialogSkillUseParameter) getGameState().getGame().getDialogParameter();
			ReRollSource source = choice.getSkill() == null ? null : choice.getSkill().getRerollSource(getReRolledAction());
			if (!choice.isSkillUsed() && source != null && dialog.getSkill().equals(choice.getSkill())
				&& dialog.getPlayerId().equals(choice.getPlayerId())
				&& isOptionalSkillOwner(pReceivedCommand, choice.getPlayerId())
				&& getGameState().getOptionalSkillUse().rerollCase(source, getReRolledAction()) != null) {
				UtilServerDialog.hideDialog(getGameState());
				setReRollSource(null);
				if (!getGameState().getOptionalSkillUse().declineEndsRerollChoice(source, getReRolledAction())
					&& askForOtherRerolls(new PendingSkillReroll(choice.getPlayerId(), dialog.getMinimumRoll(), getReRolledAction(), source),
					dialog.getModifyingSkill())) return StepCommandStatus.SKIP_STEP;
				return StepCommandStatus.EXECUTE_STEP;
			}
		}
		if (deferredReRoll != null || pReceivedCommand.getCommand() instanceof ClientCommandUseReRoll) {
			RollMechanic mechanic = (RollMechanic) getGameState().getGame().getFactory(FactoryType.Factory.MECHANIC).forName(Mechanic.Type.ROLL.name());
			StepCommandStatus intercepted = mechanic.handleDeferredReRoll(this, pReceivedCommand);
			if (intercepted != null) return intercepted;
		}
		StepCommandStatus commandStatus = super.handleCommand(pReceivedCommand);
		if (commandStatus == StepCommandStatus.UNHANDLED_COMMAND) {
			switch (pReceivedCommand.getId()) {
				case CLIENT_USE_RE_ROLL:
					ClientCommandUseReRoll useReRollCommand = (ClientCommandUseReRoll) pReceivedCommand.getCommand();
					setReRolledAction(useReRollCommand.getReRolledAction());
					if (reRollSourceSuccessfully(useReRollCommand.getReRollSource())) {
						commandStatus = StepCommandStatus.EXECUTE_STEP;
					}
					break;
				case CLIENT_PLAYER_CHOICE:
					ClientCommandPlayerChoice commandPlayerChoice = (ClientCommandPlayerChoice) pReceivedCommand.getCommand();
					if (commandPlayerChoice.getPlayerChoiceMode() == PlayerChoiceMode.LORD_OF_CHAOS) {
						playerIdForSingleUseReRoll = commandPlayerChoice.getPlayerId();
						commandStatus = StepCommandStatus.EXECUTE_STEP;
					}
					break;
				case CLIENT_USE_SKILL:
					ClientCommandUseSkill commandUseSkill = (ClientCommandUseSkill) pReceivedCommand.getCommand();
					if (commandUseSkill.isSkillUsed() && commandUseSkill.getSkill().hasSkillProperty(NamedProperties.canRerollSingleDieOncePerPeriod)) {
						setReRolledAction(commandUseSkill.getReRolledAction());
						setReRollSource(commandUseSkill.getSkill().getRerollSource(ReRolledActions.SINGLE_DIE));
						commandStatus = StepCommandStatus.EXECUTE_STEP;
					}
					break;
				default:
					break;
			}
		}
		return commandStatus;
	}

	/** True means an optional native skill reroll now waits for its owner. */
	protected boolean offerOptionalSkillReroll(Player<?> player, ReRolledAction action, ReRollSource source, int minimumRoll) {
		UseCase useCase = getGameState().getOptionalSkillUse().rerollCase(source, action);
		if (useCase == null || !getGameState().getOptionalSkillUse().alwaysAsk(useCase, player)) return false;
		optionalSkillReroll = new PendingSkillReroll(player.getId(), minimumRoll, action, source);
		setReRolledAction(action);
		setReRollSource(null);
		UtilServerDialog.showDialog(getGameState(), new DialogSkillUseParameter(player.getId(), source.getSkill(getGameState().getGame()), minimumRoll),
			!getGameState().getGame().getActingTeam().hasPlayer(player));
		getResult().setNextAction(StepAction.CONTINUE);
		return true;
	}

	private boolean askForOtherRerolls(PendingSkillReroll offered, Skill modifyingSkill) {
		RollMechanic mechanic = (RollMechanic) getGameState().getGame().getFactory(FactoryType.Factory.MECHANIC).forName(Mechanic.Type.ROLL.name());
		boolean waiting = mechanic.askForReRollIfAvailable(getGameState(), getGameState().getGame().getPlayerById(offered.playerId),
			offered.command.getReRolledAction(), offered.minimumRoll, false, modifyingSkill, null, null, null, null);
		if (waiting) getResult().setNextAction(StepAction.CONTINUE);
		return waiting;
	}

	public ReRolledAction getReRolledAction() {
		return fReRolledAction;
	}

	public DeferredReRoll getDeferredReRoll() { return deferredReRoll; }
	public void setDeferredReRoll(DeferredReRoll deferredReRoll) { this.deferredReRoll = deferredReRoll; }

	public void setReRolledAction(ReRolledAction pReRolledAction) {
		fReRolledAction = pReRolledAction;
	}

	public ReRollSource getReRollSource() {
		return fReRollSource;
	}

	public void setReRollSource(ReRollSource pReRollSource) {
		fReRollSource = pReRollSource;
	}

	public String idForSingleUseReRoll() {
		return playerIdForSingleUseReRoll;
	}

	private boolean reRollSourceSuccessfully(ReRollSource reRollSource) {
		if (reRollSource == ReRollSources.LORD_OF_CHAOS) {
			setReRollSource(reRollSource);
			List<String> lords = Arrays.stream(getGameState().getGame().getActingTeam().getPlayers())
				.filter(player -> UtilCards.hasUnusedSkillWithProperty(player, NamedProperties.grantsSingleUseTeamRerollWhenOnPitch))
				.map(Player::getId)
				.collect(Collectors.toList());

			if (lords.size() > 1) {
				UtilServerDialog.showDialog(getGameState(),
					new DialogPlayerChoiceParameter(getGameState().getGame().getActingTeam().getId(), PlayerChoiceMode.LORD_OF_CHAOS,
						lords.toArray(new String[0]), null, 1, 1), false);
				return false;
			}

			if (lords.size() == 1) {
				playerIdForSingleUseReRoll = lords.get(0);
			}

			return true;

		} else {
			setReRollSource(reRollSource);
			return true;
		}
	}

	protected ReRollSource findSkillReRollSource(ReRolledAction reRolledAction) {
		Game game = getGameState().getGame();
		ReRollSource skillRerollSource = null;
		if (TurnMode.REGULAR == game.getTurnMode()) {
			skillRerollSource = UtilCards.getUnusedRerollSource(game.getActingPlayer(), reRolledAction);
		}
		return skillRerollSource;
	}

// JSON serialization

	@Override
	public JsonObject toJsonValue() {
		JsonObject jsonObject = super.toJsonValue();
		IServerJsonOption.RE_ROLLED_ACTION.addTo(jsonObject, fReRolledAction);
		IServerJsonOption.RE_ROLL_SOURCE.addTo(jsonObject, fReRollSource);
		IServerJsonOption.PLAYER_ID_SINGLE_USE_RE_ROLL.addTo(jsonObject, playerIdForSingleUseReRoll);
		if (deferredReRoll != null) jsonObject.add("deferredReRoll", deferredReRoll.toJsonValue());
		if (optionalSkillReroll != null) jsonObject.add("optionalSkillReroll", optionalSkillReroll.toJson());
		return jsonObject;
	}

	@Override
	public AbstractStepWithReRoll initFrom(IFactorySource source, JsonValue jsonValue) {
		super.initFrom(source, jsonValue);
		JsonObject jsonObject = UtilJson.toJsonObject(jsonValue);
		fReRolledAction = (ReRolledAction) IServerJsonOption.RE_ROLLED_ACTION.getFrom(source, jsonObject);
		fReRollSource = (ReRollSource) IServerJsonOption.RE_ROLL_SOURCE.getFrom(source, jsonObject);
		playerIdForSingleUseReRoll = IServerJsonOption.PLAYER_ID_SINGLE_USE_RE_ROLL.getFrom(source, jsonObject);
		JsonValue deferred = jsonObject.get("deferredReRoll");
		deferredReRoll = deferred == null ? null : DeferredReRoll.fromJsonValue(deferred);
		JsonValue optional = jsonObject.get("optionalSkillReroll");
		optionalSkillReroll = optional == null ? null : PendingSkillReroll.restore(source, optional.asObject());
		return this;
	}

}
