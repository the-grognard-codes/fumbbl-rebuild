package com.fumbbl.gameservice;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OutboundDeliveryTest {
	@Test void writesMessagesInOrderAfterAsynchronousCompletions() {
		FakeSink sink = new FakeSink(); OutboundDelivery delivery = new OutboundDelivery(sink);
		assertTrue(delivery.send("one")); assertTrue(delivery.send("two"));
		assertEquals(1, sink.writes.size()); assertEquals("one", sink.writes.get(0));
		sink.complete(); assertEquals(2, sink.writes.size()); assertEquals("two", sink.writes.get(1));
	}
	@Test void closesSlowConsumerWhenQueueIsBounded() {
		FakeSink sink = new FakeSink(); OutboundDelivery delivery = new OutboundDelivery(sink);
		for (int i = 0; i < 32; i++) assertTrue(delivery.send("x"));
		assertFalse(delivery.send("overflow")); assertEquals(1013, sink.closeCode);
	}
	private static final class FakeSink implements OutboundDelivery.Sink {
		final List<String> writes = new ArrayList<String>(); OutboundDelivery.Completion callback; int closeCode;
		public boolean open() { return true; }
		public void close(int code, String reason) { closeCode = code; }
		public void write(String message, OutboundDelivery.Completion completion) { writes.add(message); callback = completion; }
		void complete() { callback.succeeded(); }
	}
}
