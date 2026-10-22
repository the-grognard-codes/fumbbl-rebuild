package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

/** Bounded post-action continuations; recovery assembles JSON and never executes game commands. */
final class RecoveryJournal {
	static final int MAX_ENTRIES = 32;
	static final int MAX_ENTRY_BYTES = 4 * 1024 * 1024;
	static final int COMPACT_BYTES = 2 * 1024 * 1024;
	static final int MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;

	Cursor cursor(RecoveryRepository.Record record) {
		return cursor(record, null);
	}

	Cursor cursor(RecoveryRepository.Record record, SetupSession session) {
		JsonObject envelope = envelope(record.json, MAX_ARTIFACT_BYTES);
		JsonObject payload = envelope.get("payload").asObject();
		return new Cursor(counts(payload), signature(payload), record.journalHash == null
			? envelope.getString("sha256", null) : record.journalHash, record.journalEntries, record.journalBytes, bytes(record.json),
			session == null ? -1 : session.recoveryNativeEpoch());
	}

	Change change(SetupSession session, Cursor before, long generation) {
		if (before.nativeEpoch >= 0 && before.nativeEpoch != session.recoveryNativeEpoch()) return Change.compact();
		int[] after = session.recoveryJournalCounts();
		for (int index = 0; index < 4; index++) if (after[index] < before.counts[index]) return Change.compact();
		JsonObject tail = session.recoveryJournalPayload(before.counts);
		String signature = signature(tail);
		if (Arrays.equals(before.counts, after) && before.signature.equals(signature)) return null;
		if (before.entries >= MAX_ENTRIES - 1 || before.journalBytes >= COMPACT_BYTES) return Change.compact();
		JsonObject entry = new JsonObject().add("journalVersion", 1).add("matchId", tail.get("matchId"))
			.add("generation", generation + 1).add("previous", before.hash).add("from", numbers(before.counts))
			.add("to", numbers(after)).add("state", tail);
		String json;
		try { json = new RecoveryArtifactJson().encode(ordered(entry).asObject(), MAX_ENTRY_BYTES); }
		catch (MatchService.Failure tooLarge) {
			if (!"RECOVERY_LIMIT".equals(tooLarge.code)) throw tooLarge;
			return Change.compact();
		}
		int length = bytes(json);
		if (before.budget + length > MAX_ARTIFACT_BYTES || before.journalBytes + length > COMPACT_BYTES) return Change.compact();
		String hash = JsonObject.readFrom(json).getString("sha256", null);
		return new Change(false, json, new Cursor(after, signature, hash, before.entries + 1,
			before.journalBytes + length, before.budget + length, session.recoveryNativeEpoch()));
	}

	RecoveryRepository.Record restore(String id, long generation, long checkpointGeneration, String checkpoint,
		List<RecoveryRepository.Record> entries) {
		try {
			if (checkpointGeneration < 1 || generation < checkpointGeneration || entries.size() > MAX_ENTRIES
				|| generation - checkpointGeneration != entries.size()) throw new IllegalArgumentException("Journal boundary");
			JsonObject base = envelope(checkpoint, MAX_ARTIFACT_BYTES), payload = base.get("payload").asObject();
			String hash = base.getString("sha256", null);
			long expected = checkpointGeneration, journalBytes = 0;
			for (RecoveryRepository.Record record : entries) {
				journalBytes += bytes(record.json);
				if (journalBytes > COMPACT_BYTES || record.generation != ++expected || !id.equals(record.matchId))
					throw new IllegalArgumentException("Journal sequence");
				JsonObject saved = envelope(record.json, MAX_ENTRY_BYTES), entry = saved.get("payload").asObject();
				if (entry.size() != 7 || entry.getInt("journalVersion", -1) != 1
					|| !id.equals(entry.getString("matchId", null)) || entry.getLong("generation", -1) != expected
					|| !hash.equals(entry.getString("previous", null))
					|| !Arrays.equals(counts(payload), counts(entry.get("from").asArray())))
					throw new IllegalArgumentException("Journal chain");
				JsonObject tail = entry.get("state").asObject();
				if (!id.equals(tail.getString("matchId", null))) throw new IllegalArgumentException("Journal match");
				payload = combine(payload, tail);
				if (!Arrays.equals(counts(payload), counts(entry.get("to").asArray()))) throw new IllegalArgumentException("Journal counts");
				hash = saved.getString("sha256", null);
			}
			String json = entries.isEmpty() ? checkpoint : new RecoveryArtifactJson().encode(ordered(payload).asObject(), MAX_ARTIFACT_BYTES);
			return new RecoveryRepository.Record(id, generation, json, hash, entries.size(), journalBytes);
		} catch (RuntimeException corrupt) { throw new MatchService.Failure("RECOVERY_CORRUPT"); }
	}

	private JsonObject combine(JsonObject before, JsonObject tail) {
		JsonObject result = new JsonObject(tail);
		result.set("history", concat(before.get("history").asArray(), tail.get("history").asArray()));
		result.set("eventsJson", concat(JsonArray.readFrom(before.getString("eventsJson", null)), JsonArray.readFrom(tail.getString("eventsJson", null))).toString());
		JsonObject nativeState = new JsonObject(tail.get("native").asObject());
		nativeState.set("gameLog", new JsonObject().add("commandArray", concat(commands(before), commands(tail))));
		result.set("native", nativeState);
		if (tail.get("transcript") != null) {
			JsonObject transcript = new JsonObject(tail.get("transcript").asObject());
			transcript.set("records", concat(before.get("transcript").asObject().get("records").asArray(), transcript.get("records").asArray()));
			result.set("transcript", transcript);
		}
		return result;
	}
	private String signature(JsonObject payload) {
		JsonObject metadata = new JsonObject(payload); metadata.remove("history"); metadata.remove("eventsJson");
		JsonObject nativeState = new JsonObject(metadata.get("native").asObject()); nativeState.remove("gameLog"); metadata.set("native", nativeState);
		if (metadata.get("transcript") != null) {
			JsonObject transcript = new JsonObject(metadata.get("transcript").asObject()); transcript.remove("records"); metadata.set("transcript", transcript);
		}
		return new JsonDigest().sha256(ordered(metadata));
	}
	private JsonObject envelope(String text, int maxBytes) {
		JsonObject object = new MatchJson().parse(text, maxBytes, 128);
		if (object.size() != 2 || !new JsonDigest().sha256(object.get("payload")).equals(object.getString("sha256", null))) throw new IllegalArgumentException("Journal checksum");
		return object;
	}
	private int[] counts(JsonObject payload) {
		return new int[] {payload.get("history").asArray().size(), JsonArray.readFrom(payload.getString("eventsJson", null)).size(), commands(payload).size(),
			payload.get("transcript") == null ? 0 : payload.get("transcript").asObject().get("records").asArray().size()};
	}
	private JsonArray commands(JsonObject payload) { return payload.get("native").asObject().get("gameLog").asObject().get("commandArray").asArray(); }
	private int[] counts(JsonArray value) {
		if (value.size() != 4) throw new IllegalArgumentException("Journal cursor");
		int[] counts = new int[4]; for (int index = 0; index < 4; index++) { counts[index] = value.get(index).asInt(); if (counts[index] < 0) throw new IllegalArgumentException("Journal cursor"); } return counts;
	}
	private JsonArray numbers(int[] values) { JsonArray result = new JsonArray(); for (int value : values) result.add(value); return result; }
	private JsonArray concat(JsonArray before, JsonArray after) { JsonArray result = new JsonArray(); for (JsonValue value : before) result.add(value); for (JsonValue value : after) result.add(value); return result; }
	private int bytes(String text) { return text.getBytes(StandardCharsets.UTF_8).length; }
	private JsonValue ordered(JsonValue value) {
		if (value.isObject()) { JsonObject result = new JsonObject(); value.asObject().names().stream().sorted().forEach(name -> result.add(name, ordered(value.asObject().get(name)))); return result; }
		if (value.isArray()) { JsonArray result = new JsonArray(); for (JsonValue item : value.asArray()) result.add(ordered(item)); return result; } return value;
	}
	static final class Cursor {
		final int[] counts; final String signature, hash; final int entries; final long journalBytes, budget, nativeEpoch;
		Cursor(int[] counts, String signature, String hash, int entries, long journalBytes, long budget, long nativeEpoch) { this.counts = counts.clone(); this.signature = signature; this.hash = hash; this.entries = entries; this.journalBytes = journalBytes; this.budget = budget; this.nativeEpoch = nativeEpoch; }
	}
	static final class Change {
		final boolean compact; final String json; final Cursor next;
		Change(boolean compact, String json, Cursor next) { this.compact = compact; this.json = json; this.next = next; }
		static Change compact() { return new Change(true, null, null); }
	}
}
