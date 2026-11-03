package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.model.AnimationType;

public abstract class AbstractThrowARockHandler extends PrayerHandler {
	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_THROW_A_ROCK;
	}
}
