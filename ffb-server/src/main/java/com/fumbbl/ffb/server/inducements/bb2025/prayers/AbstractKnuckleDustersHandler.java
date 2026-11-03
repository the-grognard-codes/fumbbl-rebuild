package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.model.AnimationType;

public abstract class AbstractKnuckleDustersHandler extends SelectPlayerPrayerHandler {

	@Override
	protected PlayerChoiceMode choiceMode() {
		return PlayerChoiceMode.KNUCKLE_DUSTERS;
	}

	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_KNUCKLE_DUSTERS;
	}
}
