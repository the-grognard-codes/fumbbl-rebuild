package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;
import com.fumbbl.ffb.server.db.JdbcConnections;

import java.sql.SQLException;
import java.time.Clock;
import java.util.List;
import java.util.Map;

/** Authorization-before-read boundary for the separately versioned browser runtime. */
public final class V2MatchAccess {
	/** A best-effort push cannot fit this task; it supplies no evidence of recipient revocation. */
	public static final class PublicationDeferred extends RuntimeException {
		private PublicationDeferred() { super("Publication request budget exhausted"); }
	}
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final MatchMembershipRepository memberships;
	private final V2PrincipalDirectory directory;
	private final Clock clock;

	public V2MatchAccess(MatchMembershipRepository memberships, V2PrincipalDirectory directory, Clock clock) {
		this.memberships = memberships; this.directory = directory; this.clock = clock;
	}

	public V2PublicationAuthorization.Snapshot publication(String matchId, V2PublicationAuthorization.Family family,
		List<V2PublicationAuthorization.Target> targets) throws SQLException {
		if (targets.size() > V2PublicationAuthorization.MAX_TARGETS) throw new MatchService.Failure("VIEW_UNAVAILABLE");
		if (targets.isEmpty()) return new V2PublicationAuthorization.Snapshot(Map.of());
		requirePublicationBudget();
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.LOCAL_AUTHORIZATION)) {
			V2PublicationAuthorization.Snapshot snapshot = directory.authorizePublication(matchId, family, List.copyOf(targets));
			if (snapshot == null) throw new SQLException("Local publication authorization is unavailable");
			return snapshot;
		} catch (JdbcConnections.NotStarted | JdbcConnections.DeadlineExpired exhausted) {
			// These typed failures identify the originating request allowance, not a database outage.
			throw new PublicationDeferred();
		}
	}

	/** Recheck expiry immediately before enqueueing; a batch read never extends the original token. */
	public String publicationRole(V2PublicationAuthorization.Snapshot snapshot, V2PublicationAuthorization.Target target, int slot) {
		if (snapshot == null || target.principal() != null && target.principal().expiresAtMillis() <= clock.millis()) throw new MatchService.Failure("VIEW_UNAVAILABLE");
		String role = snapshot.role(slot);
		boolean allowed = switch (target.audience()) {
			case SPECTATOR -> "spectator".equals(role);
			case PLAYER -> "home".equals(role) || "away".equals(role);
			case COMPUTER -> "away".equals(role);
		};
		if (!allowed) throw new MatchService.Failure("VIEW_UNAVAILABLE");
		requirePublicationBudget();
		return role;
	}
	private void requirePublicationBudget() {
		if (timing.budget() != null && timing.budget().remainingNanos() == 0) throw new PublicationDeferred();
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

	/** Public history remains readable after full time for a registered match. */
	public void spectatorTranscript(AuthenticatedPrincipal principal, String matchId) throws SQLException {
		require(principal, ApplicationScope.SPECTATOR);
		if (!memberships.hasMatch(matchId)) throw new MatchService.Failure("NOT_FOUND");
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

	/** Account-scoped, keyset-paged inventory, including preparations that are not activated yet. */
	public List<MatchMembership> currentMatches(AuthenticatedPrincipal principal, String afterMatchId) throws SQLException {
		principal = require(principal, ApplicationScope.PLAYER);
		return memberships.unfinishedMatches(principal.accountId(), afterMatchId);
	}

	public AuthenticatedPrincipal require(AuthenticatedPrincipal principal, ApplicationScope scope) throws SQLException {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.AUTHORIZATION)) {
			if (principal == null || principal.expiresAtMillis() <= clock.millis()) throw new MatchService.Failure("AUTHENTICATION_REQUIRED");
			try { principal = directory.reauthorize(principal); }
			catch (V2PrincipalAuthenticator.Rejected rejected) { throw new MatchService.Failure("AUTHENTICATION_REQUIRED"); }
			if (!principal.hasScope(scope)) throw new MatchService.Failure("AUTHORIZATION");
			return principal;
		}
	}
}
