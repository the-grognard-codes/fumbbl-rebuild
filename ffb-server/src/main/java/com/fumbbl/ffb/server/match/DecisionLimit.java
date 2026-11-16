package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Objects;

/** Lazily rebuild once from recovery snapshots, then count only newly appended events. */
final class DecisionLimit {
    static final int MAX_DECISIONS = 1024;
    static final String ACTION = "ACTION";
    static final String SELECTION = "SELECTION";

    private JsonArray observedEvents;
    private JsonValue firstEvent;
    private int observedSize;
    private Period recordedPeriod;
    private int decisions;

    /** Includes the accepted decision about to be recorded: fire on decision 1,024, never 1,023. */
    boolean reached(JsonArray events, JsonObject current) {
        JsonValue first = events.size() == 0 ? null : events.get(0);
        if (observedEvents != events || observedSize > events.size() || firstEvent != first) {
            observedEvents = events;
            firstEvent = first;
            observedSize = 0;
            recordedPeriod = null;
            decisions = 0;
        }
        while (observedSize < events.size()) {
            JsonObject event = events.get(observedSize).asObject();
            Period next = period(event.get("state").asObject());
            String kind = event.getString("kind", "");
            boolean decision = ACTION.equals(kind) || SELECTION.equals(kind);
            if (!Objects.equals(recordedPeriod, next)) decisions = 0;
            // An action entering a period belongs to the preceding turn/event.
            else if (next != null && decision) decisions++;
            if (observedSize == 0 && next != null && decision) decisions = 1;
            recordedPeriod = next;
            observedSize++;
        }
        Period period = period(current);
        return period != null && period.equals(recordedPeriod) && decisions + 1 >= MAX_DECISIONS;
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
