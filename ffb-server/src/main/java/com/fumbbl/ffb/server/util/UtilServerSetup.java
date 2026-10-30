package com.fumbbl.ffb.server.util;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.StringTool;
/**
 * @author Kalimar
 */
public class UtilServerSetup {







	public static void setupPlayer(GameState gameState, String pPlayerId, FieldCoordinate pCoordinate) {

		if ((gameState != null) && StringTool.isProvided(pPlayerId) && (pCoordinate != null)) {

			Game game = gameState.getGame();
			Player<?> player = game.getPlayerById(pPlayerId);
			if (player == null) {
				return;
			}

			boolean homeTeam = game.getTeamHome().hasPlayer(player);
			if (homeTeam != game.isHomePlaying()) {
				return;
			}

			FieldModel fieldModel = game.getFieldModel();
			FieldCoordinate coordinate = homeTeam ? pCoordinate : pCoordinate.transform();
			FieldCoordinate oldCoordinate = fieldModel.getPlayerCoordinate(player);
			PlayerState playerState = fieldModel.getPlayerState(player);

			if (fieldModel.getPlayer(coordinate) != null) {
				// Client is confused and tried to put a player in a square that already had a
				// player.
				// Force an update of the position and state.
				fieldModel.sendPosition(player);
				Player<?> otherPlayer = fieldModel.getPlayer(coordinate);
				fieldModel.sendPosition(otherPlayer);
			} else {
				if (coordinate.isBoxCoordinate()) {
					fieldModel.setPlayerState(player, playerState.changeBase(PlayerState.RESERVE));
				} else {
					if ((game.getTurnMode() == TurnMode.QUICK_SNAP) && !coordinate.equals(oldCoordinate)) {
						fieldModel.setPlayerState(player, playerState.changeBase(PlayerState.STANDING).changeActive(false));
					} else {
						fieldModel.setPlayerState(player, playerState.changeBase(PlayerState.STANDING).changeActive(true), true);
					}
				}
				fieldModel.setPlayerCoordinate(player, coordinate);
			}
		}

	}

}
