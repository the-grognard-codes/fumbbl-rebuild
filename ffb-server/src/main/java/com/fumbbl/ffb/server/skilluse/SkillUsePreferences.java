package com.fumbbl.ffb.server.skilluse;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

/** Immutable account policy. Wire identifiers are deliberately independent of enum names. */
public final class SkillUsePreferences {
	public enum Mode {
		ALWAYS_USE("always-use"), ALWAYS_ASK("always-ask");
		private final String key;
		Mode(String key) { this.key = key; }
		public String key() { return key; }
		public static Mode fromKey(String key) {
			for (Mode value : values()) if (value.key.equals(key)) return value;
			throw new IllegalArgumentException("Unknown skill use mode");
		}
	}
	public enum UseCase {
		CATCH("catch", Mode.ALWAYS_USE), DODGE_MOVEMENT("dodge-movement", Mode.ALWAYS_USE),
		DODGE_BLOCK("dodge-block", Mode.ALWAYS_USE), SURE_FEET("sure-feet", Mode.ALWAYS_USE),
		FEND("fend", Mode.ALWAYS_ASK), STEADY_FOOTING("steady-footing", Mode.ALWAYS_USE),
		STRIP_BALL("strip-ball", Mode.ALWAYS_USE), SURE_HANDS("sure-hands", Mode.ALWAYS_USE),
		TACKLE_MOVEMENT("tackle-movement", Mode.ALWAYS_USE), TACKLE_BLOCK("tackle-block", Mode.ALWAYS_USE),
		TAUNT("taunt", Mode.ALWAYS_ASK), WRESTLE_ATTACKER("wrestle-attacker", Mode.ALWAYS_ASK),
		WRESTLE_DEFENDER("wrestle-defender", Mode.ALWAYS_ASK), PASS_BALL("pass-ball", Mode.ALWAYS_USE),
		PASS_BOMB("pass-bomb", Mode.ALWAYS_USE), GRAB("grab", Mode.ALWAYS_USE),
		STAND_FIRM("stand-firm", Mode.ALWAYS_ASK), PICK_ME_UP("pick-me-up", Mode.ALWAYS_ASK);
		private final String key;
		private final Mode defaultMode;
		UseCase(String key, Mode defaultMode) { this.key = key; this.defaultMode = defaultMode; }
		public String key() { return key; }
		public static UseCase fromKey(String key) {
			for (UseCase value : values()) if (value.key.equals(key)) return value;
			throw new IllegalArgumentException("Unknown skill use case");
		}
	}
	private final Map<UseCase, Mode> modes;
	private SkillUsePreferences(Map<UseCase, Mode> modes) { this.modes = new EnumMap<>(modes); }
	public static SkillUsePreferences defaults() {
		Map<UseCase, Mode> modes = new EnumMap<>(UseCase.class);
		for (UseCase useCase : UseCase.values()) modes.put(useCase, useCase.defaultMode);
		return new SkillUsePreferences(modes);
	}
	public Mode mode(UseCase useCase) { return modes.get(Objects.requireNonNull(useCase)); }
	public SkillUsePreferences with(UseCase useCase, Mode mode) {
		Map<UseCase, Mode> updated = new EnumMap<>(modes);
		updated.put(Objects.requireNonNull(useCase), Objects.requireNonNull(mode));
		return new SkillUsePreferences(updated);
	}
	public JsonObject toJson() {
		JsonObject json = new JsonObject();
		for (UseCase useCase : UseCase.values()) json.add(useCase.key(), mode(useCase).key());
		return json;
	}
	/** Full normalized policy only; unknown, missing and duplicate keys fail closed. */
	public static SkillUsePreferences fromJson(JsonObject json) {
		if (json.size() != UseCase.values().length) throw new IllegalArgumentException("Incomplete skill use preferences");
		SkillUsePreferences result = defaults();
		java.util.Set<UseCase> seen = java.util.EnumSet.noneOf(UseCase.class);
		for (JsonObject.Member member : json) {
			UseCase useCase = UseCase.fromKey(member.getName());
			JsonValue value = member.getValue();
			if (!seen.add(useCase) || !value.isString()) throw new IllegalArgumentException("Invalid skill use preferences");
			result = result.with(useCase, Mode.fromKey(value.asString()));
		}
		return result;
	}
}
