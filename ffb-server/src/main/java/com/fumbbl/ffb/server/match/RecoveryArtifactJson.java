package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.nio.charset.StandardCharsets;

/** Encodes an already ordered recovery payload using the existing envelope contract. */
final class RecoveryArtifactJson {
	private static final String PREFIX = "{\"payload\":";
	private static final String CHECKSUM = ",\"sha256\":\"";
	private static final String SUFFIX = "\"}";
	private static final int ENVELOPE_BYTES = PREFIX.length() + CHECKSUM.length() + 64 + SUFFIX.length();

	String encode(JsonObject payload, int maxBytes) {
		// Use exactly the same minimal-json text for the checksum and the envelope. Rewriting
		// the tree for the envelope otherwise traverses all native and transcript history twice.
		String json = payload.toString();
		byte[] encoded = json.getBytes(StandardCharsets.UTF_8);
		if ((long) encoded.length + ENVELOPE_BYTES > maxBytes)
			throw new MatchService.Failure("RECOVERY_LIMIT");
		String checksum = new JsonDigest().sha256(encoded);
		return PREFIX + json + CHECKSUM + checksum + SUFFIX;
	}
}
