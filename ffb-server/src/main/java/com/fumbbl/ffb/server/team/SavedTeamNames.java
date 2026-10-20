package com.fumbbl.ffb.server.team;

import com.eclipsesource.json.JsonObject;

import java.text.Normalizer;
import java.util.Locale;

/** Account team names compare without case or surrounding whitespace; older unnamed documents reserve no name. */
public final class SavedTeamNames {

	public String key(String name) {
		return name == null ? "" : Normalizer.normalize(name.trim(), Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
	}

	public String documentKey(String json) {
		try {
			return key(JsonObject.readFrom(json).get("draft").asObject().getString("teamName", ""));
		} catch (RuntimeException unavailable) {
			// Unavailable historical rows have no usable public name, but remain visible for cleanup.
			return "";
		}
	}
}
