package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.ApothecaryType;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.SeriousInjury;

/** Injury and treatment names shown in browser apothecary decisions. */
final class InjuryPresentation {
	String injury(PlayerState state, SeriousInjury seriousInjury) {
		switch (state.getBase()) {
			case PlayerState.KNOCKED_OUT:
				return "Knocked Out";
			case PlayerState.BADLY_HURT:
				return "Badly Hurt";
			case PlayerState.RIP:
				return "Dead";
			case PlayerState.SERIOUS_INJURY:
				return seriousInjury(seriousInjury);
			default:
				return state.getButtonText();
		}
	}

	String treatment(ApothecaryType type) {
		return type == ApothecaryType.TEAM ? "Use Apothecary" : "Use " + type.getName();
	}

	private String seriousInjury(SeriousInjury injury) {
		if (injury == null) return "Serious Injury (MNG)";
		if (injury.isDead()) return "Dead";
		String name = injury.getButtonText().replace("Miss next game", "MNG")
			.replaceAll("-1\\s+([A-Z]+)", "-1$1");
		if (name.endsWith("(MNG)")) return name;
		if (name.endsWith(")")) return name.substring(0, name.length() - 1) + ", MNG)";
		return name + " (MNG)";
	}
}
