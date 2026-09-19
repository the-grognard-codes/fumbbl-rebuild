package com.fumbbl.ffb.server.match;

import java.sql.SQLException;
import java.util.List;

/** Authorization-before-read boundary for the separately versioned browser runtime. */
public final class V2MatchAccess {
	private final MatchMembershipRepository memberships;
	private final V2PrincipalDirectory directory;
	private final java.time.Clock clock;

	public V2MatchAccess(MatchMembershipRepository memberships, V2PrincipalDirectory directory, java.time.Clock clock) {
		this.memberships = memberships; this.directory = directory; this.clock = clock;
	}

	/** Resolves the only engine role a player path may use after scope and membership checks. */
	public String playerRole(AuthenticatedPrincipal principal, String matchId) throws SQLException {
		principal = require(principal, ApplicationScope.PLAYER);
		MatchMembership membership = memberships.find(matchId, principal.accountId());
		if (membership == null) throw new MatchService.Failure("NOT_FOUND");
		return membership.role;
	}

	/** Authorizes a spectator snapshot without revealing unregistered or non-visible match identifiers. */
	public void spectatorSnapshot(AuthenticatedPrincipal principal, String matchId) throws SQLException {
		require(principal, ApplicationScope.SPECTATOR);
		if (!memberships.isActive(matchId)) throw new MatchService.Failure("NOT_FOUND");
	}

	/** Browse is scope-gated before the first visibility read and returns only v2-registered matches. */
	public String opponentAccount(AuthenticatedPrincipal principal, String matchId) throws SQLException {
		if (!"home".equals(playerRole(principal, matchId))) throw new MatchService.Failure("AUTHORIZATION");
		return memberships.accountForRole(matchId, "away");
	}

	public List<String> browse(AuthenticatedPrincipal principal) throws SQLException {
		require(principal, ApplicationScope.SPECTATOR);
		return memberships.activeMatches();
	}

	public AuthenticatedPrincipal require(AuthenticatedPrincipal principal, ApplicationScope scope) throws SQLException {
		if (principal == null || principal.expiresAtMillis() <= clock.millis()) throw new MatchService.Failure("AUTHENTICATION_REQUIRED");
		try { principal = directory.reauthorize(principal); }
		catch (V2PrincipalAuthenticator.Rejected rejected) { throw new MatchService.Failure("AUTHENTICATION_REQUIRED"); }
		if (!principal.hasScope(scope)) throw new MatchService.Failure("AUTHORIZATION");
		return principal;
	}
}
