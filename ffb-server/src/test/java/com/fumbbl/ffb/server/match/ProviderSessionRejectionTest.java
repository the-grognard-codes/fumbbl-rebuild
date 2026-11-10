package com.fumbbl.ffb.server.match;

import java.nio.charset.StandardCharsets;
import java.util.EnumSet;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ProviderSessionRejectionTest {
	@Test void revocationRetiresOlderSessionsButPreservesNewerAuthenticationAndOtherIdentities() {
		ProviderSessionRejection observation = new ProviderSessionRejection("issuer", "subject", 200);
		assertTrue(observation.rejects(principal("subject", 100)));
		assertFalse(observation.rejects(principal("subject", 200))); assertFalse(observation.rejects(principal("subject", 300)));
		assertFalse(observation.rejects(principal("other", 100)));
		assertFalse(observation.rejects(null));
	}
	@Test void credentialAndKeyFailuresCannotImpersonateAnExplicitIdentityRejection() {
		byte[] body = "{\"error\":{\"message\":\"USER_DISABLED\"}}".getBytes(StandardCharsets.UTF_8);
		FirebaseProviderErrors errors = new FirebaseProviderErrors();
		assertEquals(FirebaseProviderFailure.IdentityRejection.NONE, errors.identityRejection(FirebaseProviderFailure.response(400, body, false)));
		assertEquals(FirebaseProviderFailure.IdentityRejection.USER_DISABLED, errors.identityRejection(FirebaseProviderFailure.response(400, body, true)));
		for (int status : new int[] {401, 403, 408, 429, 500, 503})
			assertEquals(FirebaseProviderFailure.IdentityRejection.NONE, errors.identityRejection(FirebaseProviderFailure.response(status, body, true)));
		assertEquals(FirebaseProviderFailure.IdentityRejection.NONE, errors.identityRejection(new FirebaseProviderFailure(FirebaseProviderFailure.Kind.AVAILABILITY)));
	}
	private AuthenticatedPrincipal principal(String subject, long authenticatedAt) { return new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", EnumSet.of(ApplicationScope.SPECTATOR), 10_000, "issuer", subject, authenticatedAt); }
}
