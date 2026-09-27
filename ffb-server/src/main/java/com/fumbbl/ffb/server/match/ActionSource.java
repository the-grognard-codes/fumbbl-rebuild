package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

/** Resolves the player declaring a server-offered action for the browser ribbon. */
final class ActionSource {
    String playerId(Game game, Action action) {
        String sourcePlayerId = game.getActingPlayer().getPlayerId();
        if (action.targetPlayerId != null && ("select".equals(action.kind) || "selectBlock".equals(action.kind)
            || "blitz".equals(action.kind) || "stand".equals(action.kind) || "forgo".equals(action.kind)
            || action.kind.startsWith("declare") || "secureBall".equals(action.kind))) {
            sourcePlayerId = action.targetPlayerId;
        }
        if (sourcePlayerId == null) return null;
        Player<?> player = game.getPlayerById(sourcePlayerId);
        Team team = "home".equals(action.role) ? game.getTeamHome() : game.getTeamAway();
        return player != null && player.getTeam() == team ? sourcePlayerId : null;
    }
}
