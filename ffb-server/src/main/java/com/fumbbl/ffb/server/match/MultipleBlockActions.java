package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.CardEffect;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.BlockKind;
import com.fumbbl.ffb.model.BlockTarget;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandSynchronousMultiBlock;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.util.UtilCards;
import com.fumbbl.ffb.util.UtilPlayer;

import java.util.Arrays;
import java.util.List;

/** Server-issued BB2025 Multiple Block declaration and legal defender pairs. */
final class MultipleBlockActions {
    void declaration(Game game, Player<?> player, PlayerState status, String role, List<Action> actions) {
        if (game.getTurnMode() != TurnMode.REGULAR || !status.isActive()
            || game.getFieldModel().hasCardEffect(player, CardEffect.ILLEGALLY_SUBSTITUTED)
            || player.hasSkillProperty(NamedProperties.preventRegularBlockAction)
            || status.getBase() == PlayerState.PRONE && !player.hasSkillProperty(NamedProperties.canStandUpForFree)
            || !hasMultipleBlockSkill(player) || defenders(game, player).length < 2) return;
        actions.add(new Action("declare-multiple-block-" + player.getId(), "declareMultipleBlock", "Multiple Block with " + player.getName(), role,
            new ClientCommandActingPlayer(player.getId(), PlayerAction.MULTIPLE_BLOCK, false), player.getId()));
    }

    void targets(Game game, Player<?> player, String role, List<Action> actions) {
        if (!hasMultipleBlockSkill(player)) return;
        Player<?>[] defenders = defenders(game, player);
        Arrays.sort(defenders, (left, right) -> left.getId().compareTo(right.getId()));
        for (int first = 0; first < defenders.length; first++) for (int second = first + 1; second < defenders.length; second++) {
            Player<?> left = defenders[first];
            Player<?> right = defenders[second];
            FieldCoordinate leftAt = game.getFieldModel().getPlayerCoordinate(left);
            FieldCoordinate rightAt = game.getFieldModel().getPlayerCoordinate(right);
            if (game.getFieldModel().getDiceDecoration(leftAt) == null || game.getFieldModel().getDiceDecoration(rightAt) == null) continue;
            List<BlockTarget> pair = Arrays.asList(
                new BlockTarget(left.getId(), BlockKind.BLOCK, game.getFieldModel().getPlayerState(left)),
                new BlockTarget(right.getId(), BlockKind.BLOCK, game.getFieldModel().getPlayerState(right)));
            actions.add(new Action("multi-block-" + left.getId() + "-" + right.getId(), "multiBlock",
                "Block " + left.getName() + " and " + right.getName(), role, new ClientCommandSynchronousMultiBlock(pair)));
        }
    }

    private boolean hasMultipleBlockSkill(Player<?> player) {
        return UtilCards.hasSkillWithProperty(player, NamedProperties.canBlockMoreThanOnce)
                && !UtilCards.hasSkillToCancelProperty(player, NamedProperties.canBlockMoreThanOnce)
            || UtilCards.hasSkillWithProperty(player, NamedProperties.canBlockTwoAtOnce)
                && !UtilCards.hasSkillToCancelProperty(player, NamedProperties.canBlockTwoAtOnce);
    }

    private Player<?>[] defenders(Game game, Player<?> player) {
        return UtilPlayer.findAdjacentBlockablePlayers(game, game.getOtherTeam(player.getTeam()),
            game.getFieldModel().getPlayerCoordinate(player));
    }
}
