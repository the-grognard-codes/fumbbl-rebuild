package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Live v2 match viewers and their best-effort, recipient-specific updates. Runs on the protocol worker. */
final class ActiveMatchPublisher {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final V2MatchAccess access;
	private final SetupApplication setup;
	private final Map<BrowserConnection, Viewer> viewers = new LinkedHashMap<>();
	private final Set<BrowserConnection> liveTranscriptConnections = new HashSet<>();

	ActiveMatchPublisher(V2MatchAccess access, SetupApplication setup) {
		this.access = access;
		this.setup = setup;
	}

	JsonObject watch(BrowserConnection connection, AuthenticatedPrincipal principal,
		String matchId, String requestId) throws SQLException {
		access.spectatorSnapshot(principal, matchId);
		JsonObject view = setup.spectatorView(matchId);
		enroll(connection, new Viewer(principal, matchId, true));
		return state(requestId, view);
	}

	void enrollPlayer(BrowserConnection connection, AuthenticatedPrincipal principal, String matchId) {
		enroll(connection, new Viewer(principal, matchId, false));
	}

	void enrollComputer(BrowserConnection connection, String matchId) {
		enroll(connection, new Viewer(null, matchId, false));
	}
	private void enroll(BrowserConnection connection, Viewer viewer) {
		if (!viewers.containsKey(connection) && viewers.size() >= V2PublicationAuthorization.MAX_TARGETS) throw new MatchService.Failure("VIEW_UNAVAILABLE");
		viewers.put(connection, viewer);
	}

	void remove(BrowserConnection connection) { viewers.remove(connection); }

	void liveTranscript(BrowserConnection connection, boolean enabled) {
		if (enabled) liveTranscriptConnections.add(connection);
		else liveTranscriptConnections.remove(connection);
	}

	void disconnect(BrowserConnection connection) {
		remove(connection);
		liveTranscript(connection, false);
	}

	LiveMatchTranscript transcript(String matchId, JsonObject state) {
		return new LiveMatchTranscript(setup, matchId, state);
	}

	void sendState(BrowserConnection connection, JsonObject response, LiveMatchTranscript transcript) {
		sendState(connection, response, transcript, () -> { });
	}
	private void sendState(BrowserConnection connection, JsonObject response, LiveMatchTranscript transcript, Runnable admission) {
		if (liveTranscriptConnections.contains(connection) && "ACCEPTED".equals(response.getString("code", ""))
			&& response.get("state") != null && response.get("state").isObject()) {
			String frame;
			try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RESPONSE_SERIALIZE)) { frame = transcript.frame(response.get("state").asObject()); }
			if (frame != null) {
				String mandatory;
				try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RESPONSE_SERIALIZE)) { mandatory = response.set("version", 2).toString(); }
				timing.reply(connection, response, () -> { admission.run(); connection.sendWithOptionalPredecessor(frame, mandatory); });
				return;
			}
		}
		send(connection, response, admission);
	}

	int spectatorCount(String matchId) {
		int count = 0;
		for (Viewer viewer : viewers.values()) if (viewer.spectator && matchId.equals(viewer.matchId)) count++;
		return count;
	}

	void publishChat(String matchId, BrowserConnection source, JsonObject page) {
		List<Recipient> recipients = recipients(matchId, source, true);
		V2PublicationAuthorization.Snapshot authorization = authorization(matchId, V2PublicationAuthorization.Family.CHAT, recipients);
		if (authorization == null) return;
		for (int slot = 0; slot < recipients.size(); slot++) {
			int targetSlot = slot;
			Recipient recipient = recipients.get(slot); BrowserConnection connection = recipient.connection;
			try {
				access.publicationRole(authorization, recipient.target, slot);
				send(connection, new JsonObject().add("type", "matchChat").add("requestId", JsonValue.NULL)
					.add("code", "ACCEPTED").add("matchId", matchId).add("duplicate", false).add("page", page),
					() -> access.publicationRole(authorization, recipient.target, targetSlot));
			} catch (V2MatchAccess.PublicationDeferred exhausted) { return;
			} catch (RuntimeException denied) { unavailable(recipient); }
		}
	}

	void publish(String matchId, BrowserConnection source, JsonObject publicState) {
		publish(matchId, source, publicState, transcript(matchId, publicState));
	}

	void publish(String matchId, BrowserConnection source, JsonObject publicState, LiveMatchTranscript transcript) {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.PUBLICATION)) {
			List<Recipient> recipients = recipients(matchId, source, false);
			V2PublicationAuthorization.Snapshot authorization = authorization(matchId, V2PublicationAuthorization.Family.STATE, recipients);
			if (authorization == null) return;
			for (int slot = 0; slot < recipients.size(); slot++) {
				int targetSlot = slot;
				Recipient recipient = recipients.get(slot); BrowserConnection connection = recipient.connection; Viewer viewer = recipient.viewer;
				try {
					String role = access.publicationRole(authorization, recipient.target, slot);
					if (viewer.spectator) {
						// A previously admitted viewer may receive the final frame after the match leaves the active index.
						JsonObject spectatorState = JsonObject.readFrom(publicState.toString()).set("callerRole", "spectator");
						spectatorState.remove("computer");
						spectatorState.remove("threats"); // Acting-coach guidance is invalid in a spectator projection.
						spectatorState.remove("savedFormations"); // Stored formation controls belong only to the acting coach.
						spectatorState.remove("blockPreview");
						sendState(connection, state(null, spectatorState), transcript, () -> access.publicationRole(authorization, recipient.target, targetSlot));
						if ("FULL_TIME".equals(publicState.getString("phase", ""))) viewers.remove(connection);
					} else {
						JsonObject load = new JsonObject().add("version", 1).add("type", "setup")
							.add("operation", "load").add("requestId", "broadcast").add("matchId", matchId);
						JsonObject response = setup.publishedState(matchId, role, viewer.principal == null);
						if (response == null) response = viewer.principal == null
							? setup.handleComputerWithOutcome(load).response() : setup.handle(role, load);
						response.set("requestId", JsonValue.NULL);
						sendState(connection, response, transcript, () -> access.publicationRole(authorization, recipient.target, targetSlot));
					}
				} catch (V2MatchAccess.PublicationDeferred exhausted) { return;
				} catch (SQLException | RuntimeException denied) { unavailable(recipient); }
			}
		}
	}

	private record Recipient(BrowserConnection connection, Viewer viewer, V2PublicationAuthorization.Target target) { }
	private List<Recipient> recipients(String matchId, BrowserConnection source, boolean chat) {
		List<Recipient> recipients = new ArrayList<>();
		for (Map.Entry<BrowserConnection, Viewer> entry : viewers.entrySet()) {
			Viewer viewer = entry.getValue();
			if (entry.getKey() == source || !matchId.equals(viewer.matchId) || chat && viewer.principal == null) continue;
			V2PublicationAuthorization.Audience audience = viewer.spectator ? V2PublicationAuthorization.Audience.SPECTATOR
				: viewer.principal == null ? V2PublicationAuthorization.Audience.COMPUTER : V2PublicationAuthorization.Audience.PLAYER;
			recipients.add(new Recipient(entry.getKey(), viewer, new V2PublicationAuthorization.Target(viewer.principal, audience)));
		}
		return recipients;
	}
	private V2PublicationAuthorization.Snapshot authorization(String matchId, V2PublicationAuthorization.Family family, List<Recipient> recipients) {
		if (recipients.isEmpty()) return new V2PublicationAuthorization.Snapshot(Map.of());
		try {
			if (recipients.size() > V2PublicationAuthorization.MAX_TARGETS) throw new MatchService.Failure("VIEW_UNAVAILABLE");
			return access.publication(matchId, family, recipients.stream().map(Recipient::target).toList());
		} catch (V2MatchAccess.PublicationDeferred exhausted) { return null;
		} catch (SQLException | RuntimeException denied) { recipients.forEach(this::unavailable); return null; }
	}
	private void unavailable(Recipient recipient) {
		viewers.remove(recipient.connection);
		try { send(recipient.connection, new JsonObject().add("type", "error").add("requestId", JsonValue.NULL).add("code", "VIEW_UNAVAILABLE")); }
		catch (RuntimeException disconnected) { /* One disconnected recipient cannot undo delivery to its peers. */ }
	}

	private JsonObject state(String requestId, JsonObject view) {
		return new JsonObject().add("type", "setupState")
			.add("requestId", requestId == null ? JsonValue.NULL : JsonValue.valueOf(requestId))
			.add("code", "ACCEPTED").add("duplicate", false).add("state", view);
	}

	private void send(BrowserConnection connection, JsonObject response) {
		send(connection, response, () -> { });
	}
	private void send(BrowserConnection connection, JsonObject response, Runnable admission) {
		String message;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RESPONSE_SERIALIZE)) { message = response.set("version", 2).toString(); }
		timing.reply(connection, response, () -> { admission.run(); connection.send(message); });
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
