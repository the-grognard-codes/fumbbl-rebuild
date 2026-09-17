package com.fumbbl.gameservice;

public interface TokenVerifier {
	Identity verify(String token) throws TokenRejectedException;

	final class Identity {
		public final String issuer;
		public final String subject;
		public final long expiresAtMillis;
		public Identity(String issuer, String subject, long expiresAtMillis) { this.issuer = issuer; this.subject = subject; this.expiresAtMillis = expiresAtMillis; }
	}

	final class TokenRejectedException extends Exception {
		public final boolean expired;
		public TokenRejectedException(boolean expired) { this.expired = expired; }
	}
}
