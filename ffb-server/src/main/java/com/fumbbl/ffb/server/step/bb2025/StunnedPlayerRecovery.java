package com.fumbbl.ffb.server.step.bb2025;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;

/** BB2025 recovery at the end of the owning team's missed turn. */
public class StunnedPlayerRecovery {
	public void startTurn(Game game) {
		FieldModel field = game.getFieldModel();
		for (Player<?> player : game.getActingTeam().getPlayers()) {
			PlayerState state = field.getPlayerState(player);
			if (state.getBase() == PlayerState.STUNNED) {
				field.setPlayerState(player, state.changeActive(false).changeStunRecoveryPending(true));
			}
		}
	}

	public void endTurn(Game game) {
		FieldModel field = game.getFieldModel();
		for (Player<?> player : game.getActingTeam().getPlayers()) {
			PlayerState state = field.getPlayerState(player);
			if (state.getBase() == PlayerState.STUNNED && state.isStunRecoveryPending()) {
				field.setPlayerState(player, state.changeBase(PlayerState.PRONE).changeActive(false));
			}
		}
	}
}
