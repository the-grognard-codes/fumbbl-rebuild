package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Captures the accepted native choice and the actual progress of one committed move. */
final class AcceptedActionPresentation {
    JsonObject action(Game game, Action action) {
        String playerId = new ActionSource().playerId(game, action);
        JsonValue target = action.targetPlayerId != null ? new JsonObject().add("playerId", action.targetPlayerId)
            : square(action.targetSquare);
        return new JsonObject().add("kind", action.kind).add("label", action.label)
            .add("playerId", playerId == null ? JsonValue.NULL : JsonValue.valueOf(playerId)).add("target", target);
    }

    JsonObject movement(int revision, String playerId, FieldCoordinate origin) {
        return new JsonObject().add("commitRevision", revision).add("playerId", playerId)
            .add("from", square(origin)).add("to", square(origin)).add("complete", false);
    }

    JsonObject finishMovement(Game game, JsonObject movement, boolean routePending) {
        if (movement == null) return null;
        Player<?> player = game.getPlayerById(movement.getString("playerId", null));
        if (player == null) throw new IllegalStateException("Unknown committed movement player");
        JsonObject result = JsonObject.readFrom(movement.toString());
        result.set("to", square(game.getFieldModel().getPlayerCoordinate(player)));
        boolean complete = !routePending && (game.getDialogParameter() == null || game.getFinished() != null
            || !player.getId().equals(game.getActingPlayer().getPlayerId()));
        result.set("complete", complete);
        return result;
    }

    private JsonValue square(FieldCoordinate coordinate) {
        return FieldCoordinateBounds.FIELD.isInBounds(coordinate)
            ? new JsonObject().add("x", coordinate.getX()).add("y", coordinate.getY()) : JsonValue.NULL;
    }
}
