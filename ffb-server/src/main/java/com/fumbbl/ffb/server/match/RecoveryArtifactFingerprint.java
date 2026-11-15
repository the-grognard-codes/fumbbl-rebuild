package com.fumbbl.ffb.server.match;

/** Small in-memory identity of the exact last committed checkpoint, never a replacement for the artifact. */
final class RecoveryArtifactFingerprint {
	byte[] of(String artifact) {
		return new JsonDigest().sha256Bytes(artifact);
	}
}
