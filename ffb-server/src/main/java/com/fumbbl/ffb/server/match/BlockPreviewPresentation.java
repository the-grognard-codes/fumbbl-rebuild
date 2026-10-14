package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.util.ServerUtilBlock;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Read-only block strength guidance using the same native calculation as the roll. */
final class BlockPreviewPresentation {
    private final GameState state;

    BlockPreviewPresentation(GameState state) {
        this.state = state;
    }

    JsonObject project(List<Action> actions) {
        Game game = state.getGame();
        JsonArray rolls = new JsonArray();
        Set<String> pairs = new LinkedHashSet<>();
        for (Action action : actions) {
            if ("selectBlock".equals(action.kind)) {
                Player<?> attacker = game.getPlayerById(action.targetPlayerId);
                if (attacker == null) continue;
                FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(attacker);
                Player<?>[] targets = UtilPlayer.findAdjacentBlockablePlayers(game,
                    game.getOtherTeam(attacker.getTeam()), at);
                if (targets.length == 0) continue;
                GameState calculation = copy();
                calculation.getGame().getActingPlayer().setPlayer(calculation.getGame().getPlayerById(attacker.getId()));
                calculation.getGame().getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
                for (Player<?> defender : targets) {
                    add(rolls, pairs, attacker.getId(), defender.getId(), calculation);
                }
            } else if ("block".equals(action.kind) || "blitzTarget".equals(action.kind)) {
                Player<?> attacker = game.getActingPlayer().getPlayer();
                Player<?> defender = game.getPlayerById(action.targetPlayerId);
                if (attacker != null && defender != null
                    && game.getFieldModel().getPlayerCoordinate(attacker).isAdjacent(
                        game.getFieldModel().getPlayerCoordinate(defender)))
                    add(rolls, pairs, attacker.getId(), defender.getId(), state);
            }
        }
        return rolls.isEmpty() ? null : new JsonObject().add("version", 1).add("rolls", rolls);
    }

    int blitzDice(String attackerId, String defenderId, FieldCoordinate endpoint, boolean active, boolean routeMoved) {
        GameState preview = copy();
        Game game = preview.getGame();
        Player<?> attacker = game.getPlayerById(attackerId);
        Player<?> defender = game.getPlayerById(defenderId);
        game.getActingPlayer().setPlayer(attacker);
        if (!active) game.getActingPlayer().setPlayerAction(PlayerAction.BLITZ_MOVE);
        game.getActingPlayer().setHasMoved(routeMoved || active && state.getGame().getActingPlayer().hasMoved());
        game.getFieldModel().setPlayerCoordinate(attacker, endpoint);
        return ServerUtilBlock.findNrOfBlockDice(preview, attacker, defender, false, false);
    }

    private void add(JsonArray rolls, Set<String> pairs, String attackerId, String defenderId, GameState preview) {
        if (defenderId == null || !pairs.add(attackerId + "\n" + defenderId)) return;
        Game game = preview.getGame();
        Player<?> attacker = game.getPlayerById(attackerId);
        Player<?> defender = game.getPlayerById(defenderId);
        int dice = ServerUtilBlock.findNrOfBlockDice(preview, attacker, defender, false, false);
        rolls.add(new JsonObject().add("playerId", attackerId).add("targetPlayerId", defenderId).add("dice", dice));
    }

    private GameState copy() {
        GameState preview = new GameState(state.getServer());
        preview.initFrom(state.getServer().getFactorySource(), state.toJsonValue(true, 0));
        UtilSkillBehaviours.registerBehaviours(preview.getGame(), state.getServer().getDebugLog());
        return preview;
    }
}
