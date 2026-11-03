package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.model.AnimationType;

public abstract class AbstractIronManHandler extends SelectPlayerPrayerHandler {

	@Override
	protected PlayerChoiceMode choiceMode() {
		return PlayerChoiceMode.IRON_MAN;
	}

	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_IRON_MAN;
	}
}
