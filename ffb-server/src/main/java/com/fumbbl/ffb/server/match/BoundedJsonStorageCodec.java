package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.zip.GZIPOutputStream;
import java.util.zip.CRC32;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;

/** Bounded, versioned at-rest compression for logical JSON records. */
final class BoundedJsonStorageCodec {
	static final int PREPARED_ENCODED_LIMIT = 16 * 1024 * 1024 + 64 * 1024;
	static final int PREPARED_DECODED_LIMIT = 64 * 1024 * 1024 + 64 * 1024;
	static final int RECOVERY_ENCODED_LIMIT = 32 * 1024 * 1024;
	static final int RECOVERY_DECODED_LIMIT = 128 * 1024 * 1024;
	private static final String MARKER = "ffb-match-gzip-json";
	private static final int VERSION = 1;
	private final int encodedLimit;
	private final int decodedLimit;

	BoundedJsonStorageCodec(int encodedLimit, int decodedLimit) {
		if (encodedLimit < 1 || decodedLimit < 1) throw new IllegalArgumentException("Invalid storage limits");
		this.encodedLimit = encodedLimit;
		this.decodedLimit = decodedLimit;
	}

	String encode(String json) {
		if (json != null && json.length() > decodedLimit) throw new IllegalArgumentException("Stored JSON decoded limit");
		byte[] raw = utf8(json);
		if (raw.length > decodedLimit) throw new IllegalArgumentException("Stored JSON decoded limit");
		byte[] compressed = gzip(raw);
		String skeleton = new JsonObject().add("$codec", MARKER).add("version", VERSION)
			.add("decodedBytes", raw.length).add("payload", "").toString();
		long envelopeBytes = skeleton.length() + 4L * ((compressed.length + 2L) / 3L);
		if (envelopeBytes >= raw.length) {
			if (raw.length > encodedLimit) throw new IllegalArgumentException("Stored JSON encoded limit");
			return json;
		}
		String envelope = new JsonObject().add("$codec", MARKER).add("version", VERSION)
			.add("decodedBytes", raw.length).add("payload", Base64.getEncoder().encodeToString(compressed)).toString();
		byte[] packed = utf8(envelope);
		String selected = packed.length < raw.length ? envelope : json;
		if (utf8(selected).length > encodedLimit) throw new IllegalArgumentException("Stored JSON encoded limit");
		return selected;
	}

	String decode(String stored) {
		if (stored != null && stored.length() > encodedLimit) throw new IllegalArgumentException("Stored JSON encoded limit");
		byte[] input = utf8(stored);
		if (input.length > encodedLimit) throw new IllegalArgumentException("Stored JSON encoded limit");
		if (hasCodecHeader(stored)) return decodeEnvelope(stored);
		if (input.length > decodedLimit) throw new IllegalArgumentException("Stored JSON decoded limit");
		return stored;
	}

	private String decodeEnvelope(String stored) {
		try {
			JsonObject object = JsonObject.readFrom(stored);
			if (object.size() != 4 || !new HashSet<String>(object.names()).equals(
				new HashSet<String>(Arrays.asList("$codec", "version", "decodedBytes", "payload")))
				|| !MARKER.equals(object.getString("$codec", null)) || object.getInt("version", -1) != VERSION)
				throw new IllegalArgumentException("Invalid storage envelope");
			int expected = object.getInt("decodedBytes", -1);
			if (expected < 0 || expected > decodedLimit) throw new IllegalArgumentException("Stored JSON decoded limit");
			String encoded = object.getString("payload", null);
			byte[] gzip = Base64.getDecoder().decode(encoded);
			if (!Base64.getEncoder().encodeToString(gzip).equals(encoded)) throw new IllegalArgumentException("Invalid storage payload");
			byte[] decoded = inflate(gzip, expected);
			if (decoded.length != expected) throw new IllegalArgumentException("Storage length mismatch");
			return strictUtf8(decoded);
		} catch (IllegalArgumentException failure) { throw failure;
		} catch (RuntimeException failure) { throw new IllegalArgumentException("Invalid stored JSON envelope"); }
	}

	private boolean hasCodecHeader(String value) {
		int index = 0;
		while (index < value.length() && value.charAt(index) <= 0x20) index++;
		if (index >= value.length() || value.charAt(index++) != '{') return false;
		while (index < value.length() && value.charAt(index) <= 0x20) index++;
		return value.startsWith("\"$codec\"", index);
	}

	private byte[] inflate(byte[] compressed, int expected) {
		if (compressed.length < 18 || (compressed[0] & 255) != 0x1f || (compressed[1] & 255) != 0x8b
			|| (compressed[2] & 255) != 8 || compressed[3] != 0)
			throw new IllegalArgumentException("Invalid gzip header");
		Inflater inflater = new Inflater(true);
		try {
			inflater.setInput(compressed, 10, compressed.length - 18);
			ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(expected, 1024 * 1024));
			byte[] buffer = new byte[8192];
			while (!inflater.finished()) {
				int count = inflater.inflate(buffer);
				if (count > 0) {
					if (output.size() > decodedLimit - count || output.size() > expected - count)
						throw new IllegalArgumentException("Stored JSON expansion limit");
					output.write(buffer, 0, count);
				} else if (inflater.needsDictionary() || inflater.needsInput()) {
					throw new IllegalArgumentException("Truncated gzip payload");
				} else throw new IllegalArgumentException("Invalid gzip payload");
			}
			long trailerOffset = 10L + inflater.getTotalIn();
			if (trailerOffset + 8 != compressed.length) throw new IllegalArgumentException("Unexpected gzip trailing data");
			byte[] decoded = output.toByteArray();
			CRC32 crc = new CRC32(); crc.update(decoded);
			if (crc.getValue() != readLittleEndian(compressed, (int) trailerOffset)
				|| (decoded.length & 0xffffffffL) != readLittleEndian(compressed, (int) trailerOffset + 4))
				throw new IllegalArgumentException("Gzip checksum mismatch");
			return decoded;
		} catch (DataFormatException failure) { throw new IllegalArgumentException("Invalid gzip payload");
		} finally { inflater.end(); }
	}

	private long readLittleEndian(byte[] bytes, int offset) {
		return (bytes[offset] & 255L) | (bytes[offset + 1] & 255L) << 8
			| (bytes[offset + 2] & 255L) << 16 | (bytes[offset + 3] & 255L) << 24;
	}

	private byte[] gzip(byte[] raw) {
		try {
			ByteArrayOutputStream output = new ByteArrayOutputStream();
			try (GZIPOutputStream gzip = new GZIPOutputStream(output)) { gzip.write(raw); }
			return output.toByteArray();
		} catch (IOException failure) { throw new IllegalStateException("Unable to encode stored JSON"); }
	}

	private byte[] utf8(String value) {
		if (value == null) throw new IllegalArgumentException("Missing stored JSON");
		try {
			ByteBuffer bytes = StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
				.onUnmappableCharacter(CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(value));
			byte[] result = new byte[bytes.remaining()]; bytes.get(result); return result;
		} catch (CharacterCodingException failure) { throw new IllegalArgumentException("Invalid stored JSON text"); }
	}

	private String strictUtf8(byte[] bytes) {
		try { return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
			.onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString(); }
		catch (CharacterCodingException failure) { throw new IllegalArgumentException("Invalid stored JSON text"); }
	}
}
