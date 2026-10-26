package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.dialog.DialogKickSkillParameter;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

/** Resolves the player declaring a server-offered action for the browser ribbon. */
final class ActionSource {
    String playerId(Game game, Action action) {
        String sourcePlayerId = game.getActingPlayer().getPlayerId();
        if (("skill".equals(action.kind) || "kickSkill".equals(action.kind)) && game.getDialogParameter() instanceof DialogSkillUseParameter)
            sourcePlayerId = ((DialogSkillUseParameter) game.getDialogParameter()).getPlayerId();
        if (isSidestepChoice(game, action.kind))
            sourcePlayerId = ((DialogSkillUseParameter) game.getDialogParameter()).getPlayerId();
        if ("kickSkill".equals(action.kind) && game.getDialogParameter() instanceof DialogKickSkillParameter)
            sourcePlayerId = ((DialogKickSkillParameter) game.getDialogParameter()).getPlayerId();
        if (("reroll".equals(action.kind) || "proTestReroll".equals(action.kind))
            && game.getDialogParameter() instanceof DialogReRollPropertiesParameter)
            sourcePlayerId = ((DialogReRollPropertiesParameter) game.getDialogParameter()).getPlayerId();
        if ("kickoffMove".equals(action.kind) && action.command instanceof ClientCommandSetupPlayer) {
            sourcePlayerId = ((ClientCommandSetupPlayer) action.command).getPlayerId();
        }
        if (action.targetPlayerId != null && ("select".equals(action.kind) || "selectBlock".equals(action.kind)
            || "blitz".equals(action.kind) || "stand".equals(action.kind) || "forgo".equals(action.kind)
            || action.kind.startsWith("declare") || "secureBall".equals(action.kind))) {
            sourcePlayerId = action.targetPlayerId;
        }
        return ownedPlayerId(game, sourcePlayerId, action.role);
    }

    /** Historical reroll projections used the active player, filtered to the deciding team. */
    String actingPlayerId(Game game, String role) {
        return ownedPlayerId(game, game.getActingPlayer().getPlayerId(), role);
    }

    boolean isSidestepChoice(Game game, String kind) {
        return ("reactiveSquare".equals(kind) || "reactiveSkill".equals(kind))
            && game.getDialogParameter() instanceof DialogSkillUseParameter
            && "Sidestep".equals(((DialogSkillUseParameter) game.getDialogParameter()).getSkill().getName());
    }

    private String ownedPlayerId(Game game, String sourcePlayerId, String role) {
        if (sourcePlayerId == null) return null;
        Player<?> player = game.getPlayerById(sourcePlayerId);
        Team team = "home".equals(role) ? game.getTeamHome() : game.getTeamAway();
        return player != null && player.getTeam() == team ? sourcePlayerId : null;
    }
}
