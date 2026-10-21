package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.IDialogParameter;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRolledAction;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.Mode;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.step.AbstractStep;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.util.UtilServerDialog;

/** Browser-owned BB2025 policy. Native desktop games do not enable this service. */
public final class OptionalSkillUse {

	private final GameState state;
	private SkillUsePreferences home, away;

	public OptionalSkillUse(GameState state) { this.state = state; }

	public void configure(SkillUsePreferences home, SkillUsePreferences away) {
		this.home = home;
		this.away = away;
	}

	public boolean enabled() { return home != null && away != null; }

	public boolean alwaysAsk(UseCase useCase, Player<?> player) {
		return enabled() && preferences(player).mode(useCase) == Mode.ALWAYS_ASK;
	}

	public boolean alwaysUse(UseCase useCase, Player<?> player) {
		return enabled() && preferences(player).mode(useCase) == Mode.ALWAYS_USE;
	}

	private SkillUsePreferences preferences(Player<?> player) {
		Game game = state.getGame();
		if (player != null && game.getTeamHome().hasPlayer(player)) return home;
		if (player != null && game.getTeamAway().hasPlayer(player)) return away;
		throw new IllegalArgumentException("Skill decision has no owning player");
	}

	/** Null means the native step must wait for the persisted binary decision. */
	public Boolean choice(AbstractStep step, UseCase useCase, Player<?> player, Skill skill) {
		if (!enabled()) return true;
		String key = useCase.name() + ":" + player.getId();
		Boolean answer = step.getOptionalSkillChoices().answer(key);
		if (answer != null) return answer;
		if (alwaysUse(useCase, player)) {
			step.getOptionalSkillChoices().accept(key);
			return true;
		}
		step.getOptionalSkillChoices().ask(key, player.getId(), skill.getName());
		UtilServerDialog.showDialog(state, new DialogSkillUseParameter(player.getId(), skill, 0),
			!state.getGame().getActingTeam().hasPlayer(player));
		step.getResult().setNextAction(StepAction.CONTINUE);
		return null;
	}

	public UseCase rerollCase(ReRollSource source, ReRolledAction action) {
		if (source == null) return null;
		Skill skill = source.getSkill(state.getGame());
		if (skill == null) return null;
		String name = skill.getName();
		if ("Dodge".equals(name) && action == ReRolledActions.DODGE) return UseCase.DODGE_MOVEMENT;
		if ("Catch".equals(name) && action == ReRolledActions.CATCH) return UseCase.CATCH;
		if ("Sure Hands".equals(name) && action == ReRolledActions.PICK_UP) return UseCase.SURE_HANDS;
		if ("Sure Feet".equals(name) && action == ReRolledActions.RUSH) return UseCase.SURE_FEET;
		if ("Pass".equals(name) && action == ReRolledActions.PASS) return passCase();
		return null;
	}

	private UseCase passCase() {
		PlayerAction action = state.getGame().getThrowerAction();
		return action == PlayerAction.THROW_BOMB || action == PlayerAction.HAIL_MARY_BOMB
			? UseCase.PASS_BOMB : UseCase.PASS_BALL;
	}

	/** Runs within the native executor, before browser projection or a deadline exists. */
	public ClientCommand automaticCommand() {
		if (!enabled()) return null;
		if (state.getCurrentStep() instanceof AbstractStep
			&& ((AbstractStep) state.getCurrentStep()).getOptionalSkillChoices().pending()) return null;
		IDialogParameter parameter = state.getGame().getDialogParameter();
		if (parameter instanceof DialogReRollPropertiesParameter) {
			DialogReRollPropertiesParameter dialog = (DialogReRollPropertiesParameter) parameter;
			Skill skill = dialog.getReRollSkill();
			if (skill == null) return null;
			UseCase useCase = rerollCase(skill.getRerollSource(dialog.getReRolledAction()), dialog.getReRolledAction());
			if (useCase == null || !alwaysUse(useCase, state.getGame().getPlayerById(dialog.getPlayerId()))) return null;
			return new ClientCommandUseSkill(skill, true, dialog.getPlayerId(), dialog.getReRolledAction(), false);
		}
		if (parameter instanceof DialogPlayerChoiceParameter) {
			DialogPlayerChoiceParameter dialog = (DialogPlayerChoiceParameter) parameter;
			if (dialog.getPlayerChoiceMode() != PlayerChoiceMode.PICK_ME_UP || dialog.getPlayerIds().length == 0) return null;
			Player<?> recipient = state.getGame().getPlayerById(dialog.getPlayerIds()[0]);
			if (!alwaysUse(UseCase.PICK_ME_UP, recipient)) return null;
			ClientCommandPlayerChoice command = new ClientCommandPlayerChoice(PlayerChoiceMode.PICK_ME_UP, null);
			for (String id : dialog.getPlayerIds()) command.addPlayerId(id);
			return command;
		}
		if (!(parameter instanceof DialogSkillUseParameter)) return null;
		DialogSkillUseParameter dialog = (DialogSkillUseParameter) parameter;
		Player<?> player = state.getGame().getPlayerById(dialog.getPlayerId());
		UseCase useCase = dialogCase(dialog);
		if (useCase == null || !alwaysUse(useCase, player)) return null;
		return new ClientCommandUseSkill(dialog.getSkill(), true, dialog.getPlayerId(), null, false);
	}

	private UseCase dialogCase(DialogSkillUseParameter dialog) {
		String name = dialog.getSkill().getName();
		StepId step = state.getCurrentStep().getId();
		if ("Dodge".equals(name)) return step == StepId.BLOCK_DODGE ? UseCase.DODGE_BLOCK : UseCase.DODGE_MOVEMENT;
		if ("Catch".equals(name)) return UseCase.CATCH;
		if ("Pass".equals(name)) return passCase();
		if ("Sure Hands".equals(name)) return UseCase.SURE_HANDS;
		if ("Sure Feet".equals(name)) return UseCase.SURE_FEET;
		if ("Stand Firm".equals(name)) return UseCase.STAND_FIRM;
		if ("Fend".equals(name)) return UseCase.FEND;
		if ("Taunt".equals(name)) return UseCase.TAUNT;
		if ("Grab".equals(name)) return UseCase.GRAB;
		if ("Steady Footing".equals(name)) return UseCase.STEADY_FOOTING;
		if ("Wrestle".equals(name)) return state.getGame().getActingPlayer().getPlayerId().equals(dialog.getPlayerId())
			? UseCase.WRESTLE_ATTACKER : UseCase.WRESTLE_DEFENDER;
		return null;
	}
}
