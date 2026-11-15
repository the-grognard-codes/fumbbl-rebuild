package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DecisionLimitTest {
    @Test void theActionThatEnteredANewTurnDoesNotSpendItsBudget() {
        JsonArray events = new JsonArray().add(event("START", state().set("homeTurn", 2)))
            .add(event(DecisionLimit.ACTION, state()));
        for (int i = 0; i < 1022; i++) events.add(event(DecisionLimit.ACTION, state()));
        assertFalse(new DecisionLimit().reached(events, state()));
        events.add(event(DecisionLimit.ACTION, state()));
        assertTrue(new DecisionLimit().reached(events, state()));
    }

    @Test void guardFiresOnThe1024thAcceptedDecisionAndNotThe1023rd() {
        JsonArray events = new JsonArray();
        for (int i = 0; i < 1022; i++) events.add(event(DecisionLimit.ACTION, state()));
        assertFalse(new DecisionLimit().reached(events, state()), "Decision 1,023 remains below the guard");
        events.add(event(DecisionLimit.ACTION, state()));
        assertTrue(new DecisionLimit().reached(events, state()), "Decision 1,024 fires before its result is recorded");
    }

    @Test void countsAcceptedDecisionsAcrossKickoffStagesAndIgnoresNonDecisionEvents() {
        JsonObject selection = state().add("kickoff", new JsonObject().add("event", "SOLID_DEFENCE").add("stage", "selection"));
        JsonObject movement = state().add("kickoff", new JsonObject().add("event", "SOLID_DEFENCE").add("stage", "movement"));
        JsonArray events = new JsonArray();
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 2; i++) events.add(event("SELECTION", selection));
        events.add(event("CHAT", movement));
        assertFalse(new DecisionLimit().reached(events, movement));
        events.add(event("ACTION", movement));
        assertTrue(new DecisionLimit().reached(events, movement));
        // Re-reading recorded snapshots after recovery gives the same decision.
        assertTrue(new DecisionLimit().reached(JsonArray.readFrom(events.toString()), movement));
        assertFalse(new DecisionLimit().reached(events, state().set("drive", 3).add("kickoff", movement.get("kickoff"))));
    }

    @Test void aNewTurnHasAFreshBudgetAndReactingCoachesDoNotResetIt() {
        JsonObject current = state();
        JsonArray events = new JsonArray();
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 1; i++)
            events.add(event("ACTION", state().add("actor", i % 2 == 0 ? "home" : "away")));
        assertTrue(new DecisionLimit().reached(events, current));
        assertFalse(new DecisionLimit().reached(events, state().set("homeTurn", 4)));
        assertFalse(new DecisionLimit().reached(events, state().set("phase", "SETUP")));
    }

    private JsonObject state() {
        return new JsonObject().add("phase", "PLAY").add("half", 2).add("drive", 2).add("homeTurn", 3).add("awayTurn", 3);
    }

    private JsonObject event(String kind, JsonObject state) {
        return new JsonObject().add("kind", kind).add("state", state);
    }
}
