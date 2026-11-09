package com.fumbbl.ffb.server.match;

/** Resolves a successfully verified provider identity to the single marker-6 authorization authority. */
public interface V2PrincipalDirectory {
	final class CreationOutcomeUnknown extends java.sql.SQLException {
		public CreationOutcomeUnknown(java.sql.SQLException cause) { super("Account creation outcome unknown; authenticate again", cause); }
	}
	AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected;
	AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected;
}
