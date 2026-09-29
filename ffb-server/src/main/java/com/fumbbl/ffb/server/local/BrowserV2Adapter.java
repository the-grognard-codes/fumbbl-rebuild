package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchChat;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.MatchJson;
import com.fumbbl.ffb.server.match.MatchResultJson;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import java.sql.SQLException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

/** One authenticated protocol for preparation, play and read-only observation. */
public final class BrowserV2Adapter implements BrowserProtocol {
	private final V2PrincipalAuthenticator authenticator;
	private final V2MatchAccess access;
	private final SetupApplication setup;
	private final ActiveMatchPublisher publisher;
	private final MatchService matches;
	private final V2PreparationService preparation;
	private final BrowserSavedTeamJson teams;
	private final ComputerOpponentService computers;
	private BrowserMatchAdapter.Connection computerDispatcher;
	private final Set<BrowserMatchAdapter.Connection> computerConnections = new HashSet<>();
	private final BrowserTeamJson catalog = new BrowserTeamJson(new RosterCatalog());
	private final Map<BrowserMatchAdapter.Connection, AuthenticatedPrincipal> principals = new LinkedHashMap<>();
	private final Map<BrowserMatchAdapter.Connection, String> preparationSubscriptions = new LinkedHashMap<>();
	private final Set<BrowserMatchAdapter.Connection> retired = Collections.newSetFromMap(new WeakHashMap<BrowserMatchAdapter.Connection, Boolean>());

	public BrowserV2Adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup,
		MatchService matches, V2PreparationService preparation, BrowserSavedTeamJson teams) {
		this(authenticator, access, setup, matches, preparation, teams, new ComputerOpponentService(null));
	}

	public BrowserV2Adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup,
		MatchService matches, V2PreparationService preparation, BrowserSavedTeamJson teams, ComputerOpponentService computers) {
		this.authenticator = authenticator; this.access = access; this.setup = setup;
		this.matches = matches; this.preparation = preparation; this.teams = teams;
		this.computers = computers;
		this.publisher = new ActiveMatchPublisher(access, setup, preparation);
	}

	@Override public synchronized void receive(BrowserMatchAdapter.Connection connection, String text) {
		if (retired.contains(connection)) return;
		String requestId = null;
		try {
			catalog.checkEnvelope(text);
			JsonObject request = JsonObject.readFrom(text);
			requestId = request.getString("requestId", null);
			if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,100}")) throw new IllegalArgumentException();
			if (request.getInt("version", -1) != 2) { fail(connection, requestId, "UNSUPPORTED_VERSION"); return; }
			String type = request.getString("type", "");
			if ("authenticateComputer".equals(type)) {
				fields(request, "version", "type", "requestId", "serviceToken");
				if (principals.containsKey(connection) || computerConnections.contains(connection)) {
					fail(connection, requestId, "IDENTITY_REBINDING_FORBIDDEN"); return;
				}
				if (!computers.authenticate(request.get("serviceToken").asString())) {
					fail(connection, requestId, "AUTHENTICATION_FAILED"); return;
				}
				computerConnections.add(connection);
				send(connection, new JsonObject().add("type", "computerAuthentication")
					.add("requestId", requestId).add("code", "ACCEPTED"));
				return;
			}
			if ("authenticate".equals(type)) {
				fields(request, "version", "type", "requestId", "bearer");
				if (principals.containsKey(connection) || computerConnections.contains(connection)) {
					fail(connection, requestId, "IDENTITY_REBINDING_FORBIDDEN"); return;
				}
				AuthenticatedPrincipal principal = authenticator.authenticate(request.get("bearer").asString());
				// Newest authenticated connection wins, serialized on the same worker.
				for (BrowserMatchAdapter.Connection prior : new java.util.ArrayList<>(principals.keySet())) {
					if (principals.get(prior).accountId().equals(principal.accountId())) {
						retire(prior);
					}
				}
				principals.put(connection, principal);
				send(connection, new JsonObject().add("type", "authentication").add("requestId", requestId)
					.add("code", "ACCEPTED").add("accountId", principal.accountId()));
				return;
			}
			if (computerConnections.contains(connection)) {
				handleComputerConnection(connection, request);
				return;
			}
			AuthenticatedPrincipal principal = principals.get(connection);
			if ("browse".equals(type)) {
				fields(request, "version", "type", "requestId");
				JsonArray list = new JsonArray();
				for (String id : access.browse(principal)) list.add(new JsonObject().add("matchId", id).add("label", "Home vs Away"));
				send(connection, new JsonObject().add("type", "browse").add("requestId", requestId).add("code", "ACCEPTED").add("matches", list));
				return;
			}
			if ("watch".equals(type)) {
				fields(request, "version", "type", "requestId", "matchId");
				String id = request.get("matchId").asString();
				JsonObject state = publisher.watch(connection, principal, id, requestId);
				preparationSubscriptions.remove(connection);
				send(connection, state); return;
			}
			if ("matchTranscript".equals(type)) {
				fields(request, "version", "type", "requestId", "matchId", "from", "limit");
				String id = request.get("matchId").asString();
				if (!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new IllegalArgumentException();
				int from = request.get("from").asInt(), limit = request.get("limit").asInt();
				if (from < 0 || from > 8193 || limit < 1 || limit > 8) throw new IllegalArgumentException();
				try { if (access.playerRole(principal, id) == null) throw new MatchService.Failure("NOT_FOUND"); }
				catch (MatchService.Failure membership) {
					if (!"NOT_FOUND".equals(membership.code) && !"AUTHORIZATION".equals(membership.code)) throw membership;
					access.spectatorTranscript(principal, id);
				}
				JsonObject page = setup.transcriptPage(id, from, limit);
				send(connection, new JsonObject().add("type", "matchTranscript").add("requestId", requestId)
					.add("code", "ACCEPTED").add("matchId", id).add("page", page));
				return;
			}
			if ("routePreview".equals(type)) {
				fields(request, "version", "type", "requestId", "matchId", "expectedRevision", "waypoints");
				principal = access.require(principal, ApplicationScope.PLAYER);
				String id = request.get("matchId").asString();
				if (!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new IllegalArgumentException();
				if (request.get("expectedRevision").asInt() < 0) throw new IllegalArgumentException();
				JsonArray waypoints = request.get("waypoints").asArray();
				if (waypoints.size() < 1 || waypoints.size() > 20) throw new IllegalArgumentException();
				String role = access.playerRole(principal, id);
				JsonObject route = setup.routePreview(role, id, request.get("expectedRevision").asInt(), waypoints);
				send(connection, new JsonObject().add("type", "routePreview").add("requestId", requestId)
					.add("code", "ACCEPTED").add("matchId", id).add("route", route));
				return;
			}
			if ("matchChat".equals(type)) {
				String operation = request.getString("operation", "");
				if ("load".equals(operation)) fields(request, "version", "type", "requestId", "operation", "matchId", "from", "limit");
				else if ("send".equals(operation)) fields(request, "version", "type", "requestId", "operation", "matchId", "text");
				else throw new IllegalArgumentException();
				String id = request.get("matchId").asString();
				if (!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new IllegalArgumentException();
				String role;
				try { role = access.playerRole(principal, id); }
				catch (MatchService.Failure notPlayer) {
					if (!"NOT_FOUND".equals(notPlayer.code) && !"AUTHORIZATION".equals(notPlayer.code)) throw notPlayer;
					access.spectatorTranscript(principal, id);
					role = "spectator";
				}
				JsonObject page;
				boolean duplicate = false;
				if ("load".equals(operation)) {
					int from = request.get("from").asInt(), limit = request.get("limit").asInt();
					if (from < 0 || from > 512 || limit < 1 || limit > 32) throw new IllegalArgumentException();
					page = setup.chatPage(id, from, limit);
				} else {
					String content = request.get("text").asString();
					MatchChat.Outcome outcome = setup.sendChat(id, principal.accountId(), role, requestId, content);
					duplicate = outcome.duplicate;
					page = setup.chatPage(id, outcome.message.getInt("index", -1), 1);
				}
				send(connection, new JsonObject().add("type", "matchChat").add("requestId", requestId)
					.add("code", "ACCEPTED").add("matchId", id).add("duplicate", duplicate).add("page", page));
				if ("send".equals(operation) && !duplicate) publisher.publishChat(id, connection, page);
				return;
			}
			principal = access.require(principal, ApplicationScope.PLAYER);
			request.set("version", 1); // Internal R2 contract remains version 1.
			JsonObject response;
			if ("computer".equals(type)) {
				handleComputer(connection, request);
				return;
			} else if ("setup".equals(type)) {
				String id = request.get("matchId").asString();
				String role = access.playerRole(principal, id);
				SetupApplication.HandleOutcome outcome = setup.handleWithOutcome(role, request);
				response = outcome.response();
				if ("ACCEPTED".equals(response.getString("code", ""))) {
					publisher.enrollPlayer(connection, principal, id);
					preparationSubscriptions.remove(connection);
				}
				send(connection, response);
				if (outcome.publish()) publisher.publish(id, connection, response.get("state").asObject());
				return;
			} else if ("matchResult".equals(type)) response = new MatchResultJson().handle(matches, principal.accountId(), request);
			else if ("preparedMatch".equals(type)) {
				String operation = request.getString("operation", "");
				if ("release".equals(operation)) {
					fields(request, "version", "type", "operation", "requestId", "matchId");
					String id = request.get("matchId").asString();
					access.playerRole(principal, id);
					if (preparation.isComputerMatch(id)) throw new MatchService.Failure("RELEASE_NOT_PERMITTED");
					String opponent = access.opponentAccount(principal, id);
					boolean disconnected = opponent != null && principals.values().stream().noneMatch(p -> p.accountId().equals(opponent));
					response = preparation.releaseAbandoned(principal.accountId(), id, requestId, disconnected);
				} else if ("activate".equals(operation) || "load".equals(operation)) {
					String role = access.playerRole(principal, request.get("matchId").asString());
					response = "activate".equals(operation) ? setup.activate(role, request.toString())
						: new MatchJson().handle(matches, role, request.toString());
				} else response = preparation.handle(principal.accountId(), request);
			} else if ("savedTeam".equals(type)) response = teams.handle(principal.accountId(), request.toString());
			else if ("catalog".equals(type)) {
				if (request.get("rosterId") == null) fields(request, "version", "type", "requestId");
				else fields(request, "version", "type", "requestId", "rosterId");
				response = catalog.catalog(requestId, request.get("rosterId") == null ? "human" : request.get("rosterId").asString());
			}
			else if ("validateTeam".equals(type)) { fields(request, "version", "type", "requestId", "draft");
				if (request.get("draft").asObject().getInt("draftVersion", -1) != 2) throw new IllegalArgumentException("Unsupported draft version");
				response = catalog.evaluate(requestId, request.get("draft").asObject()); }
			else { fail(connection, requestId, "UNSUPPORTED_MESSAGE"); return; }
			send(connection, response);
			if ("preparedMatch".equals(type) && "ACCEPTED".equals(response.getString("code", ""))) {
				String id = response.get("document").asObject().getString("matchId", null);
				preparationSubscriptions.put(connection, id);
				publisher.remove(connection);
				if (!"load".equals(request.getString("operation", ""))) preparationChanged(id, connection);
				if ("activate".equals(request.getString("operation", "")) && preparation.isComputerMatch(id))
					sendComputerJobs(Collections.singletonList(id));
			}
		} catch (V2PrincipalAuthenticator.Rejected rejected) { fail(connection, requestId, "AUTHENTICATION_FAILED"); }
		catch (MatchService.Failure rejected) { fail(connection, requestId, rejected.code); }
		catch (SQLException unavailable) { fail(connection, requestId, "PERSISTENCE_FAILED"); }
		catch (RuntimeException malformed) { fail(connection, requestId, "MALFORMED_MESSAGE"); }
	}

	private void handleComputer(BrowserMatchAdapter.Connection connection, JsonObject request) {
		String operation = request.getString("operation", "");
		String id = request.getString("requestId", null);
		if (!"status".equals(operation)) throw new IllegalArgumentException();
		fields(request, "version", "type", "operation", "requestId");
		computerResponse(connection, id, computerDispatcher == null ? "UNAVAILABLE" : "READY");
	}

	private void handleComputerConnection(BrowserMatchAdapter.Connection connection, JsonObject request) throws SQLException {
		String type = request.getString("type", "");
		String id = request.getString("requestId", null);
		if ("computer".equals(type) && "register".equals(request.getString("operation", ""))) {
			fields(request, "version", "type", "operation", "requestId");
			List<String> activeMatches = preparation.activeComputerMatches();
			computerDispatcher = connection;
			computerResponse(connection, id, "READY");
			sendComputerJobs(activeMatches);
		} else if ("setup".equals(type)) {
			String matchId = request.get("matchId").asString();
			if (!preparation.isComputerMatch(matchId)) throw new MatchService.Failure("NOT_FOUND");
			request.set("version", 1);
			SetupApplication.HandleOutcome outcome = setup.handleWithOutcome("away", request);
			JsonObject response = outcome.response();
			if ("ACCEPTED".equals(response.getString("code", ""))) publisher.enrollComputer(connection, matchId);
			send(connection, response);
			if (outcome.publish()) publisher.publish(matchId, connection, response.get("state").asObject());
		} else { fail(connection, id, "UNSUPPORTED_MESSAGE"); }
	}

	private void sendComputerJobs(List<String> matches) {
		if (computerDispatcher == null || matches.isEmpty()) return;
		for (int first = 0; first < matches.size(); first += 1024) {
			JsonArray jobs = new JsonArray();
			for (int index = first; index < Math.min(first + 1024, matches.size()); index++) jobs.add(matches.get(index));
			send(computerDispatcher, new JsonObject().add("type", "computerJobs").add("requestId", JsonValue.NULL)
				.add("code", "AVAILABLE").add("matches", jobs));
		}
	}
	private void computerResponse(BrowserMatchAdapter.Connection connection, String requestId, String code) {
		send(connection, new JsonObject().add("type", "computer").add("requestId", requestId).add("code", code));
	}

	private void preparationChanged(String matchId, BrowserMatchAdapter.Connection source) {
		for (BrowserMatchAdapter.Connection connection : new java.util.ArrayList<>(preparationSubscriptions.keySet())) {
			if (connection == source || !matchId.equals(preparationSubscriptions.get(connection))) continue;
			try {
				// Even invalidations disclose membership: reauthorize before sending, including on exact retry.
				access.playerRole(principals.get(connection), matchId);
				send(connection, new JsonObject().add("type", "preparationChanged").add("requestId", JsonValue.NULL)
					.add("code", "ACCEPTED").add("matchId", matchId));
			} catch (SQLException | MatchService.Failure denied) {
				preparationSubscriptions.remove(connection); fail(connection, null, "VIEW_UNAVAILABLE");
			}
		}
	}

	@Override public synchronized void disconnect(BrowserMatchAdapter.Connection connection) {
		if (connection == computerDispatcher) computerDispatcher = null;
		computerConnections.remove(connection);
		principals.remove(connection); publisher.remove(connection); preparationSubscriptions.remove(connection);
	}
	private void retire(BrowserMatchAdapter.Connection connection) {
		if (connection == computerDispatcher) computerDispatcher = null;
		computerConnections.remove(connection);
		principals.remove(connection);
		publisher.remove(connection);
		preparationSubscriptions.remove(connection);
		retired.add(connection);
		fail(connection, null, "CONNECTION_REPLACED");
		connection.close(1008, "Connection replaced by a newer authenticated session");
	}
	private void send(BrowserMatchAdapter.Connection connection, JsonObject response) { connection.send(response.set("version", 2).toString()); }
	private void fail(BrowserMatchAdapter.Connection connection, String id, String code) {
		send(connection, new JsonObject().add("type", "error").add("requestId", id == null ? JsonValue.NULL : JsonValue.valueOf(id)).add("code", code));
	}
	private void fields(JsonObject request, String... allowed) {
		if (request.size() != allowed.length || !new HashSet<>(request.names()).equals(new HashSet<>(Arrays.asList(allowed)))) throw new IllegalArgumentException();
	}
}
