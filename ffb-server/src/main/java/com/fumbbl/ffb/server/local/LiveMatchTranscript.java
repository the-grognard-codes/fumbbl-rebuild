package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.SetupApplication;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.sql.SQLException;

/** One best-effort public frame, shared only within a durable state's delivery on the protocol worker. */
final class LiveMatchTranscript {
	private final SetupApplication setup;
	private final String matchId;
	private final int revision;
	private boolean loaded;
	private String frame;

	LiveMatchTranscript(SetupApplication setup, String matchId, JsonObject state) {
		this.setup = setup;
		this.matchId = matchId;
		this.revision = state.getInt("revision", -1);
	}

	String frame(JsonObject state) {
		if (revision < 0 || revision > 8192 || state.getInt("revision", -1) != revision) return null;
		if (!loaded) {
			loaded = true;
			try {
				JsonObject page = setup.liveTranscriptPage(matchId, revision);
				if (page == null || page.getInt("formatVersion", -1) != 2
					|| page.getInt("from", -1) != revision || page.getInt("next", -1) != revision + 1
					|| page.getInt("total", -1) != revision + 1) return null;
				JsonArray records = page.get("records").asArray();
				if (records.size() != 1 || records.get(0).asObject().getInt("index", -1) != revision
					|| records.get(0).asObject().getInt("revision", -1) != revision
					|| records.get(0).asObject().get("state").asObject().getInt("revision", -1) != revision
					|| page.toString().getBytes(StandardCharsets.UTF_8).length > 512 * 1024) return null;
				String candidate = new JsonObject().add("version", 2).add("type", "matchTranscript")
					.add("requestId", JsonValue.NULL).add("code", "ACCEPTED").add("matchId", matchId)
					.add("page", page).toString();
				// Live history retains its smaller frame budget than the paged transcript protocol. The transport
				// additionally reserves the following state and all already queued messages before admission.
				if (candidate.getBytes(StandardCharsets.UTF_8).length <= BrowserMatchTransport.MAX_LIVE_TRANSCRIPT_BYTES) frame = candidate;
			} catch (SQLException | RuntimeException unavailable) {
				// A committed action must still receive its state acknowledgement; paged catch-up remains available.
			}
		}
		return frame;
	}
}
