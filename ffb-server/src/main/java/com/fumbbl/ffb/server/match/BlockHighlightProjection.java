package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.util.BlockAssistService;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.util.Comparator;
import java.util.List;

/** Player identities and ground coordinates; never computes eligibility in the browser. */
final class BlockHighlightProjection {
    JsonObject project(Game game, String attackerId, String targetId, boolean multipleBlock) {
        Player<?> attacker = game.getPlayerById(attackerId), target = game.getPlayerById(targetId);
        if (attacker == null || target == null || attacker.getTeam() == target.getTeam()) return null;
        FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(attacker), to = game.getFieldModel().getPlayerCoordinate(target);
        if (!FieldCoordinateBounds.FIELD.isInBounds(from) || !FieldCoordinateBounds.FIELD.isInBounds(to) || !from.isAdjacent(to)) return null;
        BlockAssistService assists = new BlockAssistService();
        return new BlockHighlightJson().normalized(new JsonObject().add("playerId", attackerId).add("targetPlayerId", targetId).add("from", square(from)).add("to", square(to))
            .add("offensiveAssists", project(game, assists.contributors(game, attacker, target, multipleBlock)))
            .add("defensiveAssists", project(game, assists.contributors(game, target, attacker, multipleBlock))));
    }

    private JsonArray project(Game game, List<Player<?>> players) {
        players.sort(Comparator.comparing(Player::getId));
        JsonArray result = new JsonArray();
        for (Player<?> player : players) {
            FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(player);
            result.add(square(at).add("playerId", player.getId()));
        }
        return result;
    }

    private JsonObject square(FieldCoordinate at) { return new JsonObject().add("x", at.getX()).add("y", at.getY()); }
}
