package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

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
public final class FirebaseV2PrincipalAuthenticator implements V2PrincipalAuthenticator, AutoCloseable {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final FirebaseSessionVerification verification;
	private final Clock clock;
	private final FirebaseAuth auth;
	private final String projectId;
	private final V2PrincipalDirectory principals;
	private final FirebaseProviderRuntime provider;
	private java.util.function.Consumer<ProviderSessionRejection> rejectionObserver = ignored -> { };

	public FirebaseV2PrincipalAuthenticator(String projectId, V2PrincipalDirectory principals) {
		if (projectId == null || projectId.isEmpty() || principals == null) throw new IllegalArgumentException("project and principal directory are required");
		this.projectId = projectId; this.principals = principals;
		this.clock = Clock.systemUTC(); this.verification = new FirebaseSessionVerification(System::nanoTime);
		this.provider = new FirebaseProviderRuntime(projectId); this.auth = provider.auth;
	}

	FirebaseV2PrincipalAuthenticator(FirebaseAuth auth, String projectId, V2PrincipalDirectory principals) {
		this(auth, projectId, principals, Clock.systemUTC(), System::nanoTime);
	}

	FirebaseV2PrincipalAuthenticator(FirebaseAuth auth, String projectId, V2PrincipalDirectory principals, Clock clock, LongSupplier nanos) {
		this(new FirebaseProviderRuntime(auth, nanos), projectId, principals, clock, nanos);
	}

	FirebaseV2PrincipalAuthenticator(FirebaseProviderRuntime provider, String projectId, V2PrincipalDirectory principals, Clock clock, LongSupplier nanos) {
		if (provider == null || provider.auth == null || projectId == null || projectId.isEmpty() || principals == null) throw new IllegalArgumentException("auth, project and principal directory are required");
		this.provider = provider; this.auth = provider.auth; this.projectId = projectId; this.principals = principals;
		this.clock = clock; this.verification = new FirebaseSessionVerification(nanos);
	}

	@Override public AuthenticatedPrincipal authenticate(String bearer) throws Rejected {
		long started = verification.begin();
		FirebaseProviderCircuitBreaker.Lease lease = null;
		FirebaseProviderTransport.Operation operation = null;
		VerifiedIdentity verified = null;
		try {
			lease = provider.breaker.acquire();
			operation = provider.transport.begin();
			FirebaseToken token;
			try (FirebaseProviderTransport.Operation scope = operation;
				BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.FIREBASE_LOOKUP)) {
				// Retain only trusted metadata before revocation can reject. A later key-cache
				// refresh must not prevent retirement of an explicitly rejected session.
				verified = identity(auth.verifyIdToken(bearer, false));
				token = auth.verifyIdToken(bearer, true);
			} catch (Exception failure) {
				provider.failedCredential(failure);
				if (provider.errors.availability(failure)) lease.unavailable();
				throw failure;
			}
			try { operation.requireCompleted(); } catch (FirebaseProviderFailure failure) { lease.unavailable(); throw failure; }
			VerifiedIdentity identity = identity(token);
			lease.success();
			return authenticateIdentity(identity, started);
		} catch (Exception failure) {
			if (operation != null) diagnostic("provider_operation", "http_" + operation.attempts() + "_responses_" + operation.statuses().size() + "_ms_" + operation.elapsedMillis());
			FirebaseProviderFailure transportFailure = provider.errors.transportFailure(failure);
			if (transportFailure != null) diagnostic("provider_transport", transportFailure.kind().name() + "_" + transportFailure.status());
			Throwable root = failure;
			for (int depth = 0; root.getCause() != null && depth < 31; depth++) root = root.getCause();
			diagnostic("provider_cause", root.getClass().getSimpleName());
			// A failed initial verification must also invalidate an already-known session. This
			// verification is local-only: without an active transport scope no key I/O can start.
			try {
				VerifiedIdentity known = verified == null ? identity(auth.verifyIdToken(bearer, false)) : verified;
				verification.forget(known);
				observe(known, provider.errors.identityRejection(failure));
			} catch (Exception ignored) { /* Untrusted input supplies no cache key or rejection observation. */ }
			diagnostic("provider", failure instanceof FirebaseAuthException firebase && firebase.getErrorCode() != null
				? firebase.getErrorCode().name() : failure.getClass().getSimpleName());
			throw new Rejected();
		} finally {
			if (operation != null) operation.close();
			if (lease != null) lease.denied(operation != null && operation.attempts() > 0);
		}
	}

	private VerifiedIdentity identity(FirebaseToken token) throws Rejected {
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
			return new VerifiedIdentity(issuer, token.getUid(), expiration, authenticatedAt);
		} catch (Rejected rejected) {
			throw rejected;
		} catch (Exception failure) {
			diagnostic("claims", failure.getClass().getSimpleName());
			throw new Rejected();
		}
	}

	private AuthenticatedPrincipal authenticateIdentity(VerifiedIdentity identity, long started) throws Rejected {
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
		FirebaseProviderCircuitBreaker.Lease lease = null;
		FirebaseProviderTransport.Operation operation = null;
		try {
			if (principal == null || !(("https://securetoken.google.com/" + projectId).equals(principal.issuer())) || principal.subject() == null || principal.authenticationTimeMillis() < 1
				|| principal.expiresAtMillis() <= clock.millis()) throw new Rejected();
			long started = verification.begin();
			boolean cached = verification.verified(principal);
			if (cached) {
				try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.FIREBASE_REUSE)) { /* Bounded count only. */ }
			}
			if (!cached) {
				lease = provider.breaker.acquire();
				operation = provider.transport.begin();
				UserRecord user;
				try (FirebaseProviderTransport.Operation scope = operation;
					BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.FIREBASE_LOOKUP)) {
					user = auth.getUser(principal.subject());
				} catch (Exception failure) {
					provider.failedCredential(failure);
					if (provider.errors.availability(failure)) lease.unavailable();
					observe(new VerifiedIdentity(principal.issuer(), principal.subject(), principal.expiresAtMillis(), principal.authenticationTimeMillis()), provider.errors.identityRejection(failure));
					throw failure;
				}
				try { operation.requireCompleted(); } catch (FirebaseProviderFailure failure) { lease.unavailable(); throw failure; }
				if (user == null || user.isDisabled() || user.getTokensValidAfterTimestamp() > principal.authenticationTimeMillis()) {
					if (user != null) rejectionObserver.accept(new ProviderSessionRejection(principal.issuer(), principal.subject(),
						user.isDisabled() ? Long.MAX_VALUE : user.getTokensValidAfterTimestamp()));
					throw new Rejected();
				}
				lease.success();
			}
			// Local account/identity lifecycle and scopes are still refreshed on every authorization call.
			AuthenticatedPrincipal current;
			try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.LOCAL_AUTHORIZATION)) {
				current = principals.reauthorize(principal);
			}
			if (current == null || principal.expiresAtMillis() <= clock.millis()) throw new Rejected();
			if (!cached) verification.remember(principal, started);
			return current;
		} catch (Rejected rejected) { verification.forget(principal); throw rejected;
		} catch (Exception failure) { verification.forget(principal); throw new Rejected();
		} finally {
			if (operation != null) operation.close();
			if (lease != null) lease.denied(operation != null && operation.attempts() > 0);
		}
	}

	@Override public void close() throws Exception { provider.close(); }
	@Override public void observeProviderRejection(java.util.function.Consumer<ProviderSessionRejection> observer) {
		if (observer == null) throw new IllegalArgumentException("Provider rejection observer required");
		rejectionObserver = observer;
	}
	private void observe(VerifiedIdentity identity, FirebaseProviderFailure.IdentityRejection reason) {
		if (reason == FirebaseProviderFailure.IdentityRejection.NONE) return;
		long before = reason == FirebaseProviderFailure.IdentityRejection.TOKEN_REVOKED
			? identity.authenticationTimeMillis + 1 : Long.MAX_VALUE;
		rejectionObserver.accept(new ProviderSessionRejection(identity.issuer, identity.subject, before));
	}

	/** Supplies a directory whose refresh checks Firebase lifecycle before local lifecycle and scope state. */
	public V2PrincipalDirectory liveDirectory() {
		return new V2PrincipalDirectory() {
			@Override public Snapshot authorizePublication(String matchId, Family family, java.util.List<Target> targets) throws SQLException {
				return principals.authorizePublication(matchId, family, targets);
			}
			@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws java.sql.SQLException, Rejected { return principals.authenticate(identity); }
			@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException, Rejected {
				return FirebaseV2PrincipalAuthenticator.this.reauthorize(principal);
			}
		};
	}
}
