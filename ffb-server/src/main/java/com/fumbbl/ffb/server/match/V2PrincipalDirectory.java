package com.fumbbl.ffb.server.match;

/** Resolves a successfully verified provider identity to the single marker-6 authorization authority. */
public interface V2PrincipalDirectory {
	AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected;
	AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected;
}
