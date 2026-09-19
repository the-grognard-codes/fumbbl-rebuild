package com.fumbbl.ffb.server.match;

/** Minimal result of Firebase verification; no raw token, UID-only log field, email or profile crosses this boundary. */
public final class VerifiedIdentity {
	public final String issuer;
	public final String subject;
	public final long expiresAtMillis;
	public final long authenticationTimeMillis;

	public VerifiedIdentity(String issuer, String subject, long expiresAtMillis) {
		this(issuer, subject, expiresAtMillis, 1);
	}

	public VerifiedIdentity(String issuer, String subject, long expiresAtMillis, long authenticationTimeMillis) {
		if (issuer == null || issuer.isEmpty() || subject == null || subject.isEmpty() || expiresAtMillis < 1 || authenticationTimeMillis < 1) throw new IllegalArgumentException("Invalid verified identity");
		this.issuer = issuer; this.subject = subject; this.expiresAtMillis = expiresAtMillis; this.authenticationTimeMillis = authenticationTimeMillis;
	}
}
