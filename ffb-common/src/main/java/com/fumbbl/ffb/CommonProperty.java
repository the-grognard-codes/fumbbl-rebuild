package com.fumbbl.ffb;

/** Native dialog metadata still used by the rules engine and browser checkpoints. */
public enum CommonProperty {
	SETTING_RE_ROLL_BALL_AND_CHAIN("setting.reRollBallAndChain");

	private final String key;

	CommonProperty(String key) { this.key = key; }

	public String getKey() { return key; }

	public static CommonProperty forKey(String key) {
		for (CommonProperty property : values()) if (property.key.equalsIgnoreCase(key)) return property;
		return null;
	}
}
