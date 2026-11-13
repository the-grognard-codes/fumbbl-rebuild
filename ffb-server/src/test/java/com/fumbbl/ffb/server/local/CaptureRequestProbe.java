package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import java.util.function.LongSupplier;

/** Test-only bridge to the actual worker timing context, without enabling global production logs. */
public final class CaptureRequestProbe {
	public record Publication(java.util.function.Consumer<JsonObject> publish, java.util.function.IntSupplier accepted) { }
	/** Fifteen passive peers plus the requesting player exercise the admitted connection limit. */
	public Publication publication(com.fumbbl.ffb.server.match.V2MatchAccess access,
		com.fumbbl.ffb.server.match.SetupApplication setup, com.fumbbl.ffb.server.match.AuthenticatedPrincipal principal,
		String matchId, int peers) throws java.sql.SQLException {
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		java.util.concurrent.atomic.AtomicInteger accepted = new java.util.concurrent.atomic.AtomicInteger();
		for (int index = 0; index < peers; index++) publisher.watch(new BrowserConnection() {
			@Override public void send(String message) {
				// Production queues the serialized string; JSON decoding belongs to the browser.
				int code = message.indexOf("\"code\":\"ACCEPTED\""), state = message.indexOf("\"state\":");
				if (code < 0 || state < code) throw new AssertionError("Healthy publication was rejected");
				accepted.incrementAndGet();
			}
		}, principal, matchId, "synthetic-watch");
		return new Publication(state -> publisher.publish(matchId, null, state), accepted::get);
	}
	/** Diagnostics-off bridge for real worker-budget acceptance, including checked JDBC failures. */
	public <T> T within(java.util.concurrent.Callable<T> action) throws Exception {
		BrowserRequestTiming timing = new BrowserRequestTiming();
		try (BrowserRequestTiming.Scope scope = timing.handling(new BrowserRequestTiming.Request(System.nanoTime(), System::nanoTime, false))) {
			return action.call();
		}
	}
	public record Measurement(JsonObject response, JsonObject timing) { }
	/** Checked-exception variant for the real provider/JDBC/native acceptance workload. */
	public Measurement measureChecked(JsonObject request, java.util.concurrent.Callable<JsonObject> action) throws Exception {
		List<String> lines = new ArrayList<>();
		BrowserRequestTiming timing = new BrowserRequestTiming(System::nanoTime, Clock.systemUTC(), lines::add);
		JsonObject response;
		try (BrowserRequestTiming.Scope handling = timing.handling(new BrowserRequestTiming.Request(System.nanoTime(), System::nanoTime, true))) {
			timing.selectRequest(request); response = action.call();
		}
		String summary = lines.stream().filter(line -> line.startsWith("FFB_BROWSER_TIMING ")).findFirst().orElseThrow();
		return new Measurement(response, JsonObject.readFrom(summary.substring("FFB_BROWSER_TIMING ".length())));
	}
	public JsonObject details(JsonObject request, Supplier<JsonObject> action) {
		List<String> lines = new ArrayList<>();
		BrowserRequestTiming timing = new BrowserRequestTiming(System::nanoTime, Clock.systemUTC(), lines::add);
		try (BrowserRequestTiming.Scope handling = timing.handling(new BrowserRequestTiming.Request(System.nanoTime(), System::nanoTime, true))) {
			timing.selectRequest(request);
			timing.enableReplies(new BrowserConnection() { @Override public void send(String message) { } @Override public boolean diagnosticDetailsEnabled() { return true; } });
			action.get();
		}
		return lines.stream().filter(line -> line.startsWith("FFB_BROWSER_TRACE ")).map(line -> JsonObject.readFrom(line.substring("FFB_BROWSER_TRACE ".length())).get("trace").asObject()).findFirst().orElseThrow();
	}

	public Measurement measure(JsonObject request, Supplier<JsonObject> action) {
		return measure(request, System::nanoTime, action);
	}
	public Measurement measure(JsonObject request, LongSupplier nanos, Supplier<JsonObject> action) {
		List<String> lines = new ArrayList<>();
		BrowserRequestTiming timing = new BrowserRequestTiming(nanos, Clock.systemUTC(), lines::add);
		JsonObject response;
		try (BrowserRequestTiming.Scope handling = timing.handling(
			new BrowserRequestTiming.Request(nanos.getAsLong(), nanos, true))) {
			timing.selectRequest(request); response = action.get();
		}
		List<String> summaries = lines.stream().filter(line -> line.startsWith("FFB_BROWSER_TIMING ")).toList();
		if (summaries.size() != 1) throw new IllegalStateException("Expected one bounded request timing summary");
		return new Measurement(response, JsonObject.readFrom(summaries.getFirst().substring("FFB_BROWSER_TIMING ".length())));
	}
}
