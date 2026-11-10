package com.fumbbl.ffb.server.match;

/** The v2 transport supplies a bearer token only to this verifier; it never supplies an account or role. */
public interface V2PrincipalAuthenticator {
	AuthenticatedPrincipal authenticate(String bearer) throws Rejected;

	default AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws Rejected { throw new Rejected(); }
	/** Observations are synchronous on incoming authorization, never initiated to authorize a push. */
	default void observeProviderRejection(java.util.function.Consumer<ProviderSessionRejection> observer) { }

	final class Rejected extends Exception {
		public Rejected() { super("Authentication rejected"); }
	}
}
