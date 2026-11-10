package com.fumbbl.ffb.server.match;

import java.util.Objects;

/** Transient trusted observation. Provider identifiers are deliberately not exposed to the transport. */
public final class ProviderSessionRejection {
	private final String issuer, subject;
	private final long rejectedBeforeMillis;
	ProviderSessionRejection(String issuer, String subject, long rejectedBeforeMillis) {
		this.issuer = issuer; this.subject = subject; this.rejectedBeforeMillis = rejectedBeforeMillis;
	}
	public boolean rejects(AuthenticatedPrincipal principal) {
		return principal != null && Objects.equals(issuer, principal.issuer()) && Objects.equals(subject, principal.subject())
			&& principal.authenticationTimeMillis() < rejectedBeforeMillis;
	}
}
