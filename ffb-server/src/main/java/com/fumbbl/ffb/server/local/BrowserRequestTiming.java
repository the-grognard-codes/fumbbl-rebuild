package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.time.Clock;
import java.util.Arrays;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** Opt-in, bounded diagnostics for one ingress request; never retains request bodies or game state. */
public final class BrowserRequestTiming {
	public enum Phase { SESSION_APPLY, CHECKPOINT, AUTHORIZATION, FIREBASE_LOOKUP, RECOVERY_SERIALIZE, CHECKPOINT_STORE, STORAGE_ENCODE, CHECKPOINT_SQL, PUBLICATION, RECOVERY_RESTORE, LOCAL_AUTHORIZATION, FIREBASE_REUSE, RECOVERY_CURSOR, RECOVERY_FINGERPRINT,
		DB_CONNECT, DB_READ, DB_WRITE, DB_COMMIT, DB_ROLLBACK, STORAGE_DECODE, STORAGE_COMPRESSION, STORAGE_DECOMPRESSION, RESPONSE_SERIALIZE }
	public enum Value {
		REVISION("revision"), HALF("half"), TURN("turn"), HISTORY_REQUESTS("historyRequests"), EVENTS("events"), NATIVE_COMMANDS("nativeCommands"), TRANSCRIPT_RECORDS("transcriptRecords"), JOURNAL_ENTRIES("journalEntries"), JOURNAL_BYTES("journalBytes"), CHECKPOINT_PATH("checkpointPath"), STORAGE_INPUT_BYTES("storageInputBytes"), STORAGE_OUTPUT_BYTES("storageOutputBytes"), STORAGE_READ_BYTES("storageReadBytes"), STORAGE_DECODED_BYTES("storageDecodedBytes"), RESPONSE_BYTES("responseBytes"),
		PREDECESSOR_BYTES("predecessorBytes"), PREDECESSOR_DROPPED("predecessorDropped"), ACTION_KIND("actionKind"), RESPONSE_ACCEPTED("responseAccepted"), DUPLICATE("duplicate");
		final String key; Value(String key) { this.key = key; }
	}
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
		return queued(false);
	}

	Request queued(boolean diagnostics) {
		try {
			boolean logging = Boolean.getBoolean("ffb.browser.timing");
			return logging || diagnostics || Boolean.getBoolean("ffb.browser.trace") ? new Request(nanos.getAsLong(), nanos, logging) : null;
		}
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
			try { if (request.trace != null) {
				if (!request.observed) request.trace.completed("unavailable", -1, -1, -1);
				request.trace.finish(request);
			} } catch (RuntimeException ignored) { /* Optional detail clock/log failure. */ }
			if (request.requestId == null || !request.logging) return;
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
					.add("localAuthorizationMs", millis(request.elapsed[Phase.LOCAL_AUTHORIZATION.ordinal()]))
					.add("localAuthorizationChecks", request.entries[Phase.LOCAL_AUTHORIZATION.ordinal()])
					.add("firebaseReuseHits", request.entries[Phase.FIREBASE_REUSE.ordinal()])
					.add("recoverySerializeMs", millis(request.elapsed[Phase.RECOVERY_SERIALIZE.ordinal()]))
					.add("recoveryRestoreMs", millis(request.elapsed[Phase.RECOVERY_RESTORE.ordinal()]))
					.add("recoveryCursorMs", millis(request.elapsed[Phase.RECOVERY_CURSOR.ordinal()]))
					.add("recoveryFingerprintMs", millis(request.elapsed[Phase.RECOVERY_FINGERPRINT.ordinal()]))
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
			if (!Arrays.asList("load", "action", "choice", "place", "formation", "confirm", "route", "movement",
				"concede", "saveRequest", "saveAccept", "saveReject", "saveCancel", "resumeRequest", "resumeAccept", "resumeReject", "resumeCancel").contains(operation)) return;
		} else if ("diagnostics".equals(type)) {
			if (operationValue == null || !operationValue.isString() || !"probe".equals(operationValue.asString())) return;
			operation = "probe";
		} else {
			if (!Arrays.asList("routePreview", "movementPreview", "movementRange", "matchTranscript", "watch", "currentMatches", "browse", "catalog").contains(type)) return;
			operation = "read";
		}
		current.requestId = id;
		current.requestType = type;
		current.operation = operation;
		JsonValue kind = request.get("kind"), action = request.get("actionId");
		String classification = kind != null && kind.isString() ? kind.asString() : "";
		if (classification.isEmpty() && action != null && action.isString() && action.asString().length() <= 200) {
			String idPart = action.asString(); int separator = idPart.indexOf(':'); if (separator >= 0) idPart = idPart.substring(separator + 1);
			int suffix = idPart.indexOf('-'); classification = suffix < 0 ? idPart : idPart.substring(0, suffix);
		}
		current.actionKind = switch (classification) { case "move", "select" -> 1; case "pass", "declarePass" -> 2; case "blitz", "blitzTarget" -> 3; case "foul", "declareFoul" -> 4; case "handOff", "declareHandOff" -> 5; case "block", "selectBlock" -> 6; case "endTurn" -> 7; default -> 0; };
		if (Boolean.getBoolean("ffb.browser.trace")) detail(current);
	}
	private void detail(Request request) {
		try { if (request.trace == null && request.requestId != null) request.trace = new BrowserDiagnosticTrace(request.started, request.startedUtcMs,
			request.nanos, request.logging || Boolean.getBoolean("ffb.browser.trace") ? output : ignored -> {}, request.requestId, request.requestType, request.operation, request.started - request.queued);
			if (request.trace != null) request.trace.value(Value.ACTION_KIND, request.actionKind);
		} catch (RuntimeException ignored) { /* Optional details cannot reject a request. */ }
	}
	public boolean detailed() { Request request = CURRENT.get(); return request != null && request.trace != null; }
	public void value(Value key, long value) { Request request = CURRENT.get(); if (request != null && request.trace != null) request.trace.value(key, value); }
	public void add(Value key, long value) { Request request = CURRENT.get(); if (request != null && request.trace != null) request.trace.add(key, value); }
	BrowserMatchDelivery.WriteObserver claimWriteObserver() {
		Request request = CURRENT.get();
		if (request == null || !request.observerReady) return null;
		request.observerReady = false; request.observed = true; return request.trace;
	}

	void enableReplies(BrowserConnection connection) {
		Request current = CURRENT.get();
		if (current != null) { current.recipient = connection; if (connection.diagnosticDetailsEnabled()) detail(current); }
	}

	/** Boundary is the call to enqueue the serialized correlated reply, before later publication.
	 * Active phase spans include only time up to this boundary. Nested phases overlap and are not additive. */
	void reply(BrowserConnection connection, JsonObject response, Runnable enqueue) {
		String telemetry = null;
		Request current = CURRENT.get();
		try {
			if (current != null && current.recipient == connection && !current.replied && current.requestId != null
				&& current.requestId.equals(response.getString("requestId", null))
				&& !Arrays.asList("AUTHENTICATION_REQUIRED", "AUTHORIZATION", "AUTHENTICATION_FAILED").contains(response.getString("code", ""))) {
				current.replied = true;
				long now = current.nanos.getAsLong();
				JsonObject durations = new JsonObject().add("queueWaitMs", boundedMillis(current.started - current.queued))
					.add("handlingMs", boundedMillis(now - current.started));
				Phase[] phases = { Phase.AUTHORIZATION, Phase.SESSION_APPLY, Phase.CHECKPOINT, Phase.RECOVERY_SERIALIZE, Phase.CHECKPOINT_SQL };
				String[] keys = { "authorizationMs", "sessionApplyMs", "checkpointMs", "recoverySerializeMs", "checkpointSqlMs" };
				for (int index = 0; index < phases.length; index++) {
					int phase = phases[index].ordinal();
					long elapsed = current.elapsed[phase] + (current.depth[phase] > 0 ? now - current.began[phase] : 0);
					durations.add(keys[index], boundedMillis(elapsed));
				}
				if (current.trace != null && connection.diagnosticDetailsEnabled()) current.trace.reply(connection, durations);
				telemetry = new JsonObject().add("version", 2).add("type", "diagnosticsTiming")
					.add("requestId", current.requestId).add("code", "ACCEPTED").add("timing", durations).toString();
			}
		} catch (RuntimeException unavailable) { /* Optional diagnostics cannot interrupt a reply. */ }
		if (current != null && current.trace != null && !current.writeAssigned && current.requestId.equals(response.getString("requestId", null))) {
			current.writeAssigned = true; current.observerReady = true;
			JsonValue code = response.get("code"), duplicate = response.get("duplicate");
			if (code != null && code.isString()) current.trace.value(Value.RESPONSE_ACCEPTED, "ACCEPTED".equals(code.asString()) ? 1 : 0);
			if (duplicate != null && duplicate.isBoolean()) current.trace.value(Value.DUPLICATE, duplicate.asBoolean() ? 1 : 0);
		}
		try { enqueue.run(); }
		finally { if (current != null && current.observerReady) { current.observerReady = false; try { current.trace.completed("unavailable", -1, -1, -1); } catch (RuntimeException ignored) { } } }
		if (telemetry != null) {
			try { connection.sendDiagnostics(telemetry); }
			catch (RuntimeException unavailable) { /* Best-effort, bounded delivery. */ }
		}
	}

	private double boundedMillis(long elapsed) { return Math.max(0, Math.min(3600000, elapsed / 1000000.0)); }

	/** Nested spans of the same phase count their union, including when a failure unwinds them. */
	public Scope span(Phase phase) {
		Request request = CURRENT.get();
		if (request == null || request.requestId == null) return EMPTY;
		int index = phase.ordinal();
		long detailStarted;
		boolean tracing = request.trace != null;
		try {
			detailStarted = tracing ? request.nanos.getAsLong() : 0;
			if (request.depth[index] == 0) {
				request.began[index] = request.nanos.getAsLong();
				request.entries[index]++;
			}
			request.depth[index]++;
		} catch (RuntimeException unavailable) { return EMPTY; }
		return () -> {
			try {
				long ended = request.nanos.getAsLong();
				if (--request.depth[index] == 0) request.elapsed[index] += ended - request.began[index];
				if (tracing) request.trace.span(phase, detailStarted, ended);
			} catch (RuntimeException unavailable) { /* Diagnostics must not change the request outcome. */ }
		};
	}

	private double millis(long elapsed) { return elapsed / 1000000.0; }

	static final class Request {
		final long queued;
		final LongSupplier nanos;
		final boolean logging;
		BrowserConnection recipient;
		boolean replied;
		boolean observerReady, observed, writeAssigned;
		int actionKind;
		BrowserDiagnosticTrace trace;
		long started, startedUtcMs;
		String requestId, requestType, operation;
		final long[] began = new long[Phase.values().length], elapsed = new long[Phase.values().length];
		final int[] depth = new int[Phase.values().length], entries = new int[Phase.values().length];
		Request(long queued, LongSupplier nanos, boolean logging) { this.queued = queued; this.nanos = nanos; this.logging = logging; }
	}
}
