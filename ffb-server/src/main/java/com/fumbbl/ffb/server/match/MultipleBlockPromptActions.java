package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledAction;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.dialog.DialogBlockRollPropertiesParameter;
import com.fumbbl.ffb.factory.ReRollSourceFactory;
import com.fumbbl.ffb.model.BlockRollProperties;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandBlockChoice;
import com.fumbbl.ffb.net.commands.ClientCommandBlockOrReRollChoiceForTarget;
import com.fumbbl.ffb.net.commands.ClientCommandUseBrawler;
import com.fumbbl.ffb.net.commands.ClientCommandUseConsummateReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseHatred;
import com.fumbbl.ffb.net.commands.ClientCommandUseMultiBlockDiceReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseProReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSingleBlockDieReRoll;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import java.util.ArrayList;
import java.util.List;

/** Adapts existing native per-target prompt properties; never computes availability. */
final class MultipleBlockPromptActions {
    List<Action> project(Game game, List<BlockRollProperties> rolls, String role, boolean opponent) {
        List<Action> result = new ArrayList<>();
        for (BlockRollProperties roll : rolls) {
            if (!roll.needsSelection()) continue;
            DialogBlockRollPropertiesParameter dialog = new DialogBlockRollPropertiesParameter(
                ("home".equals(role) ? game.getTeamHome() : game.getTeamAway()).getId(),
                opponent || roll.isOwnChoice() ? roll.getNrOfDice() : -roll.getNrOfDice(), roll.getBlockRoll(),
                opponent ? null : new ArrayList<>(roll.getReRollProperties()), opponent ? null : roll.getRrActionToSource());
            for (Action action : new RerollPromptActions(game, role).blockRoll(dialog)) {
                if (!opponent && !roll.isOwnChoice() && action.command instanceof ClientCommandBlockChoice) continue;
                if (action.command instanceof ClientCommandUseProReRollForBlock) {
                    for (int index = 0; index < roll.getBlockRoll().length; index++)
                        add(result, action, roll, "pro:"+index, "Use Pro on die "+(index+1),
                            new ClientCommandBlockOrReRollChoiceForTarget(roll.getTargetId(), -1, index, ReRollSources.PRO));
                } else add(result, action, roll, action.id, action.label, command(game, roll, action.command));
            }
        }
        return result;
    }

    private void add(List<Action> result, Action original, BlockRollProperties roll, String id, String label, ClientCommand command) {
        result.add(new Action("multi:"+roll.getTargetId()+":"+id, original.kind, label, original.role, command, roll.getTargetId()));
    }

    private ClientCommand command(Game game, BlockRollProperties roll, ClientCommand command) {
        String target = roll.getTargetId();
        int selected = -1, index = -1; int[] indexes = null; ReRollSource source = null;
        if (command instanceof ClientCommandBlockChoice) selected = ((ClientCommandBlockChoice) command).getDiceIndex();
        else if (command instanceof ClientCommandUseReRoll) source = ((ClientCommandUseReRoll) command).getReRollSource();
        else if (command instanceof ClientCommandUseBrawler) return new ClientCommandUseBrawler(target);
        else if (command instanceof ClientCommandUseHatred) return new ClientCommandUseHatred(target);
        else if (command instanceof ClientCommandUseConsummateReRollForBlock) {
            index = ((ClientCommandUseConsummateReRollForBlock) command).getProIndex();
            source = source(game, roll, ReRolledActions.SINGLE_DIE);
        } else if (command instanceof ClientCommandUseSingleBlockDieReRoll) {
            ClientCommandUseSingleBlockDieReRoll single = (ClientCommandUseSingleBlockDieReRoll) command;
            source = single.getReRollSource(); indexes = new int[] {single.getDieIndex()};
        } else if (command instanceof ClientCommandUseMultiBlockDiceReRoll) {
            source = source(game, roll, ReRolledActions.MULTI_BLOCK_DICE);
            indexes = ((ClientCommandUseMultiBlockDiceReRoll) command).getDiceIndexes();
        } else throw new IllegalArgumentException("Unsupported native Multiple Block choice");
        return new ClientCommandBlockOrReRollChoiceForTarget(target, selected, index, source, indexes);
    }

    private ReRollSource source(Game game, BlockRollProperties roll, ReRolledAction action) {
        String name = roll.getRrActionToSource().get(action.getName(game.getRules().getSkillFactory()));
        ReRollSourceFactory factory = game.getFactory(FactoryType.Factory.RE_ROLL_SOURCE);
        return name == null ? null : factory.forName(name);
    }
}
