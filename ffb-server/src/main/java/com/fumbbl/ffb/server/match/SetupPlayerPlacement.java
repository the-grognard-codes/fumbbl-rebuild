package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.util.UtilServerSetup;

import java.util.function.Consumer;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** A validated setup move, including the temporary reserve square needed to swap players. */
final class SetupPlayerPlacement {
	private final boolean home;
	private final FieldCoordinateBounds half;
	private final Player<?> player;
	private final FieldCoordinate origin;
	private final FieldCoordinate destination;
	private final Player<?> occupant;
	private final FieldCoordinate swapBuffer;

	SetupPlayerPlacement(Game game, String role, JsonObject request) {
		home = "home".equals(role);
		half = home ? FieldCoordinateBounds.HALF_HOME : FieldCoordinateBounds.HALF_AWAY;
		Team team = home ? game.getTeamHome() : game.getTeamAway();
		FieldModel field = game.getFieldModel();
		player = game.getPlayerById(request.getString("playerId", null));
		if (player == null || !team.hasPlayer(player)) throw new MatchService.Failure("WRONG_PLAYER");
		if (!field.getPlayerState(player).canBeMovedDuringSetup()) throw new MatchService.Failure("ILLEGAL_PLACEMENT");
		origin = field.getPlayerCoordinate(player);
		JsonValue target = request.get("to");
		if (target.isNull()) {
			destination = reserveSquare(field);
			occupant = null;
			swapBuffer = null;
		} else {
			JsonObject square = target.asObject();
			destination = new FieldCoordinate(square.get("x").asInt(), square.get("y").asInt());
			if (!half.isInBounds(destination) || destination.equals(origin)) throw new MatchService.Failure("ILLEGAL_PLACEMENT");
			occupant = field.getPlayer(destination);
			if (occupant != null && (!team.hasPlayer(occupant) || !half.isInBounds(origin)
				|| !field.getPlayerState(occupant).canBeMovedDuringSetup())) throw new MatchService.Failure("ILLEGAL_PLACEMENT");
			swapBuffer = occupant == null ? null : reserveSquare(field);
		}
	}

	ClientCommandSetupPlayer command() {
		return command(player, destination);
	}

	void prepareSwap(Consumer<ClientCommandSetupPlayer> place) {
		if (occupant == null) return;
		place.accept(command(player, swapBuffer));
		place.accept(command(occupant, origin));
	}

	void applyStaged(GameState state) {
		// The staged API only sends an on-pitch player to reserves.
		if (!half.isInBounds(destination) && !half.isInBounds(origin)) throw new MatchService.Failure("ILLEGAL_PLACEMENT");
		Consumer<ClientCommandSetupPlayer> place = move -> UtilServerSetup.setupPlayer(state, move.getPlayerId(), move.getCoordinate());
		prepareSwap(place);
		place.accept(command());
	}

	private ClientCommandSetupPlayer command(Player<?> player, FieldCoordinate coordinate) {
		return new ClientCommandSetupPlayer(player.getId(), home ? coordinate : coordinate.transform());
	}

	private FieldCoordinate reserveSquare(FieldModel field) {
		int box = home ? FieldCoordinate.RSV_HOME_X : FieldCoordinate.RSV_AWAY_X;
		int row = 0;
		while (field.getPlayer(new FieldCoordinate(box, row)) != null) row++;
		return new FieldCoordinate(box, row);
	}
}
