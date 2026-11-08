package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
		JsonObject next = new JsonObject().add("phase", phase.name()).add("startMs", ms(start - origin)).add("durationMs", ms(end - start));
		if (spans.size() == MAX_SPANS) {
			dropped++;
			int existing = -1;
			for (int index = 0; index < spans.size(); index++) {
				JsonObject retained = spans.get(index).asObject();
				if (phase.name().equals(retained.getString("phase", null)) && (existing < 0
					|| retained.getDouble("startMs", 0) < spans.get(existing).asObject().getDouble("startMs", 0))) existing = index;
			}
			if (existing >= 0) {
				JsonObject retained = spans.get(existing).asObject();
				// A same-phase outer span closes after its children. Keep its actual interval.
				if (next.getDouble("startMs", 0) < retained.getDouble("startMs", 0)
					|| next.getDouble("startMs", 0) == retained.getDouble("startMs", 0)
					&& next.getDouble("durationMs", 0) > retained.getDouble("durationMs", 0)) spans.set(existing, next);
				return;
			}
			// Preserve one interval for each phase, including outer phases that close last.
			spans.remove(removable(spans));
		}
		spans.add(next);
	}
	private int removable(JsonArray retained) {
		Map<String, Integer> outer = new HashMap<>();
		for (int index = 0; index < retained.size(); index++) {
			JsonObject candidate = retained.get(index).asObject();
			String phase = candidate.getString("phase", ""); Integer previous = outer.get(phase);
			if (previous == null) { outer.put(phase, index); continue; }
			JsonObject earlier = retained.get(previous).asObject();
			if (candidate.getDouble("startMs", 0) < earlier.getDouble("startMs", 0)
				|| candidate.getDouble("startMs", 0) == earlier.getDouble("startMs", 0)
				&& candidate.getDouble("durationMs", 0) > earlier.getDouble("durationMs", 0)) outer.put(phase, index);
		}
		for (int index = retained.size() - 1; index >= 0; index--)
			if (outer.get(retained.get(index).asObject().getString("phase", "")) != index) return index;
		return retained.size() - 1;
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
		try { log.accept("FFB_BROWSER_TRACE " + new JsonObject().add("requestId", requestId).add("requestType", requestType).add("operation", operation).add("trace", trace)); }
		catch (RuntimeException ignored) { /* Optional logging cannot change delivery. */ }
		if (connection != null && timing != null) try {
			connection.sendDiagnosticTrace(frame(trace, BrowserMatchDelivery.TRACE_BYTES));
		} catch (RuntimeException ignored) { /* Missing telemetry remains missing. */ }
	}
	String frame(JsonObject trace, int budget) {
		JsonArray retained = new JsonArray();
		trace.get("spans").asArray().forEach(retained::add);
		JsonObject transport = new JsonObject(trace).set("spans", retained);
		JsonObject envelope = new JsonObject().add("version", 2).add("type", "diagnosticsTrace")
			.add("requestId", requestId).add("code", "ACCEPTED").add("trace", transport);
		String encoded = envelope.toString();
		int bytes = encoded.getBytes(StandardCharsets.UTF_8).length;
		if (bytes <= budget) return encoded;
		List<Integer> sizes = new ArrayList<>();
		retained.forEach(span -> sizes.add(span.toString().getBytes(StandardCharsets.UTF_8).length));
		int omitted = trace.getInt("droppedSpans", 0);
		// Measure each span once; trim a transport-only copy without reserializing the
		// full envelope per removal. Keep unique phases ahead of repeated inner spans.
		while (bytes > budget && !retained.isEmpty()) {
			int index = removable(retained);
			bytes -= sizes.remove(index) + (retained.size() > 1 ? 1 : 0);
			bytes += Integer.toString(omitted + 1).length() - Integer.toString(omitted).length();
			omitted++; retained.remove(index);
		}
		transport.set("droppedSpans", omitted);
		return envelope.toString();
	}
}
