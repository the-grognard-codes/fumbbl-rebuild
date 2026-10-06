package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.HasReRollProperties;
import com.fumbbl.ffb.ReRollProperty;
import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledAction;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.dialog.DialogBlockRollPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.factory.BlockResultFactory;
import com.fumbbl.ffb.factory.ReRollSourceFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandBlockChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseBrawler;
import com.fumbbl.ffb.net.commands.ClientCommandUseConsummateReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseHatred;
import com.fumbbl.ffb.net.commands.ClientCommandUseMultiBlockDiceReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseProReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSingleBlockDieReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;

import java.util.ArrayList;
import java.util.List;

/** Projects native prompt properties and source mappings into explicit choices. */
final class RerollPromptActions {
	private final Game game;
	private final String role;

	RerollPromptActions(Game game, String role) { this.game = game; this.role = role; }

	List<CoreTurnActions.Action> blockRoll(DialogBlockRollPropertiesParameter dialog) {
		List<CoreTurnActions.Action> result = new ArrayList<>();
		int count = dialog.getBlockRoll().length;
		boolean ownChoice = dialog.getNrOfDice() > 0 || !dialog.hasActualReRoll();
		if (ownChoice) for (int index = 0; index < count; index++) {
			BlockResultFactory factory = game.getFactory(FactoryType.Factory.BLOCK_RESULT);
			add(result, "block-die:" + index, "blockDie", "Choose " + factory.forRoll(dialog.getBlockRoll()[index]).getName() + " (die " + (index + 1) + ")", new ClientCommandBlockChoice(index));
		} else add(result, "block-reroll:none", "reroll", "Keep dice; opponent chooses", new ClientCommandUseReRoll(ReRolledActions.BLOCK, null));
		teamChoices(result, dialog, "block-reroll", ReRolledActions.BLOCK);
		boolean pro = dialog.hasProperty(ReRollProperty.PRO) || source(dialog, ReRolledActions.SINGLE_DIE_PER_ACTIVATION) == ReRollSources.PRO;
		if (pro) for (int index = 0; index < count; index++) proChoices(result, dialog, "block-reroll", ReRolledActions.BLOCK, index);
		if (source(dialog, ReRolledActions.SINGLE_BOTH_DOWN) == ReRollSources.BRAWLER)
			add(result, "block-reroll:brawler", "reroll", "Use Brawler on a Both Down die", new ClientCommandUseBrawler(null));
		if (source(dialog, ReRolledActions.SINGLE_SKULL) == ReRollSources.HATRED)
			add(result, "block-reroll:hatred", "reroll", "Use Hatred on a Skull die", new ClientCommandUseHatred(null));
		ReRollSource single = source(dialog, ReRolledActions.SINGLE_DIE), singleBlock = source(dialog, ReRolledActions.SINGLE_BLOCK_DIE);
		for (int index = 0; index < count; index++) {
			if (single != null) add(result, "block-reroll:single:" + index, "reroll", "Use " + single.getName(game) + " on die " + (index + 1), new ClientCommandUseConsummateReRollForBlock(index));
			if (singleBlock != null) add(result, "block-reroll:block-single:" + index, "reroll", "Use " + singleBlock.getName(game) + " on die " + (index + 1), new ClientCommandUseSingleBlockDieReRoll(index, singleBlock));
		}
		ReRollSource multiple = source(dialog, ReRolledActions.MULTI_BLOCK_DICE);
		if (multiple != null) for (int mask = 1; mask < 1 << count; mask++) {
			List<Integer> indexes = new ArrayList<>(); List<String> numbers = new ArrayList<>();
			for (int index = 0; index < count; index++) if ((mask & 1 << index) != 0) { indexes.add(index); numbers.add(String.valueOf(index + 1)); }
			add(result, "block-reroll:multi:" + mask, "reroll", "Use " + multiple.getName(game) + " on dice " + String.join(", ", numbers), new ClientCommandUseMultiBlockDiceReRoll(indexes.stream().mapToInt(Integer::intValue).toArray()));
		}
		return result;
	}

	List<CoreTurnActions.Action> reroll(DialogReRollPropertiesParameter dialog) {
		List<CoreTurnActions.Action> result = new ArrayList<>();
		ReRolledAction action = dialog.getReRolledAction();
		add(result, "reroll:none", "reroll", "Do not re-roll " + action.getName(game.getRules().getSkillFactory()), new ClientCommandUseReRoll(action, null));
		teamChoices(result, dialog, "reroll", action);
		if (dialog.hasProperty(ReRollProperty.PRO)) proChoices(result, dialog, "reroll", action, -1);
		if (dialog.getReRollSkill() != null) add(result, "reroll:skill", "reroll", "Use " + dialog.getReRollSkill().getName(), new ClientCommandUseSkill(dialog.getReRollSkill(), true, dialog.getPlayerId(), action, false));
		if (dialog.getModifyingSkill() != null) add(result, "reroll:modify", "reroll", "Use " + dialog.getModifyingSkill().getName(), new ClientCommandUseSkill(dialog.getModifyingSkill(), true, dialog.getPlayerId(), action, false));
		return result;
	}

	private void teamChoices(List<CoreTurnActions.Action> result, HasReRollProperties dialog, String prefix, ReRolledAction action) {
		String suffix = action == ReRolledActions.BLOCK ? "" : " for " + action.getName(game.getRules().getSkillFactory());
		String teamLabel = dialog.hasProperty(ReRollProperty.BRILLIANT_COACHING) ? "Use Brilliant Coaching re-roll"
			: dialog.hasProperty(ReRollProperty.PUMP_UP_THE_CROWD) ? "Use Pump up the Crowd re-roll"
			: dialog.hasProperty(ReRollProperty.SHOW_STAR) ? "Use Star of the Show re-roll"
			: dialog.hasProperty(ReRollProperty.MASCOT) ? "Use team sources (Mascot first; fallback if needed)" : "Use team re-roll";
		if (dialog.hasProperty(ReRollProperty.TRR)) add(result, prefix + ":team", "reroll", teamLabel + suffix, new ClientCommandUseReRoll(action, ReRollSources.TEAM_RE_ROLL));
		if (dialog.hasProperty(ReRollProperty.MASCOT)) {
			add(result, prefix + ":mascot", "reroll", "Try Team Mascot (conditional re-roll)" + suffix, new ClientCommandUseReRoll(action, ReRollSources.MASCOT));
			if (dialog.hasProperty(ReRollProperty.TRR)) add(result, prefix + ":mascot-team", "reroll", "Try Mascot; team re-roll if Mascot fails" + suffix, new ClientCommandUseReRoll(action, ReRollSources.MASCOT_TRR));
		}
	}

	private void proChoices(List<CoreTurnActions.Action> result, HasReRollProperties dialog, String prefix, ReRolledAction action, int index) {
		proChoice(result, prefix, action, index, "pro", ReRollSources.PRO, "");
		// Generic native dialogs allow a failed Pro-check fallback only for Loner.
		// Block dialogs have their own per-die flow and do not use that restriction.
		if (index < 0 && !dialog.hasProperty(ReRollProperty.LONER)) return;
		if (dialog.hasProperty(ReRollProperty.TRR)) proChoice(result, prefix, action, index, "pro-team", ReRollSources.PRO_TRR, "; team re-roll a failed Pro check");
		if (dialog.hasProperty(ReRollProperty.MASCOT)) {
			proChoice(result, prefix, action, index, "pro-mascot", ReRollSources.PRO_MASCOT, "; try Mascot on a failed Pro check");
			if (dialog.hasProperty(ReRollProperty.TRR)) proChoice(result, prefix, action, index, "pro-mascot-team", ReRollSources.PRO_MASCOT_TRR, "; Mascot then team re-roll a failed Pro check");
		}
	}

	private void proChoice(List<CoreTurnActions.Action> result, String prefix, ReRolledAction action, int index, String id, ReRollSource source, String fallback) {
		String label = index >= 0 ? "Use Pro on die " + (index + 1) : "Use Pro re-roll for " + action.getName(game.getRules().getSkillFactory());
		ClientCommand command = index < 0 ? new ClientCommandUseReRoll(action, source) : source == ReRollSources.PRO ? new ClientCommandUseProReRollForBlock(index) : new ClientCommandUseSingleBlockDieReRoll(index, source);
		add(result, prefix + ":" + id + (index >= 0 ? ":" + index : ""), "reroll", label + fallback, command);
	}

	private ReRollSource source(DialogBlockRollPropertiesParameter dialog, ReRolledAction action) {
		String name = dialog.getRrActionToSource().get(action.getName(game.getRules().getSkillFactory()));
		ReRollSourceFactory factory = game.getFactory(FactoryType.Factory.RE_ROLL_SOURCE);
		return name == null ? null : factory.forName(name);
	}
	private void add(List<CoreTurnActions.Action> result, String id, String kind, String label, ClientCommand command) {
		result.add(new CoreTurnActions.Action(id, kind, label, role, command));
	}
}
