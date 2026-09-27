package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.FantasyFootballServer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupApplicationTranscriptTest {
    @Test void completedMatchPagesStoredOutcomesWithoutResidentEngine() throws Exception {
        String id = "12345678-1234-1234-1234-123456789abc";
        MatchTranscript transcript = new MatchTranscript();
        transcript.append(0, "START", "system", 100L, JsonValue.NULL, new JsonArray(),
            new JsonObject().add("revision", 0), 0);
        CompletedMatch completed = new CompletedMatch(new JsonObject().add("formatVersion", 2)
            .add("transcript", transcript.json()).toString());
        MatchDocument document = new MatchDocument(id, 4, "away", MatchDocument.Lifecycle.COMPLETED,
            null, null, new java.util.LinkedHashMap<>(), completed);
        MatchService matches = mock(MatchService.class);
        when(matches.load("home", id)).thenReturn(new MatchService.Result(document, false));
        SetupApplication application = new SetupApplication(mock(FantasyFootballServer.class), matches);

        JsonObject page = application.transcriptPage(id, 0, 8);
        assertEquals(1, page.getInt("total", -1));
        assertEquals("START", page.get("records").asArray().get(0).asObject().getString("kind", null));
        assertThrows(IllegalArgumentException.class, () -> application.transcriptPage(id, 0, 9));
    }
}
