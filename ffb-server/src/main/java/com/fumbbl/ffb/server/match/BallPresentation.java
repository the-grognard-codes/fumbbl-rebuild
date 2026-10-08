package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Public ball possession from the native in-play/moving state, not square occupancy alone. */
final class BallPresentation {

	JsonObject project(Game game) {
		FieldCoordinate coordinate = game.getFieldModel().getBallCoordinate();
		Player<?> player = FieldCoordinateBounds.FIELD.isInBounds(coordinate) ? game.getFieldModel().getPlayer(coordinate) : null;
		String carrier = UtilPlayer.hasBall(game, player) ? player.getId() : null;
		return new JsonObject().add("version", 1).add("carrierPlayerId", carrier == null ? JsonValue.NULL : JsonValue.valueOf(carrier))
			.add("inPlay", game.getFieldModel().isBallInPlay()).add("moving", game.getFieldModel().isBallMoving());
	}
}
