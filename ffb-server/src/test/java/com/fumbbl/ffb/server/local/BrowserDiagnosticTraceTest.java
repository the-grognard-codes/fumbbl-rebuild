package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BrowserDiagnosticTraceTest {
	@Test void producerPhaseAndContextVocabularyMatchesTheBrowserContract() throws Exception {
		java.nio.file.Path fixture = java.nio.file.Path.of("../browser-client/test/fixtures/diagnostic-contract.json");
		if (!java.nio.file.Files.exists(fixture)) fixture = java.nio.file.Path.of("browser-client/test/fixtures/diagnostic-contract.json");
		JsonObject contract = JsonObject.readFrom(java.nio.file.Files.readString(fixture));
		List<String> phases = new ArrayList<>(), values = new ArrayList<>();
		contract.get("serverPhases").asArray().forEach(value -> phases.add(value.asString()));
		contract.get("traceValues").asArray().forEach(value -> values.add(value.asString()));
		assertEquals(java.util.Arrays.stream(BrowserRequestTiming.Phase.values()).map(Enum::name).toList(), phases);
		assertEquals(java.util.Arrays.stream(BrowserRequestTiming.Value.values()).map(value -> value.key).toList(), values);
	}
	private final AtomicLong nanos = new AtomicLong(1_000_000);
	private final BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, Clock.fixed(Instant.ofEpochMilli(123456), ZoneOffset.UTC), line -> {});
	private final Connection connection = new Connection();
	private JsonObject response() { return new JsonObject().add("requestId", "safe-request").add("code", "ACCEPTED"); }
	private void start() {
		timing.selectRequest(new JsonObject().add("type", "setup").add("requestId", "safe-request").add("operation", "movement"));
		timing.enableReplies(connection);
	}
	@Test void joinsWorkerAndAsynchronousWriteWithoutDependingOnThreadLocalCallback() throws Exception {
		BrowserMatchDelivery.WriteObserver[] observer = new BrowserMatchDelivery.WriteObserver[1];
		try (BrowserRequestTiming.Scope worker = timing.handling(timing.queued(true))) {
			start();
			timing.value(BrowserRequestTiming.Value.HISTORY_REQUESTS, 128);
			try (BrowserRequestTiming.Scope sql = timing.span(BrowserRequestTiming.Phase.DB_COMMIT)) { nanos.addAndGet(5_000_000); }
			timing.reply(connection, response(), () -> observer[0] = timing.claimWriteObserver());
			nanos.addAndGet(2_000_000);
		}
		assertNotNull(observer[0]); assertTrue(connection.details.isEmpty());
		nanos.addAndGet(10_000_000);
		Thread io = new Thread(() -> observer[0].completed("completed", 3, 7, 500)); io.start(); io.join();
		observer[0].completed("failed", 0, 0, 0);
		assertEquals(1, connection.details.size());
		JsonObject trace = JsonObject.readFrom(connection.details.getFirst()).get("trace").asObject();
		assertEquals(7, trace.getDouble("handlingMs", -1));
		assertEquals(17, trace.get("write").asObject().getDouble("completedMs", -1));
		assertEquals(3, trace.get("write").asObject().getLong("queueMs", -1));
		assertEquals(500, trace.get("values").asObject().getLong("responseBytes", -1));
		assertEquals(5, trace.get("totals").asObject().get("DB_COMMIT").asObject().getDouble("ms", -1));
		assertTrue(trace.getString("correlation", "").matches("[a-f0-9]{32}"));
		assertFalse(connection.details.getFirst().contains("matchId"));
	}
	@Test void synchronousCompletionWaitsForWorkerAndExplicitCapsRetainTotals() {
		try (BrowserRequestTiming.Scope worker = timing.handling(timing.queued(true))) {
			start();
			for (int index = 0; index < 60; index++) try (BrowserRequestTiming.Scope sql = timing.span(BrowserRequestTiming.Phase.DB_READ)) { nanos.addAndGet(1_000_000); }
			timing.reply(connection, response(), () -> timing.claimWriteObserver().completed("completed", 0, 0, 100));
			assertTrue(connection.details.isEmpty());
		}
		JsonObject trace = JsonObject.readFrom(connection.details.getFirst()).get("trace").asObject();
		assertEquals(48, trace.get("spans").asArray().size());
		assertEquals(12, trace.getInt("droppedSpans", -1));
		assertEquals(60, trace.get("totals").asObject().get("DB_READ").asObject().getInt("count", -1));
		assertTrue(connection.details.getFirst().getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 8192);
	}
	@Test void nonObservingTransportsReportUnavailableInsteadOfInventingWriteTimes() {
		try (BrowserRequestTiming.Scope worker = timing.handling(timing.queued(true))) { start(); timing.reply(connection, response(), () -> {}); }
		JsonObject write = JsonObject.readFrom(connection.details.getFirst()).get("trace").asObject().get("write").asObject();
		assertEquals("unavailable", write.getString("status", null)); assertFalse(write.names().contains("durationMs"));
	}
	@Test void denseTracesFitTheOptionalFrameBudgetWithoutLosingPhaseTotals() {
		try (BrowserRequestTiming.Scope worker = timing.handling(timing.queued(true))) {
			start();
			for (BrowserRequestTiming.Value value : BrowserRequestTiming.Value.values()) timing.value(value, 9_007_199_254_740_991L);
			for (int repeat = 0; repeat < 3; repeat++) for (BrowserRequestTiming.Phase phase : BrowserRequestTiming.Phase.values())
				try (BrowserRequestTiming.Scope span = timing.span(phase)) { nanos.addAndGet(12_345_678_901L); }
			timing.reply(connection, response(), () -> timing.claimWriteObserver().completed("completed", 12345, 67890, 123456));
		}
		String encoded = connection.details.getFirst();
		assertTrue(encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= BrowserMatchDelivery.TRACE_BYTES);
		JsonObject trace = JsonObject.readFrom(encoded).get("trace").asObject();
		assertEquals(BrowserRequestTiming.Phase.values().length, trace.get("totals").asObject().size());
		assertTrue(trace.getInt("droppedSpans", -1) >= 21);
	}
	private static class Connection implements BrowserConnection {
		final List<String> details = new ArrayList<>();
		@Override public void send(String message) { }
		@Override public boolean diagnosticDetailsEnabled() { return true; }
		@Override public void sendDiagnosticTrace(String message) { details.add(message); }
	}
}
