package com.fumbbl.ffb.server.match;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/** Provider-neutral v2 principal; profile, email and provider UID are intentionally absent. */
public final class AuthenticatedPrincipal {
	private final String accountId;
	private final Set<ApplicationScope> scopes;
	private final long expiresAtMillis;
	private final String issuer;
	private final String subject;
	private final long authenticationTimeMillis;

	public AuthenticatedPrincipal(String accountId, Set<ApplicationScope> scopes, long expiresAtMillis) {
		this(accountId, scopes, expiresAtMillis, null, null, 0);
	}

	AuthenticatedPrincipal(String accountId, Set<ApplicationScope> scopes, long expiresAtMillis, String issuer, String subject) {
		this(accountId, scopes, expiresAtMillis, issuer, subject, 1);
	}

	AuthenticatedPrincipal(String accountId, Set<ApplicationScope> scopes, long expiresAtMillis, String issuer, String subject, long authenticationTimeMillis) {
		if (accountId == null || !accountId.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
			|| scopes == null || scopes.isEmpty() || expiresAtMillis < 1 || ((issuer == null) != (subject == null))
			|| (issuer != null && (issuer.isEmpty() || subject.isEmpty() || authenticationTimeMillis < 1))
			|| (issuer == null && authenticationTimeMillis != 0)) throw new IllegalArgumentException("Invalid principal");
		this.accountId = accountId;
		this.scopes = Collections.unmodifiableSet(EnumSet.copyOf(scopes));
		this.expiresAtMillis = expiresAtMillis;
		this.issuer = issuer;
		this.subject = subject;
		this.authenticationTimeMillis = authenticationTimeMillis;
	}

	public String accountId() { return accountId; }
	public boolean hasScope(ApplicationScope scope) { return scopes.contains(scope); }
	public long expiresAtMillis() { return expiresAtMillis; }

	// Provider identifiers remain package-private so transports cannot serialize or log them.
	String issuer() { return issuer; }
	String subject() { return subject; }
	long authenticationTimeMillis() { return authenticationTimeMillis; }
}
