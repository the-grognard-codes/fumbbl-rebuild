package com.fumbbl.ffb.server.match;

/** A v2 account-to-match association; the role is server routing data, never client input. */
public final class MatchMembership {
	public final String matchId;
	public final String accountId;
	public final String role;

	public MatchMembership(String matchId, String accountId, String role) {
		if (!validId(matchId) || !validId(accountId) || (!"home".equals(role) && !"away".equals(role)))
			throw new IllegalArgumentException("Invalid match membership");
		this.matchId = matchId;
		this.accountId = accountId;
		this.role = role;
	}

	private static boolean validId(String value) {
		try { return value != null && java.util.UUID.fromString(value).toString().equals(value); }
		catch (IllegalArgumentException invalid) { return false; }
	}
}
