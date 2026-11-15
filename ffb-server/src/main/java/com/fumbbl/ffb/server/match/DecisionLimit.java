package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Count accepted decisions from recorded snapshots so reconnect/recovery cannot reset the allowance. */
final class DecisionLimit {
    static final int MAX_DECISIONS = 1024;

    boolean reached(JsonArray events, JsonObject current) {
        String period = period(current);
        if (period == null) return false;
        int count = 1; // The decision about to be recorded.
        for (int index = events.size() - 1; index >= 0; index--) {
            JsonObject event = events.get(index).asObject();
            if (!period.equals(period(event.get("state").asObject()))) break;
            String kind = event.getString("kind", "");
            if (("ACTION".equals(kind) || "SELECTION".equals(kind)) && ++count >= MAX_DECISIONS) return true;
        }
        return false;
    }

    private String period(JsonObject view) {
        if (!"PLAY".equals(view.getString("phase", null))) return null;
        String key = view.getInt("half", 1) + ":" + view.getInt("drive", 1);
        JsonValue kickoff = view.get("kickoff");
        if (kickoff != null && kickoff.isObject()) return key + ":" + kickoff.asObject().getString("event", "");
        return key + ":" + view.getInt("homeTurn", 0) + ":" + view.getInt("awayTurn", 0);
    }
}
