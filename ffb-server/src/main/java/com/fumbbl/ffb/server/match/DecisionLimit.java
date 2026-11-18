package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Objects;

/** Derived accounting updated by the recorder, rebuilt explicitly when history is restored. */
final class DecisionLimit {
    static final int MAX_DECISIONS = 1024;
    static final String ACTION = "ACTION";
    static final String SELECTION = "SELECTION";

    private Period recordedPeriod;
    private int decisions;

    void recorded(String kind, JsonObject snapshot) {
        Period next = period(snapshot);
        if (!Objects.equals(recordedPeriod, next)) decisions = 0;
        // Every action entering a period, including the first history entry, belongs to its predecessor.
        else if (next != null && (ACTION.equals(kind) || SELECTION.equals(kind))) decisions++;
        recordedPeriod = next;
    }

    void restore(JsonArray events) {
        recordedPeriod = null;
        decisions = 0;
        for (JsonValue value : events) {
            JsonObject event = value.asObject();
            recorded(event.getString("kind", ""), event.get("state").asObject());
        }
    }

    /** Includes the accepted decision about to be recorded: fire on decision 1,024, never 1,023. */
    boolean reached(JsonObject current) {
        return recordedPeriod != null && recordedPeriod.equals(period(current)) && decisions + 1 >= MAX_DECISIONS;
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
