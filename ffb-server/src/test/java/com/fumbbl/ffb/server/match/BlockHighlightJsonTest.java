package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BlockHighlightJsonTest {
    private final BlockHighlightJson validator = new BlockHighlightJson();

    @Test void rejectsInvalidGeometryParticipantsAndActiveTargets() {
        assertDoesNotThrow(() -> validator.context(context()));
        JsonObject value = context(); value.set("activeTargetPlayerId", "unknown");
        assertThrows(IllegalArgumentException.class, () -> validator.context(value));
        JsonObject duplicate = context(); duplicate.get("blocks").asArray().add(block());
        assertThrows(IllegalArgumentException.class, () -> validator.context(duplicate));
        JsonObject distant = block(); distant.get("offensiveAssists").asArray().get(0).asObject().set("x", 20);
        assertThrows(IllegalArgumentException.class, () -> validator.highlight(distant));
        JsonObject repeated = block(); repeated.get("offensiveAssists").asArray().get(0).asObject().set("playerId", "attacker");
        assertThrows(IllegalArgumentException.class, () -> validator.highlight(repeated));
        JsonObject outside = block(); outside.get("from").asObject().set("y", 15);
        assertThrows(IllegalArgumentException.class, () -> validator.highlight(outside));
        JsonObject extra = block().add("private", true);
        assertThrows(IllegalArgumentException.class, () -> validator.highlight(extra));
    }

    @Test void durableAndPublicContextsRequireKnownPlayersOnTheCorrectTeams() {
        JsonArray players = new JsonArray().add(player("attacker", "home")).add(player("target", "away")).add(player("assist", "home"));
        assertDoesNotThrow(() -> validator.context(context(), players));
        players.get(2).asObject().set("role", "away");
        assertThrows(IllegalArgumentException.class, () -> validator.context(context(), players));
        players.get(2).asObject().set("id", "unknown");
        assertThrows(IllegalArgumentException.class, () -> validator.context(context(), players));
        players.get(1).asObject().set("role", "home");
        assertThrows(IllegalArgumentException.class, () -> validator.context(context(), players));
    }

    private JsonObject context() { return new JsonObject().add("version", 1).add("activeTargetPlayerId", "target").add("blocks", new JsonArray().add(block())); }
    private JsonObject block() { return JsonObject.readFrom("{\"playerId\":\"attacker\",\"targetPlayerId\":\"target\",\"from\":{\"x\":7,\"y\":7},\"to\":{\"x\":8,\"y\":7},\"offensiveAssists\":[{\"playerId\":\"assist\",\"x\":9,\"y\":8}],\"defensiveAssists\":[]}"); }
    private JsonObject player(String id, String role) { return new JsonObject().add("id", id).add("role", role); }
}
