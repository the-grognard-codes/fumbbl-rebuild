package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.model.AnimationType;

public abstract class AbstractBlessedStatueOfNuffleHandler extends SelectPlayerPrayerHandler {

	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_BLESSED_STATUE_OF_NUFFLE;
	}

	@Override
	protected PlayerChoiceMode choiceMode() {
		return PlayerChoiceMode.BLESSED_STATUE_OF_NUFFLE;
	}
}
