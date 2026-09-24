package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/** Live v2 match viewers and their best-effort, recipient-specific updates. Runs on the protocol worker. */
final class ActiveMatchPublisher {
	private final V2MatchAccess access;
	private final SetupApplication setup;
	private final Map<BrowserMatchAdapter.Connection, Viewer> viewers = new LinkedHashMap<>();

	ActiveMatchPublisher(V2MatchAccess access, SetupApplication setup) {
		this.access = access;
		this.setup = setup;
	}

	JsonObject watch(BrowserMatchAdapter.Connection connection, AuthenticatedPrincipal principal,
		String matchId, String requestId) throws SQLException {
		access.spectatorSnapshot(principal, matchId);
		JsonObject view = setup.spectatorView(matchId);
		viewers.put(connection, new Viewer(principal, matchId, true));
		return state(requestId, view);
	}

	void enrollPlayer(BrowserMatchAdapter.Connection connection, AuthenticatedPrincipal principal, String matchId) {
		viewers.put(connection, new Viewer(principal, matchId, false));
	}

	void remove(BrowserMatchAdapter.Connection connection) { viewers.remove(connection); }

	void publish(String matchId, BrowserMatchAdapter.Connection source, JsonObject publicState) {
		for (BrowserMatchAdapter.Connection connection : new ArrayList<>(viewers.keySet())) {
			Viewer viewer = viewers.get(connection);
			if (viewer == null || connection == source || !matchId.equals(viewer.matchId)) continue;
			try {
				if (viewer.spectator) {
					// A previously admitted viewer may receive the final frame after the match leaves the active index.
					access.require(viewer.principal, ApplicationScope.SPECTATOR);
					send(connection, state(null, JsonObject.readFrom(publicState.toString()).set("callerRole", "spectator")));
					if ("FULL_TIME".equals(publicState.getString("phase", ""))) viewers.remove(connection);
				} else {
					String role = access.playerRole(viewer.principal, matchId);
					JsonObject response = setup.handle(role, new JsonObject().add("version", 1).add("type", "setup")
						.add("operation", "load").add("requestId", "broadcast").add("matchId", matchId));
					response.set("requestId", JsonValue.NULL);
					send(connection, response);
				}
			} catch (SQLException | MatchService.Failure denied) {
				viewers.remove(connection);
				send(connection, new JsonObject().add("type", "error").add("requestId", JsonValue.NULL).add("code", "VIEW_UNAVAILABLE"));
			}
		}
	}

	private JsonObject state(String requestId, JsonObject view) {
		return new JsonObject().add("type", "setupState")
			.add("requestId", requestId == null ? JsonValue.NULL : JsonValue.valueOf(requestId))
			.add("code", "ACCEPTED").add("duplicate", false).add("state", view);
	}

	private void send(BrowserMatchAdapter.Connection connection, JsonObject response) {
		connection.send(response.set("version", 2).toString());
	}

	private static final class Viewer {
		final AuthenticatedPrincipal principal;
		final String matchId;
		final boolean spectator;
		Viewer(AuthenticatedPrincipal principal, String matchId, boolean spectator) {
			this.principal = principal;
			this.matchId = matchId;
			this.spectator = spectator;
		}
	}
}
