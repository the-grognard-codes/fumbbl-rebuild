package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MatchTranscriptTest {
    @Test void restoresAcceptedDecisionAndRawNativeOutcomeInRevisionOrder() {
        MatchTranscript transcript = new MatchTranscript();
        transcript.append(0, "START", "system", 100L, JsonValue.NULL, new JsonArray(), state(0), 0);
        JsonObject report = new JsonObject().add("commandNr", 7).add("reportList", new JsonObject()
            .add("reports", new JsonArray().add(new JsonObject().add("roll", 4).add("minimumRoll", 3))));
        transcript.append(1, "ACTION", "home", 101L, new JsonObject().add("actionId", "move"),
            new JsonArray().add(report), state(1), 7);

        MatchTranscript restored = new MatchTranscript(JsonObject.readFrom(transcript.json().toString()));
        assertEquals(2, restored.size());
        assertEquals(7, restored.nativeCursor());
        assertEquals(1, restored.page(1, 1).get("records").asArray().size());
        assertEquals(2, restored.page(1, 1).getInt("next", -1));
        JsonObject accepted = restored.json().get("records").asArray().get(1).asObject();
        assertEquals("home", accepted.getString("actor", null));
        assertEquals(4, accepted.get("native").asArray().get(0).asObject().get("reportList").asObject()
            .get("reports").asArray().get(0).asObject().getInt("roll", -1));
        assertThrows(IllegalArgumentException.class, () -> restored.append(1, "ACTION", "home", 102L,
            new JsonObject(), new JsonArray(), state(1), 7));
        assertThrows(IllegalArgumentException.class, () -> restored.page(0, 9));
    }

    @Test void rejectsMissingRevisionAndUnsupportedSavedShape() {
        MatchTranscript transcript = new MatchTranscript();
        assertThrows(IllegalArgumentException.class, () -> transcript.append(1, "ACTION", "home", 100L,
            new JsonObject(), new JsonArray(), state(1), 0));
        transcript.append(0, "START", "system", 100L, JsonValue.NULL, new JsonArray(), state(0), 0);
        JsonObject saved = transcript.json();
        saved.get("records").asArray().get(0).asObject().set("revision", 2);
        assertThrows(IllegalArgumentException.class, () -> new MatchTranscript(saved));
    }

    private JsonObject state(int revision) { return new JsonObject().add("revision", revision); }
}
