package com.fumbbl.ffb.server.match;

/** Resolves a successfully verified provider identity to the single marker-6 authorization authority. */
public interface V2PrincipalDirectory extends V2PublicationAuthorization {
	final class CreationOutcomeUnknown extends java.sql.SQLException {
		public CreationOutcomeUnknown(java.sql.SQLException cause) { super("Account creation outcome unknown; authenticate again", cause); }
	}
	AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected;
	AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected;
	/** Implementations must supply a genuinely local batch; an incoming reauthorization loop is forbidden. */
	@Override default Snapshot authorizePublication(String matchId, Family family, java.util.List<Target> targets) throws java.sql.SQLException {
		throw new java.sql.SQLException("Local publication authorization is unavailable");
	}
}
