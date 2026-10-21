package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Strict public metadata validation, also used for durable presentation checkpoints. */
final class BlockHighlightJson {
    JsonObject normalized(JsonObject value) { return ordered(value).asObject(); }

    private JsonValue ordered(JsonValue value) {
        if (value.isObject()) {
            JsonObject copy = new JsonObject();
            value.asObject().names().stream().sorted().forEach(key -> copy.add(key, ordered(value.asObject().get(key))));
            return copy;
        }
        if (value.isArray()) {
            JsonArray copy = new JsonArray();
            for (JsonValue item : value.asArray()) copy.add(ordered(item));
            return copy;
        }
        return value;
    }

    void highlight(JsonObject value) {
        exact(value, "playerId", "targetPlayerId", "from", "to", "offensiveAssists", "defensiveAssists");
        text(value.get("playerId")); text(value.get("targetPlayerId"));
        if (value.get("playerId").equals(value.get("targetPlayerId"))) throw new IllegalArgumentException("Self block");
        square(value.get("from").asObject()); square(value.get("to").asObject());
        JsonObject from = value.get("from").asObject(), to = value.get("to").asObject();
        if (Math.max(Math.abs(from.getInt("x", -1)-to.getInt("x", -1)), Math.abs(from.getInt("y", -1)-to.getInt("y", -1))) != 1)
            throw new IllegalArgumentException("Non-adjacent block metadata");
        Set<String> players = new HashSet<>(Arrays.asList(value.getString("playerId", ""), value.getString("targetPlayerId", "")));
        for (String key : new String[] {"offensiveAssists", "defensiveAssists"}) {
            JsonArray assists = value.get(key).asArray();
            if (assists.size() > 8) throw new IllegalArgumentException("Too many block assists");
            for (JsonValue item : assists) {
                JsonObject assist = item.asObject(); exact(assist, "playerId", "x", "y"); text(assist.get("playerId"));
                coordinate(assist.get("x"), 25); coordinate(assist.get("y"), 14);
                JsonObject destination = "offensiveAssists".equals(key) ? to : from;
                if (Math.max(Math.abs(assist.getInt("x", -1) - destination.getInt("x", -1)),
                    Math.abs(assist.getInt("y", -1) - destination.getInt("y", -1))) != 1)
                    throw new IllegalArgumentException("Non-adjacent block contributor");
                if (!players.add(assist.getString("playerId", ""))) throw new IllegalArgumentException("Duplicate block participant");
            }
        }
    }

    void context(JsonObject value, JsonArray players) {
        context(value);
        Map<String, String> roles = new HashMap<>();
        for (JsonValue player : players) roles.put(player.asObject().getString("id", ""), player.asObject().getString("role", ""));
        for (JsonValue item : value.get("blocks").asArray()) {
            JsonObject block = item.asObject();
            String attacker = roles.get(block.getString("playerId", "")), target = roles.get(block.getString("targetPlayerId", ""));
            if (attacker == null || target == null || attacker.equals(target)) throw new IllegalArgumentException("Unknown block participants");
            for (String key : new String[] {"offensiveAssists", "defensiveAssists"})
                for (JsonValue assist : block.get(key).asArray())
                    if (!("offensiveAssists".equals(key) ? attacker : target).equals(roles.get(assist.asObject().getString("playerId", ""))))
                        throw new IllegalArgumentException("Invalid contributor team");
        }
    }

    void context(JsonObject value) {
        exact(value, "version", "activeTargetPlayerId", "blocks");
        if (value.getInt("version", -1) != 1) throw new IllegalArgumentException("Unsupported block context");
        text(value.get("activeTargetPlayerId"));
        JsonArray blocks = value.get("blocks").asArray();
        if (blocks.isEmpty() || blocks.size() > 2) throw new IllegalArgumentException("Invalid block count");
        Set<String> targets = new HashSet<>(); String attacker = null;
        for (JsonValue item : blocks) {
            JsonObject block = item.asObject(); highlight(block);
            if (!targets.add(block.getString("targetPlayerId", ""))) throw new IllegalArgumentException("Duplicate target");
            if (attacker != null && !attacker.equals(block.getString("playerId", ""))) throw new IllegalArgumentException("Different blockers");
            attacker = block.getString("playerId", "");
        }
        if (!targets.contains(value.getString("activeTargetPlayerId", ""))) throw new IllegalArgumentException("Unknown active target");
    }

    private void square(JsonObject value) { exact(value, "x", "y"); coordinate(value.get("x"), 25); coordinate(value.get("y"), 14); }
    private void coordinate(JsonValue value, int max) { int n = value.asInt(); if (n < 0 || n > max) throw new IllegalArgumentException("Invalid square"); }
    private void text(JsonValue value) { if (value == null || !value.isString() || value.asString().isEmpty() || value.asString().length() > 100) throw new IllegalArgumentException("Invalid player"); }
    private void exact(JsonObject value, String... fields) {
        if (value.size() != fields.length || !value.names().containsAll(Arrays.asList(fields))) throw new IllegalArgumentException("Unexpected block metadata fields");
    }
}
