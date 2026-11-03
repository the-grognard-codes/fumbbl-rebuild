package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.model.AnimationType;
import com.fumbbl.ffb.server.GameState;

public abstract class AbstractBadHabitsHandler extends RandomSelectionPrayerHandler {

	@Override
	protected int affectedPlayers(GameState gameState) {
		return gameState.getDiceRoller().rollDice(3);
	}

	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_BAD_HABITS;
	}
}
