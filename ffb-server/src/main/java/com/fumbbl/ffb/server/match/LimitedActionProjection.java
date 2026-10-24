package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;

/** Names shared with the browser action artwork, from authoritative declarations only. */
final class LimitedActionProjection {
    String kind(PlayerAction action) {
        if (action == null) return null;
        switch (action) {
            case BLITZ_MOVE: return "blitz";
            case PASS: return "pass";
            case HAND_OVER: return "handOff";
            case FOUL: return "foul";
            case THROW_BOMB: return "bomb";
            case THROW_TEAM_MATE: return "throwMate";
            case KICK_TEAM_MATE: return "kickMate";
            case PUNT: return "punt";
            case SECURE_THE_BALL: return "secure";
            default: return null;
        }
    }
}
