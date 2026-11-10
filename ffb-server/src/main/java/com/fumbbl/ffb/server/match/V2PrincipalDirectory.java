package com.fumbbl.ffb.server.match;

import java.sql.SQLException;
import java.util.List;

/** Resolves a successfully verified provider identity to the single marker-6 authorization authority. */
public interface V2PrincipalDirectory extends V2PublicationAuthorization {
	final class CreationOutcomeUnknown extends SQLException {
		public CreationOutcomeUnknown(SQLException cause) { super("Account creation outcome unknown; authenticate again", cause); }
	}
	AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws SQLException, V2PrincipalAuthenticator.Rejected;
	AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws SQLException, V2PrincipalAuthenticator.Rejected;
	/** Implementations must supply a genuinely local batch; an incoming reauthorization loop is forbidden. */
	@Override default Snapshot authorizePublication(String matchId, Family family, List<Target> targets) throws SQLException {
		throw new SQLException("Local publication authorization is unavailable");
	}
}
