package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import java.util.List;

/** HMP is a mode of an already reserved action, including while a passer moves. */
final class HailMaryActions {
    PlayerAction action(Game game) {
        ActingPlayer acting = game.getActingPlayer();
        if (acting.getPlayerAction() != null && acting.getPlayerAction().getDelegate() == PlayerAction.THROW_BOMB)
            return PlayerAction.THROW_BOMB;
        return acting.isHailMaryPassMode() && (acting.getPlayerAction() == PlayerAction.PASS_MOVE
            || acting.getPlayerAction() == PlayerAction.PASS) ? PlayerAction.HAIL_MARY_PASS : acting.getPlayerAction();
    }

    void modes(Game game, String role, List<Action> actions) {
        ActingPlayer acting = game.getActingPlayer();
        if (acting.getPlayer() == null || game.getPassCoordinate() != null
            || !acting.getPlayer().hasSkillProperty(NamedProperties.canPassToAnySquare)) return;
        PlayerAction current = action(game);
        boolean ball = current == PlayerAction.PASS_MOVE || current == PlayerAction.PASS || current == PlayerAction.HAIL_MARY_PASS;
        boolean bomb = current == PlayerAction.THROW_BOMB || current == PlayerAction.HAIL_MARY_BOMB;
        if (!ball && !bomb || ball && acting.hasPassed()) return;
        boolean hailMary = current == PlayerAction.HAIL_MARY_PASS || current == PlayerAction.HAIL_MARY_BOMB;
        PlayerAction normal = ball ? PlayerAction.PASS_MOVE : PlayerAction.THROW_BOMB;
        PlayerAction alternative = ball ? PlayerAction.HAIL_MARY_PASS : PlayerAction.HAIL_MARY_BOMB;
        String kind = ball ? "hailMaryPassMode" : "hailMaryBombMode";
        actions.add(new Action(kind, kind, hailMary ? "Use normal throw" : "Use Hail Mary throw", role,
            new ClientCommandActingPlayer(acting.getPlayerId(), hailMary ? normal : alternative, acting.isJumping()), acting.getPlayerId()));
        if (hailMary) actions.add(new Action(ball ? "normal-pass-mode" : "normal-bomb-mode",
            ball ? "normalPassMode" : "normalBombMode", "Use normal throw", role,
            new ClientCommandActingPlayer(acting.getPlayerId(), normal, acting.isJumping()), acting.getPlayerId()));
    }
}
