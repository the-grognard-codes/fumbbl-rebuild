package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

/** Encodes an already ordered recovery payload using the existing envelope contract. */
final class RecoveryArtifactJson {
	static final int MAX_CHECKPOINT_BYTES = 128 * 1024 * 1024;
	private static final String PREFIX = "{\"payload\":";
	private static final String CHECKSUM = ",\"sha256\":\"";
	private static final String SUFFIX = "\"}";
	static final int ENVELOPE_BYTES = PREFIX.length() + CHECKSUM.length() + 64 + SUFFIX.length();

	String encode(JsonObject payload, int maxBytes) {
		return encodeWithMetadata(payload, maxBytes).envelope();
	}

	Encoded encodeCheckpoint(JsonObject payload) {
		return encodeWithMetadata(payload, MAX_CHECKPOINT_BYTES);
	}
	Encoded encodeCanonicalCheckpoint(JsonObject payload) {
		return encodeText(new CanonicalJson().encode(payload, MAX_CHECKPOINT_BYTES - ENVELOPE_BYTES), MAX_CHECKPOINT_BYTES);
	}

	Encoded encodeWithMetadata(JsonObject payload, int maxBytes) {
		// Use exactly the same minimal-json text for the checksum and the envelope. Rewriting
		// the tree for the envelope otherwise traverses all native and transcript history twice.
		return encodeText(payload.toString(), maxBytes);
	}

	private Encoded encodeText(String json, int maxBytes) {
		long bytes = new Utf8Size().bytes(json);
		if (bytes + ENVELOPE_BYTES > maxBytes)
			throw new MatchService.Failure("RECOVERY_LIMIT");
		String checksum = new JsonDigest().sha256(json);
		return new Encoded(PREFIX + json + CHECKSUM + checksum + SUFFIX, checksum, (int) bytes + ENVELOPE_BYTES);
	}

	record Encoded(String envelope, String checksum, int envelopeBytes) { }
}
