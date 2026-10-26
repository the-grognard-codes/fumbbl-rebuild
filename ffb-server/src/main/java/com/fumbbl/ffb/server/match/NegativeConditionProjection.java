package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.inducement.bb2025.Prayer;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;

import com.eclipsesource.json.JsonArray;

/** Public presentation of active effects; their lifetimes remain owned by the engine. */
class NegativeConditionProjection {
    JsonArray project(Game game, Player<?> player) {
        PlayerState state = game.getFieldModel().getPlayerState(player);
        JsonArray conditions = new JsonArray();
        if (state.isDistracted()) conditions.add("distracted");
        if (state.isChomped()) conditions.add("chomped");
        if (state.isRooted()) conditions.add("rooted");
        if (player.hasActiveEnhancement(KickoffResult.DODGY_SNACK.getName())) conditions.add("dodgySnack");
        if (player.hasActiveEnhancement(Prayer.GREASY_CLEATS.getName())) conditions.add("greasyCleats");
        if (state.isEyeGouged()) conditions.add("eyeGouged");
        return conditions;
    }
}
