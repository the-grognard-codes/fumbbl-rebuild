package com.fumbbl.ffb.server.match;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Small in-memory identity of the exact last committed checkpoint, never a replacement for the artifact. */
final class RecoveryArtifactFingerprint {
	byte[] of(String artifact) {
		try { return MessageDigest.getInstance("SHA-256").digest(artifact.getBytes(StandardCharsets.UTF_8)); }
		catch (NoSuchAlgorithmException unavailable) { throw new IllegalStateException("SHA-256 unavailable", unavailable); }
	}
}
