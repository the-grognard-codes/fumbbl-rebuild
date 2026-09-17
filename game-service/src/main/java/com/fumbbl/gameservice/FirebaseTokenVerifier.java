package com.fumbbl.gameservice;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.google.auth.oauth2.GoogleCredentials;

public final class FirebaseTokenVerifier implements TokenVerifier {
	private final FirebaseAuth auth;
	private final String projectId;

	public FirebaseTokenVerifier(String projectId) {
		this.projectId = projectId;
		try {
			FirebaseOptions options = FirebaseOptions.builder().setCredentials(GoogleCredentials.getApplicationDefault()).setProjectId(projectId).build();
			FirebaseApp app = FirebaseApp.initializeApp(options, "game-service-" + projectId);
			auth = FirebaseAuth.getInstance(app);
		} catch (Exception e) { throw new IllegalStateException("Firebase ADC initialization failed", e); }
	}

	FirebaseTokenVerifier(FirebaseAuth auth, String projectId) {
		if (auth == null || projectId == null || projectId.isEmpty()) throw new IllegalArgumentException("auth and projectId are required");
		this.auth = auth;
		this.projectId = projectId;
	}

	@Override
	public Identity verify(String token) throws TokenRejectedException {
		try {
			FirebaseToken verified = auth.verifyIdToken(token, true);
			// Firebase Admin verifies signature, expiry, audience and issuer before returning a FirebaseToken.
			String issuer = "https://securetoken.google.com/" + projectId;
			if (!issuer.equals(verified.getClaims().get("iss")) || !projectId.equals(verified.getClaims().get("aud"))) throw new TokenRejectedException(false);
			if (verified.getUid() == null || verified.getUid().isEmpty()) throw new TokenRejectedException(false);
			Object expires = verified.getClaims().get("exp");
			if (!(expires instanceof Number)) throw new TokenRejectedException(false);
			if (((Number) expires).longValue() <= System.currentTimeMillis() / 1000L) throw new TokenRejectedException(true);
			return new Identity(issuer, verified.getUid(), ((Number) expires).longValue() * 1000L);
		} catch (TokenRejectedException e) { throw e;
		} catch (FirebaseAuthException e) {
			throw new TokenRejectedException(AuthErrorCode.EXPIRED_ID_TOKEN.equals(e.getAuthErrorCode()));
		} catch (Exception e) {
			throw new TokenRejectedException(false);
		}
	}
}
