package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;

/** A confirmed target; the native Block sequence owns its Jump Up roll and rerolls. */
final class JumpUpBlockDeclaration extends ClientCommandActingPlayer {
    final String targetPlayerId;

    JumpUpBlockDeclaration(String playerId, String targetPlayerId) {
        super(playerId, PlayerAction.BLOCK, false);
        this.targetPlayerId = targetPlayerId;
    }
}
