package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Count accepted decisions from recorded snapshots so reconnect/recovery cannot reset the allowance. */
final class DecisionLimit {
    static final int MAX_DECISIONS = 1024;
    static final String ACTION = "ACTION";
    static final String SELECTION = "SELECTION";

    /** Includes the accepted decision about to be recorded: fire on decision 1,024, never 1,023. */
    boolean reached(JsonArray events, JsonObject current) {
        Period period = period(current);
        if (period == null) return false;
        int count = 1; // The decision about to be recorded.
        for (int index = events.size() - 1; index >= 0; index--) {
            JsonObject event = events.get(index).asObject();
            if (!period.equals(period(event.get("state").asObject()))) break;
            String kind = event.getString("kind", "");
            // An action that entered this period belongs to the preceding turn/event.
            if ((ACTION.equals(kind) || SELECTION.equals(kind)) && index > 0
                && !period.equals(period(events.get(index - 1).asObject().get("state").asObject()))) break;
            if ((ACTION.equals(kind) || SELECTION.equals(kind)) && ++count >= MAX_DECISIONS) return true;
        }
        return false;
    }

    private Period period(JsonObject view) {
        if (!"PLAY".equals(view.getString("phase", null))) return null;
        int half = view.getInt("half", 1), drive = view.getInt("drive", 1);
        JsonValue kickoff = view.get("kickoff");
        if (kickoff != null && kickoff.isObject()) return new Period(half, drive, kickoff.asObject().getString("event", ""), 0, 0);
        return new Period(half, drive, null, view.getInt("homeTurn", 0), view.getInt("awayTurn", 0));
    }

    private record Period(int half, int drive, String event, int homeTurn, int awayTurn) { }
}
