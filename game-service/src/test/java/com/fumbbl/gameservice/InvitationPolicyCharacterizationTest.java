package com.fumbbl.gameservice;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvitationPolicyCharacterizationTest {
	@Test void currentCodeIsTransferableToTheFirstAvailableSecondPlayerAndRejectsCrossSessionUse() throws Exception {
		SessionManager manager = new SessionManager();
		String invite = manager.create("creator").code;
		String otherInvite = manager.create("other-creator").code;
		assertTrue(invite.matches("[0-9a-f]{32}"));
		assertTrue(otherInvite.matches("[0-9a-f]{32}"));
		assertEquals(1, manager.join("any-authenticated-player", invite).selfSlot);
		assertCode("session_full", () -> manager.join("third-player", invite));
		assertCode("already_in_session", () -> manager.join("other-creator", invite));
		assertCode("session_not_found", () -> manager.join("available-player", "00000000000000000000000000000000"));
	}

	@Test void concurrentReconnectsRestoreExactlyOneReservedSlotAndRejectTheOtherIntent() throws Exception {
		SessionManager manager = new SessionManager();
		String invite = manager.create("creator").code;
		manager.join("returning-player", invite);
		manager.disconnected("returning-player");
		CountDownLatch ready = new CountDownLatch(2);
		CountDownLatch start = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(2);
		try {
			List<Future<String>> results = new ArrayList<Future<String>>();
			for (int index = 0; index < 2; index++) results.add(executor.submit(() -> {
				ready.countDown();
				start.await(5, TimeUnit.SECONDS);
				try { return "reconnected:" + manager.join("returning-player", invite).selfSlot; }
				catch (SessionManager.GameException e) { return e.code; }
			}));
			assertTrue(ready.await(5, TimeUnit.SECONDS));
			start.countDown();
			List<String> outcomes = new ArrayList<String>();
			for (Future<String> result : results) outcomes.add(result.get(5, TimeUnit.SECONDS));
			assertEquals(1, outcomes.stream().filter(value -> "reconnected:1".equals(value)).count());
			assertEquals(1, outcomes.stream().filter(value -> "already_in_session".equals(value)).count());
		} finally { executor.shutdownNow(); }
	}

	@Test void currentInactiveSessionPurgesOnlyAfterOneHourAndOnlyOnAFollowingCreateOrJoin() throws Exception {
		MutableClock clock = new MutableClock();
		SessionManager manager = new SessionManager(clock, 1);
		String expiredInvite = manager.create("creator").code;
		manager.disconnected("creator");
		clock.now += 60L * 60L * 1000L - 1L;
		assertCode("capacity_reached", () -> manager.create("new-player"));
		clock.now++;
		manager.create("new-player");
		assertCode("session_not_found", () -> manager.join("creator", expiredInvite));
	}

	private void assertCode(String expected, Operation operation) {
		try { operation.run(); }
		catch (SessionManager.GameException e) { assertEquals(expected, e.code); return; }
		throw new AssertionError("Expected " + expected);
	}
	private interface Operation { void run() throws SessionManager.GameException; }
	private static final class MutableClock extends Clock {
		private long now;
		@Override public ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(ZoneId zone) { return this; }
		@Override public Instant instant() { return Instant.ofEpochMilli(now); }
	}
}
