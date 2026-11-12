package com.fumbbl.ffb.server.local;

import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LobbyReadLimiterTest {
	@Test void burstRefillAndCapacityUseMonotonicBoundaries() {
		AtomicLong nanos = new AtomicLong();
		LobbyReadLimiter limiter = new LobbyReadLimiter(nanos::get);
		assertTrue(limiter.acquire()); assertTrue(limiter.acquire()); assertFalse(limiter.acquire());
		nanos.set(1_999_999_999L); assertFalse(limiter.acquire());
		nanos.incrementAndGet(); assertTrue(limiter.acquire()); assertFalse(limiter.acquire());
		nanos.set(10_000_000_001L);
		assertTrue(limiter.acquire()); assertTrue(limiter.acquire()); assertFalse(limiter.acquire());
		nanos.set(11_999_999_999L); assertFalse(limiter.acquire());
		nanos.incrementAndGet(); assertTrue(limiter.acquire()); assertFalse(limiter.acquire());
	}
	@Test void aNewConnectionStartsFullAtTheSameClockAfterPriorExhaustion() {
		AtomicLong nanos = new AtomicLong(17);
		LobbyReadLimiter previous = new LobbyReadLimiter(nanos::get);
		assertTrue(previous.acquire()); assertTrue(previous.acquire()); assertFalse(previous.acquire());
		LobbyReadLimiter reconnected = new LobbyReadLimiter(nanos::get);
		assertTrue(reconnected.acquire()); assertTrue(reconnected.acquire()); assertFalse(reconnected.acquire());
		assertFalse(previous.acquire(), "Connection buckets never share tokens");
	}

}
