package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;

import com.eclipsesource.json.JsonObject;

/** A confirmed next activation waiting for a native end-of-activation decision. */
final class PendingActivation {
    final String role;
    final ClientCommandActingPlayer command;
    private final int half, turn;

    PendingActivation(String role, ClientCommandActingPlayer command, Game game) {
        this.role = role;
        this.command = command;
        half = game.getHalf();
        turn = game.getTurnData().getTurnNr();
    }

    PendingActivation(JsonObject saved, Game game) {
        if ((saved.size() != 6 && !(saved.size() == 7 && saved.get("blockTargetId") != null)) || !saved.names().containsAll(java.util.Arrays.asList("role", "playerId", "action", "jumping", "half", "turn")))
            throw new IllegalArgumentException("Invalid pending activation");
        role = saved.get("role").asString();
        if (saved.get("blockTargetId") != null && (!"BLOCK".equals(saved.getString("action", null)) || saved.getBoolean("jumping", false)))
            throw new IllegalArgumentException("Invalid pending Jump Up Block");
        command = saved.get("blockTargetId") == null ? new ClientCommandActingPlayer(saved.get("playerId").asString(),
            PlayerAction.valueOf(saved.get("action").asString()), saved.get("jumping").asBoolean())
            : new JumpUpBlockDeclaration(saved.get("playerId").asString(), saved.get("blockTargetId").asString());
        half = saved.get("half").asInt();
        turn = saved.get("turn").asInt();
        Player<?> player = game.getPlayerById(command.getPlayerId());
        if (!sameTurn(game) || player == null || !game.getActingTeam().hasPlayer(player)
            || !game.getFieldModel().getPlayerState(player).isActive() || player == game.getActingPlayer().getPlayer())
            throw new IllegalArgumentException("Pending activation does not match native state");
    }

    boolean sameTurn(Game game) {
        return role.equals(game.isHomePlaying() ? "home" : "away")
            && half == game.getHalf() && turn == game.getTurnData().getTurnNr();
    }

    JsonObject json() {
        JsonObject saved = new JsonObject().add("role", role).add("playerId", command.getPlayerId())
            .add("action", command.getPlayerAction().name()).add("jumping", command.isJumping()).add("half", half).add("turn", turn);
        if (command instanceof JumpUpBlockDeclaration) saved.add("blockTargetId", ((JumpUpBlockDeclaration) command).targetPlayerId);
        return saved;
    }
}
