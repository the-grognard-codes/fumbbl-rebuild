package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
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
		assertTrue(BrowserRequestTiming.Phase.values().length <= BrowserDiagnosticTrace.MAX_SPANS,
			"The bounded collector must be able to reserve one interval per known phase");
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
	@Test void basicTimingIsAvailableBeforeTheDelayedDetailedTrace() {
		BrowserMatchDelivery.WriteObserver[] observer = new BrowserMatchDelivery.WriteObserver[1];
		try (BrowserRequestTiming.Scope worker = timing.handling(timing.queued(true))) {
			start(); nanos.addAndGet(5_000_000);
			timing.reply(connection, response(), () -> observer[0] = timing.claimWriteObserver());
			assertEquals(1, connection.timings.size(), "Basic evidence must not depend on publication or write completion");
			assertTrue(connection.details.isEmpty());
		}
		assertTrue(connection.details.isEmpty());
		observer[0].completed("completed", 0, 20, 100);
		assertEquals(1, connection.details.size()); assertEquals(1, connection.timings.size());
	}
	@Test void denseRepeatedReadsRetainLateOuterAndPublicationPhases() {
		try (BrowserRequestTiming.Scope worker = timing.handling(timing.queued(true))) {
			start();
			try (BrowserRequestTiming.Scope apply = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY);
				BrowserRequestTiming.Scope outerRead = timing.span(BrowserRequestTiming.Phase.DB_READ)) {
				for (int index = 0; index < 60; index++) try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ)) { nanos.addAndGet(1_000_000); }
			}
			try (BrowserRequestTiming.Scope publication = timing.span(BrowserRequestTiming.Phase.PUBLICATION)) { nanos.addAndGet(1_000_000); }
			timing.reply(connection, response(), () -> timing.claimWriteObserver().completed("completed", 0, 0, 100));
		}
		JsonObject trace = JsonObject.readFrom(connection.details.getFirst()).get("trace").asObject();
		List<String> phases = new ArrayList<>();
		trace.get("spans").asArray().forEach(span -> phases.add(span.asObject().getString("phase", null)));
		assertTrue(phases.contains("SESSION_APPLY")); assertTrue(phases.contains("PUBLICATION"));
		assertTrue(trace.get("spans").asArray().values().stream().anyMatch(span -> "DB_READ".equals(span.asObject().getString("phase", null)) && span.asObject().getDouble("durationMs", -1) == 60));
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
	@Test void frameTrimmingPreservesTheOriginalLogAndPrefersOuterPhaseIntervals() {
		List<String> logs = new ArrayList<>();
		BrowserDiagnosticTrace trace = new BrowserDiagnosticTrace(0, 0, nanos::get, logs::add, "request", "setup", "movement", 0);
		for (int index = 0; index < 48; index++) trace.span(BrowserRequestTiming.Phase.DB_READ, index * 1_000_000L, (index + 1) * 1_000_000L);
		BrowserRequestTiming.Request request = new BrowserRequestTiming.Request(0, nanos::get, true);
		trace.finish(request); trace.completed("completed", 0, 0, 100);
		JsonObject logged = JsonObject.readFrom(logs.getFirst().substring("FFB_BROWSER_TRACE ".length())).get("trace").asObject();
		String original = logged.toString();
		JsonArray outer = logged.get("spans").asArray();
		outer.set(0, new JsonObject().add("phase", "SESSION_APPLY").add("startMs", 0).add("durationMs", 100));
		String beforeTrim = logged.toString();
		String encoded = trace.frame(logged, 1200);
		assertTrue(encoded.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 1200);
		assertEquals(beforeTrim, logged.toString(), "Transport trimming must not mutate the log record");
		assertEquals(48, JsonObject.readFrom(original).get("spans").asArray().size());
		JsonObject wire = JsonObject.readFrom(encoded).get("trace").asObject();
		assertTrue(wire.getInt("droppedSpans", 0) > 0);
		assertEquals("SESSION_APPLY", wire.get("spans").asArray().get(0).asObject().getString("phase", null));
	}
	@Test void denseCollectionAndWireTrimmingAgreeOnSameStartWiderIntervals() {
		List<String> logs = new ArrayList<>();
		BrowserDiagnosticTrace trace = new BrowserDiagnosticTrace(0, 0, nanos::get, logs::add, "request", "setup", "movement", 0);
		trace.span(BrowserRequestTiming.Phase.DB_READ, 0, 10_000_000);
		trace.span(BrowserRequestTiming.Phase.DB_READ, 0, 100_000_000);
		for (int index = 1; index <= 60; index++) trace.span(BrowserRequestTiming.Phase.DB_READ, index * 1_000_000L, (index + 1) * 1_000_000L);
		trace.span(BrowserRequestTiming.Phase.SESSION_APPLY, 0, 200_000_000);
		trace.span(BrowserRequestTiming.Phase.DB_READ, 0, 50_000_000);
		for (int index = 1; index <= 60; index++) trace.span(BrowserRequestTiming.Phase.DB_READ, index * 1_000_000L, (index + 1) * 1_000_000L);
		trace.finish(new BrowserRequestTiming.Request(0, nanos::get, true)); trace.completed("completed", 0, 0, 100);
		JsonObject logged = JsonObject.readFrom(logs.getFirst().substring("FFB_BROWSER_TRACE ".length())).get("trace").asObject();
		assertEquals(48, logged.get("spans").asArray().size()); assertEquals(76, logged.getInt("droppedSpans", -1));
		JsonObject wire = JsonObject.readFrom(trace.frame(logged, 1200)).get("trace").asObject();
		for (JsonObject observed : List.of(logged, wire)) {
			assertTrue(observed.get("spans").asArray().values().stream().anyMatch(span -> "DB_READ".equals(span.asObject().getString("phase", null)) && span.asObject().getDouble("durationMs", 0) == 100));
			assertTrue(observed.get("spans").asArray().values().stream().anyMatch(span -> "SESSION_APPLY".equals(span.asObject().getString("phase", null))));
		}
	}
	private static class Connection implements BrowserConnection {
		final List<String> details = new ArrayList<>();
		final List<String> timings = new ArrayList<>();
		@Override public void send(String message) { }
		@Override public void sendDiagnostics(String message) { timings.add(message); }
		@Override public boolean diagnosticDetailsEnabled() { return true; }
		@Override public void sendDiagnosticTrace(String message) { details.add(message); }
	}
}
