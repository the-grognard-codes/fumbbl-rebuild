package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BiConsumer;

/** One dispatcher connection and its worker-local inventory subscription. */
final class DispatcherSubscription {
	private final BiConsumer<BrowserConnection, JsonObject> send;
	private final Set<String> watched = new HashSet<>();
	private BrowserConnection connection;
	private boolean watchChanges;
	private boolean watchSuspension;

	DispatcherSubscription(BiConsumer<BrowserConnection, JsonObject> send) { this.send = send; }

	void register(BrowserConnection connection, boolean watchChanges, boolean watchSuspension, List<String> matches) {
		this.connection = connection;
		this.watchChanges = watchChanges;
		this.watchSuspension = watchSuspension;
		watched.clear();
		if (watchChanges) watched.addAll(matches);
	}

	boolean connected() { return connection != null; }
	boolean watches(String matchId) { return watched.contains(matchId); }

	void advertise(String matchId) {
		if (watchChanges) watched.add(matchId);
		jobs(List.of(matchId), null);
	}

	void changed(String matchId, JsonObject state, boolean saveResumeChanged) {
		if (!watches(matchId)) return;
		int revision = state.getInt("revision", -1);
		if (revision < 0) return;
		send.accept(connection, notice("computerJobChanged", matchId).add("revision", revision)
			.add("saveResumeChanged", saveResumeChanged));
		if ("FULL_TIME".equals(state.getString("phase", null))) forget(matchId);
	}

	void suspended(String matchId) {
		// Older dispatchers also need the job advertised afresh when it resumes.
		if (watched.remove(matchId) && watchSuspension) send.accept(connection, notice("computerJobSuspended", matchId));
	}

	void ended(String matchId) {
		if (watched.remove(matchId)) send.accept(connection, notice("computerJobEnded", matchId));
	}

	void forget(String matchId) { watched.remove(matchId); }

	void jobs(List<String> matches, String requestId) {
		if (!connected() || requestId == null && matches.isEmpty()) return;
		JsonValue correlation = requestId == null ? JsonValue.NULL : JsonValue.valueOf(requestId);
		for (int first = 0; first < Math.max(1, matches.size()); first += 1024) {
			JsonArray jobs = new JsonArray();
			for (int index = first; index < Math.min(first + 1024, matches.size()); index++) jobs.add(matches.get(index));
			send.accept(connection, new JsonObject().add("type", "computerJobs").add("requestId", correlation)
				.add("code", "AVAILABLE").add("matches", jobs));
		}
	}

	void disconnect(BrowserConnection disconnected) {
		if (connection != disconnected) return;
		connection = null;
		watchChanges = false;
		watchSuspension = false;
		watched.clear();
	}

	private JsonObject notice(String type, String matchId) {
		return new JsonObject().add("type", type).add("requestId", JsonValue.NULL).add("matchId", matchId);
	}
}
