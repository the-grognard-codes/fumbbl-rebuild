package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PassingDistance;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.factory.PassModifierFactory;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.mechanics.PassRangeService;
import com.fumbbl.ffb.mechanics.TtmMechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.modifiers.PassContext;
import com.fumbbl.ffb.modifiers.PassModifier;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Public guidance from the native pass and teammate-flight mechanics. */
public final class PassingProjection {

	public JsonObject project(Game game) {
		ActingPlayer acting = game.getActingPlayer();
        PlayerAction action = new HailMaryActions().action(game);
        boolean hailMary = action == PlayerAction.HAIL_MARY_PASS || action == PlayerAction.HAIL_MARY_BOMB;
        boolean bomb = action == PlayerAction.THROW_BOMB || action == PlayerAction.HAIL_MARY_BOMB;
		boolean thrown = action == PlayerAction.THROW_TEAM_MATE || action == PlayerAction.THROW_TEAM_MATE_MOVE;
		boolean kicked = action == PlayerAction.KICK_TEAM_MATE || action == PlayerAction.KICK_TEAM_MATE_MOVE;
		boolean teammate = thrown || kicked;
        if (acting.getPlayer() == null || !bomb && acting.hasPassed()
            || (!teammate && !hailMary && !bomb && action != PlayerAction.PASS_MOVE && action != PlayerAction.PASS)) return null;
		TtmMechanic ttm = game.getMechanic(Mechanic.Type.TTM);
		if (teammate && (game.getDefender() == null || game.getPassCoordinate() != null
			|| kicked && !ttm.handleKickLikeThrow())) return null;
		FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(acting.getPlayer());
		if (!FieldCoordinateBounds.FIELD.isInBounds(from)) return null;
		PassMechanic mechanic = game.getMechanic(Mechanic.Type.PASS);
        PassRangeService passRange = new PassRangeService();
		JsonArray ranges = new JsonArray();
		JsonArray targets = new JsonArray();
		PassModifierFactory modifiers = game.getFactory(FactoryType.Factory.PASS_MODIFIER);
		for (int x = 0; x < 26; x++) {
			StringBuilder row = new StringBuilder();
			JsonArray targetRow = new JsonArray();
			for (int y = 0; y < 15; y++) {
				FieldCoordinate to = new FieldCoordinate(x, y);
				PassingDistance distance = mechanic.findPassingDistance(game, from, to, teammate);
                boolean available = (hailMary || !to.equals(from)) && (hailMary
                    ? passRange.isInRange(game, acting.getPlayer(), to, action) : distance != null);
                if (hailMary && available) distance = PassingDistance.LONG_BOMB;
				row.append(available ? distance.getShortcut() : '-');
				if (teammate && available) {
					PassContext flight = new PassContext(game, acting.getPlayer(), distance, true);
					targetRow.add(Math.max(2, ttm.minimumRoll(distance, modifiers.findModifiers(flight))));
				} else targetRow.add(JsonValue.NULL);
			}
			ranges.add(row.toString());
			targets.add(targetRow);
		}
		PassModifier sunny = modifiers.forName("Very Sunny");
		PassContext context = new PassContext(game, acting.getPlayer(), PassingDistance.QUICK_PASS, teammate);
		int penalty = sunny != null && sunny.appliesToContext(null, context) ? sunny.getModifier() : 0;
		JsonObject result = new JsonObject().add("version", teammate ? 2 : 1).add("playerId", acting.getPlayerId())
			.add("from", new JsonObject().add("x", from.getX()).add("y", from.getY()))
			.add("weatherPenalty", penalty).add("rangeLimited", game.getFieldModel().getWeather() == Weather.BLIZZARD)
			.add("ranges", ranges);
		if (teammate) result.add("action", kicked ? "kickMateTo" : "throwTeamMate").add("targets", targets);
        if (hailMary || bomb) result.set("version", 3).add("action", bomb ? "bomb" : "pass").add("hailMary", hailMary);
		return result;
	}
}
