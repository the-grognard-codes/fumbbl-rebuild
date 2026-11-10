package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PublicationDeliveryTest {
	@Test void deferredMatchDoesNotDelayNewHealthyMatchOrBlockItsQueuedChat() throws Exception {
		Fixture fixture = new Fixture();
		fixture.deferred.add("a"); fixture.publish("a", "a1", false);
		fixture.publish("b", "b1", false);
		assertEquals(List.of("b1"), fixture.sent);
		fixture.deferred.add("b"); fixture.publish("b", "b2", false); fixture.publish("b", "b3", false);
		fixture.deferred.remove("b"); fixture.delivery.retry();
		assertEquals(List.of("b1", "b2", "b3"), fixture.sent);
		assertTrue(fixture.delivery.hasPending());
		fixture.deferred.clear(); fixture.delivery.retry();
		assertEquals(List.of("b1", "b2", "b3", "a1"), fixture.sent);
		assertFalse(fixture.delivery.hasPending());
	}

	@Test void matchConsumingEntireBudgetRotatesBehindOtherMatchesForNextControlTask() throws Exception {
		Fixture fixture = new Fixture(); fixture.deferred.addAll(List.of("a", "b"));
		fixture.publish("a", "a1", false); fixture.publish("b", "b1", false);
		fixture.deferred.remove("b"); fixture.consumeBudget = true;
		fixture.retryWithBudget(); assertTrue(fixture.sent.isEmpty());
		fixture.retryWithBudget(); assertEquals(List.of("b1"), fixture.sent);
		assertFalse(fixture.delivery.hasPending()); assertEquals(1, fixture.retired);
	}

	@Test void latestStateReplacesOlderStatesBehindOrderedChatWithoutExhaustingRetention() throws Exception {
		Fixture fixture = new Fixture(); fixture.deferred.add("a");
		fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			fixture.publish("a", "old", true); fixture.publish("a", "chat1", false);
			for (int revision = 0; revision < 100; revision++) fixture.publish("a", "state" + revision, true);
			fixture.publish("a", "chat2", false); fixture.publish("a", "final", true);
		});
		fixture.deferred.clear(); fixture.delivery.retry();
		assertEquals(List.of("chat1", "chat2", "final"), fixture.sent);
		assertEquals(0, fixture.retired); assertFalse(fixture.delivery.hasPending());
	}

	@Test void persistentDeferralRetiresAfterThreeAttemptsAndReleasesAllCapacity() throws Exception {
		Fixture fixture = new Fixture(); fixture.deferred.add("a"); fixture.publish("a", "blocked", false);
		fixture.delivery.retry(); assertEquals(0, fixture.retired);
		fixture.delivery.retry(); assertEquals(1, fixture.retired); assertFalse(fixture.delivery.hasPending());
		fixture.delivery.retry(); assertEquals(1, fixture.retired);
		fixture.deferred.clear(); fixture.publish("b", "healthy", false);
		assertEquals(List.of("healthy"), fixture.sent);
		fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			for (int index = 0; index < PublicationDelivery.MAX_PENDING; index++) fixture.publish("queued-" + index, "payload", false);
		});
		assertEquals(1, fixture.retired, "Retirement releases its entry capacity");
		fixture.retryWithBudget(); assertFalse(fixture.delivery.hasPending());
		assertEquals(PublicationDelivery.MAX_PENDING + 1, fixture.sent.size());
	}

	@Test void inlineCatchUpDeliversChatBeforeFreshStateWithoutWaitingForTick() throws Exception {
		Fixture fixture = new Fixture(); fixture.deferred.add("a"); fixture.publish("a", "chat", false);
		fixture.deferred.clear(); fixture.withBudget(() -> fixture.publish("a", "handoff", true));
		assertEquals(List.of("chat", "handoff"), fixture.sent); assertFalse(fixture.delivery.hasPending());
	}

	@Test void exhaustedCallersDoNotSpendRetryAllowanceButStateSupersessionDoesNotResetIt() throws Exception {
		Fixture fixture = new Fixture(); fixture.deferred.add("a"); fixture.publish("a", "first", true);
		for (int index = 0; index < 10; index++) fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			fixture.publish("a", "newer", true);
		});
		assertEquals(0, fixture.retired);
		fixture.delivery.retry(); assertEquals(0, fixture.retired);
		fixture.publish("a", "latest", true);
		assertEquals(1, fixture.retired); assertFalse(fixture.delivery.hasPending());
	}

	@Test void inlineCatchUpNeverRefillsCallersDeadline() throws Exception {
		Fixture fixture = new Fixture(); fixture.deferred.add("a"); fixture.publish("a", "chat", false);
		fixture.consumeBudget = true;
		fixture.withBudget(() -> fixture.publish("a", "state", true));
		assertEquals(BrowserRequestTiming.REQUEST_BUDGET_NANOS, fixture.nanos.get());
		assertTrue(fixture.sent.isEmpty()); assertTrue(fixture.delivery.hasPending());
		fixture.deferred.clear(); fixture.retryWithBudget();
		assertEquals(List.of("chat", "state"), fixture.sent);
	}

	private static final class Fixture {
		final V2MatchAccess access = mock(V2MatchAccess.class);
		final PublicationDelivery delivery = new PublicationDelivery(access);
		final List<String> deferred = new ArrayList<>(), sent = new ArrayList<>();
		final AtomicLong nanos = new AtomicLong();
		boolean consumeBudget;
		int retired;
		Fixture() throws Exception {
			when(access.publication(anyString(), any(), any())).thenAnswer(call -> {
				if (deferred.contains(call.<String>getArgument(0))) {
					if (consumeBudget) nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
					throw new JdbcConnections.NotStarted();
				}
				return new V2PublicationAuthorization.Snapshot(Map.of(0, "home"));
			});
		}
		void publish(String match, String message, boolean state) {
			delivery.publish(match, state ? V2PublicationAuthorization.Family.STATE : V2PublicationAuthorization.Family.CHAT,
				List.of(new PublicationDelivery.Recipient() {
					public boolean enrolled() { return true; }
					public V2PublicationAuthorization.Target target() { return new V2PublicationAuthorization.Target(null, V2PublicationAuthorization.Audience.COMPUTER); }
					public void send(V2PublicationAuthorization.Snapshot authorization, int slot) { sent.add(message); }
					public void unavailable() { retired++; }
				}), state ? 300_000 : message.length());
		}
		void retryWithBudget() { withBudget(delivery::retry); }
		void withBudget(Runnable action) {
			BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, ignored -> { });
			try (BrowserRequestTiming.Scope ignored = timing.handling(timing.queued(BrowserRequestTiming.TaskKind.CONTROL))) { action.run(); }
		}
	}
}
