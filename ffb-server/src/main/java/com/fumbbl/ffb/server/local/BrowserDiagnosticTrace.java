package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** One bounded request, joined across the engine worker and asynchronous write callback. */
final class BrowserDiagnosticTrace implements BrowserMatchDelivery.WriteObserver {
	static final int MAX_SPANS = 48;
	private final String correlation = UUID.randomUUID().toString().replace("-", "");
	private final long origin, utc;
	private final LongSupplier nanos;
	private final Consumer<String> log;
	private final JsonArray spans = new JsonArray();
	private final JsonObject values = new JsonObject();
	private final String requestId, requestType, operation;
	private final double queueMs;
	private BrowserConnection recipient;
	private JsonObject timing;
	private JsonObject write;
	private int dropped;
	private boolean finished, emitted;
	private double handlingMs;
	private JsonObject totals;

	BrowserDiagnosticTrace(long origin, long utc, LongSupplier nanos, Consumer<String> log, String requestId,
		String requestType, String operation, long queueNanos) {
		this.origin = origin; this.utc = utc; this.nanos = nanos; this.log = log;
		this.requestId = requestId; this.requestType = requestType; this.operation = operation; queueMs = ms(queueNanos);
	}
	static double ms(long value) { return Math.max(0, Math.min(3_600_000, value / 1_000_000.0)); }
	synchronized void span(BrowserRequestTiming.Phase phase, long start, long end) {
		if (spans.size() == MAX_SPANS) { dropped++; return; }
		spans.add(new JsonObject().add("phase", phase.name()).add("startMs", ms(start - origin)).add("durationMs", ms(end - start)));
	}
	synchronized void value(BrowserRequestTiming.Value key, long value) {
		if (value >= 0 && value <= 9_007_199_254_740_991L) values.set(key.key, value);
	}
	synchronized void add(BrowserRequestTiming.Value key, long value) {
		if (value >= 0) { long previous = values.getLong(key.key, 0); value(key, previous + Math.min(value, 9_007_199_254_740_991L - previous)); }
	}
	synchronized void reply(BrowserConnection recipient, JsonObject timing) { this.recipient = recipient; this.timing = timing; }
	@Override public synchronized void admitted(int optionalBytes, boolean optionalDropped) {
		value(BrowserRequestTiming.Value.PREDECESSOR_BYTES, optionalBytes);
		value(BrowserRequestTiming.Value.PREDECESSOR_DROPPED, optionalDropped ? 1 : 0);
	}
	void finish(BrowserRequestTiming.Request request) {
		synchronized (this) {
			finished = true; handlingMs = ms(nanos.getAsLong() - origin); totals = new JsonObject();
			for (BrowserRequestTiming.Phase phase : BrowserRequestTiming.Phase.values()) {
				int index = phase.ordinal();
				if (request.entries[index] > 0) totals.add(phase.name(), new JsonObject().add("ms", ms(request.elapsed[index])).add("count", request.entries[index]));
			}
		}
		emit();
	}
	@Override public void completed(String status, long queueMillis, long writeMillis, int bytes) {
		synchronized (this) {
			if (write != null) return;
			write = new JsonObject().add("status", status).add("completedMs", ms(nanos.getAsLong() - origin));
			if (queueMillis >= 0) write.add("queueMs", Math.min(3_600_000, queueMillis));
			if (writeMillis >= 0) write.add("durationMs", Math.min(3_600_000, writeMillis));
			if (bytes >= 0) value(BrowserRequestTiming.Value.RESPONSE_BYTES, bytes);
		}
		emit();
	}
	private void emit() {
		JsonObject trace;
		BrowserConnection connection;
		synchronized (this) {
			if (!finished || write == null || emitted) return;
			emitted = true; connection = recipient;
			trace = new JsonObject().add("version", 1).add("correlation", correlation).add("originUtcMs", utc)
				.add("requestType", requestType).add("operation", operation)
				.add("queueMs", queueMs).add("handlingMs", handlingMs).add("spans", spans).add("values", values)
				.add("write", write).add("totals", totals).add("droppedSpans", dropped);
			if (timing != null) trace.add("timing", timing);
		}
		JsonObject envelope = new JsonObject().add("version", 2).add("type", "diagnosticsTrace")
			.add("requestId", requestId).add("code", "ACCEPTED").add("trace", trace);
		String encoded = envelope.toString();
		// Preserve phase totals/context even when long numeric spans exhaust the optional frame budget.
		while (encoded.getBytes(StandardCharsets.UTF_8).length > BrowserMatchDelivery.TRACE_BYTES && !spans.isEmpty()) {
			spans.remove(spans.size() - 1); trace.set("droppedSpans", ++dropped); encoded = envelope.toString();
		}
		try { log.accept("FFB_BROWSER_TRACE " + new JsonObject().add("requestId", requestId).add("requestType", requestType).add("operation", operation).add("trace", trace)); }
		catch (RuntimeException ignored) { /* Optional logging cannot change delivery. */ }
		if (connection != null && timing != null) try {
			connection.sendDiagnosticTrace(encoded);
		} catch (RuntimeException ignored) { /* Missing telemetry remains missing. */ }
	}
}
