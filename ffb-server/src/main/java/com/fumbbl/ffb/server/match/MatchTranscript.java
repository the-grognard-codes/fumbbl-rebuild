package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;

/** Bounded public record of accepted decisions and the native outcomes they caused. */
final class MatchTranscript {
    static final int FORMAT_VERSION = 2;
    static final int MAX_BYTES = 32 * 1024 * 1024;
    private final JsonArray records = new JsonArray();
    private int bytes;
    private int nativeCursor;

    MatchTranscript() { }

    MatchTranscript(JsonObject saved) {
        exact(saved, "formatVersion", "nativeCursor", "records");
        if (saved.getInt("formatVersion", -1) != FORMAT_VERSION) throw new IllegalArgumentException("Unsupported transcript format");
        int cursor = saved.getInt("nativeCursor", -1);
        if (cursor < 0) throw new IllegalArgumentException("Invalid native cursor");
        int priorNative = 0;
        long priorTime = 0;
        for (JsonValue value : saved.get("records").asArray()) {
            JsonObject record = value.asObject();
            exact(record, "index", "revision", "kind", "actor", "at", "decision", "native", "state");
            int index = record.getInt("index", -1);
            int revision = record.getInt("revision", -1);
            if (index != records.size() || revision != index || revision > 8192) throw new IllegalArgumentException("Transcript gap");
            String kind = record.getString("kind", null);
            if (!("START".equals(kind) || "ACTION".equals(kind) || "SELECTION".equals(kind)
                || "TOUCHDOWN".equals(kind) || "HALFTIME".equals(kind) || "FULL_TIME".equals(kind)))
                throw new IllegalArgumentException("Invalid transcript kind");
            if (index == 0 ? !"START".equals(kind) : "START".equals(kind)) throw new IllegalArgumentException("Invalid start boundary");
            String actor = record.getString("actor", null);
            if (index == 0 ? !"system".equals(actor) : !("home".equals(actor) || "away".equals(actor)))
                throw new IllegalArgumentException("Invalid transcript actor");
            long at = record.get("at").asLong();
            if (at < priorTime || (index == 0 ? !record.get("decision").isNull() : !record.get("decision").isObject()))
                throw new IllegalArgumentException("Invalid transcript decision");
            priorTime = at;
            for (JsonValue nativeValue : record.get("native").asArray()) {
                int number = nativeValue.asObject().getInt("commandNr", -1);
                if (number <= priorNative || number > cursor) throw new IllegalArgumentException("Native transcript order");
                priorNative = number;
            }
            if (record.get("state").asObject().getInt("revision", -1) != revision) throw new IllegalArgumentException("Transcript state mismatch");
            add(record);
        }
        if (records.size() == 0) throw new IllegalArgumentException("Empty transcript");
        nativeCursor = cursor;
    }

    void append(int revision, String kind, String actor, long at, JsonValue decision, JsonArray nativeOutcomes, JsonObject state, int cursor) {
        if (revision != records.size() || revision > 8192 || at < 0 || cursor < nativeCursor)
            throw new IllegalArgumentException("Invalid transcript append");
        if (!("START".equals(kind) || "ACTION".equals(kind) || "SELECTION".equals(kind)
            || "TOUCHDOWN".equals(kind) || "HALFTIME".equals(kind) || "FULL_TIME".equals(kind)))
            throw new IllegalArgumentException("Invalid transcript kind");
        if (revision == 0 ? !"START".equals(kind) : "START".equals(kind)) throw new IllegalArgumentException("Invalid start boundary");
        if (decision == null || nativeOutcomes == null || state == null) throw new IllegalArgumentException("Missing transcript data");
        if (records.size() > 0 && at < records.get(records.size() - 1).asObject().get("at").asLong())
            throw new IllegalArgumentException("Transcript time went backwards");
        if (revision == 0 ? !"system".equals(actor) || !decision.isNull() : !("home".equals(actor) || "away".equals(actor)) || !decision.isObject())
            throw new IllegalArgumentException("Invalid transcript actor or decision");
        if (state.getInt("revision", -1) != revision) throw new IllegalArgumentException("Transcript state mismatch");
        int priorNative = nativeCursor;
        for (JsonValue nativeValue : nativeOutcomes) {
            int number = nativeValue.asObject().getInt("commandNr", -1);
            if (number <= priorNative || number > cursor) throw new IllegalArgumentException("Native transcript order");
            priorNative = number;
        }
        JsonObject record = new JsonObject().add("index", records.size()).add("revision", revision).add("kind", kind)
            .add("actor", actor).add("at", at).add("decision", decision).add("native", nativeOutcomes).add("state", state);
        add(record);
        nativeCursor = cursor;
    }

    JsonObject json() {
        return new JsonObject().add("formatVersion", FORMAT_VERSION).add("nativeCursor", nativeCursor).add("records", records);
    }

    int size() { return records.size(); }
    int bytes() { return bytes; }
    int nativeCursor() { return nativeCursor; }
    long lastTime() { return records.size() == 0 ? 0 : records.get(records.size() - 1).asObject().get("at").asLong(); }

    JsonObject page(int from, int limit) {
        if (from < 0 || from > records.size() || limit < 1 || limit > 8) throw new IllegalArgumentException("Invalid transcript page");
        JsonArray selected = new JsonArray();
        int selectedBytes = 0;
        for (int index = from; index < records.size() && selected.size() < limit; index++) {
            JsonValue record = records.get(index);
            int length = record.toString().getBytes(StandardCharsets.UTF_8).length;
            if (selected.size() > 0 && selectedBytes + length > 512 * 1024) break;
            selected.add(record);
            selectedBytes += length;
        }
        return new JsonObject().add("formatVersion", FORMAT_VERSION).add("from", from)
            .add("next", from + selected.size()).add("total", records.size()).add("records", selected);
    }

    private void add(JsonObject record) {
        int length = record.toString().getBytes(StandardCharsets.UTF_8).length;
        if (length > 256 * 1024 || bytes + length > MAX_BYTES - 128 * 1024) throw new IllegalArgumentException("Transcript limit");
        records.add(record);
        bytes += length;
    }

    private static void exact(JsonObject object, String... fields) {
        if (object.size() != fields.length || !new HashSet<>(object.names()).equals(new HashSet<>(Arrays.asList(fields))))
            throw new IllegalArgumentException("Unsupported transcript shape");
    }
}
