package com.fumbbl.ffb.server.match;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FirebaseV2PrincipalAuthenticatorTest {
	private static final String PROJECT = "browser-project";

	@Test void devAndProdCredentialsAreRejectedAcrossProjectsBeforeAccountCreation() throws Exception {
		String[] projects = {"dev-moles-under-the-pitch-org", "molesunderthepitch-dotorg"};
		for (int index = 0; index < projects.length; index++) {
			String expected = projects[index]; String foreign = projects[1 - index];
			for (boolean foreignIssuer : new boolean[] {false, true}) {
				FirebaseAuth auth = mock(FirebaseAuth.class); FirebaseToken token = token("synthetic-subject", 1900000000L);
				Map<String, Object> claims = new HashMap<>(token.getClaims());
				claims.put("aud", foreignIssuer ? expected : foreign);
				claims.put("iss", "https://securetoken.google.com/" + (foreignIssuer ? foreign : expected));
				when(token.getClaims()).thenReturn(claims); when(auth.verifyIdToken("synthetic", true)).thenReturn(token);
				Directory directory = new Directory();
				assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> new FirebaseV2PrincipalAuthenticator(auth, expected, directory).authenticate("synthetic"));
				assertEquals(0, directory.authenticateCalls);
			}
		}
	}

	@Test void verifiesRevocationAndPassesOnlyValidatedIdentityToDirectory() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class);
		FirebaseToken token = token("firebase-subject", 1900000000L);
		when(auth.verifyIdToken("bearer", true)).thenReturn(token);
		Directory directory = new Directory();

		new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).authenticate("bearer");

		verify(auth).verifyIdToken("bearer", true);
		assertEquals(1, directory.authenticateCalls);
		assertEquals("https://securetoken.google.com/" + PROJECT, directory.identity.issuer);
		assertEquals("firebase-subject", directory.identity.subject);
		assertEquals(1900000000000L, directory.identity.expiresAtMillis);
	}

	@Test void rejectsInvalidProviderClaimsWithoutCallingDirectoryOrCreatingAccount() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class);
		FirebaseToken token = token("firebase-subject", 1900000000L);
		when(token.getClaims()).thenReturn(new HashMap<String, Object>());
		when(auth.verifyIdToken(anyString(), eq(true))).thenReturn(token);
		Directory directory = new Directory();

		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).authenticate("bad"));

		assertEquals(0, directory.authenticateCalls);
		assertEquals(0, directory.reauthorizeCalls);
	}

	@Test void propagatesDirectoryRejectionWithoutRetryingOrCreatingAccount() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class);
		FirebaseToken token = token("firebase-subject", 1900000000L);
		when(auth.verifyIdToken("bearer", true)).thenReturn(token);
		Directory directory = new Directory(); directory.rejectAuthentication = true;

		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).authenticate("bearer"));

		assertEquals(1, directory.authenticateCalls);
		assertEquals(0, directory.reauthorizeCalls);
	}

	@Test void reauthorizationRejectsDisabledFirebaseAccountBeforeDirectoryRefresh() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class); UserRecord user = mock(UserRecord.class);
		when(auth.getUser("firebase-subject")).thenReturn(user); when(user.isDisabled()).thenReturn(true);
		Directory directory = new Directory();

		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).reauthorize(principal()));

		assertEquals(0, directory.reauthorizeCalls);
	}

	@Test void reauthorizationChecksFirebaseThenRefreshesLocalDirectory() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class); UserRecord user = mock(UserRecord.class);
		when(auth.getUser("firebase-subject")).thenReturn(user); when(user.getTokensValidAfterTimestamp()).thenReturn(1800000000000L);
		Directory directory = new Directory(); AuthenticatedPrincipal principal = principal();

		assertEquals(principal, new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).reauthorize(principal));

		assertEquals(1, directory.reauthorizeCalls);
	}

	@Test void reauthorizationRejectsFirebaseRevocationAfterAuthenticationTimeBeforeDirectoryRefresh() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class); UserRecord user = mock(UserRecord.class);
		when(auth.getUser("firebase-subject")).thenReturn(user); when(user.getTokensValidAfterTimestamp()).thenReturn(1800000000001L);
		Directory directory = new Directory();

		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).reauthorize(principal()));

		assertEquals(0, directory.reauthorizeCalls);
	}

	@Test void reauthorizationRejectsFirebaseOutageBeforeDirectoryRefresh() throws Exception {
		FirebaseAuth auth = mock(FirebaseAuth.class);
		when(auth.getUser("firebase-subject")).thenThrow(new IllegalStateException("unavailable"));
		Directory directory = new Directory();

		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> new FirebaseV2PrincipalAuthenticator(auth, PROJECT, directory).reauthorize(principal()));

		assertEquals(0, directory.reauthorizeCalls);
	}

	private FirebaseToken token(String subject, long expirationSeconds) {
		FirebaseToken token = mock(FirebaseToken.class);
		Map<String, Object> claims = new HashMap<>();
		claims.put("aud", PROJECT); claims.put("iss", "https://securetoken.google.com/" + PROJECT); claims.put("exp", expirationSeconds); claims.put("auth_time", 1800000000L);
		when(token.getClaims()).thenReturn(claims); when(token.getUid()).thenReturn(subject);
		return token;
	}

	private AuthenticatedPrincipal principal() {
		return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", java.util.EnumSet.of(ApplicationScope.SPECTATOR), 1900000000000L,
			"https://securetoken.google.com/" + PROJECT, "firebase-subject", 1800000000000L);
	}

	private static final class Directory implements V2PrincipalDirectory {
		private int authenticateCalls;
		private int reauthorizeCalls;
		private VerifiedIdentity identity;
		private boolean rejectAuthentication;

		@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity candidate) throws V2PrincipalAuthenticator.Rejected {
			authenticateCalls++; identity = candidate;
			if (rejectAuthentication) throw new V2PrincipalAuthenticator.Rejected();
			return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", java.util.EnumSet.of(ApplicationScope.SPECTATOR), candidate.expiresAtMillis, candidate.issuer, candidate.subject, candidate.authenticationTimeMillis);
		}

		@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws SQLException, V2PrincipalAuthenticator.Rejected {
			reauthorizeCalls++; return principal;
		}
	}
}
