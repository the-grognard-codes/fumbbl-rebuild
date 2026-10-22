package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.spy;

class RecoveryArtifactJsonTest {
	@Test void serializesTheFullPayloadOnlyOnce() {
		JsonObject payload = spy(new JsonObject().add("records", new JsonArray()
			.add(new JsonObject().add("revision", 1).add("name", "Coach"))));
		new RecoveryArtifactJson().encode(payload, 4096);
		assertEquals(1L, mockingDetails(payload).getInvocations().stream()
			.filter(invocation -> "write".equals(invocation.getMethod().getName())).count(),
			"Digest and envelope must share one serialized payload");
	}

	@Test void preservesTheExactEnvelopeDigestAndEveryUtf16Character() {
		StringBuilder allCharacters = new StringBuilder();
		for (int value = 0; value <= Character.MAX_VALUE; value++) allCharacters.append((char) value);
		JsonObject payload = new JsonObject().add("escaped", allCharacters.toString())
			.add("nested", new JsonArray().add(JsonValue.NULL).add(true).add(-0.5)
				.add(new JsonObject().add("\u2028\u2029\n\"\\", "\ud83c\udfc8\ud800\udc00\udfff")));
		String expected = legacy(payload);
		String encoded = new RecoveryArtifactJson().encode(payload, 1024 * 1024);
		assertEquals(expected, encoded);
		JsonObject restored = JsonObject.readFrom(encoded);
		assertEquals(payload, restored.get("payload"));
		assertEquals(new JsonDigest().sha256(restored.get("payload")), restored.getString("sha256", null));
	}

	@Test void enforcesTheExactUtf8EnvelopeLimitIncludingHashAndEscapes() {
		JsonObject payload = new JsonObject().add("name", "\ud83c\udfc8\u00e9\n\ud800");
		String expected = legacy(payload);
		int bytes = expected.getBytes(StandardCharsets.UTF_8).length;
		assertEquals(expected, new RecoveryArtifactJson().encode(payload, bytes));
		MatchService.Failure failure = assertThrows(MatchService.Failure.class,
			() -> new RecoveryArtifactJson().encode(payload, bytes - 1));
		assertEquals("RECOVERY_LIMIT", failure.code);
	}

	private String legacy(JsonObject payload) {
		return new JsonObject().add("payload", payload).add("sha256", new JsonDigest().sha256(payload)).toString();
	}
}
