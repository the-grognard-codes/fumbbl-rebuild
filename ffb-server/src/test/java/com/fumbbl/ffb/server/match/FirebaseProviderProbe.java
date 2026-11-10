package com.fumbbl.ffb.server.match;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.auth.FirebaseAuth;

import java.time.Clock;
import java.util.EnumSet;

/** Test-only bridge from the real TLS/DNS fixture to package-private production policy. */
public final class FirebaseProviderProbe {
	private final FirebaseProviderTransport transport;
	private final FirebaseProviderCredentials credentials;
	private final FirebaseProviderBounds bounds;
	public FirebaseProviderProbe(FirebaseProviderTransport transport) {
		this(transport, new FirebaseProviderBounds(1_000, 200, 250, 3, 5_000));
	}
	public FirebaseProviderProbe(FirebaseProviderTransport transport, FirebaseProviderBounds bounds) {
		this.transport = transport; this.bounds = bounds; this.credentials = new FirebaseProviderCredentials(bounds, transport);
	}
	public GoogleCredentials bind(GoogleCredentials source) { return credentials.bind(source); }
	public AuthenticatedPrincipal knownPrincipal(String project) {
		return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", EnumSet.of(ApplicationScope.PLAYER), System.currentTimeMillis() + 3_600_000,
			"https://securetoken.google.com/" + project, "synthetic", 100);
	}
	public AuthenticatedPrincipal principal(String project, String account, String subject, long authenticatedAt, long expires) {
		return new AuthenticatedPrincipal(account, EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), expires,
			"https://securetoken.google.com/" + project, subject, authenticatedAt);
	}
	public ProviderSessionRejection rejection(String project, String subject, long before) {
		return new ProviderSessionRejection("https://securetoken.google.com/" + project, subject, before);
	}
	public FirebaseV2PrincipalAuthenticator verifier(FirebaseAuth auth, String project) {
		V2PrincipalDirectory directory = new V2PrincipalDirectory() {
			@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) {
				return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", EnumSet.of(ApplicationScope.PLAYER), identity.expiresAtMillis, identity.issuer, identity.subject, identity.authenticationTimeMillis);
			}
			@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) { return principal; }
		};
		return new FirebaseV2PrincipalAuthenticator(new FirebaseProviderRuntime(auth, transport, bounds, credentials, System::nanoTime), project, directory, Clock.systemUTC(), System::nanoTime);
	}
}
