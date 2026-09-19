package com.fumbbl.ffb.server.match;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;

/**
 * Firebase Admin token verifier for the marker-6 authority. Revocation is checked while a bearer
 * first enters this boundary. Operation-time checks retain only expiry, provider identifiers and auth_time,
 * then use Firebase's non-secret account lifecycle state without retaining a bearer.
 */
public final class FirebaseV2PrincipalAuthenticator implements V2PrincipalAuthenticator {
	private final FirebaseAuth auth;
	private final String projectId;
	private final V2PrincipalDirectory principals;

	public FirebaseV2PrincipalAuthenticator(String projectId, V2PrincipalDirectory principals) {
		if (projectId == null || projectId.isEmpty() || principals == null) throw new IllegalArgumentException("project and principal directory are required");
		this.projectId = projectId; this.principals = principals;
		try {
			FirebaseOptions options = FirebaseOptions.builder().setCredentials(GoogleCredentials.getApplicationDefault()).setProjectId(projectId).build();
			auth = FirebaseAuth.getInstance(FirebaseApp.initializeApp(options, "ffb-browser-v2-" + projectId));
		} catch (Exception failure) { throw new IllegalStateException("Firebase Admin initialization failed"); }
	}

	FirebaseV2PrincipalAuthenticator(FirebaseAuth auth, String projectId, V2PrincipalDirectory principals) {
		if (auth == null || projectId == null || projectId.isEmpty() || principals == null) throw new IllegalArgumentException("auth, project and principal directory are required");
		this.auth = auth; this.projectId = projectId; this.principals = principals;
	}

	@Override public AuthenticatedPrincipal authenticate(String bearer) throws Rejected {
		try {
			FirebaseToken token = auth.verifyIdToken(bearer, true);
			String issuer = "https://securetoken.google.com/" + projectId;
			Object audience = token.getClaims().get("aud"); Object claimedIssuer = token.getClaims().get("iss"); Object expires = token.getClaims().get("exp"); Object authenticationTime = token.getClaims().get("auth_time");
			if (!issuer.equals(claimedIssuer) || !projectId.equals(audience) || token.getUid() == null || token.getUid().isEmpty() || !(expires instanceof Number) || !(authenticationTime instanceof Number)) throw new Rejected();
			long expiration = ((Number) expires).longValue() * 1000L;
			long authenticatedAt = ((Number) authenticationTime).longValue() * 1000L;
			if (expiration <= System.currentTimeMillis() || authenticatedAt < 1 || authenticatedAt > expiration) throw new Rejected();
			return principals.authenticate(new VerifiedIdentity(issuer, token.getUid(), expiration, authenticatedAt));
		} catch (Rejected rejected) { throw rejected;
		} catch (FirebaseAuthException failure) { throw new Rejected();
		} catch (Exception failure) { throw new Rejected(); }
	}

	@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws Rejected {
		try {
			if (principal == null || !(("https://securetoken.google.com/" + projectId).equals(principal.issuer())) || principal.subject() == null || principal.authenticationTimeMillis() < 1) throw new Rejected();
			UserRecord user = auth.getUser(principal.subject());
			if (user == null || user.isDisabled() || user.getTokensValidAfterTimestamp() > principal.authenticationTimeMillis()) throw new Rejected();
			return principals.reauthorize(principal);
		} catch (Rejected rejected) { throw rejected;
		} catch (Exception failure) { throw new Rejected(); }
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
