package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
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
	private final BrowserTeamJson catalog = new BrowserTeamJson(new RosterCatalog());
	private final Map<BrowserMatchAdapter.Connection, AuthenticatedPrincipal> principals = new LinkedHashMap<>();
	private final Map<BrowserMatchAdapter.Connection, String> preparationSubscriptions = new LinkedHashMap<>();
	private final Set<BrowserMatchAdapter.Connection> retired = Collections.newSetFromMap(new WeakHashMap<BrowserMatchAdapter.Connection, Boolean>());

	public BrowserV2Adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup,
		MatchService matches, V2PreparationService preparation, BrowserSavedTeamJson teams) {
		this.authenticator = authenticator; this.access = access; this.setup = setup;
		this.matches = matches; this.preparation = preparation; this.teams = teams;
		this.publisher = new ActiveMatchPublisher(access, setup);
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
			if ("authenticate".equals(type)) {
				fields(request, "version", "type", "requestId", "bearer");
				if (principals.containsKey(connection)) { fail(connection, requestId, "IDENTITY_REBINDING_FORBIDDEN"); return; }
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
			principal = access.require(principal, ApplicationScope.PLAYER);
			request.set("version", 1); // Internal R2 contract remains version 1.
			JsonObject response;
			if ("setup".equals(type)) {
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
					String opponent = access.opponentAccount(principal, id);
					boolean disconnected = opponent != null && principals.values().stream().noneMatch(p -> p.accountId().equals(opponent));
					response = preparation.releaseAbandoned(principal.accountId(), id, requestId, disconnected);
				} else if ("activate".equals(operation) || "load".equals(operation)) {
					String role = access.playerRole(principal, request.get("matchId").asString());
					response = "activate".equals(operation) ? setup.activate(role, request.toString())
						: new MatchJson().handle(matches, role, request.toString());
				} else response = preparation.handle(principal.accountId(), request);
			} else if ("savedTeam".equals(type)) response = teams.handle(principal.accountId(), request.toString());
			else if ("catalog".equals(type)) { fields(request, "version", "type", "requestId"); response = catalog.catalog(requestId); }
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
			}
		} catch (V2PrincipalAuthenticator.Rejected rejected) { fail(connection, requestId, "AUTHENTICATION_FAILED"); }
		catch (MatchService.Failure rejected) { fail(connection, requestId, rejected.code); }
		catch (SQLException unavailable) { fail(connection, requestId, "PERSISTENCE_FAILED"); }
		catch (RuntimeException malformed) { fail(connection, requestId, "MALFORMED_MESSAGE"); }
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
		principals.remove(connection); publisher.remove(connection); preparationSubscriptions.remove(connection);
	}
	private void retire(BrowserMatchAdapter.Connection connection) {
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
