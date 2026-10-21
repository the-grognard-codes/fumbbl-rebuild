package com.fumbbl.ffb.server.util;

import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;

public class ServerUtilPlayer {
    public static int findBlockStrength(Game game, Player<?> attacker, int attackerStrength, Player<?> defender, boolean isMultiBlock) {
        return attackerStrength + new BlockAssistService().contributors(game, attacker, defender, isMultiBlock).size();
    }
}
