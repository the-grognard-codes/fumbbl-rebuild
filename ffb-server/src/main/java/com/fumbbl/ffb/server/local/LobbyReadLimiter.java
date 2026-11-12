package com.fumbbl.ffb.server.local;

import java.util.function.LongSupplier;

/** Per-connection monotonic two-token burst; a rejected request never moves the refill anchor. */
final class LobbyReadLimiter {
	private static final long INTERVAL = 2_000_000_000L;
	private final LongSupplier nanos;
	private long anchor;
	private int tokens = 2;

	LobbyReadLimiter(LongSupplier nanos) { this.nanos = nanos; anchor = nanos.getAsLong(); }

	boolean acquire() {
		long now = nanos.getAsLong(), elapsed = now - anchor;
		if (elapsed >= INTERVAL) {
			tokens = (int) Math.min(2, tokens + elapsed / INTERVAL);
			anchor = now - elapsed % INTERVAL;
		}
		if (tokens == 0) return false;
		tokens--;
		return true;
	}
}
