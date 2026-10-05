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
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.modifiers.PassContext;
import com.fumbbl.ffb.modifiers.PassModifier;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

/** Public distance guidance for a declared Pass, even before a loose-ball pickup. */
public final class PassingProjection {

	public JsonObject project(Game game) {
		ActingPlayer acting = game.getActingPlayer();
		PlayerAction action = acting.getPlayerAction();
		if (acting.getPlayer() == null || acting.hasPassed() || (action != PlayerAction.PASS_MOVE && action != PlayerAction.PASS)) return null;
		FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(acting.getPlayer());
		if (!FieldCoordinateBounds.FIELD.isInBounds(from)) return null;
		PassMechanic mechanic = game.getMechanic(Mechanic.Type.PASS);
		JsonArray ranges = new JsonArray();
		for (int x = 0; x < 26; x++) {
			StringBuilder row = new StringBuilder();
			for (int y = 0; y < 15; y++) {
				FieldCoordinate to = new FieldCoordinate(x, y);
				PassingDistance distance = mechanic.findPassingDistance(game, from, to, false);
				row.append(to.equals(from) || distance == null ? '-' : distance.getShortcut());
			}
			ranges.add(row.toString());
		}
		PassModifierFactory modifiers = game.getFactory(FactoryType.Factory.PASS_MODIFIER);
		PassModifier sunny = modifiers.forName("Very Sunny");
		PassContext context = new PassContext(game, acting.getPlayer(), PassingDistance.QUICK_PASS, false);
		int penalty = sunny != null && sunny.appliesToContext(null, context) ? sunny.getModifier() : 0;
		return new JsonObject().add("version", 1).add("playerId", acting.getPlayerId())
			.add("from", new JsonObject().add("x", from.getX()).add("y", from.getY()))
			.add("weatherPenalty", penalty).add("rangeLimited", game.getFieldModel().getWeather() == Weather.BLIZZARD)
			.add("ranges", ranges);
	}
}
