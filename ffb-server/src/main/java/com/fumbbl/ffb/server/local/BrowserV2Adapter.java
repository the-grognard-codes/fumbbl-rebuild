package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.FrozenTeam;
import com.fumbbl.ffb.server.match.LobbyReadBudget;
import com.fumbbl.ffb.server.match.MatchChat;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchJson;
import com.fumbbl.ffb.server.match.MatchMembership;
import com.fumbbl.ffb.server.match.MatchResultJson;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.ProviderSessionRejection;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.function.LongSupplier;

/** One authenticated protocol for preparation, play and read-only observation. */
public final class BrowserV2Adapter implements BrowserProtocol {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final V2PrincipalAuthenticator authenticator;
	private final V2MatchAccess access;
	private final SetupApplication setup;
	private final ActiveMatchPublisher publisher;
	private final PublicationDelivery delivery;
	private final MatchService matches;
	private final V2PreparationService preparation;
	private final BrowserSavedTeamJson teams;
	private final ComputerOpponentService computers;
	private final Clock clock;
	private SkillUsePreferenceService skillUsePreferences;
	private BrowserConnection computerDispatcher;
	private final Set<BrowserConnection> computerConnections = new HashSet<>();
	private final BrowserTeamJson catalog = new BrowserTeamJson(new RosterCatalog());
	private final Map<BrowserConnection, AuthenticatedPrincipal> principals = new LinkedHashMap<>();
	private final Map<BrowserConnection, String> connectionPurposes = new LinkedHashMap<>();
	private final Set<BrowserConnection> diagnostics = new HashSet<>();
	private final Map<BrowserConnection, Long> diagnosticProbeAt = new LinkedHashMap<>();
	private boolean diagnosticsAllowed;
	private final Map<BrowserConnection, LobbyReadLimiter> lobbyReads = new LinkedHashMap<>();
	private LongSupplier readNanos = System::nanoTime;
	void readClock(LongSupplier nanos) { readNanos = nanos; }
	private final Map<BrowserConnection, Long> preparationCompletedAt = new LinkedHashMap<>();
	private final Map<BrowserConnection, String> preparationSubscriptions = new LinkedHashMap<>();
	private final Set<BrowserConnection> retired = Collections.newSetFromMap(new WeakHashMap<BrowserConnection, Boolean>());

	public BrowserV2Adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup,
		MatchService matches, V2PreparationService preparation, BrowserSavedTeamJson teams) {
		this(authenticator, access, setup, matches, preparation, teams, new ComputerOpponentService(null));
	}

	public BrowserV2Adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup,
		MatchService matches, V2PreparationService preparation, BrowserSavedTeamJson teams, ComputerOpponentService computers) {
		this(authenticator, access, setup, matches, preparation, teams, computers, Clock.systemUTC());
	}

	BrowserV2Adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup,
		MatchService matches, V2PreparationService preparation, BrowserSavedTeamJson teams, ComputerOpponentService computers, Clock clock) {
		this.authenticator = authenticator; this.access = access; this.setup = setup;
		this.matches = matches; this.preparation = preparation; this.teams = teams;
		this.computers = computers;
		this.clock = clock;
		this.delivery = new PublicationDelivery(access);
		this.publisher = new ActiveMatchPublisher(access, setup, delivery);
		authenticator.observeProviderRejection(this::providerRejected);
	}

	public void configureSkillUsePreferences(SkillUsePreferenceService service) { skillUsePreferences = service; }
	/** Called by the server-owned fixed transport policy, never by a browser field. */
	void configureDiagnostics(boolean allowed) { diagnosticsAllowed = allowed; }

	@Override public boolean hasPendingPublications() { return delivery.hasPending(); }
	@Override public synchronized void retryPublications() { delivery.retry(); }

	@Override public synchronized void expireDecisions() {
		setup.expireReactiveDecisions().forEach((id, state) -> publisher.publish(id, null, state));
	}

	@Override public synchronized void receive(BrowserConnection connection, String text) {
		if (retired.contains(connection)) return;
		String requestId = null;
		boolean lobbyRead = false;
		try {
			catalog.checkEnvelope(text);
			JsonObject request = JsonObject.readFrom(text);
			requestId = request.getString("requestId", null);
			if (requestId == null || !requestId.matches("[A-Za-z0-9_-]{1,100}")) throw new IllegalArgumentException();
			if (request.getInt("version", -1) != 2) { fail(connection, requestId, "UNSUPPORTED_VERSION"); return; }
			BrowserV2RequestType type = BrowserV2RequestType.fromWireName(request.getString("type", ""));
			timing.selectRequest(request);
			enableDiagnosticsReplies(connection);
			if (type == BrowserV2RequestType.AUTHENTICATE_COMPUTER) {
				publisher.liveTranscript(connection, false);
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
			if (type == BrowserV2RequestType.AUTHENTICATE) {
				publisher.liveTranscript(connection, false);
				List<String> authenticationFields = new ArrayList<>(Arrays.asList("version", "type", "requestId", "bearer"));
				if (request.get("purpose") != null) authenticationFields.add("purpose");
				JsonValue requestedTranscript = request.get("liveTranscript");
				if (requestedTranscript != null) authenticationFields.add("liveTranscript");
				fields(request, authenticationFields.toArray(new String[0]));
				if (requestedTranscript != null && !requestedTranscript.isBoolean()) throw new IllegalArgumentException();
				boolean liveTranscript = requestedTranscript != null && requestedTranscript.asBoolean();
				String purpose = request.getString("purpose", "play");
				if (!"play".equals(purpose) && !"preparation".equals(purpose)) throw new IllegalArgumentException();
				if (principals.containsKey(connection) || computerConnections.contains(connection)) {
					fail(connection, requestId, "IDENTITY_REBINDING_FORBIDDEN"); return;
				}
				AuthenticatedPrincipal principal = authenticator.authenticate(request.get("bearer").asString());
				// Keep one preparation and one play connection per account. Reconnects replace only their own purpose.
				for (BrowserConnection prior : new ArrayList<>(principals.keySet())) {
					if (principals.get(prior).accountId().equals(principal.accountId())
						&& purpose.equals(connectionPurposes.get(prior))) {
						retire(prior);
					}
				}
				principals.put(connection, principal);
				connectionPurposes.put(connection, purpose);
				publisher.liveTranscript(connection, liveTranscript);
				JsonObject authentication = new JsonObject().add("type", "authentication").add("requestId", requestId)
					.add("code", "ACCEPTED").add("accountId", principal.accountId());
				if (liveTranscript) authentication.add("liveTranscript", true);
				send(connection, authentication);
				return;
			}
			if (computerConnections.contains(connection)) {
				handleComputerConnection(connection, request);
				return;
			}
			AuthenticatedPrincipal principal = principals.get(connection);
			if (type == BrowserV2RequestType.DIAGNOSTICS) {
				String operation = request.getString("operation", "");
				if ("configure".equals(operation)) {
					if (request.get("detailVersion") != null) {
						fields(request, "version", "type", "requestId", "operation", "enabled", "detailVersion");
						if (request.getInt("detailVersion", -1) != 1) throw new IllegalArgumentException();
					} else fields(request, "version", "type", "requestId", "operation", "enabled");
				}
				else if ("probe".equals(operation)) fields(request, "version", "type", "requestId", "operation");
				else throw new IllegalArgumentException();
				if (principal == null) throw new MatchService.Failure("AUTHENTICATION_REQUIRED");
				access.require(principal, principal.hasScope(ApplicationScope.PLAYER) ? ApplicationScope.PLAYER : ApplicationScope.SPECTATOR);
				if ("configure".equals(operation)) {
					boolean enabled = request.get("enabled").asBoolean();
					if (enabled && !diagnosticsAllowed) { fail(connection, requestId, "UNSUPPORTED_MESSAGE"); return; }
					if (enabled) diagnostics.add(connection);
					else diagnostics.remove(connection);
					connection.diagnosticsEnabled(enabled);
					boolean details = enabled && request.get("detailVersion") != null;
					connection.diagnosticDetailsEnabled(details);
					JsonObject configured = new JsonObject().add("type", "diagnostics").add("requestId", requestId).add("code", "ACCEPTED").add("enabled", enabled);
					if (request.get("detailVersion") != null) configured.add("detailVersion", 1);
					send(connection, configured);
				} else {
					if (!diagnosticsAllowed || !diagnostics.contains(connection)) { fail(connection, requestId, "DIAGNOSTICS_DISABLED"); return; }
					long now = clock.millis(), previous = diagnosticProbeAt.getOrDefault(connection, Long.MIN_VALUE);
					if (previous != Long.MIN_VALUE && (now < previous || now - previous < 1000)) {
						fail(connection, requestId, "RATE_LIMITED"); return;
					}
					diagnosticProbeAt.put(connection, now);
					send(connection, new JsonObject().add("type", "diagnostics").add("requestId", requestId)
						.add("code", "ACCEPTED").add("enabled", true));
				}
				return;
			}
			if (type == BrowserV2RequestType.SKILL_USE_PREFERENCES) {
				principal = access.require(principal, ApplicationScope.PLAYER);
				String operation = request.getString("operation", "");
				if ("load".equals(operation)) fields(request, "version", "type", "requestId", "operation");
				else if ("update".equals(operation)) fields(request, "version", "type", "requestId", "operation", "useCase", "mode");
				else throw new IllegalArgumentException();
				if (skillUsePreferences == null) { fail(connection, requestId, "PREFERENCES_UNAVAILABLE"); return; }
				SkillUsePreferences preferences = "load".equals(operation) ? skillUsePreferences.load(principal.accountId())
					: skillUsePreferences.update(principal.accountId(), SkillUsePreferences.UseCase.fromKey(request.get("useCase").asString()),
						SkillUsePreferences.Mode.fromKey(request.get("mode").asString()));
				send(connection, new JsonObject().add("type", "skillUsePreferences").add("requestId", requestId)
					.add("code", "ACCEPTED").add("preferences", preferences.toJson()));
				return;
			}
			if (type == BrowserV2RequestType.CURRENT_MATCHES) {
				fields(request, "version", "type", "requestId", "after");
				JsonValue after = request.get("after");
				if (!after.isNull() && (!after.isString()
					|| !after.asString().matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))) throw new IllegalArgumentException();
				lobbyRead = true;
				admitLobbyRead(connection, principal, ApplicationScope.PLAYER);
				LobbyReadBudget budget = new LobbyReadBudget();
				budget.check();
				List<MatchMembership> memberships = access.currentMatches(principal, after.isNull() ? null : after.asString());
				if (expirePreparation(connection)) return;
				JsonArray entries = new JsonArray();
				int count = Math.min(LobbyReadBudget.MAX_ENTRIES, memberships.size());
				List<String> ids = new ArrayList<>();
				for (int index = 0; index < count; index++) ids.add(memberships.get(index).matchId);
				Map<String, MatchDocument> documents = setup.browseDocuments(ids, budget);
				List<String> active = new ArrayList<>();
				for (MatchDocument document : documents.values()) if (document.lifecycle == MatchDocument.Lifecycle.ACTIVATED) active.add(document.matchId);
				Map<String, JsonObject> states = setup.browseStates(active, budget);
				for (int index = 0; index < count; index++) {
					MatchMembership membership = memberships.get(index);
					JsonObject entry = new JsonObject().add("matchId", membership.matchId).add("callerRole", membership.role)
						.add("lifecycle", "UNAVAILABLE").add("homeTeamName", JsonValue.NULL)
						.add("awayTeamName", JsonValue.NULL).add("phase", JsonValue.NULL);
					budget.check();
					MatchDocument document = documents.get(membership.matchId);
					if (document != null) {
						if (document.lifecycle == MatchDocument.Lifecycle.COMPLETED) continue;
						entry.set("lifecycle", document.lifecycle.name())
							.set("homeTeamName", document.home.team.teamName == null || document.home.team.teamName.isEmpty() ? "Home" : document.home.team.teamName)
							.set("awayTeamName", document.away == null ? JsonValue.NULL
								: JsonValue.valueOf(document.away.team.teamName == null || document.away.team.teamName.isEmpty() ? "Away" : document.away.team.teamName));
						if (document.lifecycle == MatchDocument.Lifecycle.ACTIVATED) {
							JsonObject state = states.get(membership.matchId);
							if (state != null && state.get("phase") != null) entry.set("phase", state.get("phase"));
							else entry.set("lifecycle", "UNAVAILABLE");
						}
					}
					entries.add(entry);
				}
				sendLobby(connection, budget, new JsonObject().add("type", "currentMatches").add("requestId", requestId).add("code", "ACCEPTED")
					.add("matches", entries).add("next", memberships.size() > count
						? JsonValue.valueOf(memberships.get(count - 1).matchId) : JsonValue.NULL));
				return;
			}
			if (type == BrowserV2RequestType.BROWSE) {
				JsonValue requestedDetails = request.get("includeDetails");
				if (requestedDetails == null) fields(request, "version", "type", "requestId");
				else fields(request, "version", "type", "requestId", "includeDetails");
				if (requestedDetails != null && !requestedDetails.isBoolean()) throw new IllegalArgumentException();
				boolean includeDetails = requestedDetails != null && requestedDetails.asBoolean();
				lobbyRead = true;
				admitLobbyRead(connection, principal, ApplicationScope.SPECTATOR);
				LobbyReadBudget budget = new LobbyReadBudget();
				budget.check();
				List<String> visible = access.browse(principal);
				List<String> ids = visible.subList(0, Math.min(LobbyReadBudget.MAX_ENTRIES, visible.size()));
				Map<String, MatchDocument> documents = includeDetails ? setup.browseDocuments(ids, budget) : Map.of();
				List<String> active = new ArrayList<>();
				for (MatchDocument document : documents.values()) if (document.lifecycle == MatchDocument.Lifecycle.ACTIVATED && document.away != null) active.add(document.matchId);
				Map<String, JsonObject> states = includeDetails ? setup.browseStates(active, budget) : Map.of();
				JsonArray list = new JsonArray();
				for (String id : ids) {
					budget.check();
					JsonObject entry = new JsonObject().add("matchId", id).add("label", "Home vs Away");
					MatchDocument document = documents.get(id);
					if (document != null && document.lifecycle == MatchDocument.Lifecycle.ACTIVATED && document.away != null)
						entry.add("details", browseDetails(document, states.get(id), publisher.spectatorCount(id)));
					list.add(entry);
				}
				sendLobby(connection, budget, new JsonObject().add("type", "browse").add("requestId", requestId).add("code", "ACCEPTED").add("matches", list));
				return;
			}
			if (type == BrowserV2RequestType.WATCH) {
				fields(request, "version", "type", "requestId", "matchId");
				String id = request.get("matchId").asString();
				JsonObject state = publisher.watch(connection, principal, id, requestId);
				preparationSubscriptions.remove(connection);
				publisher.sendState(connection, state, publisher.transcript(id, state.get("state").asObject())); return;
			}
			if (type == BrowserV2RequestType.MATCH_TRANSCRIPT) {
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
			if (type == BrowserV2RequestType.ROUTE_PREVIEW) {
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
			if (type == BrowserV2RequestType.MOVEMENT_RANGE || type == BrowserV2RequestType.MOVEMENT_PREVIEW) {
				boolean preview = type == BrowserV2RequestType.MOVEMENT_PREVIEW;
				if (preview && request.get("targetSquare") != null) fields(request, "version", "type", "requestId", "matchId", "expectedRevision",
					"playerId", "kind", "targetPlayerId", "targetSquare", "waypoints");
				else if (preview) fields(request, "version", "type", "requestId", "matchId", "expectedRevision",
					"playerId", "kind", "targetPlayerId", "waypoints");
				else fields(request, "version", "type", "requestId", "matchId", "expectedRevision", "playerId");
				principal = access.require(principal, ApplicationScope.PLAYER);
				String id = request.get("matchId").asString();
				if (!id.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
					|| request.get("expectedRevision").asInt() < 0
					|| request.get("playerId").asString().length() > 200) throw new IllegalArgumentException();
				String role = access.playerRole(principal, id);
				JsonObject result;
				if (preview) {
					String kind = request.get("kind").asString();
					if (!("move".equals(kind) || "blitz".equals(kind) || "foul".equals(kind)
						|| "pass".equals(kind) || "handOff".equals(kind))) throw new IllegalArgumentException();
					String target = request.get("targetPlayerId").isNull() ? null : request.get("targetPlayerId").asString();
					if (target != null && target.length() > 200) throw new IllegalArgumentException();
					if (request.get("targetSquare") != null) {
						JsonObject square = request.get("targetSquare").asObject();
						if (!"pass".equals(kind) || target != null || square.size() != 2
							|| !square.names().containsAll(Arrays.asList("x", "y"))
							|| square.get("x").asInt() < 0 || square.get("x").asInt() > 25
							|| square.get("y").asInt() < 0 || square.get("y").asInt() > 14) throw new IllegalArgumentException();
					}
					JsonArray waypoints = request.get("waypoints").asArray();
					if (waypoints.size() > 20) throw new IllegalArgumentException();
					result = setup.movementPreview(role, id, request.get("expectedRevision").asInt(),
						request.get("playerId").asString(), kind, target,
						request.get("targetSquare") == null ? null : request.get("targetSquare").asObject(), waypoints);
				} else result = setup.movementRange(role, id, request.get("expectedRevision").asInt(),
					request.get("playerId").asString());
				send(connection, new JsonObject().add("type", type.wireName()).add("requestId", requestId)
					.add("code", "ACCEPTED").add("matchId", id).add(preview ? "plan" : "range", result));
				return;
			}
			if (type == BrowserV2RequestType.MATCH_CHAT) {
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
			if (type == BrowserV2RequestType.COMPUTER) {
				handleComputer(connection, request);
				return;
			} else if (type == BrowserV2RequestType.SETUP) {
				String id = request.get("matchId").asString();
				String role = access.playerRole(principal, id);
				SetupApplication.HandleOutcome outcome = setup.handleWithOutcome(role, request);
				response = outcome.response();
				if ("ACCEPTED".equals(response.getString("code", ""))) {
					// Retain the socket's original credential identity; publication refreshes scopes locally.
					publisher.enrollPlayer(connection, principals.get(connection), id);
					preparationSubscriptions.remove(connection);
				}
				JsonValue state = response.get("state");
				LiveMatchTranscript transcript = publisher.transcript(id,
					state != null && state.isObject() ? state.asObject() : new JsonObject());
				publisher.sendState(connection, response, transcript);
				if (outcome.publish()) publisher.publish(id, connection, state.asObject(), transcript);
				return;
			} else if (type == BrowserV2RequestType.MATCH_RESULT) {
				String role = access.playerRole(principal, request.get("matchId").asString());
				response = new MatchResultJson().handle(matches, role, request);
			}
			else if (type == BrowserV2RequestType.PREPARED_MATCH) {
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
			} else if (type == BrowserV2RequestType.SAVED_TEAM) response = teams.handle(principal.accountId(), request.toString());
			else if (type == BrowserV2RequestType.CATALOG) {
				if (request.get("rosterId") == null) fields(request, "version", "type", "requestId");
				else fields(request, "version", "type", "requestId", "rosterId");
				response = catalog.catalog(requestId, request.get("rosterId") == null ? "human" : request.get("rosterId").asString());
			}
			else if (type == BrowserV2RequestType.VALIDATE_TEAM) { fields(request, "version", "type", "requestId", "draft");
				if (request.get("draft").asObject().getInt("draftVersion", -1) != 2) throw new IllegalArgumentException("Unsupported draft version");
				response = catalog.evaluate(requestId, request.get("draft").asObject()); }
			else { fail(connection, requestId, "UNSUPPORTED_MESSAGE"); return; }
			send(connection, response);
			if (type == BrowserV2RequestType.PREPARED_MATCH && "ACCEPTED".equals(response.getString("code", ""))) {
				String id = response.get("document").asObject().getString("matchId", null);
				preparationSubscriptions.put(connection, id);
				preparationCompletedAt.remove(connection);
				publisher.remove(connection);
				if (!"load".equals(request.getString("operation", ""))) preparationChanged(id, connection);
				if ("activate".equals(request.getString("operation", "")) && preparation.isComputerMatch(id))
					sendComputerJobs(Collections.singletonList(id));
			}
		} catch (V2PrincipalAuthenticator.Rejected rejected) { fail(connection, requestId, "AUTHENTICATION_FAILED"); }
		catch (MatchService.Failure rejected) { fail(connection, requestId, rejected.code); }
		catch (JdbcConnections.NotStarted unavailable) { fail(connection, requestId, lobbyRead ? "RATE_LIMITED" : "PERSISTENCE_FAILED"); }
		catch (SQLException unavailable) { fail(connection, requestId, "PERSISTENCE_FAILED"); }
		catch (RuntimeException malformed) { fail(connection, requestId, "MALFORMED_MESSAGE"); }
	}

	private void handleComputer(BrowserConnection connection, JsonObject request) {
		String operation = request.getString("operation", "");
		String id = request.getString("requestId", null);
		if (!"status".equals(operation)) throw new IllegalArgumentException();
		fields(request, "version", "type", "operation", "requestId");
		computerResponse(connection, id, computerDispatcher == null ? "UNAVAILABLE" : "READY");
	}

	private void handleComputerConnection(BrowserConnection connection, JsonObject request) throws SQLException {
		BrowserV2RequestType type = BrowserV2RequestType.fromWireName(request.getString("type", ""));
		String id = request.getString("requestId", null);
		if (type == BrowserV2RequestType.COMPUTER && "register".equals(request.getString("operation", ""))) {
			fields(request, "version", "type", "operation", "requestId");
			List<String> activeMatches = preparation.activeComputerMatches();
			computerDispatcher = connection;
			computerResponse(connection, id, "READY");
			sendComputerJobs(activeMatches);
		} else if (type == BrowserV2RequestType.SETUP) {
			String matchId = request.get("matchId").asString();
			if (!preparation.isComputerMatch(matchId)) throw new MatchService.Failure("NOT_FOUND");
			request.set("version", 1);
			SetupApplication.HandleOutcome outcome = setup.handleComputerWithOutcome(request);
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
	private void computerResponse(BrowserConnection connection, String requestId, String code) {
		send(connection, new JsonObject().add("type", "computer").add("requestId", requestId).add("code", code));
	}

	private JsonObject browseDetails(MatchDocument document, JsonObject state, int spectators) {
		JsonObject details = new JsonObject().add("home", browseTeam(document.home.team, "Home", null))
			.add("away", browseTeam(document.away.team, "Away", computerCoach(document)))
			.add("ruleset", document.home.team.ruleset).add("competition", JsonValue.NULL)
			.add("spectators", spectators);
		for (String field : Arrays.asList("phase", "half", "turn", "homeScore", "awayScore"))
			details.add(field, state == null || state.get(field) == null ? JsonValue.NULL : state.get(field));
		return details;
	}

	private JsonObject browseTeam(FrozenTeam team, String fallback, String coach) {
		String type = team.rosterId;
		try { type = JsonObject.readFrom(team.resolvedCatalogJson).getString("name", team.rosterId); }
		catch (RuntimeException unavailable) { /* Historic frozen catalog may omit a display name. */ }
		return new JsonObject().add("name", team.teamName == null || team.teamName.isEmpty() ? fallback : team.teamName)
			.add("type", type).add("teamValue", team.total)
			.add("coach", coach == null ? JsonValue.NULL : JsonValue.valueOf(coach));
	}

	private String computerCoach(MatchDocument document) {
		com.fumbbl.ffb.server.match.ComputerCoach coach = computers.coach(document);
		if (coach == null) return null;
		if (document.away.team.coachName != null) return document.away.team.coachName;
		return ComputerOpponentService.BUGMAN_ID.equals(coach.opponentId)
			? ComputerOpponentService.LEGACY_BUGMAN_NAME : computers.coachName(coach.opponentId);
	}

	void preparationChanged(String matchId, BrowserConnection source) {
		List<PublicationDelivery.Recipient> recipients = new ArrayList<>();
		for (BrowserConnection connection : preparationSubscriptions.keySet()) {
			if (connection == source || !matchId.equals(preparationSubscriptions.get(connection))) continue;
			AuthenticatedPrincipal principal = principals.get(connection);
			if (principal == null) continue;
			recipients.add(new PublicationDelivery.Recipient() {
				@Override public boolean enrolled() { return principals.get(connection) == principal && matchId.equals(preparationSubscriptions.get(connection)); }
				@Override public V2PublicationAuthorization.Target target() { return new V2PublicationAuthorization.Target(principal, V2PublicationAuthorization.Audience.PLAYER); }
				@Override public void send(V2PublicationAuthorization.Snapshot authorization, int slot) {
					access.publicationRole(authorization, target(), slot);
					BrowserV2Adapter.this.send(connection, new JsonObject().add("type", "preparationChanged").add("requestId", JsonValue.NULL)
						.add("code", "ACCEPTED").add("matchId", matchId), () -> access.publicationRole(authorization, target(), slot));
				}
				@Override public void unavailable() { preparationSubscriptions.remove(connection); fail(connection, null, "VIEW_UNAVAILABLE"); }
				@Override public void delayed(V2PublicationAuthorization.Snapshot authorization, int slot, V2PublicationAuthorization.Family family) {
					access.publicationRole(authorization, target(), slot);
					BrowserV2Adapter.this.send(connection, new JsonObject().add("type", "publicationDelayed").add("requestId", JsonValue.NULL)
						.add("code", "PUBLICATION_DELAYED").add("matchId", matchId).add("family", family.name()),
						() -> access.publicationRole(authorization, target(), slot));
				}
			});
		}
		delivery.publish(matchId, V2PublicationAuthorization.Family.PREPARATION, recipients, matchId.length());
	}

	private void admitLobbyRead(BrowserConnection connection, AuthenticatedPrincipal principal, ApplicationScope scope) throws SQLException {
		if (principal == null) throw new MatchService.Failure("AUTHENTICATION_REQUIRED");
		if (!lobbyReads.computeIfAbsent(connection, ignored -> new LobbyReadLimiter(readNanos)).acquire()) {
			// Even overload responses refresh authorization; do not leak a viewer's former authority.
			access.require(principal, scope);
			throw new MatchService.Failure("RATE_LIMITED");
		}
	}

	private void sendLobby(BrowserConnection connection, LobbyReadBudget budget, JsonObject response) {
		budget.response(response);
		send(connection, response);
	}

	@Override public synchronized void disconnect(BrowserConnection connection) {
		diagnostics.remove(connection);
		diagnosticProbeAt.remove(connection);
		lobbyReads.remove(connection);
		connection.diagnosticsEnabled(false);
		if (connection == computerDispatcher) computerDispatcher = null;
		computerConnections.remove(connection);
		principals.remove(connection); connectionPurposes.remove(connection); preparationCompletedAt.remove(connection); publisher.disconnect(connection); preparationSubscriptions.remove(connection);
	}
	private synchronized void providerRejected(ProviderSessionRejection observation) {
		for (Map.Entry<BrowserConnection, AuthenticatedPrincipal> entry : principals.entrySet()) {
			if (!observation.rejects(entry.getValue())) continue;
			BrowserConnection connection = entry.getKey();
			publisher.remove(connection); preparationSubscriptions.remove(connection);
			try { fail(connection, null, "VIEW_UNAVAILABLE"); } catch (RuntimeException disconnected) { /* Continue retiring matching subscriptions. */ }
		}
	}
	private void retire(BrowserConnection connection) {
		diagnostics.remove(connection);
		diagnosticProbeAt.remove(connection);
		lobbyReads.remove(connection);
		connection.diagnosticsEnabled(false);
		if (connection == computerDispatcher) computerDispatcher = null;
		computerConnections.remove(connection);
		principals.remove(connection);
		connectionPurposes.remove(connection);
		preparationCompletedAt.remove(connection);
		publisher.disconnect(connection);
		preparationSubscriptions.remove(connection);
		retired.add(connection);
		fail(connection, null, "CONNECTION_REPLACED");
		connection.close(1008, "Connection replaced by a newer authenticated session");
	}

	/** The preparation inventory poll also supplies liveness; active matches have no elapsed-time limit. */
	private boolean expirePreparation(BrowserConnection connection) throws SQLException {
		String id = preparationSubscriptions.get(connection);
		if (!"preparation".equals(connectionPurposes.get(connection)) || id == null) return false;
		access.playerRole(principals.get(connection), id);
		MatchDocument document = setup.browseDocument(id);
		if (document.lifecycle != MatchDocument.Lifecycle.COMPLETED) { preparationCompletedAt.remove(connection); return false; }
		Long completedAt = preparationCompletedAt.get(connection);
		if (completedAt == null) {
			completedAt = clock.millis();
			JsonObject artifact = JsonObject.readFrom(document.completion.json());
			if (artifact.get("transcript") != null) {
				JsonArray records = artifact.get("transcript").asObject().get("records").asArray();
				if (!records.isEmpty()) completedAt = records.get(records.size() - 1).asObject().get("at").asLong();
			}
			preparationCompletedAt.put(connection, completedAt);
		}
		if (clock.millis() - completedAt < 15 * 60 * 1000L) return false;
		fail(connection, null, "PREPARATION_EXPIRED");
		retired.add(connection);
		disconnect(connection);
		connection.close(1000, "Match preparation retention ended");
		return true;
	}
	private void send(BrowserConnection connection, JsonObject response) {
		send(connection, response, () -> { });
	}
	private void send(BrowserConnection connection, JsonObject response, Runnable admission) {
		String message;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RESPONSE_SERIALIZE)) { message = response.set("version", 2).toString(); }
		timing.reply(connection, response, () -> { admission.run(); connection.send(message); });
	}
	private void enableDiagnosticsReplies(BrowserConnection connection) {
		try {
			if (diagnosticsAllowed && diagnostics.contains(connection) && principals.containsKey(connection)
				&& principals.get(connection).expiresAtMillis() > clock.millis()) timing.enableReplies(connection);
		} catch (RuntimeException unavailable) { /* A diagnostic clock must not change gameplay. */ }
	}
	private void fail(BrowserConnection connection, String id, String code) {
		send(connection, new JsonObject().add("type", "error").add("requestId", id == null ? JsonValue.NULL : JsonValue.valueOf(id)).add("code", code));
	}
	private void fields(JsonObject request, String... allowed) {
		if (request.size() != allowed.length || !new HashSet<>(request.names()).equals(new HashSet<>(Arrays.asList(allowed)))) throw new IllegalArgumentException();
	}
}
