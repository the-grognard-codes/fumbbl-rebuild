package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;

class CanonicalJsonTest {
	@Test void streamingReplayJoinMatchesTheFormerParserAndSerializerContract() {
		String[] arrays = {"[]", " [ null, true, false, 1e+02, -0.0 ] ",
			"[[[],[1]],{\"same\":1,\"same\":2}]", "[{\"\\u0061\":\"\\u00e9 \\\"quoted\\\"\\n\"}]"};
		for (String before : arrays) for (String after : arrays) {
			JsonArray expected = JsonArray.readFrom(before);
			for (JsonValue value : JsonArray.readFrom(after)) expected.add(value);
			assertEquals(expected.toString(), new JsonArrayText().concat(before, after));
			assertEquals(expected.size(), new JsonArrayText().count(new JsonArrayText().concat(before, after)));
		}
		assertThrows(RuntimeException.class, () -> new JsonArrayText().concat("{}", "[]"));
		assertThrows(RuntimeException.class, () -> new JsonArrayText().concat("[]", "[1,"));
	}

	@Test void chunkedFingerprintPreservesUtf8WhenASurrogatePairCrossesAChunkBoundary() throws Exception {
		String json = "x".repeat(8191) + "🦔 café “Unicode”";
		assertArrayEquals(MessageDigest.getInstance("SHA-256").digest(json.getBytes(StandardCharsets.UTF_8)),
			new RecoveryArtifactFingerprint().of(json));
	}

	@Test void replayCounterValidatesNestedArraysWithoutCountingTheirChildrenAsEvents() {
		JsonArrayText counter = new JsonArrayText();
		assertEquals(0, counter.count("[]"));
		assertEquals("[{\"a\":\"é\"},[2],true]", counter.concat(" [ { \"a\" : \"\\u00e9\" } ] ", "[[2],true]"));
		assertEquals(3, counter.count("[{\"state\":[1,2]},[3,4],\"escaped \\\"text\\\"\"]"));
		assertThrows(IllegalArgumentException.class, () -> counter.count("{}"));
		assertThrows(RuntimeException.class, () -> counter.count("[1,"));
	}

	@Test void completedObjectAndTextConstructorsHaveTheSameEmptyContainerDepthBoundary() {
		JsonObject artifact = new JsonObject();
		for (int depth = 1; depth < 64; depth++) artifact = new JsonObject().add("nested", artifact);
		CompletedMatch completed = new CompletedMatch(artifact);
		assertEquals(completed, new CompletedMatch(completed.json()));
		JsonObject tooDeep = new JsonObject().add("nested", artifact);
		assertThrows(IllegalArgumentException.class, () -> new CompletedMatch(tooDeep));
		assertThrows(IllegalArgumentException.class, () -> new CompletedMatch(tooDeep.toString()));
	}

	@Test void canonicalWriterRetainsTheExistingSortedChecksumEncodingAndUtf8Limit() {
		JsonObject unordered = new JsonObject().add("z", new JsonObject().add("b", "café 🦔").add("a", 1)).add("a", true);
		JsonObject ordered = new JsonObject().add("a", true).add("z", new JsonObject().add("a", 1).add("b", "café 🦔"));
		String expected = ordered.toString();
		long bytes = new Utf8Size().bytes(expected);
		assertEquals(expected, new CanonicalJson().encode(unordered, bytes));
		assertEquals(new RecoveryArtifactJson().encodeCheckpoint(ordered), new RecoveryArtifactJson().encodeCanonicalCheckpoint(unordered));
		assertThrows(MatchService.Failure.class, () -> new CanonicalJson().encode(unordered, bytes - 1));
	}
}
