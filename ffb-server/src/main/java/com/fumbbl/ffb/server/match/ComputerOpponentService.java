package com.fumbbl.ffb.server.match;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.UUID;

/** Computer coach definitions and the separate WebSocket service credential. */
public final class ComputerOpponentService {
	public static final String BUGMAN_ID = "coach-bugman-random";
	public static final String BUGMAN_NAME = "Gobbo \u201cWot Now?\u201d Snotpick";
	public static final String LEGACY_BUGMAN_NAME = "Coach Bugman - Random";
	public static final String BUGMAN_TEAM_NAME = "Bugman's Best";
	public static final String BOGRUK_ID = "coach-bogruk-weak";
	public static final String BOGRUK_NAME = "Bogruk the Almost Clever";
	public static final String BOGRUK_TEAM_NAME = "Bogruk's Almost Best";
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

	public boolean supports(String id) { return BUGMAN_ID.equals(id) || BOGRUK_ID.equals(id); }
	public String memberId() { return memberId; }
	public String cloneTeamId(String matchId) {
		return cloneTeamId(matchId, BUGMAN_ID);
	}
	public String cloneTeamId(String matchId, String opponentId) throws IllegalArgumentException {
		if (!supports(opponentId)) throw new IllegalArgumentException("Unknown computer coach");
		return UUID.nameUUIDFromBytes(("computer-team\n" + opponentId + "\n" + matchId)
			.getBytes(StandardCharsets.UTF_8)).toString();
	}
	public String teamName(String opponentId) throws IllegalArgumentException {
		if (!supports(opponentId)) throw new IllegalArgumentException("Unknown computer coach");
		return BOGRUK_ID.equals(opponentId) ? BOGRUK_TEAM_NAME : BUGMAN_TEAM_NAME;
	}
	public String coachName(String opponentId) throws IllegalArgumentException {
		if (!supports(opponentId)) throw new IllegalArgumentException("Unknown computer coach");
		return BOGRUK_ID.equals(opponentId) ? BOGRUK_NAME : BUGMAN_NAME;
	}
	public ComputerCoach identity(String matchId, String opponentId) throws IllegalArgumentException {
		return new ComputerCoach(opponentId, BOGRUK_ID.equals(opponentId) ? "bogruk-v1" : "random-v1",
			matchId.hashCode() & 0xffffffffL);
	}
	/** Legacy Bugman documents predate explicit policy identity. Never infer Bogruk from a display name. */
	public ComputerCoach coach(MatchDocument document) {
		if (document.away == null) return null;
		ComputerCoach coach = document.computer == null ? identity(document.matchId, BUGMAN_ID) : document.computer;
		return teamName(coach.opponentId).equals(document.away.team.teamName)
			&& cloneTeamId(document.matchId, coach.opponentId).equals(document.away.team.sourceTeamId) ? coach : null;
	}
}
