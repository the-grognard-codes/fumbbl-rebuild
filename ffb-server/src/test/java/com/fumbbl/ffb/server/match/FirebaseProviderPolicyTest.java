package com.fumbbl.ffb.server.match;

import com.google.firebase.ErrorCode;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;

import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.time.Clock;
import java.util.EnumSet;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FirebaseProviderPolicyTest {
	@Test void outageAcrossIdentitiesOpensDependencyBreakerAndAllowsOneMonotonicProbe() throws Exception {
		AtomicLong nanos = new AtomicLong(); FirebaseAuth auth = mock(FirebaseAuth.class);
		when(auth.getUser(anyString())).thenThrow(new IllegalStateException(new ConnectException("synthetic")));
		FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(auth, "project", directory(), Clock.systemUTC(), nanos::get);
		for (int index = 0; index < 128; index++) {
			AuthenticatedPrincipal principal = principal("subject-" + index);
			assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal));
		}
		verify(auth, times(3)).getUser(anyString());
		nanos.set(4_999_999_999L);
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("early")));
		verify(auth, times(3)).getUser(anyString());
		nanos.incrementAndGet();
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("failed-probe")));
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("blocked")));
		verify(auth, times(4)).getUser(anyString());
		nanos.addAndGet(5_000_000_000L); doReturn(mock(UserRecord.class)).when(auth).getUser(anyString());
		verifier.reauthorize(principal("recovery")); verifier.reauthorize(principal("other"));
		verify(auth, times(6)).getUser(anyString());
	}

	@Test void ordinaryDenialsNeverOpenOrHealAndOnlyOneRecoveryProbeIsAdmitted() throws Exception {
		AtomicLong nanos = new AtomicLong(); FirebaseProviderBounds bounds = new FirebaseProviderBounds();
		FirebaseProviderCircuitBreaker breaker = new FirebaseProviderCircuitBreaker(bounds, nanos::get);
		breaker.acquire().unavailable(); breaker.acquire().close(); breaker.acquire().unavailable();
		breaker.acquire().close(); breaker.acquire().unavailable();
		assertThrows(FirebaseProviderFailure.class, breaker::acquire);
		nanos.set(5_000_000_000L); FirebaseProviderCircuitBreaker.Lease probe = breaker.acquire();
		assertThrows(FirebaseProviderFailure.class, breaker::acquire);
		probe.close();
		FirebaseProviderCircuitBreaker.Lease nextProbe = breaker.acquire();
		assertThrows(FirebaseProviderFailure.class, breaker::acquire); // Denial did not heal the open breaker.
		nextProbe.unavailable(); assertThrows(FirebaseProviderFailure.class, breaker::acquire);
		nanos.addAndGet(5_000_000_000L); breaker.acquire().success();
		try (FirebaseProviderCircuitBreaker.Lease recovered = breaker.acquire()) { recovered.success(); }
	}
	@Test void revokedProbeDoesNotDelayTheNextValidIdentityOrCacheTheDeniedIdentity() throws Exception {
		AtomicLong nanos = new AtomicLong(); FirebaseAuth auth = mock(FirebaseAuth.class);
		when(auth.getUser(anyString())).thenThrow(new IllegalStateException(new ConnectException("synthetic")));
		FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(auth, "project", directory(), Clock.systemUTC(), nanos::get);
		for (int index = 0; index < 3; index++) assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("outage")));
		nanos.addAndGet(5_000_000_000L);
		UserRecord disabled = mock(UserRecord.class); when(disabled.isDisabled()).thenReturn(true);
		doReturn(disabled).when(auth).getUser("disabled");
		doReturn(mock(UserRecord.class)).when(auth).getUser("valid");
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("disabled")));
		verifier.reauthorize(principal("valid")); // Same monotonic instant, without another cooldown.
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("disabled")));
		verify(auth, times(2)).getUser("disabled"); verify(auth).getUser("valid");
	}

	@Test void successfulProviderCheckResetsOutageStreakEvenWhenTheLocalDatabaseRejects() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class); UserRecord healthy = mock(UserRecord.class);
		IllegalStateException unavailable = new IllegalStateException(new ConnectException());
		when(auth.getUser(anyString())).thenThrow(unavailable).thenThrow(unavailable).thenReturn(healthy).thenThrow(unavailable).thenReturn(healthy);
		V2PrincipalDirectory localDenied = new V2PrincipalDirectory() {
			@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws V2PrincipalAuthenticator.Rejected { throw new V2PrincipalAuthenticator.Rejected(); }
			@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException { throw new java.sql.SQLException("synthetic local database failure"); }
		};
		FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(auth, "project", localDenied);
		for (int index = 0; index < 5; index++) {
			AuthenticatedPrincipal principal = principal("subject-" + index);
			assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal));
		}
		verify(auth, times(5)).getUser(anyString());
	}

	@Test void positiveSessionReuseSurvivesOtherIdentitiesOutageButNeverExtendsItsWindow() throws Exception {
		AtomicLong nanos = new AtomicLong(); FirebaseAuth auth = mock(FirebaseAuth.class);
		when(auth.getUser("healthy")).thenReturn(mock(UserRecord.class));
		FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(auth, "project", directory(), Clock.systemUTC(), nanos::get);
		verifier.reauthorize(principal("healthy"));
		when(auth.getUser("outage")).thenThrow(new IllegalStateException(new IOException()));
		for (int index = 0; index < 3; index++) assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("outage")));
		nanos.set(4_999_999_999L); verifier.reauthorize(principal("healthy"));
		nanos.incrementAndGet(); // Breaker cooldown began at zero too; failed probe invalidates this identity.
		when(auth.getUser("healthy")).thenThrow(new IllegalStateException(new IOException()));
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("healthy")));
		verify(auth, times(2)).getUser("healthy");
	}

	@Test void typedHttpFailuresTakePrecedenceOverSdkWrappingAndIdentityErrorsAreNotOutages() {
		FirebaseProviderErrors errors = new FirebaseProviderErrors();
		for (int status : new int[] {408, 429, 500, 503}) assertTrue(errors.isAvailabilityFailure(new IOException(FirebaseProviderFailure.response(status, new byte[0], false))));
		for (int status : new int[] {301, 400, 401, 403, 404}) assertFalse(errors.isAvailabilityFailure(new IOException(FirebaseProviderFailure.response(status, new byte[0], false))));
		for (AuthErrorCode code : new AuthErrorCode[] {AuthErrorCode.INVALID_ID_TOKEN, AuthErrorCode.EXPIRED_ID_TOKEN, AuthErrorCode.REVOKED_ID_TOKEN, AuthErrorCode.USER_DISABLED, AuthErrorCode.USER_NOT_FOUND}) {
			FirebaseAuthException failure = mock(FirebaseAuthException.class); when(failure.getAuthErrorCode()).thenReturn(code);
			when(failure.getErrorCode()).thenReturn(ErrorCode.UNAVAILABLE); assertFalse(errors.isAvailabilityFailure(failure));
		}
		assertTrue(errors.isAvailabilityFailure(new ConnectException()));
		assertFalse(errors.isAvailabilityFailure(new FirebaseProviderFailure(FirebaseProviderFailure.Kind.ADMISSION)));
		assertFalse(errors.isAvailabilityFailure(new FirebaseProviderFailure(FirebaseProviderFailure.Kind.CIRCUIT_OPEN)));
	}

	@Test void unsafeBoundsAndEndpointsFailBeforeNetworkWork() {
		for (int allocation : new int[] {-1, 0, 199, 1851}) assertThrows(IllegalArgumentException.class, () -> new FirebaseProviderBounds(allocation, 100, 100, 3, 5000));
		FirebaseProviderBounds bounds = new FirebaseProviderBounds();
		for (String uri : new String[] {"http://www.googleapis.com/key", "https://evil.invalid/", "https://www.googleapis.com:8443/", "https://secret@www.googleapis.com/", "https://www.googleapis.com/#fragment"})
			assertThrows(IllegalArgumentException.class, () -> bounds.requireEndpoint(URI.create(uri)));
		bounds.requireEndpoint(URI.create("https://www.googleapis.com/key"));
		bounds.requireEndpoint(URI.create("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"));
	}

	@Test void unsupportedCredentialTypesAreRejectedRatherThanUsingAnIndependentTransport() {
		FirebaseProviderBounds bounds = new FirebaseProviderBounds();
		FirebaseProviderCredentials binder = new FirebaseProviderCredentials(bounds, FirebaseProviderTransport.withoutNetworkForTests(bounds));
		assertThrows(IllegalArgumentException.class, () -> binder.bind(com.google.auth.oauth2.GoogleCredentials.create(null)));
		assertThrows(IllegalArgumentException.class, () -> binder.bind(null));
	}

	@Test void adcAndResolverDiscoveryCannotBeIntroducedOnTheWorker() throws Exception {
		FirebaseProviderBounds bounds = new FirebaseProviderBounds();
		FirebaseProviderCredentials binder = new FirebaseProviderCredentials(bounds, FirebaseProviderTransport.withoutNetworkForTests(bounds));
		new com.fumbbl.ffb.server.local.CaptureRequestProbe().within(() -> {
			assertThrows(IllegalStateException.class, binder::applicationDefault);
			assertThrows(IllegalStateException.class, FirebaseDnsResolver::new);
			return null;
		});
	}

	private AuthenticatedPrincipal principal(String subject) { return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", EnumSet.of(ApplicationScope.PLAYER), 1_900_000_000_000L, "https://securetoken.google.com/project", subject, 1_800_000_000_000L); }
	private V2PrincipalDirectory directory() { return new V2PrincipalDirectory() {
		@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) { throw new UnsupportedOperationException(); }
		@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) { return principal; }
	}; }
}
