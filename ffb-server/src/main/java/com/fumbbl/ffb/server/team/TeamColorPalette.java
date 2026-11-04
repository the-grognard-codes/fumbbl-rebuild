package com.fumbbl.ffb.server.team;

import com.eclipsesource.json.JsonObject;

import java.util.Set;

/** Versioned palette decoder; defaults are only for saved-team lifecycle input. */
public final class TeamColorPalette {
    public TeamColors decode(JsonObject value) {
        if (value.size() != 3 || !Set.copyOf(value.names()).equals(Set.of("version", "primary", "secondary"))
            || value.getInt("version", -1) != 1) throw new IllegalArgumentException("Invalid team colors");
        return new TeamColors(value.getString("primary", null), value.getString("secondary", null));
    }
    public TeamColors defaults(String rosterId) {
        return switch (rosterId) {
            case "human" -> new TeamColors("navy", "ivory");
            case "orc" -> new TeamColors("black", "orange");
            default -> throw new IllegalArgumentException("Unsupported team-color roster");
        };
    }
}
