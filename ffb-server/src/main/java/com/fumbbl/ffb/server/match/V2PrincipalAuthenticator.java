package com.fumbbl.ffb.server.match;

/** The v2 transport supplies a bearer token only to this verifier; it never supplies an account or role. */
public interface V2PrincipalAuthenticator {
	AuthenticatedPrincipal authenticate(String bearer) throws Rejected;

	default AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws Rejected { throw new Rejected(); }

	final class Rejected extends Exception {
		public Rejected() { super("Authentication rejected"); }
	}
}
