package com.fumbbl.gameservice;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvitationStoreTest {
	@TempDir Path directory;

	@Test void persistsTransferableBearerClaimsAndRejectsOtherClaimants() throws Exception {
		MutableClock clock = new MutableClock();
		String path = directory.resolve("invitations").toString();
		InvitationStore first = new InvitationStore(path, clock);
		String code = first.create("creator").code;
		assertTrue(code.matches("[0-9a-f]{32}"));
		new InvitationStore(path, clock).claim(code, "first-opponent");
		new InvitationStore(path, clock).claim(code, "first-opponent");
		assertCode("session_full", () -> new InvitationStore(path, clock).claim(code, "other-opponent"));
	}

	@Test void expiresPendingCodesAfterOneHourAndPersistsTheRejection() throws Exception {
		MutableClock clock = new MutableClock();
		InvitationStore store = new InvitationStore(directory.resolve("expiry").toString(), clock);
		String code = store.create("creator").code;
		clock.now += 60L * 60L * 1000L;
		assertCode("invitation_expired", () -> store.requireJoinable(code, "opponent"));
		assertCode("invitation_expired", () -> store.claim(code, "opponent"));
	}

	@Test void creatorReissueAndDisconnectedOpponentReleaseRevokeOldCodesImmediately() throws Exception {
		InvitationStore store = new InvitationStore(directory.resolve("reissue").toString(), new MutableClock());
		String first = store.create("creator").code;
		String second = store.reissue(first, "creator").code;
		assertNotEquals(first, second);
		assertCode("invitation_revoked", () -> store.requireJoinable(first, "opponent"));
		store.claim(second, "opponent");
		assertCode("not_session_creator", () -> store.releaseAndReissue(second, "opponent"));
		String third = store.releaseAndReissue(second, "creator").code;
		assertNotEquals(second, third);
		assertCode("invitation_revoked", () -> store.requireJoinable(second, "opponent"));
	}

	private void assertCode(String expected, Operation operation) {
		InvitationStore.InvitationException exception = assertThrows(InvitationStore.InvitationException.class, operation::run);
		assertEquals(expected, exception.code);
	}
	private interface Operation { void run() throws InvitationStore.InvitationException; }
	private static final class MutableClock extends Clock {
		private long now;
		@Override public ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(ZoneId zone) { return this; }
		@Override public Instant instant() { return Instant.ofEpochMilli(now); }
	}
}
