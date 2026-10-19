package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JsonDigestTest {
	@Test void matchesTheExistingSerializedChecksumAcrossEscapesUnicodeAndWriterBufferBoundaries() throws Exception {
		StringBuilder text = new StringBuilder();
		for (int index = 0; index < 20000; index++) text.append("\ud83c\udfc8\u00e9\ud800\n\"\\");
		for (JsonValue value : new JsonValue[] { new JsonObject(), new JsonObject().add("z", text.toString()).add("a", new JsonArray().add(1).add(true).add(JsonValue.NULL)) }) {
			byte[] expected = MessageDigest.getInstance("SHA-256").digest(value.toString().getBytes(StandardCharsets.UTF_8));
			assertEquals(String.format("%064x", new BigInteger(1, expected)), new JsonDigest().sha256(value));
		}
	}
}
