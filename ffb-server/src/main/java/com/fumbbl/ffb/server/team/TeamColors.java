package com.fumbbl.ffb.server.team;

import com.eclipsesource.json.JsonObject;

import java.util.Set;

/** Immutable, versioned palette identity shared by saved and frozen teams. */
public record TeamColors(String primary, String secondary) {
    private static final Set<String> IDS = Set.of("navy", "gold", "sky", "teal", "forest", "lime", "lemon", "orange",
        "red", "slate", "violet", "magenta", "brown", "black", "ivory", "white");

    public TeamColors {
        if (primary == null || secondary == null || !IDS.contains(primary) || !IDS.contains(secondary))
            throw new IllegalArgumentException("Unknown team color");
    }
    public JsonObject encode() {
        return new JsonObject().add("version", 1).add("primary", primary).add("secondary", secondary);
    }
}
