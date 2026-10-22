package com.fumbbl.ffb.server.match;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FirebaseSessionVerificationTest {
	private final AtomicLong nanos = new AtomicLong();
	private final MutableClock clock = new MutableClock();
	private final FirebaseAuth auth = mock(FirebaseAuth.class);
	private final UserRecord user = mock(UserRecord.class);
	private final Directory directory = new Directory();
	private final FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(auth, "project", directory, clock, nanos::get);

	@Test void fixedDeadlineDoesNotSlideAndRevocationIsObservedAtBoundary() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		verifier.reauthorize(principal("actor", 100, 10_000));
		when(user.getTokensValidAfterTimestamp()).thenReturn(101L);
		nanos.set(4_999_999_999L);
		verifier.reauthorize(principal("actor", 100, 10_000));
		nanos.incrementAndGet();
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 10_000)));
		verify(auth, times(2)).getUser("actor"); assertEquals(2, directory.calls);
	}

	@Test void expiredWindowFailsClosedOnOutageAndDoesNotRememberFailures() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		verifier.reauthorize(principal("actor", 100, 10_000));
		nanos.set(FirebaseSessionVerification.VALIDITY_NANOS);
		when(auth.getUser("actor")).thenThrow(new IllegalStateException("provider unavailable"));
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 10_000)));
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 10_000)));
		verify(auth, times(3)).getUser("actor"); assertEquals(1, directory.calls);
	}

	@Test void providerDisablementIsObservedOnRefreshAndInvalidatesOtherSessions() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		verifier.reauthorize(principal("actor", 100, 10_000));
		nanos.set(1_000_000_000L);
		verifier.reauthorize(principal("actor", 200, 10_000));
		when(user.isDisabled()).thenReturn(true);
		nanos.set(FirebaseSessionVerification.VALIDITY_NANOS);
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 10_000)));
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 200, 10_000)));
		verify(auth, times(4)).getUser("actor");
	}

	@Test void localPermissionsRefreshImmediatelyAndRejectionInvalidatesProviderCheck() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		verifier.reauthorize(principal("actor", 100, 10_000));
		directory.playerOnly = true;
		AuthenticatedPrincipal current = verifier.reauthorize(principal("actor", 100, 10_000));
		assertTrue(current.hasScope(ApplicationScope.PLAYER)); assertFalse(current.hasScope(ApplicationScope.SPECTATOR));
		directory.reject = true;
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 10_000)));
		directory.reject = false;
		verifier.reauthorize(principal("actor", 100, 10_000));
		verify(auth, times(2)).getUser("actor"); assertEquals(4, directory.calls);
	}

	@Test void tokenExpiryIsCheckedEvenWhileProviderVerificationIsFresh() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		verifier.reauthorize(principal("actor", 100, 2_000));
		clock.millis = 2_000;
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 2_000)));
		verify(auth).getUser("actor"); assertEquals(1, directory.calls);
	}

	@Test void lookupTimeCountsAgainstWindowAndExpiredTokenCannotPassSlowLookup() throws Exception {
		when(auth.getUser("actor")).thenAnswer(call -> { nanos.addAndGet(FirebaseSessionVerification.VALIDITY_NANOS); return user; });
		verifier.reauthorize(principal("actor", 100, 10_000));
		verifier.reauthorize(principal("actor", 100, 10_000));
		verify(auth, times(2)).getUser("actor");
		when(auth.getUser("actor")).thenAnswer(call -> { clock.millis = 10_000; return user; });
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> verifier.reauthorize(principal("actor", 100, 10_000)));
	}

	@Test void subjectAuthenticationTimeExpirationAndVerifierAreIsolated() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		verifier.reauthorize(principal("actor", 100, 10_000));
		verifier.reauthorize(principal("actor", 101, 10_000));
		verifier.reauthorize(principal("actor", 100, 11_000));
		verifier.reauthorize(principal("viewer", 100, 10_000));
		new FirebaseV2PrincipalAuthenticator(auth, "project", directory, clock, nanos::get).reauthorize(principal("actor", 100, 10_000));
		verify(auth, times(4)).getUser("actor"); verify(auth).getUser("viewer");
	}

	@Test void cacheIsBoundedAndEvictionRequiresARealProviderCheck() throws Exception {
		when(auth.getUser(anyString())).thenReturn(user);
		for (int index = 0; index <= FirebaseSessionVerification.MAX_SESSIONS; index++) verifier.reauthorize(principal("actor" + index, 100, 10_000));
		verifier.reauthorize(principal("actor0", 100, 10_000));
		verify(auth, times(2)).getUser("actor0");
	}

	@Test void monotonicDeadlineIgnoresWallClockRollbackAndRejectsNegativeAge() {
		FirebaseSessionVerification cache = new FirebaseSessionVerification(nanos::get);
		AuthenticatedPrincipal principal = principal("actor", 100, 10_000);
		cache.remember(principal, cache.begin());
		nanos.set(FirebaseSessionVerification.VALIDITY_NANOS);
		assertFalse(cache.verified(principal));
		cache.remember(principal, cache.begin()); nanos.decrementAndGet();
		assertFalse(cache.verified(principal));
	}

	private AuthenticatedPrincipal principal(String subject, long authenticatedAt, long expiration) {
		return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", EnumSet.allOf(ApplicationScope.class),
			expiration, "https://securetoken.google.com/project", subject, authenticatedAt);
	}
	private static final class MutableClock extends Clock {
		long millis = 1_000;
		@Override public ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(ZoneId zone) { return this; }
		@Override public Instant instant() { return Instant.ofEpochMilli(millis); }
		@Override public long millis() { return millis; }
	}
	private static final class Directory implements V2PrincipalDirectory {
		int calls; boolean reject, playerOnly;
		@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) { throw new UnsupportedOperationException(); }
		@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws V2PrincipalAuthenticator.Rejected {
			calls++; if (reject) throw new V2PrincipalAuthenticator.Rejected();
			return playerOnly ? new AuthenticatedPrincipal(principal.accountId(), EnumSet.of(ApplicationScope.PLAYER),
				principal.expiresAtMillis(), principal.issuer(), principal.subject(), principal.authenticationTimeMillis()) : principal;
		}
	}
}
