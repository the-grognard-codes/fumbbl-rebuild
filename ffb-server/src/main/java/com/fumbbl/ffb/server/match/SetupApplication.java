package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.FantasyFootballServer;

import java.sql.SQLException;
import java.time.Clock;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;

/** Invoked on the existing communication worker; optional private checkpoints preserve activated engines. */
public final class SetupApplication {
	private final FantasyFootballServer server;
	private final MatchService matches;
	private final RecoveryRepository recovery;
	private final boolean defaultSetup;
	private final boolean saveResume;
	private final Clock clock;
	private static final long IDLE_MILLIS = 30 * 60 * 1000L;
	private final Map<String, Long> lastAccess = new LinkedHashMap<>();
	private final Map<String, Long> generations = new LinkedHashMap<>();
	private final Map<String, SetupSession> sessions = new LinkedHashMap<>();
	private final Map<String, String> pendingActivations = new LinkedHashMap<>();
	private long engineId = -2;
	private long completedReleases;
	private long failedReleases;
	private long idleReleases;
	private long capacityRejections;
	private long restoredSessions;
	private long retentionRejections;
	private final java.util.Set<String> completionBroadcasts = new HashSet<>();
	// Legacy runtimes retain their completed engine under the historic 32-session limit.
	// Keep their peer-notification acknowledgement with that bounded resident lifetime.
	private final java.util.Set<String> legacyCompletionBroadcasted = new HashSet<>();
	public boolean takeCompletionBroadcast(String matchId) { return completionBroadcasts.remove(matchId); }

	/** Worker-thread operational counters; contains no match IDs or private state. */
	public JsonObject lifecycleMetrics() {
		return new JsonObject().add("residentSessions", sessions.size()).add("residentLimit", 32)
			.add("pendingActivations", pendingActivations.size()).add("completedReleases", completedReleases)
			.add("failedReleases", failedReleases).add("idleReleases", idleReleases).add("idleMillis", IDLE_MILLIS)
			.add("capacityRejections", capacityRejections).add("restoredSessions", restoredSessions)
			.add("retentionRejections", retentionRejections);
	}

	private void release(String id) {
		sessions.remove(id);
		generations.remove(id);
		lastAccess.remove(id);
	}

	/** Called only on the communication worker after authorization. Durable checkpoints are never deleted. */
	private void releaseIdle() {
		if (recovery == null) return;
		long now = clock.millis();
		for (String id : new java.util.ArrayList<>(lastAccess.keySet())) {
			if (now - lastAccess.get(id) >= IDLE_MILLIS && !sessions.get(id).isComplete()) { release(id); idleReleases++; }
		}
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches) {
		this(server, matches, null);
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery) {
		this(server, matches, recovery, false);
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup) {
		this(server, matches, recovery, defaultSetup, Clock.systemUTC(), false);
	}

	/** New activations use the r4.1 runtime; older checkpoint runtimes remain recoverable as themselves. */
	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, boolean saveResume) {
		this(server, matches, recovery, defaultSetup, Clock.systemUTC(), saveResume);
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, Clock clock) {
		this(server, matches, recovery, defaultSetup, clock, false);
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, Clock clock, boolean saveResume) {
		if ((defaultSetup || saveResume) && recovery == null) throw new IllegalArgumentException("Versioned setup requires recovery");
		if (saveResume && !defaultSetup) throw new IllegalArgumentException("Save/resume requires the default checkpoint runtime");
		this.defaultSetup = defaultSetup;
		this.saveResume = saveResume;
		this.clock = java.util.Objects.requireNonNull(clock);
		this.server = server; this.matches = matches; this.recovery = recovery;
	}

	public JsonObject activate(String owner, String text) {
		JsonObject request = JsonObject.readFrom(text);
		String matchId, key;
		try {
			if (request.size() != 6 || !new HashSet<>(request.names()).equals(new HashSet<>(Arrays.asList(
				"version", "type", "operation", "requestId", "matchId", "expectedRevision")))) throw new IllegalArgumentException();
			if (request.get("version").asInt() != 1 || !"preparedMatch".equals(request.get("type").asString())
				|| !"activate".equals(request.get("operation").asString())) throw new IllegalArgumentException();
			matchId = request.get("matchId").asString();
			key = owner + "|" + request.get("requestId").asString() + "|" + request.get("expectedRevision").asInt();
		} catch (RuntimeException invalid) { return new MatchJson().handle(matches, owner, text); }
		if (recovery != null) return activateRecoverable(owner, text, request, matchId);
		// Keep resident engines bounded; never evict a live lifetime and permit reinitialization.
		try {
			MatchDocument document = matches.load(owner, matchId).document;
			if (document.lifecycle == MatchDocument.Lifecycle.AWAITING_SETUP && !sessions.containsKey(matchId)) {
				if (sessions.size() + pendingActivations.size() >= 32 && !pendingActivations.containsKey(matchId))
					return new JsonObject().add("version", 1).add("type", "preparedMatch").add("requestId", request.get("requestId"))
						.add("code", "ACTIVATION_LIMIT").add("duplicate", false).add("callerRole", JsonValue.NULL)
						.add("document", JsonValue.NULL).add("recoveryMatchId", JsonValue.NULL);
				pendingActivations.put(matchId, key);
			}
		} catch (SQLException failure) {
			return preparedFailure(request, "PERSISTENCE_FAILED");
		} catch (MatchService.Failure failure) {
			return preparedFailure(request, failure.code);
		}
		JsonObject response = new MatchJson().handle(matches, owner, text);
		if ("ACCEPTED".equals(response.getString("code", null)) && key.equals(pendingActivations.get(matchId))
			&& !sessions.containsKey(matchId)) {
			String id = response.get("document").asObject().getString("matchId", null);
			// A local pending reservation permits reconciliation; a retry after restart has no reservation.
			// Reserve the lifetime before initialization, including failures. Never attempt initialization twice.
			pendingActivations.remove(id);
			sessions.put(id, null);
			try {
				sessions.put(id, new SetupSession(server, matches.load(owner, id).document, engineId--));
			} catch (SQLException | RuntimeException failure) {
				// ACTIVATED remains durable; load reports SESSION_UNAVAILABLE. No rollback or phantom recovery.
			}
		} else if (!"MATCH_OUTCOME_UNKNOWN".equals(response.getString("code", null)) && key.equals(pendingActivations.get(matchId))) {
			pendingActivations.remove(matchId);
		}
		return response;
	}

	private JsonObject activateRecoverable(String owner, String text, JsonObject request, String id) {
		try {
			MatchDocument document = matches.load(owner, id).document;
			releaseIdle();
			if (document.lifecycle == MatchDocument.Lifecycle.AWAITING_SETUP
				&& document.documentVersion == request.get("expectedRevision").asInt()
				&& request.get("requestId").asString().matches("[A-Za-z0-9_-]{1,100}")
				&& document.request(owner, request.get("requestId").asString()) == null) {
				if (sessions.size() >= 32 && !sessions.containsKey(id)) { capacityRejections++; return preparedFailure(request, "ACTIVATION_LIMIT"); }
				RecoveryRepository.Record staged = recovery.find(id);
				if (staged == null) {
					// Persist an unpublished initial checkpoint first. Activation can then be retried after any crash.
					SetupSession initial = new SetupSession(server, document, engineId--, true, defaultSetup, saveResume);
					if (saveResume) initial.startSaveResumeRetention(clock.millis());
					if (!recovery.save(new RecoveryRepository.Record(id, 1, initial.recoveryArtifact()), 0))
						return preparedFailure(request, "CONFLICT");
				} else new SetupSession(server, document, staged.json); // Reject incompatible staged state before activation.
			}
			JsonObject response = new MatchJson().handle(matches, owner, text);
			if ("ACCEPTED".equals(response.getString("code", null)) && !sessions.containsKey(id)) {
				MatchDocument activated = matches.load(owner, id).document;
				if (activated.lifecycle == MatchDocument.Lifecycle.ACTIVATED) restore(id, activated);
			}
			return response;
		} catch (RecoveryRepository.RetentionLimit full) { retentionRejections++; return preparedFailure(request, "RETENTION_LIMIT"); }
		catch (RecoveryRepository.OutcomeUnknown unknown) { return preparedFailure(request, "MATCH_OUTCOME_UNKNOWN"); }
		catch (SQLException unavailable) { return preparedFailure(request, "PERSISTENCE_FAILED"); }
		catch (MatchService.Failure rejected) { return preparedFailure(request, rejected.code); }
		catch (RuntimeException invalid) { return preparedFailure(request, "RECOVERY_CORRUPT"); }
	}

	private SetupSession restore(String id, MatchDocument document) throws SQLException {
		RecoveryRepository.Record record = recovery.find(id);
		if (record == null) return null; // Never initialize an already active pre-R2 match.
		if (sessions.size() >= 32) { capacityRejections++; throw new MatchService.Failure("ACTIVATION_LIMIT"); }
		SetupSession session = new SetupSession(server, document, record.json);
		if (session.isFailed()) return session;
		sessions.put(id, session);
		generations.put(id, record.generation);
		lastAccess.put(id, clock.millis());
		restoredSessions++;
		return session;
	}

	private void checkpoint(String owner, String id, SetupSession session, String before) throws SQLException {
		if (recovery == null) return;
		try {
			matches.load(owner, id); // Reauthorize before the durable mutation as well as before engine execution.
			String after = session.recoveryArtifact();
			if (after.equals(before)) return;
			long generation = generations.get(id);
			if (!recovery.save(new RecoveryRepository.Record(id, generation + 1, after), generation))
				throw new MatchService.Failure("RECOVERY_CONFLICT");
			generations.put(id, generation + 1);
			if (session.isFailed()) { release(id); failedReleases++; }
		} catch (SQLException | RuntimeException failure) {
			release(id); // Reconcile the durable outcome before any further use.
			throw failure;
		}
	}

	private JsonObject preparedFailure(JsonObject request, String code) {
		return new JsonObject().add("version", 1).add("type", "preparedMatch").add("requestId", request.get("requestId"))
			.add("code", code).add("duplicate", false).add("callerRole", JsonValue.NULL)
			.add("document", JsonValue.NULL).add("recoveryMatchId", JsonValue.NULL);
	}

	public JsonObject handle(String owner, JsonObject request) {
		String requestId = request.getString("requestId", null);
		try {
			validate(request);
			String id = request.getString("matchId", null);
			MatchDocument document = matches.load(owner, id).document;
			String role = owner.equals(document.home.owner) ? "home"
				: document.away != null && owner.equals(document.away.owner) ? "away" : null;
			if (role == null) throw new MatchService.Failure("NOT_FOUND");
			releaseIdle();
			if (recovery != null && document.lifecycle == MatchDocument.Lifecycle.COMPLETED)
				return completedReply(owner, document, role, request);
			SetupSession recovered = null;
			if (recovery != null && !sessions.containsKey(id)
				&& document.lifecycle == MatchDocument.Lifecycle.ACTIVATED) recovered = restore(id, document);
			if (document.lifecycle == MatchDocument.Lifecycle.COMPLETED && !sessions.containsKey(id)) {
                if (!"load".equals(request.getString("operation", null))) throw new MatchService.Failure("MATCH_COMPLETED");
                JsonObject artifact = JsonObject.readFrom(matches.result(owner, id).json());
                com.eclipsesource.json.JsonArray events = artifact.get("events").asArray();
                JsonObject terminal = events.get(events.size() - 1).asObject().get("state").asObject().set("callerRole", role);
                return new JsonObject().add("version", 1).add("type", "setupState").add("requestId", requestId)
                    .add("code", "ACCEPTED").add("duplicate", false).add("state", terminal);
            }
            if (document.lifecycle != MatchDocument.Lifecycle.COMPLETED && document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("NOT_ACTIVATED");
			SetupSession session = recovered == null ? sessions.get(id) : recovered;
			if (session == null) throw new MatchService.Failure("SESSION_UNAVAILABLE");
			if (session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
			if (recovery != null) lastAccess.put(id, clock.millis());
			String before = recovery == null ? null : session.recoveryArtifact();
			if (session.abandonIfInactive(clock.millis())) {
				checkpoint(owner, id, session, before);
				release(id);
				return failure(requestId, "MATCH_ABANDONED");
			}
			session.expireSaveResumeProposal(clock.millis());
			JsonObject response;
			try {
				String operation = request.getString("operation", null);
				response = "load".equals(operation) ? session.reply(requestId, "ACCEPTED", false, role)
					: isSaveResumeOperation(operation) ? session.saveResume(role, request, clock.millis()) : session.apply(role, request);
				if ("ACCEPTED".equals(response.getString("code", null)) && !response.getBoolean("duplicate", false)
					&& !"load".equals(operation) && !isSaveResumeOperation(operation)) session.recordPlayerActivity(clock.millis());
			} catch (RuntimeException failure) {
				checkpoint(owner, id, session, before);
				throw failure;
			}
			checkpoint(owner, id, session, before);
			session.decorateSaveResume(response);
            // Persist before acknowledging terminal success. A retry/load reconciles without executing the engine again.
			if (session.isComplete()) {
				matches.complete(owner, id, session.completedMatch());
				if (recovery == null) {
					if (legacyCompletionBroadcasted.add(id)) completionBroadcasts.add(id);
				} else if (document.lifecycle != MatchDocument.Lifecycle.COMPLETED) completionBroadcasts.add(id);
				if (recovery != null) { release(id); completedReleases++; }
			}
            return response;
		} catch (RecoveryRepository.OutcomeUnknown failure) { return failure(requestId, "MATCH_OUTCOME_UNKNOWN"); }
		catch (MatchService.OutcomeUnknown failure) { return failure(requestId, "MATCH_OUTCOME_UNKNOWN"); }
        catch (MatchService.Failure failure) { return failure(requestId, failure.code); }
		catch (SQLException failure) { return failure(requestId, "PERSISTENCE_FAILED"); }
		catch (RuntimeException failure) { return failure(requestId, "INVALID_REQUEST"); }
	}

	private JsonObject completedReply(String owner, MatchDocument document, String role, JsonObject request) throws SQLException {
		RecoveryRepository.Record record = recovery.find(document.matchId);
		if (record == null) {
			if (!"load".equals(request.getString("operation", null))) throw new MatchService.Failure("MATCH_COMPLETED");
			JsonObject artifact = JsonObject.readFrom(matches.result(owner, document.matchId).json());
			com.eclipsesource.json.JsonArray events = artifact.get("events").asArray();
			return new JsonObject().add("version", 1).add("type", "setupState").add("requestId", request.get("requestId"))
				.add("code", "ACCEPTED").add("duplicate", false)
				.add("state", events.get(events.size() - 1).asObject().get("state").asObject().set("callerRole", role));
		}
		// Use the existing R2 validator, including native round-trip assertions. This transient
		// reconstruction never enters the resident pool and never receives an engine command.
		SetupSession terminal = new SetupSession(server, document, record.json);
		if (!terminal.isComplete() || terminal.isFailed()
			|| !terminal.completedMatch().equals(matches.result(owner, document.matchId)))
			throw new MatchService.Failure("RECOVERY_CORRUPT");
		JsonObject response = "load".equals(request.getString("operation", null))
			? terminal.reply(request.getString("requestId", null), "ACCEPTED", false, role) : terminal.apply(role, request);
		if (sessions.containsKey(document.matchId) && "ACCEPTED".equals(response.getString("code", null))) {
			// A resident terminal engine means the earlier result commit was not acknowledged.
			completionBroadcasts.add(document.matchId);
			completedReleases++;
			release(document.matchId);
		}
		return response;
	}

	public JsonObject failure(String id, String code) {
		return new JsonObject().add("version", 1).add("type", "setupState").add("requestId", id)
			.add("code", code).add("duplicate", false).add("state", JsonValue.NULL);
	}

	/** Internal v2 read-only source; authorization and visibility are enforced before this is invoked. */
	public JsonObject spectatorView(String matchId) throws SQLException {
		MatchDocument document = matches.load("home", matchId).document;
		if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("NOT_FOUND");
		releaseIdle();
		if (recovery != null && !sessions.containsKey(matchId)) restore(matchId, document);
		SetupSession session = sessions.get(matchId);
		if (session == null) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (recovery != null) lastAccess.put(matchId, clock.millis());
		return session.decorateSaveResumeState(session.spectatorView());
	}

	private void validate(JsonObject request) {
		String operation = request.get("operation").asString();
		String[] base = { "version", "type", "operation", "requestId", "matchId" };
		java.util.List<String> fields = new java.util.ArrayList<>(Arrays.asList(base));
		if (!"load".equals(operation)) {
			fields.add("expectedRevision");
			if (request.get("expectedRevision").asInt() < 0) throw new IllegalArgumentException();
		}
		switch (operation) {
			case "load": case "confirm": case "saveRequest": case "resumeRequest": break;
			case "saveAccept": case "saveReject": case "saveCancel": case "resumeAccept": case "resumeReject": case "resumeCancel":
				fields.add("proposalId"); if (!request.get("proposalId").asString().matches("[0-9a-f-]{36}")) throw new IllegalArgumentException(); break;
			case "action": fields.add("actionId"); if (request.get("actionId").asString().length() > 200) throw new IllegalArgumentException(); break;
			case "choice": fields.add("promptId"); fields.add("optionId"); request.get("promptId").asString(); request.get("optionId").asString(); break;
			case "place":
				fields.add("playerId"); fields.add("to"); request.get("playerId").asString();
				if (!request.get("to").isNull()) {
					JsonObject to = request.get("to").asObject();
					if (to.size() != 2 || !new HashSet<>(to.names()).equals(new HashSet<>(Arrays.asList("x", "y")))) throw new IllegalArgumentException();
					to.get("x").asInt(); to.get("y").asInt();
				}
				break;
			default: throw new IllegalArgumentException();
		}
		if (request.size() != fields.size() || !new HashSet<>(request.names()).equals(new HashSet<>(fields))
			|| request.get("version").asInt() != 1 || !"setup".equals(request.get("type").asString())
			|| !request.get("requestId").asString().matches("[A-Za-z0-9_-]{1,100}")) throw new IllegalArgumentException();
	}

	private boolean isSaveResumeOperation(String operation) {
		return "saveRequest".equals(operation) || "saveAccept".equals(operation) || "saveReject".equals(operation) || "saveCancel".equals(operation)
			|| "resumeRequest".equals(operation) || "resumeAccept".equals(operation) || "resumeReject".equals(operation) || "resumeCancel".equals(operation);
	}
}
