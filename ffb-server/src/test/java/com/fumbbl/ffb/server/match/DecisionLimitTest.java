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
        assertFalse(restored(events).reached(state()));
        events.add(event(DecisionLimit.ACTION, state()));
        assertTrue(restored(events).reached(state()));
    }

    @Test void guardFiresOnThe1024thAcceptedDecisionAndNotThe1023rd() {
        JsonArray events = new JsonArray().add(event("START", state()));
        for (int i = 0; i < 1022; i++) events.add(event(DecisionLimit.ACTION, state()));
        assertFalse(restored(events).reached(state()), "Decision 1,023 remains below the guard");
        events.add(event(DecisionLimit.ACTION, state()));
        assertTrue(restored(events).reached(state()), "Decision 1,024 fires before its result is recorded");
    }

    @Test void countsAcceptedDecisionsAcrossKickoffStagesAndIgnoresNonDecisionEvents() {
        JsonObject selection = state().add("kickoff", new JsonObject().add("event", "SOLID_DEFENCE").add("stage", "selection"));
        JsonObject movement = state().add("kickoff", new JsonObject().add("event", "SOLID_DEFENCE").add("stage", "movement"));
        JsonArray events = new JsonArray().add(event("START", selection));
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 2; i++) events.add(event("SELECTION", selection));
        events.add(event("CHAT", movement));
        assertFalse(restored(events).reached(movement));
        events.add(event("ACTION", movement));
        assertTrue(restored(events).reached(movement));
        assertTrue(restored(JsonArray.readFrom(events.toString())).reached(movement));
        assertFalse(restored(events).reached(state().set("drive", 3).add("kickoff", movement.get("kickoff"))));
    }

    @Test void aNewTurnHasAFreshBudgetAndReactingCoachesDoNotResetIt() {
        JsonArray events = new JsonArray().add(event("START", state()));
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 1; i++)
            events.add(event("ACTION", state().add("actor", i % 2 == 0 ? "home" : "away")));
        DecisionLimit limit = restored(events);
        assertTrue(limit.reached(state()));
        assertFalse(limit.reached(state().set("homeTurn", 4)));
        assertFalse(limit.reached(state().set("phase", "SETUP")));
    }

    @Test void appendAccountingAndRestoreDoNotDependOnArrayMutationDetection() {
        DecisionLimit limit = new DecisionLimit();
        JsonArray events = new JsonArray().add(event("START", state()));
        limit.restore(events);
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 2; i++) {
            events.add(event(DecisionLimit.ACTION, state()));
            limit.recorded(DecisionLimit.ACTION, state());
            assertFalse(limit.reached(state()));
            assertFalse(limit.reached(state()), "A query does not consume a decision");
        }
        events.add(event(DecisionLimit.ACTION, state()));
        limit.recorded(DecisionLimit.ACTION, state());
        assertTrue(limit.reached(state()));
        assertTrue(restored(JsonArray.readFrom(events.toString())).reached(state()), "Restore derives the same allowance");
        // Reinstall a different history with the same array identity, size and first entry.
        events.remove(events.size() - 1);
        events.add(event(DecisionLimit.ACTION, state().set("homeTurn", 4)));
        limit.restore(events);
        assertFalse(limit.reached(state().set("homeTurn", 4)), "Explicit restore starts the new period's count afresh");
        assertFalse(limit.reached(state()), "No stale count remains for the replaced history");
    }

    @Test void aHistoryStartingWithAnActionTreatsItAsAPeriodEntry() {
        JsonArray events = new JsonArray();
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 1; i++) events.add(event(DecisionLimit.ACTION, state()));
        assertFalse(restored(events).reached(state()), "The first entry action does not spend this period's allowance");
        events.add(event(DecisionLimit.ACTION, state()));
        assertTrue(restored(events).reached(state()));
    }

    private DecisionLimit restored(JsonArray events) {
        DecisionLimit limit = new DecisionLimit();
        limit.restore(events);
        return limit;
    }

    private JsonObject state() {
        return new JsonObject().add("phase", "PLAY").add("half", 2).add("drive", 2).add("homeTurn", 3).add("awayTurn", 3);
    }

    private JsonObject event(String kind, JsonObject state) {
        return new JsonObject().add("kind", kind).add("state", state);
    }
}
