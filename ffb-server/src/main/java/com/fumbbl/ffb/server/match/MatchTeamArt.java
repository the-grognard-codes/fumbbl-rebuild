package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Public presentation identity from the immutable catalog accepted with a team. */
public final class MatchTeamArt {
    public JsonObject project(FrozenTeam team) {
        String league = JsonObject.readFrom(team.resolvedCatalogJson).getString("league", null);
        return new JsonObject().add("rosterId", team.rosterId)
            .add("league", league == null ? JsonValue.NULL : JsonValue.valueOf(league));
    }
}
