package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ReactiveDecisionAllowanceTest {
    @Test void recoveryRetainsOriginalAllowanceWithoutChangingTheDeadline() {
        ReactiveDecision decision = new ReactiveDecision();
        JsonObject saved = checkpoint().add("allowanceMs", 15_000L);
        decision.restore(saved);
        assertEquals(15_000L, decision.publicJson(5_000L).getLong("allowanceMs", -1));
        assertEquals(20_000L, decision.publicJson(5_000L).getLong("expiresAt", -1));
        assertEquals(15_000L, decision.checkpoint().getLong("allowanceMs", -1));
    }

    @Test void olderCheckpointsUseTheLegacyAllowanceAndInvalidDurationsAreRejected() {
        ReactiveDecision decision = new ReactiveDecision();
        decision.restore(checkpoint());
        assertEquals(ReactiveDecision.ALLOWANCE_MS, decision.publicJson(0).getLong("allowanceMs", -1));
        assertThrows(IllegalArgumentException.class, () -> decision.restore(checkpoint().add("allowanceMs", 0L)));
    }

    private JsonObject checkpoint() {
        return new JsonObject().add("id", "reaction-1").add("key", "skill:Wrestle").add("actor", "home")
            .add("title", "Use Wrestle?").add("expiresAt", 20_000L).add("paused", false).add("normalHome", true);
    }
}
