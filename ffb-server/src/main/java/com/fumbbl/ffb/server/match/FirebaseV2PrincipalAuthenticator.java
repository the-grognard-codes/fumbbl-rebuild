package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;

import java.sql.SQLException;
import java.time.Clock;
import java.util.function.LongSupplier;

/**
 * Firebase Admin token verifier for the marker-6 authority. Revocation is checked while a bearer
 * first enters this boundary. Operation-time checks retain only expiry, provider identifiers and auth_time,
 * then reuse a positive provider lifecycle check for at most five seconds without retaining a bearer.
 * Expiration and local account/identity/scopes are checked on every operation.
 */
public final class FirebaseV2PrincipalAuthenticator implements V2PrincipalAuthenticator {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final FirebaseSessionVerification verification;
	private final Clock clock;
	private final FirebaseAuth auth;
	private final String projectId;
	private final V2PrincipalDirectory principals;

	public FirebaseV2PrincipalAuthenticator(String projectId, V2PrincipalDirectory principals) {
		if (projectId == null || projectId.isEmpty() || principals == null) throw new IllegalArgumentException("project and principal directory are required");
		this.projectId = projectId; this.principals = principals;
		this.clock = Clock.systemUTC(); this.verification = new FirebaseSessionVerification(System::nanoTime);
		try {
			FirebaseOptions options = FirebaseOptions.builder().setCredentials(GoogleCredentials.getApplicationDefault()).setProjectId(projectId).build();
			auth = FirebaseAuth.getInstance(FirebaseApp.initializeApp(options, "ffb-browser-v2-" + projectId));
		} catch (Exception failure) { throw new IllegalStateException("Firebase Admin initialization failed"); }
	}

	FirebaseV2PrincipalAuthenticator(FirebaseAuth auth, String projectId, V2PrincipalDirectory principals) {
		this(auth, projectId, principals, Clock.systemUTC(), System::nanoTime);
	}

	FirebaseV2PrincipalAuthenticator(FirebaseAuth auth, String projectId, V2PrincipalDirectory principals, Clock clock, LongSupplier nanos) {
		if (auth == null || projectId == null || projectId.isEmpty() || principals == null) throw new IllegalArgumentException("auth, project and principal directory are required");
		this.auth = auth; this.projectId = projectId; this.principals = principals;
		this.clock = clock; this.verification = new FirebaseSessionVerification(nanos);
	}

	@Override public AuthenticatedPrincipal authenticate(String bearer) throws Rejected {
		long started = verification.begin();
		FirebaseToken token;
		try {
			token = auth.verifyIdToken(bearer, true);
		} catch (FirebaseAuthException failure) {
			diagnostic("provider", failure.getErrorCode() == null ? null : failure.getErrorCode().name());
			throw new Rejected();
		} catch (Exception failure) {
			diagnostic("provider", failure.getClass().getSimpleName());
			throw new Rejected();
		}
		VerifiedIdentity identity;
		try {
			String issuer = "https://securetoken.google.com/" + projectId;
			Object audience = token.getClaims().get("aud"); Object claimedIssuer = token.getClaims().get("iss"); Object expires = token.getClaims().get("exp"); Object authenticationTime = token.getClaims().get("auth_time");
			if (!issuer.equals(claimedIssuer) || !projectId.equals(audience) || token.getUid() == null || token.getUid().isEmpty() || !(expires instanceof Number) || !(authenticationTime instanceof Number)) {
				diagnostic("claims", "rejected");
				throw new Rejected();
			}
			long expiration = ((Number) expires).longValue() * 1000L;
			long authenticatedAt = ((Number) authenticationTime).longValue() * 1000L;
			if (expiration <= clock.millis() || authenticatedAt < 1 || authenticatedAt > expiration) {
				diagnostic("time_claims", "rejected");
				throw new Rejected();
			}
			identity = new VerifiedIdentity(issuer, token.getUid(), expiration, authenticatedAt);
		} catch (Rejected rejected) {
			throw rejected;
		} catch (Exception failure) {
			diagnostic("claims", failure.getClass().getSimpleName());
			throw new Rejected();
		}
		try {
			AuthenticatedPrincipal principal = principals.authenticate(identity);
			if (principal == null || principal.expiresAtMillis() <= clock.millis()) throw new Rejected();
			verification.remember(principal, started);
			return principal;
		} catch (SQLException failure) {
			diagnostic("principal_directory_sql", "state_" + failure.getSQLState() + "_" + failure.getClass().getSimpleName());
			throw new Rejected();
		} catch (Rejected rejected) {
			diagnostic("principal_directory", "rejected");
			throw rejected;
		} catch (Exception failure) {
			diagnostic("principal_directory", failure.getClass().getSimpleName());
			throw new Rejected();
		}
	}

	private static void diagnostic(String stage, String code) {
		if (!Boolean.getBoolean("ffb.v2.auth.diagnostics")) return;
		String safeCode = code == null ? "unspecified" : code.replaceAll("[^A-Za-z0-9_.-]", "_");
		if (safeCode.length() > 64) safeCode = safeCode.substring(0, 64);
		System.err.println("FFB_V2_AUTH_DIAGNOSTIC stage=" + stage + " code=" + safeCode);
	}

	@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws Rejected {
		try {
			if (principal == null || !(("https://securetoken.google.com/" + projectId).equals(principal.issuer())) || principal.subject() == null || principal.authenticationTimeMillis() < 1
				|| principal.expiresAtMillis() <= clock.millis()) throw new Rejected();
			long started = verification.begin();
			boolean cached = verification.verified(principal);
			if (!cached) {
				UserRecord user;
				try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.FIREBASE_LOOKUP)) {
					user = auth.getUser(principal.subject());
				}
				if (user == null || user.isDisabled() || user.getTokensValidAfterTimestamp() > principal.authenticationTimeMillis()) throw new Rejected();
			}
			// Local account/identity lifecycle and scopes are still refreshed on every authorization call.
			AuthenticatedPrincipal current = principals.reauthorize(principal);
			if (current == null || principal.expiresAtMillis() <= clock.millis()) throw new Rejected();
			if (!cached) verification.remember(principal, started);
			return current;
		} catch (Rejected rejected) { verification.forget(principal); throw rejected;
		} catch (Exception failure) { verification.forget(principal); throw new Rejected(); }
	}

	/** Supplies a directory whose refresh checks Firebase lifecycle before local lifecycle and scope state. */
	public V2PrincipalDirectory liveDirectory() {
		return new V2PrincipalDirectory() {
			@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws java.sql.SQLException, Rejected { return principals.authenticate(identity); }
			@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException, Rejected {
				return FirebaseV2PrincipalAuthenticator.this.reauthorize(principal);
			}
		};
	}
}
