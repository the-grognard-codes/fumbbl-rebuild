package com.fumbbl.gameservice;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionManagerTest {
	@Test void givesBothPlayersTheSameOrderedBoundedHistoryAndDifferentSlots() throws Exception {
		SessionManager manager = new SessionManager();
		String code = manager.create("one").code;
		manager.join("two", code);
		for (int i = 0; i < 60; i++) manager.chat(i % 2 == 0 ? "one" : "two", "message" + i);
		SessionManager.Snapshot first = manager.snapshot("one");
		SessionManager.Snapshot second = manager.snapshot("two");
		assertEquals(0, first.selfSlot);
		assertEquals(1, second.selfSlot);
		assertEquals(first.events, second.events);
		assertEquals(first.slots, second.slots);
		assertEquals(50, first.events.size());
		long expectedSequence = 15;
		for (Map<String, Object> event : first.events) assertEquals(expectedSequence++, event.get("sequence"));
		assertEquals("message59", first.events.get(49).get("text"));
	}

	@Test void reservesDisconnectedSlotsAndRejectsDuplicatePresence() throws Exception {
		SessionManager manager = new SessionManager();
		String code = manager.create("one").code;
		manager.join("two", code);
		assertEquals("already_in_session", assertThrows(SessionManager.GameException.class, () -> manager.join("one", code)).code);
		manager.disconnected("one");
		assertEquals(false, manager.snapshot("two").slots.get(0).get("connected"));
		assertEquals(true, manager.snapshot("two").slots.get(0).get("occupied"));
		assertEquals("session_full", assertThrows(SessionManager.GameException.class, () -> manager.join("three", code)).code);
		SessionManager.Snapshot rejoined = manager.join("one", code);
		assertEquals(0, rejoined.selfSlot);
		assertEquals("reconnected", rejoined.events.get(rejoined.events.size() - 1).get("type"));
	}

	@Test void requiresMembershipAndValidTextForChat() throws Exception {
		SessionManager manager = new SessionManager();
		manager.create("one");
		assertEquals("session_not_found", assertThrows(SessionManager.GameException.class, () -> manager.chat("other", "hello")).code);
		assertThrows(SessionManager.GameException.class, () -> manager.chat("one", "  "));
		assertThrows(SessionManager.GameException.class, () -> manager.chat("one", "x".repeat(1001)));
		assertThrows(SessionManager.GameException.class, () -> manager.chat("one", null));
		SessionManager.Snapshot result = manager.chat("one", "<b>plain text</b>");
		assertEquals("<b>plain text</b>", result.events.get(2).get("text"));
		manager.leave("one");
		assertThrows(SessionManager.GameException.class, () -> manager.chat("one", "after leave"));
	}

	@Test void expiresOnlyFullyDisconnectedSessionsAndBoundsCapacity() throws Exception {
		MutableClock clock = new MutableClock();
		SessionManager manager = new SessionManager(clock, 2);
		String active = manager.create("one").code;
		String abandoned = manager.create("two").code;
		manager.disconnected("two");
		assertEquals("capacity_reached", assertThrows(SessionManager.GameException.class, () -> manager.create("three")).code);
		clock.now += 3600001;
		manager.create("three");
		assertEquals(active, manager.snapshot("one").code);
		assertEquals("session_not_found", assertThrows(SessionManager.GameException.class, () -> manager.join("two", abandoned)).code);
	}

	@Test void hidesInternalIdentityAndSnapshotsCannotBeMutated() throws Exception {
		SessionManager manager = new SessionManager();
		SessionManager.Snapshot snapshot = manager.create("private-account-id");
		assertTrue(snapshot.code.matches("[0-9a-f]{32}"));
		assertNotEquals(snapshot.code, manager.create("another-private-id").code);
		assertFalse(snapshot.events.toString().contains("private-account-id"));
		assertFalse(snapshot.slots.toString().contains("private-account-id"));
		assertThrows(UnsupportedOperationException.class, () -> snapshot.events.get(0).put("text", "changed"));
		assertThrows(UnsupportedOperationException.class, () -> snapshot.slots.get(0).put("connected", false));
	}

	private static final class MutableClock extends Clock {
		private long now;
		@Override public ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(ZoneId zone) { return this; }
		@Override public Instant instant() { return Instant.ofEpochMilli(now); }
	}
}
