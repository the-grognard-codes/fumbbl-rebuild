package com.fumbbl.ffb.server.match;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.LongSupplier;

/** Bounded positive account checks. Hits never extend the fixed provider revalidation deadline. */
final class FirebaseSessionVerification {
	static final long VALIDITY_NANOS = 5_000_000_000L;
	static final int MAX_SESSIONS = 1024;
	private final LongSupplier nanos;
	private final Map<Key, Long> checked = new LinkedHashMap<>();

	FirebaseSessionVerification(LongSupplier nanos) { this.nanos = nanos; }
	long begin() { return nanos.getAsLong(); }

	synchronized boolean verified(AuthenticatedPrincipal principal) {
		Key key = new Key(principal);
		Long started = checked.get(key);
		if (started == null) return false;
		long age = nanos.getAsLong() - started;
		if (age < 0 || age >= VALIDITY_NANOS) { checked.remove(key); return false; }
		return true;
	}

	synchronized void remember(AuthenticatedPrincipal principal, long started) {
		long age = nanos.getAsLong() - started;
		if (age < 0 || age >= VALIDITY_NANOS) return;
		Key key = new Key(principal);
		if (!checked.containsKey(key) && checked.size() >= MAX_SESSIONS) {
			Iterator<Key> oldest = checked.keySet().iterator(); oldest.next(); oldest.remove();
		}
		checked.put(key, started);
	}

	/** An observed rejection invalidates every cached session for this provider identity. */
	synchronized void forget(AuthenticatedPrincipal principal) {
		if (principal == null) return;
		Iterator<Key> entries = checked.keySet().iterator();
		while (entries.hasNext()) {
			Key key = entries.next();
			if (Objects.equals(key.issuer, principal.issuer()) && Objects.equals(key.subject, principal.subject())) entries.remove();
		}
	}

	private static final class Key {
		private final String account, issuer, subject;
		private final long expiration, authenticationTime;
		private Key(AuthenticatedPrincipal principal) {
			account = principal.accountId(); issuer = principal.issuer(); subject = principal.subject();
			expiration = principal.expiresAtMillis(); authenticationTime = principal.authenticationTimeMillis();
		}
		@Override public boolean equals(Object other) {
			if (!(other instanceof Key)) return false;
			Key key = (Key) other;
			return account.equals(key.account) && Objects.equals(issuer, key.issuer) && Objects.equals(subject, key.subject)
				&& expiration == key.expiration && authenticationTime == key.authenticationTime;
		}
		@Override public int hashCode() { return Objects.hash(account, issuer, subject, expiration, authenticationTime); }
	}
}
