package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BoundedJsonStorageCodecTest {
	private final BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(1024 * 1024, 16 * 1024 * 1024);

	@Test void documentsRepositoryStorageAndDecodedBudgets() {
		assertEquals(16 * 1024 * 1024 + 64 * 1024, BoundedJsonStorageCodec.PREPARED_ENCODED_LIMIT);
		assertEquals(64 * 1024 * 1024 + 64 * 1024, BoundedJsonStorageCodec.PREPARED_DECODED_LIMIT);
		assertEquals(32 * 1024 * 1024, BoundedJsonStorageCodec.RECOVERY_ENCODED_LIMIT);
		assertEquals(128 * 1024 * 1024, BoundedJsonStorageCodec.RECOVERY_DECODED_LIMIT);
		assertEquals(32 * 1024 * 1024, MatchTranscript.MAX_BYTES);
	}

	@Test void readsLegacyRawJsonAndUsesDeterministicCompressionOnlyWhenBeneficial() {
		String legacy = "{\"formatVersion\":1,\"label\":\"old\"}";
		assertEquals(legacy, codec.decode(legacy));
		String repetitive = "{\"artifact\":\"" + repeat("snapshot-state-", 700_000) + "\"}";
		String encoded = codec.encode(repetitive);
		assertNotEquals(repetitive, encoded);
		assertEquals(encoded, codec.encode(repetitive));
		assertEquals(repetitive, codec.decode(encoded));
		assertEquals(repetitive, codec.decode("  \n" + encoded));
	}

	@Test void rejectsCorruptionTruncationDeclaredLengthAndExpandedPayload() {
		String valid = codec.encode("{\"state\":\"" + repeat("x", 100_000) + "\"}");
		String payload = JsonObject.readFrom(valid).getString("payload", null);
		JsonObject truncated = JsonObject.readFrom(valid);
		byte[] gzip = Base64.getDecoder().decode(payload);
		truncated.set("payload", Base64.getEncoder().encodeToString(java.util.Arrays.copyOf(gzip, gzip.length - 3)));
		assertThrows(IllegalArgumentException.class, () -> codec.decode(truncated.toString()));
		byte[] corrupt = Base64.getDecoder().decode(payload); corrupt[corrupt.length - 8] ^= 1;
		JsonObject corrupted = JsonObject.readFrom(valid);
		corrupted.set("payload", Base64.getEncoder().encodeToString(corrupt));
		assertThrows(IllegalArgumentException.class, () -> codec.decode(corrupted.toString()));
		byte[] trailing = java.util.Arrays.copyOf(gzip, gzip.length + 1);
		JsonObject withTrailingData = JsonObject.readFrom(valid);
		withTrailingData.set("payload", Base64.getEncoder().encodeToString(trailing));
		assertThrows(IllegalArgumentException.class, () -> codec.decode(withTrailingData.toString()));

		JsonObject wrongLength = JsonObject.readFrom(valid);
		wrongLength.set("decodedBytes", wrongLength.getInt("decodedBytes", 0) + 1);
		assertThrows(IllegalArgumentException.class, () -> codec.decode(wrongLength.toString()));

		BoundedJsonStorageCodec small = new BoundedJsonStorageCodec(1024 * 1024, 100);
		assertThrows(IllegalArgumentException.class, () -> small.decode(valid));
	}

	@Test void rejectsInvalidUtf8UnknownEnvelopeFieldsAndEncodedOversize() throws Exception {
		byte[] invalidUtf8Gzip = gzip(new byte[] {(byte) 0xc3, (byte) 0x28});
		String invalid = envelope(2, invalidUtf8Gzip);
		assertThrows(IllegalArgumentException.class, () -> codec.decode(invalid));

		String extra = JsonObject.readFrom(codec.encode("{\"content\":\"" + repeat("x", 1000) + "\"}"))
			.add("unexpected", true).toString();
		assertThrows(IllegalArgumentException.class, () -> codec.decode(extra));
		BoundedJsonStorageCodec tiny = new BoundedJsonStorageCodec(8, 100);
		assertThrows(IllegalArgumentException.class, () -> tiny.decode("{\"legacy\":true}"));
	}

	private String envelope(int size, byte[] gzip) {
		return new JsonObject().add("$codec", "ffb-match-gzip-json").add("version", 1).add("decodedBytes", size)
			.add("payload", Base64.getEncoder().encodeToString(gzip)).toString();
	}
	private byte[] gzip(byte[] input) throws Exception {
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (GZIPOutputStream output = new GZIPOutputStream(bytes)) { output.write(input); }
		return bytes.toByteArray();
	}
	private String repeat(String value, int count) {
		StringBuilder result = new StringBuilder(value.length() * count);
		for (int index = 0; index < count; index++) result.append(value);
		return result.toString();
	}
}
