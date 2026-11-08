package com.fumbbl.ffb.server.local;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class BrowserMatchDeliveryTest {
	@Test void writeCompletionQueuesDetailBehindTheBasicTimingAlreadySelectedForWrite() {
		DelayedSink sink = new DelayedSink(); BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics, 3, 1000);
		delivery.sendWithOptionalPredecessor(null, "reply", (status, queue, write, bytes) -> assertTrue(delivery.sendTrace("detail")));
		assertTrue(delivery.sendOptional("timing")); sink.completeNext();
		assertEquals(List.of("reply", "timing"), sink.messages);
		sink.completeNext(); assertEquals(List.of("reply", "timing", "detail"), sink.messages);
		sink.completeNext(); assertEquals(0, metrics.toJson().getLong("deliveryQueueBytes", -1));
	}
	@Test void detailedTraceCanFollowInFlightBasicTimingAndStillYieldToGameplay() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, new BrowserMatchTransportMetrics(), 3, 1000);
		delivery.send("reply"); assertTrue(delivery.sendOptional("timing")); sink.completeNext();
		assertTrue(delivery.sendTrace("detail"));
		assertFalse(delivery.sendTrace("duplicate-detail"));
		assertTrue(delivery.send("next-action")); sink.completeNext(); sink.completeNext();
		assertEquals(List.of("reply", "timing", "next-action"), sink.messages);
		assertEquals(0, sink.closeCode);
	}
	@Test void observedMandatoryWriteMeasuresQueueAndCompletionOutsideDeliveryLock() {
		AtomicLong clock = new AtomicLong(); DelayedSink sink = new DelayedSink();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, new BrowserMatchTransportMetrics(), 8, 1000, clock::get);
		List<String> observations = new ArrayList<>();
		delivery.send("first"); clock.set(5);
		delivery.sendWithOptionalPredecessor("history", "state", (status, queue, write, bytes) -> {
			assertFalse(Thread.holdsLock(delivery)); observations.add(status + ":" + queue + ":" + write + ":" + bytes);
		});
		clock.set(10); sink.completeNext(); clock.set(20); sink.completeNext(); clock.set(25); sink.completeNext();
		assertEquals(List.of("completed:15:5:5"), observations);
		assertEquals(List.of("first", "history", "state"), sink.messages);
	}
	@Test void observedCloseAndTimeoutCompleteOnceWithoutChangingQueuePolicy() {
		for (boolean timeout : new boolean[] { true, false }) {
			AtomicLong clock = new AtomicLong(); DelayedSink sink = new DelayedSink();
			BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, new BrowserMatchTransportMetrics(), 4, 1000, clock::get);
			List<String> statuses = new ArrayList<>();
			delivery.sendWithOptionalPredecessor(null, "state", (status, queue, write, bytes) -> statuses.add(status));
			if (timeout) delivery.expireIfStalled(20, 10); else delivery.close();
			sink.completeNext(); assertEquals(List.of(timeout ? "timeout" : "closed"), statuses);
		}
	}
	@Test void optionalTelemetryYieldsToGameplayAndNeverClosesOnOverflow() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics, 3, 24);
		assertTrue(delivery.send("first"));
		assertTrue(delivery.sendOptional("timing"));
		assertFalse(delivery.sendOptional("another-timing"));
		assertTrue(delivery.send("mandatory-response")); // Drops queued timing before checking mandatory capacity.
		sink.completeNext();
		assertEquals(List.of("first", "mandatory-response"), sink.messages);
		assertFalse(delivery.sendOptional("far-too-large-for-remaining-queue-space"));
		assertEquals(0, sink.closeCode);
		assertEquals(0, metrics.toJson().getLong("outboundOverload", -1));
	}

	@Test void optionalTelemetryFollowsItsReplyWhenQueueIsQuiet() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, new BrowserMatchTransportMetrics(), 3, 100);
		delivery.send("reply");
		assertTrue(delivery.sendOptional("timing"));
		sink.completeNext();
		assertEquals(List.of("reply", "timing"), sink.messages);
		sink.completeNext();
		assertEquals(0, sink.closeCode);
	}
	@Test
	public void productionQueueStillRejectsOneByteBeyondItsBudgetAndClearsQueuedState() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics,
			BrowserMatchTransport.MAX_OUTBOUND_MESSAGES, BrowserMatchTransport.MAX_OUTBOUND_BYTES);
		char[] characters = new char[BrowserMatchTransport.MAX_OUTBOUND_BYTES];
		Arrays.fill(characters, 'x');
		assertTrue(delivery.send(new String(characters)));
		assertFalse(delivery.send("x"));
		assertEquals(1013, sink.closeCode);
		assertEquals(0, metrics.toJson().getLong("deliveryQueueBytes", -1));
	}
	@Test
	public void optionalHistoryAndMandatoryStateKeepOrderWithinTheSharedQueueBudget() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics, 3, 100);
		assertTrue(delivery.send("queued"));
		assertTrue(delivery.sendWithOptionalPredecessor("history", "state"));
		assertEquals(3, metrics.toJson().getLong("deliveryQueueDepth", -1));
		assertEquals("queued", sink.messages.get(0));
		sink.completeNext();
		assertEquals("history", sink.messages.get(1));
		sink.completeNext();
		assertEquals("state", sink.messages.get(2));
		sink.completeNext();
		assertEquals(0, metrics.toJson().getLong("deliveryQueueBytes", -1));
		assertEquals(0, sink.closeCode);
	}

	@Test
	public void optionalUtf8HistoryIsOmittedWhenOnlyTheMandatoryStateFits() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics, 2, 8);
		assertTrue(delivery.sendWithOptionalPredecessor("\u20ac\u20ac", "ack"));
		assertEquals(1, sink.messages.size());
		assertEquals("ack", sink.messages.get(0));
		assertEquals(3, metrics.toJson().getLong("deliveryQueueBytes", -1));
		assertEquals(0, metrics.toJson().getLong("outboundOverload", -1));
		assertEquals(0, sink.closeCode);
	}

	@Test
	public void mandatoryStateOverflowStillDisconnectsWithOptionalDelivery() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics, 2, 3);
		assertFalse(delivery.sendWithOptionalPredecessor("history", "\u20ac\u20ac"));
		assertEquals(1013, sink.closeCode);
		assertEquals(1, metrics.toJson().getLong("outboundOverload", -1));
	}

	@Test
	public void repeatedOldCallbackCannotCompleteTheNextWrite() {
		DelayedSink sink = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics, 3, 100);
		delivery.send("first");
		delivery.send("second");
		delivery.send("third");
		BrowserMatchDelivery.Completion first = sink.completions.remove(0);
		first.succeeded();
		first.succeeded();
		first.failed(new IllegalStateException("late failure"));
		assertEquals(2, sink.messages.size());
		assertEquals(2, metrics.toJson().getLong("deliveryQueueDepth", -1));
		assertEquals(0, sink.closeCode);
		sink.completeNext();
		assertEquals("third", sink.messages.get(2));
		delivery.close();
		sink.completeNext();
		assertEquals(0, metrics.toJson().getLong("deliveryQueueDepth", -1));
	}

	@Test
	public void blockedWriterDoesNotPreventHealthyPeerDelivery() {
		DelayedSink blocked = new DelayedSink();
		ImmediateSink healthy = new ImmediateSink();
		BrowserMatchDelivery blockedDelivery = new BrowserMatchDelivery(blocked, new BrowserMatchTransportMetrics(), 2, 100);
		BrowserMatchDelivery healthyDelivery = new BrowserMatchDelivery(healthy, new BrowserMatchTransportMetrics(), 2, 100);

		assertTrue(blockedDelivery.send("first"));
		assertTrue(blockedDelivery.send("second"));
		assertTrue(healthyDelivery.send("state"));

		assertEquals(1, blocked.messages.size());
		assertEquals("state", healthy.messages.get(0));
		blocked.completeNext();
		assertEquals("second", blocked.messages.get(1));
	}

	@Test
	public void overflowDisconnectsSlowPeerAndClearsBoundedQueue() {
		DelayedSink slow = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(slow, metrics, 2, 100);

		assertTrue(delivery.send("first"));
		assertTrue(delivery.send("second"));
		assertFalse(delivery.send("third"));

		assertEquals(1013, slow.closeCode);
		assertEquals(0, metrics.toJson().getLong("deliveryQueueDepth", -1));
		assertEquals(1, metrics.toJson().getLong("outboundOverload", -1));
		assertEquals(1, metrics.toJson().getLong("slowDisconnects", -1));
		assertFalse(delivery.send("later"));
		slow.completions.remove(0).succeeded();
		assertEquals(0, metrics.toJson().getLong("deliveryQueueDepth", -1));
		assertEquals(1, metrics.toJson().getLong("slowDisconnects", -1));
		assertEquals(1, metrics.toJson().getLong("outboundOverload", -1));
	}

	@Test
	public void writeFailureClearsPendingBytesWithoutWaitingForThePeer() {
		DelayedSink slow = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(slow, metrics, 2, 100);

		assertTrue(delivery.send("first"));
		assertTrue(delivery.send("second"));
		slow.completions.remove(0).failed(new RuntimeException("write failed"));

		assertEquals(1013, slow.closeCode);
		assertEquals(0, metrics.toJson().getLong("deliveryQueueDepth", -1));
		assertEquals(0, metrics.toJson().getLong("deliveryQueueBytes", -1));
		assertFalse(delivery.send("later"));
	}

	@Test
	public void watchdogTimeoutClosesBlockedWriterWithoutDelayingHealthyPeer() {
		AtomicLong now = new AtomicLong(100);
		DelayedSink blocked = new DelayedSink();
		ImmediateSink healthy = new ImmediateSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery blockedDelivery = new BrowserMatchDelivery(blocked, metrics, 2, 100, now::get);
		BrowserMatchDelivery healthyDelivery = new BrowserMatchDelivery(healthy, new BrowserMatchTransportMetrics(), 2, 100, now::get);

		assertTrue(blockedDelivery.send("first"));
		assertTrue(blockedDelivery.send("second"));
		assertTrue(healthyDelivery.send("state"));
		assertFalse(blockedDelivery.expireIfStalled(2099, 2000));
		assertTrue(blockedDelivery.expireIfStalled(2100, 2000));

		assertEquals(1013, blocked.closeCode);
		assertEquals("state", healthy.messages.get(0));
		assertEquals(0, metrics.toJson().getLong("deliveryQueueBytes", -1));
	}

	@Test
	public void utf8ByteLimitRejectsMessageThatFitsCharacterLimit() {
		DelayedSink slow = new DelayedSink();
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		BrowserMatchDelivery delivery = new BrowserMatchDelivery(slow, metrics, 2, 3);

		assertFalse(delivery.send("€€"));
		assertEquals(1013, slow.closeCode);
		assertEquals(1, metrics.toJson().getLong("outboundOverload", -1));
	}

	private static class DelayedSink implements BrowserMatchDelivery.Sink {
		private final List<String> messages = new ArrayList<>();
		private final List<BrowserMatchDelivery.Completion> completions = new ArrayList<>();
		private int closeCode;
		private boolean open = true;

		@Override public boolean isOpen() { return open; }
		@Override public void close(int statusCode, String reason) { closeCode = statusCode; open = false; }
		@Override public void send(String message, BrowserMatchDelivery.Completion completion) {
			messages.add(message);
			completions.add(completion);
		}
		private void completeNext() { completions.remove(0).succeeded(); }
	}

	private static class ImmediateSink implements BrowserMatchDelivery.Sink {
		private final List<String> messages = new ArrayList<>();
		@Override public boolean isOpen() { return true; }
		@Override public void close(int statusCode, String reason) { }
		@Override public void send(String message, BrowserMatchDelivery.Completion completion) {
			messages.add(message);
			completion.succeeded();
		}
	}
}
