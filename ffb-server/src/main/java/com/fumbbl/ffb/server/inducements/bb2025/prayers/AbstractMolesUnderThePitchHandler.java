package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.model.AnimationType;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;

public abstract class AbstractMolesUnderThePitchHandler extends PrayerHandler {
	@Override
	public boolean initEffect(GameState gameState, Team prayingTeam) {
		gameState.getPrayerState().addMolesUnderThePitch(prayingTeam);
		return true;
	}

	@Override
	public void removeEffectInternal(GameState gameState, Team team) {
		gameState.getPrayerState().removeMolesUnderThePitch(team);
	}

	@Override
	public AnimationType animationType() {
		return AnimationType.PRAYER_MOLES_UNDER_THE_PITCH;
	}

}
