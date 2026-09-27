package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchResultV2Test {
    @Test void metadataReadDoesNotAttachThePrivateSizedTranscript() throws Exception {
        String matchId = "12345678-1234-1234-1234-123456789abc";
        MatchService matches = mock(MatchService.class);
        JsonObject artifact = new JsonObject().add("formatVersion", 2).add("matchId", matchId)
            .add("events", new JsonArray().add(new JsonObject().add("revision", 0).add("kind", "FULL_TIME")))
            .add("transcript", new JsonObject().add("formatVersion", 2).add("records", new JsonArray()
                .add(new JsonObject().add("native", new JsonArray().add(new JsonObject().add("commandNr", 1))))));
        when(matches.result("home", matchId)).thenReturn(new CompletedMatch(artifact.toString()));
        JsonObject request = new JsonObject().add("version", 1).add("type", "matchResult").add("requestId", "result")
            .add("operation", "load").add("matchId", matchId);

        JsonObject response = new MatchResultJson().handle(matches, "home", request);
        assertEquals("ACCEPTED", response.getString("code", null));
        assertEquals(2, response.get("result").asObject().getInt("formatVersion", -1));
        assertEquals(1, response.get("result").asObject().getInt("eventCount", -1));
        assertNull(response.get("result").asObject().get("transcript"));
        assertEquals(JsonValue.NULL, response.get("event"));
    }
}
