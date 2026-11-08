package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/** Test-only bridge to the actual worker timing context, without enabling global production logs. */
public final class CaptureRequestProbe {
	public record Measurement(JsonObject response, JsonObject timing) { }

	public Measurement measure(JsonObject request, Supplier<JsonObject> action) {
		List<String> lines = new ArrayList<>();
		BrowserRequestTiming timing = new BrowserRequestTiming(System::nanoTime, Clock.systemUTC(), lines::add);
		JsonObject response;
		try (BrowserRequestTiming.Scope handling = timing.handling(
			new BrowserRequestTiming.Request(System.nanoTime(), System::nanoTime, true))) {
			timing.selectRequest(request); response = action.get();
		}
		if (lines.size() != 1) throw new IllegalStateException("Expected one bounded request timing event");
		return new Measurement(response, JsonObject.readFrom(lines.getFirst().substring("FFB_BROWSER_TIMING ".length())));
	}
}
