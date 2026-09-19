package com.fumbbl.gameservice;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/** A provider-neutral, server-derived principal. It intentionally contains no provider profile data. */
public final class Principal {
	private final String accountId;
	private final Set<ApplicationScope> scopes;
	private final long expiresAtMillis;

	Principal(String accountId, Set<ApplicationScope> scopes, long expiresAtMillis) {
		this.accountId = accountId;
		this.scopes = Collections.unmodifiableSet(EnumSet.copyOf(scopes));
		this.expiresAtMillis = expiresAtMillis;
	}

	public String accountId() { return accountId; }
	public boolean hasScope(ApplicationScope scope) { return scopes.contains(scope); }
	public Set<ApplicationScope> scopes() { return scopes; }
	public long expiresAtMillis() { return expiresAtMillis; }
}
