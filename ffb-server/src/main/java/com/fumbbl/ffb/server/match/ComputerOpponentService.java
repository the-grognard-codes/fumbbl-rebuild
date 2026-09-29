package com.fumbbl.ffb.server.match;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.UUID;

/** Computer coach definitions and the separate WebSocket service credential. */
public final class ComputerOpponentService {
	public static final String BUGMAN_ID = "coach-bugman-random";
	public static final String BUGMAN_NAME = "Coach Bugman - Random";
	public static final String BUGMAN_TEAM_NAME = "Bugman's Best";
	private final byte[] tokenHash;
	private final String memberId = UUID.nameUUIDFromBytes(
		("computer-opponent\n" + BUGMAN_ID).getBytes(StandardCharsets.UTF_8)).toString();

	public ComputerOpponentService(String hash) {
		if (hash == null || hash.trim().isEmpty()) { tokenHash = null; return; }
		if (!hash.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("Invalid computer service token hash");
		tokenHash = new byte[32];
		for (int index = 0; index < tokenHash.length; index++)
			tokenHash[index] = (byte) Integer.parseInt(hash.substring(index * 2, index * 2 + 2), 16);
	}

	public boolean authenticate(String token) {
		if (tokenHash == null || token == null || !token.matches("[A-Za-z0-9_-]{43}")) return false;
		try {
			if (Base64.getUrlDecoder().decode(token).length != 32) return false;
			return MessageDigest.isEqual(tokenHash, MessageDigest.getInstance("SHA-256")
				.digest(token.getBytes(StandardCharsets.US_ASCII)));
		} catch (IllegalArgumentException | NoSuchAlgorithmException invalid) { return false; }
	}

	public boolean supports(String id) { return BUGMAN_ID.equals(id); }
	public String memberId() { return memberId; }
	public String cloneTeamId(String matchId) {
		return UUID.nameUUIDFromBytes(("computer-team\n" + BUGMAN_ID + "\n" + matchId)
			.getBytes(StandardCharsets.UTF_8)).toString();
	}
}
