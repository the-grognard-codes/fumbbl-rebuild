package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CompletedMatchTest {
	@Test void acceptsCanonicalArtifactsLargerThanTheFormerSixteenMiBBound() {
		StringBuilder json = new StringBuilder(17 * 1024 * 1024 + 32);
		json.append("{\"blob\":\"");
		for (int index = 0; index < 17 * 1024 * 1024; index++) json.append('x');
		json.append("\"}");
		CompletedMatch completed = new CompletedMatch(json.toString());
		assertTrue(completed.json().length() > 16 * 1024 * 1024);
		assertEquals(64 * 1024 * 1024, CompletedMatch.MAX_BYTES);
	}

	@Test void sortsObjectKeysWithoutChangingArrayOrderEscapesOrNumberSpelling() {
		String input = "{\"z\":[{\"b\":1.00,\"a\":\"quote\\\"/line\\n\"}],\"n\":1e+02,\"a\":-0.0}";
		String expected = "{\"a\":-0.0,\"n\":1e+02,\"z\":[{\"a\":\"quote\\\"/line\\n\",\"b\":1.00}]}";
		assertEquals(expected, new CompletedMatch(input).json());
		assertEquals(expected, new CompletedMatch(JsonObject.readFrom(input)).json());
	}

	@Test void freezesJsonObjectInputAtConstructionTime() {
		JsonObject source = JsonObject.readFrom("{\"z\":[1,2],\"a\":{\"value\":true}}");
		CompletedMatch completed = new CompletedMatch(source);
		source.set("a", false).set("z", new JsonArray().add(9));
		assertEquals("{\"a\":{\"value\":true},\"z\":[1,2]}", completed.json());
	}

	@Test void rejectsNestingDeeperThanThePersistedArtifactLimit() {
		StringBuilder json = new StringBuilder();
		for (int index = 0; index < 65; index++) json.append('[');
		json.append('0');
		for (int index = 0; index < 65; index++) json.append(']');
		assertThrows(IllegalArgumentException.class, () -> new CompletedMatch("{\"value\":" + json + "}"));
	}

	@Test void countsUtf8BytesWhenEnforcingTheArtifactLimit() {
		StringBuilder json = new StringBuilder(33_554_440);
		json.append("{\"value\":\"");
		for (int index = 0; index < 33_554_427; index++) json.append('\u00e9');
		json.append("\"}");
		assertTrue(json.length() < CompletedMatch.MAX_BYTES);
		assertThrows(IllegalArgumentException.class, () -> new CompletedMatch(json.toString()));
	}
}
