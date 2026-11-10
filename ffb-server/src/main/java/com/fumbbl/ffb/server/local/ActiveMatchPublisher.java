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
	private final PublicationDelivery delivery;
	private final Map<BrowserConnection, Viewer> viewers = new LinkedHashMap<>();
	private final Set<BrowserConnection> liveTranscriptConnections = new HashSet<>();

	ActiveMatchPublisher(V2MatchAccess access, SetupApplication setup) {
		this(access, setup, new PublicationDelivery(access));
	}

	ActiveMatchPublisher(V2MatchAccess access, SetupApplication setup, PublicationDelivery delivery) {
		this.access = access;
		this.setup = setup;
		this.delivery = delivery;
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
		Viewer previous = viewers.get(connection);
		if (previous != null && previous.principal == viewer.principal && previous.spectator == viewer.spectator && previous.matchId.equals(viewer.matchId))
			viewer = new Viewer(viewer.principal, viewer.matchId, viewer.spectator, previous.enrollment);
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
		sendState(connection, response, transcript, () -> { }, true);
	}
	private void sendState(BrowserConnection connection, JsonObject response, LiveMatchTranscript transcript, Runnable admission, boolean transcriptReserved) {
		if (transcriptReserved && liveTranscriptConnections.contains(connection) && "ACCEPTED".equals(response.getString("code", ""))
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

	void retryPublications() { delivery.retry(); }

	void publishChat(String matchId, BrowserConnection source, JsonObject page) {
		String retainedPage = page.toString();
		List<PublicationDelivery.Recipient> targets = new ArrayList<>();
		for (Recipient recipient : recipients(matchId, source, true)) targets.add(new DeliveryRecipient(recipient) {
			@Override public boolean enrolled() {
				Viewer current = viewers.get(recipient.connection);
				return current != null && current.enrollment == recipient.viewer.enrollment;
			}
			@Override public void send(V2PublicationAuthorization.Snapshot authorization, int slot) {
				access.publicationRole(authorization, target(), slot);
				ActiveMatchPublisher.this.send(recipient.connection, new JsonObject().add("type", "matchChat").add("requestId", JsonValue.NULL)
					.add("code", "ACCEPTED").add("matchId", matchId).add("duplicate", false).add("page", JsonObject.readFrom(retainedPage)),
					() -> access.publicationRole(authorization, target(), slot));
			}
		});
		delivery.publish(matchId, V2PublicationAuthorization.Family.CHAT, targets, retainedPage.length());
	}

	void publish(String matchId, BrowserConnection source, JsonObject publicState) {
		publish(matchId, source, publicState, transcript(matchId, publicState));
	}

	void publish(String matchId, BrowserConnection source, JsonObject publicState, LiveMatchTranscript transcript) {
		String retainedState = publicState.toString();
		List<Recipient> recipients = recipients(matchId, source, false);
		boolean liveTranscript = recipients.stream()
			.anyMatch(recipient -> liveTranscriptConnections.contains(recipient.connection));
		List<PublicationDelivery.Recipient> targets = new ArrayList<>();
		for (Recipient recipient : recipients) {
			boolean transcriptReserved = liveTranscriptConnections.contains(recipient.connection);
			targets.add(new DeliveryRecipient(recipient) {
				@Override public void send(V2PublicationAuthorization.Snapshot authorization, int slot) throws SQLException {
					String role = access.publicationRole(authorization, target(), slot);
					if (recipient.viewer.spectator) {
						JsonObject state = JsonObject.readFrom(retainedState);
						state.set("callerRole", "spectator");
						state.remove("computer"); state.remove("threats");
						state.remove("savedFormations"); state.remove("blockPreview");
						sendState(recipient.connection, state(null, state), transcript, () -> access.publicationRole(authorization, target(), slot), transcriptReserved);
						if ("FULL_TIME".equals(state.getString("phase", ""))) viewers.remove(recipient.connection);
					} else {
						JsonObject load = new JsonObject().add("version", 1).add("type", "setup")
							.add("operation", "load").add("requestId", "broadcast").add("matchId", matchId);
						JsonObject response = setup.publishedState(matchId, role, recipient.viewer.principal == null);
						if (response == null) response = recipient.viewer.principal == null
							? setup.handleComputerWithOutcome(load).response() : setup.handle(role, load);
						response.set("requestId", JsonValue.NULL);
						sendState(recipient.connection, response, transcript, () -> access.publicationRole(authorization, target(), slot), transcriptReserved);
					}
				}
			});
		}
		delivery.publish(matchId, V2PublicationAuthorization.Family.STATE, targets, retainedState.length() + Math.max(transcript.retainedCharacters(),
			liveTranscript ? BrowserMatchTransport.MAX_LIVE_TRANSCRIPT_BYTES : 0));
	}

	private abstract class DeliveryRecipient implements PublicationDelivery.Recipient {
		private final Recipient recipient;
		DeliveryRecipient(Recipient recipient) { this.recipient = recipient; }
		@Override public boolean enrolled() { return viewers.get(recipient.connection) == recipient.viewer; }
		@Override public V2PublicationAuthorization.Target target() { return recipient.target; }
		@Override public void unavailable() { ActiveMatchPublisher.this.unavailable(recipient); }
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
		final Object enrollment;
		Viewer(AuthenticatedPrincipal principal, String matchId, boolean spectator) {
			this(principal, matchId, spectator, new Object());
		}
		Viewer(AuthenticatedPrincipal principal, String matchId, boolean spectator, Object enrollment) {
			this.enrollment = enrollment;
			this.principal = principal;
			this.matchId = matchId;
			this.spectator = spectator;
		}
	}
}
