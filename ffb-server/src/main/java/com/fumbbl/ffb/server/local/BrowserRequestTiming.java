package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.time.Clock;
import java.util.Arrays;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** Opt-in, bounded diagnostics for one ingress request; never retains request bodies or game state. */
public final class BrowserRequestTiming {
	public enum Phase { SESSION_APPLY, CHECKPOINT, AUTHORIZATION, FIREBASE_LOOKUP, RECOVERY_SERIALIZE, CHECKPOINT_STORE, STORAGE_ENCODE, CHECKPOINT_SQL, PUBLICATION, RECOVERY_RESTORE }
	public interface Scope extends AutoCloseable { @Override void close(); }
	private static final Scope EMPTY = () -> { };
	// Services at the transport, protocol and application boundaries share only the current worker request.
	private static final ThreadLocal<Request> CURRENT = new ThreadLocal<>();
	private final LongSupplier nanos;
	private final Clock clock;
	private final Consumer<String> output;

	public BrowserRequestTiming() { this(System::nanoTime, Clock.systemUTC(), line -> System.err.println(line)); }
	BrowserRequestTiming(LongSupplier nanos, Consumer<String> output) { this(nanos, Clock.systemUTC(), output); }
	BrowserRequestTiming(LongSupplier nanos, Clock clock, Consumer<String> output) {
		this.nanos = nanos; this.clock = clock; this.output = output;
	}

	Request queued() {
		try { return Boolean.getBoolean("ffb.browser.timing") ? new Request(nanos.getAsLong(), nanos) : null; }
		catch (RuntimeException unavailable) { return null; }
	}

	Scope handling(Request request) {
		if (request == null) return EMPTY;
		Request previous = CURRENT.get();
		try { request.started = nanos.getAsLong(); request.startedUtcMs = clock.millis(); }
		catch (RuntimeException unavailable) { return EMPTY; }
		CURRENT.set(request);
		return () -> {
			if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
			if (request.requestId == null) return;
			try {
				long finished = nanos.getAsLong(), finishedUtcMs = clock.millis();
				JsonObject event = new JsonObject().add("version", 1).add("requestId", request.requestId)
					.add("requestType", request.requestType).add("operation", request.operation)
					.add("serverStartUtcMs", request.startedUtcMs).add("serverEndUtcMs", finishedUtcMs)
					.add("queueWaitMs", millis(request.started - request.queued))
					.add("sessionApplyMs", millis(request.elapsed[Phase.SESSION_APPLY.ordinal()]))
					.add("checkpointMs", millis(request.elapsed[Phase.CHECKPOINT.ordinal()]))
					.add("authorizationMs", millis(request.elapsed[Phase.AUTHORIZATION.ordinal()]))
					.add("firebaseLookupMs", millis(request.elapsed[Phase.FIREBASE_LOOKUP.ordinal()]))
					.add("recoverySerializeMs", millis(request.elapsed[Phase.RECOVERY_SERIALIZE.ordinal()]))
					.add("recoveryRestoreMs", millis(request.elapsed[Phase.RECOVERY_RESTORE.ordinal()]))
					.add("checkpointStoreMs", millis(request.elapsed[Phase.CHECKPOINT_STORE.ordinal()]))
					.add("storageEncodeMs", millis(request.elapsed[Phase.STORAGE_ENCODE.ordinal()]))
					.add("checkpointSqlMs", millis(request.elapsed[Phase.CHECKPOINT_SQL.ordinal()]))
					.add("publicationMs", millis(request.elapsed[Phase.PUBLICATION.ordinal()]))
					.add("authorizationChecks", request.entries[Phase.AUTHORIZATION.ordinal()])
					.add("firebaseLookups", request.entries[Phase.FIREBASE_LOOKUP.ordinal()])
					.add("handlingMs", millis(finished - request.started)).add("totalMs", millis(finished - request.queued));
				output.accept("FFB_BROWSER_TIMING " + event);
			}
			catch (RuntimeException unavailable) { /* Diagnostics must not change the request outcome. */ }
		};
	}

	/** Called only after the v2 envelope has been checked. Only bounded correlation fields are copied. */
	void selectRequest(JsonObject request) {
		Request current = CURRENT.get();
		if (current == null || request == null) return;
		JsonValue idValue = request.get("requestId"), typeValue = request.get("type"), operationValue = request.get("operation");
		if (idValue == null || !idValue.isString() || typeValue == null || !typeValue.isString()) return;
		String id = idValue.asString(), type = typeValue.asString(), operation;
		if (!id.matches("[A-Za-z0-9_-]{1,100}")) return;
		if ("setup".equals(type)) {
			if (operationValue == null || !operationValue.isString()) return;
			operation = operationValue.asString();
			if (!Arrays.asList("load", "action", "choice", "place", "confirm", "route", "movement",
				"concede", "saveRequest", "saveAccept", "saveReject", "saveCancel", "resumeRequest", "resumeAccept", "resumeReject", "resumeCancel").contains(operation)) return;
		} else {
			if (!Arrays.asList("routePreview", "movementPreview", "movementRange", "matchTranscript", "watch", "currentMatches", "browse", "catalog").contains(type)) return;
			operation = "read";
		}
		current.requestId = id;
		current.requestType = type;
		current.operation = operation;
	}

	/** Nested spans of the same phase count their union, including when a failure unwinds them. */
	public Scope span(Phase phase) {
		Request request = CURRENT.get();
		if (request == null || request.requestId == null) return EMPTY;
		int index = phase.ordinal();
		try {
			if (request.depth[index] == 0) {
				request.began[index] = request.nanos.getAsLong();
				request.entries[index]++;
			}
			request.depth[index]++;
		} catch (RuntimeException unavailable) { return EMPTY; }
		return () -> {
			try {
				if (--request.depth[index] == 0) request.elapsed[index] += request.nanos.getAsLong() - request.began[index];
			} catch (RuntimeException unavailable) { /* Diagnostics must not change the request outcome. */ }
		};
	}

	private double millis(long elapsed) { return elapsed / 1000000.0; }

	static final class Request {
		final long queued;
		final LongSupplier nanos;
		long started, startedUtcMs;
		String requestId, requestType, operation;
		final long[] began = new long[Phase.values().length], elapsed = new long[Phase.values().length];
		final int[] depth = new int[Phase.values().length], entries = new int[Phase.values().length];
		Request(long queued, LongSupplier nanos) { this.queued = queued; this.nanos = nanos; }
	}
}
