package com.fumbbl.ffb.server.match;

import java.util.function.LongSupplier;

/** Dependency-wide availability state. Identity denials never heal or increment the outage streak. */
final class FirebaseProviderCircuitBreaker {
	private final FirebaseProviderBounds bounds;
	private final LongSupplier nanos;
	private int failures;
	private boolean open, probing;
	private long openedAt, generation;
	FirebaseProviderCircuitBreaker(FirebaseProviderBounds bounds, LongSupplier nanos) { this.bounds = bounds; this.nanos = nanos; }
	synchronized Lease acquire() throws FirebaseProviderFailure {
		if (open && (probing || nanos.getAsLong() - openedAt < bounds.cooldownMillis() * 1_000_000L))
			throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.CIRCUIT_OPEN);
		boolean probe = open;
		if (probe) probing = true;
		return new Lease(probe, generation);
	}
	final class Lease implements AutoCloseable {
		private final boolean probe;
		private final long admittedGeneration;
		private boolean finished;
		Lease(boolean probe, long generation) { this.probe = probe; this.admittedGeneration = generation; }
		void success() { synchronized (FirebaseProviderCircuitBreaker.this) {
			if (finished) return;
			finished = true;
			if (admittedGeneration == generation) { failures = 0; open = false; probing = false; generation++; }
		} }
		void unavailable() { synchronized (FirebaseProviderCircuitBreaker.this) {
			if (finished) return;
			finished = true;
			if (admittedGeneration != generation) return;
			if (probe || ++failures >= bounds.failureThreshold()) { open = true; probing = false; openedAt = nanos.getAsLong(); generation++; }
		} }
		void denied(boolean providerAttempted) { synchronized (FirebaseProviderCircuitBreaker.this) {
			if (finished) return;
			finished = true;
			if (probe && admittedGeneration == generation) {
				probing = false; generation++;
				if (providerAttempted) openedAt = nanos.getAsLong();
			}
		} }
		@Override public void close() { denied(false); }
	}
}
