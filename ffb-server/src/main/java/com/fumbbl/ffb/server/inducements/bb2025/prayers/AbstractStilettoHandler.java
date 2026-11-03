package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.model.AnimationType;
import com.fumbbl.ffb.server.GameState;

public abstract class AbstractStilettoHandler extends RandomSelectionPrayerHandler {

	@Override
	protected int affectedPlayers(GameState gameState) {
		return 1;
	}

	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_STILETTO;
	}
}
