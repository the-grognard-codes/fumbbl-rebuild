package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.ArrayList;
import java.util.List;

/** Validates a hypothetical transfer on a detached native game, without rolling or declaring. */
final class PlannedBallTransfer {
    void validate(GameState state, String playerId, String targetId, String kind, String role, JsonObject route) {
        Game live = state.getGame();
        Player<?> source = live.getPlayerById(playerId);
        boolean possession = UtilPlayer.hasBall(live, source);
        if (!possession && live.getFieldModel().isBallInPlay() && live.getFieldModel().isBallMoving()
            && !source.hasSkillProperty(NamedProperties.preventPickup)
            && !source.hasSkillProperty(NamedProperties.preventHoldBall)) {
            FieldCoordinate ball = live.getFieldModel().getBallCoordinate();
            for (JsonValue value : route.get("steps").asArray()) {
                JsonObject step = value.asObject();
                if (new FieldCoordinate(step.getInt("x", -1), step.getInt("y", -1)).equals(ball)) possession = true;
            }
        }
        if (!possession) throw new MatchService.Failure("INVALID_TARGET");

        GameState preview = new GameState(state.getServer());
        preview.initFrom(state.getServer().getFactorySource(), state.toJsonValue(true, 0));
        UtilSkillBehaviours.registerBehaviours(preview.getGame(), state.getServer().getDebugLog());
        Game game = preview.getGame();
        Player<?> player = game.getPlayerById(playerId);
        JsonObject end = route.get("from").asObject();
        for (JsonValue value : route.get("steps").asArray()) end = value.asObject();
        FieldCoordinate endpoint = new FieldCoordinate(end.getInt("x", -1), end.getInt("y", -1));
        game.getFieldModel().setPlayerCoordinate(player, endpoint);
        game.getFieldModel().setBallCoordinate(endpoint);
        game.getFieldModel().setBallMoving(false);
        game.getActingPlayer().setPlayer(player);
        game.getActingPlayer().setHasPassed(false);
        game.getActingPlayer().setPlayerAction("pass".equals(kind) ? PlayerAction.PASS_MOVE : PlayerAction.HAND_OVER_MOVE);
        if (!eligibleRecipient(game, player, targetId, kind)) throw new MatchService.Failure("INVALID_TARGET");
        List<Action> targets = new ArrayList<>();
        new BallAndFoulActions().targets(game, role, targets);
        if (targets.stream().noneMatch(action -> matches(game, action, targetId, kind)))
            throw new MatchService.Failure("INVALID_TARGET");
    }

    boolean eligibleRecipient(Game game, Player<?> source, String targetId, String kind) {
        Player<?> target = game.getPlayerById(targetId);
        if (target == null || source == target || !source.getTeam().hasPlayer(target)) return false;
        if ("handOff".equals(kind) && !game.getFieldModel().getPlayerState(target).hasTacklezones()) return false;
        FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(target);
        return FieldCoordinateBounds.FIELD.isInBounds(at)
            && ("handOff".equals(kind) == game.getFieldModel().getPlayerCoordinate(source).isAdjacent(at));
    }

    boolean matches(Game game, Action action, String targetId, String kind) {
        return kind.equals(action.kind) && ("handOff".equals(kind) ? targetId.equals(action.targetPlayerId)
            : game.getFieldModel().getPlayerCoordinate(game.getPlayerById(targetId)).equals(action.targetSquare));
    }
}
