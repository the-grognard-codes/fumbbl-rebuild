package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.IDialogParameter;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogReceiveChoiceParameter;
import com.fumbbl.ffb.factory.MechanicsFactory;
import com.fumbbl.ffb.mechanics.GameMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandCoinChoice;
import com.fumbbl.ffb.net.commands.ClientCommandEndTurn;
import com.fumbbl.ffb.net.commands.ClientCommandReceiveChoice;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.option.GameOptionBoolean;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.GameOptionString;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.factory.SequenceGeneratorFactory;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.mechanic.SetupMechanic;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.generator.EndGame;
import com.fumbbl.ffb.server.step.generator.SequenceGenerator;
import com.fumbbl.ffb.server.step.generator.StartGame;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import java.util.Date;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** One authoritative engine lifetime, initialized once or restored from a versioned private checkpoint. */
public final class SetupSession {
	public static final String LEGACY_RUNTIME = "ffb-3.4.0-bb2025-r2.2";
	public static final String DEFAULT_SETUP_RUNTIME = "ffb-3.4.0-bb2025-r2.3";
	/** A separate checkpoint contract; r2.2/r2.3 lifetimes are deliberately not upgraded in place. */
	public static final String SAVE_RESUME_RUNTIME = "ffb-3.4.0-bb2025-r4.1";
	public static final String TRANSCRIPT_RUNTIME = "ffb-3.4.0-bb2025-r5.1";
	public static final String ROUTE_RUNTIME = "ffb-3.4.0-bb2025-r5.2";
	public static final String CHAT_RUNTIME = "ffb-3.4.0-bb2025-r5.3";
	private boolean defaultSetup;
	private boolean saveResume;
	private boolean transcriptV2;
	private boolean routeV2;
	private boolean chatV1;
	private MatchTranscript transcript;
	private MatchChat chat;
	private PendingRoute pendingRoute;
	private final GameState state;
	private final String matchId;
	private final Map<String, Record> history = new LinkedHashMap<>();
	private final Set<String> kickoffSelection = new LinkedHashSet<>();
	private int revision;
	private int drive = 1;
	private int replayBytes;
	private final JsonArray events = new JsonArray();
	private final MatchDocument document;
	private boolean failed;
	private RecoveryDice recoveryDice;
	private SaveResumeState saveResumeState;

	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId) {
		this(server, document, engineId, false);
	}

	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId, boolean recoverable) {
		this(server, document, engineId, recoverable, false);
	}

	/** New v2 lifetimes opt in; the checkpoint runtime version retains the choice on restore. */
	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId, boolean recoverable, boolean defaultSetup) {
		this(server, document, engineId, recoverable, defaultSetup, false);
	}

	/** A new r4.1 lifetime persists save/resume metadata in a distinct checkpoint version. */
	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId, boolean recoverable, boolean defaultSetup, boolean saveResume) {
		this(server, document, engineId, recoverable, defaultSetup, saveResume, false);
	}

	/** New recoverable matches keep native reports with their accepted input in the same checkpoint. */
	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId, boolean recoverable, boolean defaultSetup, boolean saveResume, boolean transcriptV2) {
		this(server, document, engineId, recoverable, defaultSetup, saveResume, transcriptV2, false);
	}

	/** New r5.2 matches retain a committed route across native decision prompts. */
	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId, boolean recoverable, boolean defaultSetup, boolean saveResume, boolean transcriptV2, boolean routeV2) {
		this(server, document, engineId, recoverable, defaultSetup, saveResume, transcriptV2, routeV2, false);
	}

	/** New r5.3 matches retain public conversation alongside the native checkpoint. */
	public SetupSession(FantasyFootballServer server, MatchDocument document, long engineId, boolean recoverable, boolean defaultSetup, boolean saveResume, boolean transcriptV2, boolean routeV2, boolean chatV1) {
		if (defaultSetup && !recoverable) throw new IllegalArgumentException("Default setup requires a versioned recovery lifetime");
		if (saveResume && !recoverable) throw new IllegalArgumentException("Save/resume requires a versioned recovery lifetime");
		if (transcriptV2 && !recoverable) throw new IllegalArgumentException("Transcript requires a versioned recovery lifetime");
		if (routeV2 && !transcriptV2) throw new IllegalArgumentException("Routes require the transcript checkpoint runtime");
		if (chatV1 && !routeV2) throw new IllegalArgumentException("Chat requires the route checkpoint runtime");
		this.defaultSetup = defaultSetup;
		this.saveResume = saveResume;
		this.transcriptV2 = transcriptV2;
		this.routeV2 = routeV2;
		this.chatV1 = chatV1;
		if (transcriptV2) transcript = new MatchTranscript();
		if (chatV1) chat = new MatchChat();
		if (saveResume) saveResumeState = new SaveResumeState(0L);
		this.document = document;
		matchId = document.matchId;
		state = new GameState(server) {
			@Override public boolean usesLegacyPersistence() { return false; }
		};
		if (recoverable) {
			recoveryDice = new RecoveryDice();
			state.getDiceRoller().setRecoveryRoll(recoveryDice::roll);
		}
		Game game = state.getGame();
		game.setId(engineId);
		game.getOptions().addOption(new GameOptionString(GameOptionId.RULESVERSION).setValue("BB2025"));
		// The frozen exhibition preset excludes all inducement/prayer purchases.
		game.getOptions().addOption(new GameOptionBoolean(GameOptionId.USE_PREDEFINED_INDUCEMENTS).setValue(true));
		game.getOptions().addOption(new GameOptionBoolean(GameOptionId.INDUCEMENT_PRAYERS_AVAILABLE_FOR_UNDERDOG).setValue(false));
		game.getOptions().addOption(new GameOptionBoolean(GameOptionId.OVERTIME).setValue(false));
		game.initializeRules();
		state.initRulesDependentMembers();
		UtilSkillBehaviours.registerBehaviours(game, server.getDebugLog());
		FrozenTeamEngineConverter converter = new FrozenTeamEngineConverter();
		game.setTeamHome(converter.convert(document.home.team, game.getRules()));
		game.setTeamAway(converter.convert(document.away.team, game.getRules()));
		initializeTeam(game.getTeamHome(), document.home.owner, document.home.team.teamName.isEmpty() ? "Home" : document.home.team.teamName);
		initializeTeam(game.getTeamAway(), document.away.owner, document.away.team.teamName.isEmpty() ? "Away" : document.away.team.teamName);
		UtilBox.refreshBoxes(game);
		game.setHomePlaying(false);
		game.setTurnMode(TurnMode.START_GAME);
		// Persisted preparation and explicit activation replace the legacy lobby's start acknowledgement.
		game.setStarted(new Date());
		SequenceGeneratorFactory factory = game.getFactory(FactoryType.Factory.SEQUENCE_GENERATOR);
		((StartGame) factory.forName(SequenceGenerator.Type.StartGame.name()))
			.pushSequence(new SequenceGenerator.SequenceParams(state));
		state.startNextStep();
		assertSupported();
		recordEvent("START", "system", JsonValue.NULL);
	}

	/** Recovery uses native deserialization only: never start a sequence or execute a command. */
	public SetupSession(FantasyFootballServer server, MatchDocument document, String artifact) {
		this.document = document;
		matchId = document.matchId;
		state = new GameState(server) {
			@Override public boolean usesLegacyPersistence() { return false; }
		};
		try {
			JsonObject envelope = new MatchJson().parse(artifact, 33554432, 128);
			JsonObject payload = envelope.get("payload").asObject();
			if (envelope.size() != 2 || !digest(payload.toString()).equals(envelope.getString("sha256", null)))
				throw new IllegalArgumentException("Recovery checksum mismatch");
			int recoveryVersion = payload.getInt("recoveryVersion", -1);
			String runtime = payload.getString("runtimeVersion", null);
			boolean r2 = recoveryVersion == 2 && (LEGACY_RUNTIME.equals(runtime) || DEFAULT_SETUP_RUNTIME.equals(runtime));
			boolean r41 = recoveryVersion == 3 && SAVE_RESUME_RUNTIME.equals(runtime);
			boolean r51 = recoveryVersion == 4 && TRANSCRIPT_RUNTIME.equals(runtime);
			boolean r52 = recoveryVersion == 5 && ROUTE_RUNTIME.equals(runtime);
			boolean r53 = recoveryVersion == 6 && CHAT_RUNTIME.equals(runtime);
			if ((!r2 && !r41 && !r51 && !r52 && !r53)
				|| !"ffb-3.4.0-bb2025-m3d.1".equals(payload.getString("engineVersion", null))
				|| payload.getInt("replayVersion", -1) != (r51 || r52 || r53 ? 2 : 1))
				throw new MatchService.Failure("RECOVERY_UNSUPPORTED");
			defaultSetup = !LEGACY_RUNTIME.equals(runtime);
			saveResume = r41 || (r51 || r52 || r53) && payload.getBoolean("saveResumeEnabled", false);
			transcriptV2 = r51 || r52 || r53;
			routeV2 = r52 || r53;
			chatV1 = r53;
			if (r2) exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView");
			else if (r41) exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView", "saveResume");
			else if (r51) exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView", "saveResumeEnabled", "transcript",
				"saveResume");
			else if (r52) exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView", "saveResumeEnabled", "transcript",
				"saveResume", "pendingRoute");
			else exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView", "saveResumeEnabled", "transcript",
				"saveResume", "pendingRoute", "chat");
			if ((r51 || r52 || r53) && !saveResume && !payload.get("saveResume").isNull())
				throw new IllegalArgumentException("Unexpected save/resume state");
			if (!matchId.equals(payload.getString("matchId", null)) || !ordered(frozen()).equals(payload.get("frozen")))
				throw new IllegalArgumentException("Recovery frozen inputs differ");
			revision = payload.get("revision").asInt();
			drive = payload.get("drive").asInt();
			failed = payload.get("failed").asBoolean();
			if (revision < 0 || drive < 1) throw new IllegalArgumentException("Invalid recovery counters");
			recoveryDice = new RecoveryDice(payload.get("dice").asObject());
			state.getDiceRoller().setRecoveryRoll(recoveryDice::roll);
			state.initFrom(server.getFactorySource(), payload.get("native"));
			UtilSkillBehaviours.registerBehaviours(state.getGame(), server.getDebugLog());
			state.setTurnTimeStarted(payload.get("turnTimeStarted").asLong());
			state.initCommandNrGenerator(payload.get("lastCommandNr").asLong());
			for (JsonObject.Member queue : payload.get("testRolls").asObject()) {
				java.util.ArrayList<com.fumbbl.ffb.DiceCategory> rolls = new java.util.ArrayList<>();
				for (JsonValue roll : queue.getValue().asArray()) {
					com.fumbbl.ffb.DiceCategory category = new com.fumbbl.ffb.DiceCategory();
					category.parseCommand(Integer.toString(roll.asInt()), state.getGame(), state.getGame().getTeamHome());
					rolls.add(category);
				}
				state.getDiceRoller().getTestRolls().put(queue.getName(), rolls);
			}
			for (JsonValue item : payload.get("history").asArray()) {
				JsonObject entry = item.asObject();
				exactRecovery(entry, "key", "fingerprint", "code");
				if (!entry.get("key").asString().matches("(home|away)\\n[A-Za-z0-9_-]{1,100}")
					|| !("ACCEPTED".equals(entry.getString("code", null)) || "ILLEGAL_SETUP".equals(entry.getString("code", null))))
					throw new IllegalArgumentException("Invalid recovery request history");
				if (history.put(entry.get("key").asString(), new Record(entry.get("fingerprint").asString(), entry.get("code").asString())) != null)
					throw new IllegalArgumentException("Duplicate recovery history");
			}
			if (history.size() > 8192) throw new IllegalArgumentException("Recovery history limit");
			for (JsonValue selection : payload.get("kickoffSelection").asArray()) kickoffSelection.add(selection.asString());
			for (JsonValue event : JsonArray.readFrom(payload.get("eventsJson").asString())) {
				events.add(event);
				replayBytes += event.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
			}
			if (replayBytes > 16 * 1024 * 1024 || events.size() != revision + 1
				|| payload.get("pendingTerminal").asBoolean() != isComplete()) throw new IllegalArgumentException("Recovery event boundary");
			if (saveResume) saveResumeState = new SaveResumeState(payload.get("saveResume").asObject());
			if (r51 || r52 || r53) {
				transcript = new MatchTranscript(payload.get("transcript").asObject());
				if (transcript.size() != revision + 1 || transcript.nativeCursor() > state.getLastCommandNr())
					throw new IllegalArgumentException("Transcript checkpoint boundary");
			}
			if (r53) chat = new MatchChat(payload.get("chat").asObject());
			if ((r52 || r53) && !payload.get("pendingRoute").isNull())
				pendingRoute = new PendingRoute(payload.get("pendingRoute").asObject());
			if (pendingRoute != null) {
				Player<?> active = state.getGame().getActingPlayer().getPlayer();
				if (pendingRoute.declaredRevision >= revision || active == null
					|| !pendingRoute.playerId.equals(active.getId())
					|| !pendingRoute.expectedPosition().equals(state.getGame().getFieldModel().getPlayerCoordinate(active)))
					throw new IllegalArgumentException("Pending route does not match native state");
			}
			assertSupported();
			if (!ordered(recoveryNative()).equals(payload.get("native"))) throw new IllegalArgumentException("Native state did not round-trip");
			if (!matchesRecoveredView(payload.get("homeView").asObject(), "home")
				|| !matchesRecoveredView(payload.get("awayView").asObject(), "away"))
				throw new IllegalArgumentException("Recovered decision differs");
		} catch (MatchService.Failure failure) { throw failure; }
		catch (RuntimeException invalid) { throw new MatchService.Failure("RECOVERY_CORRUPT"); }
	}

	public String recoveryArtifact() {
		if (recoveryDice == null) throw new IllegalStateException("Legacy lifetime cannot be upgraded");
		JsonArray requests = new JsonArray(), selections = new JsonArray();
		history.forEach((key, entry) -> requests.add(new JsonObject().add("key", key).add("fingerprint", entry.fingerprint).add("code", entry.code)));
		kickoffSelection.forEach(selections::add);
		JsonObject rolls = new JsonObject();
		state.getDiceRoller().getTestRolls().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
			JsonArray queue = new JsonArray(); entry.getValue().forEach(roll -> queue.add(roll.testRoll())); rolls.add(entry.getKey(), queue);
		});
		JsonObject payload = new JsonObject().add("recoveryVersion", chatV1 ? 6 : routeV2 ? 5 : transcriptV2 ? 4 : saveResume ? 3 : 2)
			.add("runtimeVersion", chatV1 ? CHAT_RUNTIME : routeV2 ? ROUTE_RUNTIME : transcriptV2 ? TRANSCRIPT_RUNTIME : saveResume ? SAVE_RESUME_RUNTIME : defaultSetup ? DEFAULT_SETUP_RUNTIME : LEGACY_RUNTIME)
			.add("engineVersion", "ffb-3.4.0-bb2025-m3d.1").add("replayVersion", transcriptV2 ? 2 : 1).add("matchId", matchId)
			.add("frozen", frozen()).add("revision", revision).add("drive", drive).add("failed", failed)
			.add("native", recoveryNative()).add("dice", recoveryDice.snapshot()).add("testRolls", rolls)
			.add("turnTimeStarted", state.getTurnTimeStarted()).add("lastCommandNr", state.getLastCommandNr()).add("history", requests).add("kickoffSelection", selections)
			.add("eventsJson", events.toString()).add("pendingTerminal", isComplete()).add("homeView", view("home")).add("awayView", view("away"));
		if (transcriptV2) payload.add("saveResumeEnabled", saveResume).add("transcript", transcript.json())
			.add("saveResume", saveResume ? saveResumeState.json() : JsonValue.NULL);
		else if (saveResume) payload.add("saveResume", saveResumeState.json());
		if (routeV2) payload.add("pendingRoute", pendingRoute == null ? JsonValue.NULL : pendingRoute.json());
		if (chatV1) payload.add("chat", chat.json());
		payload = ordered(payload).asObject();
		String artifact = new JsonObject().add("payload", payload).add("sha256", digest(payload.toString())).toString();
		if (artifact.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 33554432) throw new MatchService.Failure("RECOVERY_LIMIT");
		return artifact;
	}

	private JsonObject frozen() {
		JsonObject encoded = new MatchJson().encode(document);
		return new JsonObject().add("home", encoded.get("home")).add("away", encoded.get("away"))
			.add("homeOwner", document.home.owner).add("awayOwner", document.away.owner);
	}

	private JsonObject recoveryNative() {
		JsonObject snapshot = state.toJsonValue(true, 0);
		// Native initFrom maps absent distance to zero. Before kickoff execution this value
		// is always overwritten by the scatter roll; normalize only this versioned boundary.
		for (JsonValue step : snapshot.get("stepStack").asObject().get("steps").asArray()) normalizeRecoveryStep(step.asObject());
		if (snapshot.get("currentStep") != null) normalizeRecoveryStep(snapshot.get("currentStep").asObject());
		return new RecoveryNativeJson().normalize(snapshot);
	}

	private void normalizeRecoveryStep(JsonObject step) {
		if ("kickoffScatterRoll".equals(step.getString("stepId", null)) && step.get("scatterDistance") == null) step.add("scatterDistance", 0);
	}

	private String digest(String text) {
		try {
			return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
				.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
		} catch (java.security.NoSuchAlgorithmException unavailable) { throw new IllegalStateException(unavailable); }
	}

	private JsonValue ordered(JsonValue value) {
		if (value.isObject()) {
			JsonObject result = new JsonObject();
			value.asObject().names().stream().sorted().forEach(name -> result.add(name, ordered(value.asObject().get(name))));
			return result;
		}
		if (value.isArray()) {
			JsonArray result = new JsonArray(); for (JsonValue item : value.asArray()) result.add(ordered(item)); return result;
		}
		return value;
	}

	private void exactRecovery(JsonObject object, String... names) {
		if (object.size() != names.length || !new java.util.HashSet<>(object.names()).equals(new java.util.HashSet<>(java.util.Arrays.asList(names))))
			throw new IllegalArgumentException("Unsupported recovery shape");
	}

	private void initializeTeam(Team team, String owner, String name) {
		team.setCoach(owner); team.setName(name);
		for (Player<?> player : team.getPlayers()) {
			state.getGame().getFieldModel().setPlayerState(player, new PlayerState(PlayerState.RESERVE));
			UtilBox.putPlayerIntoBox(state.getGame(), player);
		}
	}

	public boolean isFailed() { return failed; }

	/** Called while staging a new r4.1 checkpoint, before activation is acknowledged. */
	public void startSaveResumeRetention(long now) {
		if (!saveResume) throw new IllegalStateException("Save/resume is unavailable for this checkpoint runtime");
		saveResumeState = new SaveResumeState(now);
	}

	public boolean usesSaveResume() { return saveResume; }

	/** Expiry is durable and fail-closed; it is never a background deletion or an inferred consent. */
	public boolean abandonIfInactive(long now) {
		if (!saveResume || saveResumeState.abandoned || isComplete() || failed) return false;
		if (now - saveResumeState.lastPlayerActivityAt < SaveResumeState.RETENTION_MILLIS) return false;
		saveResumeState.abandoned = true;
		saveResumeState.proposal = null;
		return true;
	}

	/** A successful native action invalidates a pending proposal and refreshes the one-month activity period. */
	public void recordPlayerActivity(long now) {
		if (!saveResume || saveResumeState.abandoned) return;
		saveResumeState.proposal = null;
		if (!saveResumeState.suspended()) saveResumeState.lastPlayerActivityAt = now;
	}

	/** An expired proposal must not be shown again when a saved match is loaded. */
	public void expireSaveResumeProposal(long now) {
		if (saveResume && saveResumeState.proposal != null && now >= saveResumeState.proposal.expiresAt)
			saveResumeState.proposal = null;
	}

	/** The save protocol performs no engine command and consumes no dice. */
	public JsonObject saveResume(String role, JsonObject request, long now) {
		if (!saveResume) throw new MatchService.Failure("SAVE_RESUME_UNAVAILABLE");
		String id = request.getString("requestId", null);
		String key = role + "\n" + id;
		String fingerprint = canonical(request);
		Record prior = saveResumeState.history.get(key);
		if (prior != null) {
			if (!prior.fingerprint.equals(fingerprint)) throw new MatchService.Failure("REQUEST_ID_REUSED");
			return reply(id, prior.code, true, role);
		}
		if (failed) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (isComplete()) throw new MatchService.Failure("MATCH_COMPLETED");
		if (saveResumeState.abandoned) throw new MatchService.Failure("MATCH_ABANDONED");
		String operation = request.getString("operation", null);
		expireSaveResumeProposal(now);
		if (saveResumeState.history.size() >= SaveResumeState.HISTORY_LIMIT) throw new MatchService.Failure("SAVE_HISTORY_LIMIT");
		if (request.get("expectedRevision").asInt() != revision) throw new MatchService.Failure("STALE_REVISION");
		if ("saveRequest".equals(operation)) {
			if (saveResumeState.suspended()) throw new MatchService.Failure("MATCH_SUSPENDED");
			requestProposal(role, id, "SAVE", now);
		} else if ("resumeRequest".equals(operation)) {
			if (!saveResumeState.suspended()) throw new MatchService.Failure("MATCH_NOT_SUSPENDED");
			requestProposal(role, id, "RESUME", now);
		} else if ("saveAccept".equals(operation) || "resumeAccept".equals(operation)) {
			Proposal proposal = requiredProposal(request, role, operation.startsWith("save") ? "SAVE" : "RESUME");
			if ("SAVE".equals(proposal.intent)) saveResumeState.suspendedAt = now;
			else rebaseClock(now);
			saveResumeState.proposal = null;
			saveResumeState.lastPlayerActivityAt = now;
		} else if ("saveReject".equals(operation) || "resumeReject".equals(operation)) {
			requiredProposal(request, role, operation.startsWith("save") ? "SAVE" : "RESUME", false);
			saveResumeState.proposal = null;
			saveResumeState.lastPlayerActivityAt = now;
		} else if ("saveCancel".equals(operation) || "resumeCancel".equals(operation)) {
			Proposal proposal = requiredProposal(request, role, operation.startsWith("save") ? "SAVE" : "RESUME", true);
			if (!role.equals(proposal.proposer)) throw new MatchService.Failure("SAVE_PROPOSAL_OWNER");
			saveResumeState.proposal = null;
			saveResumeState.lastPlayerActivityAt = now;
		} else throw new MatchService.Failure("INVALID_REQUEST");
		saveResumeState.history.put(key, new Record(fingerprint, "ACCEPTED"));
		return reply(id, "ACCEPTED", false, role);
	}

	private void requestProposal(String role, String requestId, String intent, long now) {
		if (saveResumeState.proposal != null) throw new MatchService.Failure("SAVE_PROPOSAL_PENDING");
		String proposalId = java.util.UUID.nameUUIDFromBytes((matchId + "\n" + role + "\n" + requestId + "\n" + intent)
			.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
		saveResumeState.proposal = new Proposal(proposalId, intent, role, revision, now, now + SaveResumeState.PROPOSAL_MILLIS);
		saveResumeState.lastPlayerActivityAt = now;
	}

	private Proposal requiredProposal(JsonObject request, String role, String intent) { return requiredProposal(request, role, intent, false); }

	private Proposal requiredProposal(JsonObject request, String role, String intent, boolean proposerRequired) {
		Proposal proposal = saveResumeState.proposal;
		if (proposal == null) throw new MatchService.Failure("SAVE_PROPOSAL_MISSING");
		if (!intent.equals(proposal.intent) || !proposal.id.equals(request.getString("proposalId", null)))
			throw new MatchService.Failure("SAVE_PROPOSAL_MISMATCH");
		if (proposal.revision != revision) throw new MatchService.Failure("STALE_REVISION");
		if (proposerRequired != role.equals(proposal.proposer)) throw new MatchService.Failure("SAVE_PROPOSAL_OWNER");
		return proposal;
	}

	private void rebaseClock(long now) {
		long paused = Math.max(0L, now - saveResumeState.suspendedAt);
		long started = state.getTurnTimeStarted();
		if (started > 0) state.setTurnTimeStarted(started > Long.MAX_VALUE - paused ? Long.MAX_VALUE : started + paused);
		saveResumeState.suspendedAt = -1L;
	}

	/** Add save state to a wire projection only; replay snapshots retain their frozen schema. */
	public JsonObject decorateSaveResume(JsonObject response) {
		if (saveResume && response.get("state") != null && !response.get("state").isNull())
			response.get("state").asObject().add("saveResume", saveResumeState.publicJson());
		return response;
	}

	/** Spectators receive only the same small suspension status, never checkpoint details. */
	public JsonObject decorateSaveResumeState(JsonObject state) {
		if (saveResume) state.add("saveResume", saveResumeState.publicJson());
		return state;
	}

	public JsonObject apply(String role, JsonObject request) {
		String id = request.getString("requestId", null);
		String key = role + "\n" + id;
		String fingerprint = canonical(request);
		Record prior = history.get(key);
		if (prior != null) {
			if (!prior.fingerprint.equals(fingerprint)) throw new MatchService.Failure("REQUEST_ID_REUSED");
			return reply(id, prior.code, true, role);
		}
		if (failed) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (isComplete()) throw new MatchService.Failure("MATCH_COMPLETED");
		if (saveResume && saveResumeState.abandoned) throw new MatchService.Failure("MATCH_ABANDONED");
		if (saveResume && saveResumeState.suspended()) throw new MatchService.Failure("MATCH_SUSPENDED");
		// Reserve 128 KiB: one bounded 64 KiB projection plus the envelope and up to 8,193 array separators.
		if (replayBytes > (transcriptV2 ? 7 : 16) * 1024 * 1024 - 128 * 1024
			|| transcriptV2 && transcript.bytes() > 7 * 1024 * 1024 - 128 * 1024)
			throw new MatchService.Failure("REPLAY_LIMIT");
		if (history.size() >= 8192) throw new MatchService.Failure("REQUEST_HISTORY_LIMIT");
		if (request.get("expectedRevision").asInt() != revision) throw new MatchService.Failure("STALE_REVISION");
		if (!"action".equals(request.getString("operation", null)) && !"concede".equals(request.getString("operation", null)) && !role.equals(actor())) throw new MatchService.Failure("WRONG_ACTOR");
		String operation = request.getString("operation", null);
		ClientCommand command;
		Game game = state.getGame();
		if ("concede".equals(operation)) {
			command = null;
		} else if ("route".equals(operation)) {
			JsonObject preview = routePreview(role, revision, request.get("waypoints").asArray());
			if (!preview.getString("playerId", "").equals(request.getString("playerId", "")))
				throw new MatchService.Failure("WRONG_PLAYER");
			pendingRoute = new PendingRoute(role, revision, preview);
			command = null;
		} else if ("action".equals(operation)) {
            Action selected = null;
            for (Action action : actions()) if (actionId(action).equals(request.getString("actionId", null))) selected = action;
            if (selected == null) throw new MatchService.Failure("INVALID_OPTION");
            if (!role.equals(selected.role)) throw new MatchService.Failure("WRONG_ACTOR");
            command = selected.command;
            if (command == null) {
                if (!selected.id.startsWith("event-pick:")) throw new MatchService.Failure("INVALID_OPTION");
                String player = selected.id.substring("event-pick:".length());
                if (!kickoffSelection.remove(player)) kickoffSelection.add(player);
                revision++;
                history.put(key, new Record(fingerprint, "ACCEPTED"));
				recordEvent("SELECTION", role, request);
                return reply(id, "ACCEPTED", false, role);
            }
            if ("confirm-solid-defence".equals(selected.id)) {
                IDialogParameter previous = game.getDialogParameter();
                if (!mechanic().checkSetup(state, game.isHomePlaying(), state.getKickingSwarmers())) {
                    game.setDialogParameter(previous);
                    throw new MatchService.Failure("ILLEGAL_SETUP");
                }
            }
        } else if ("choice".equals(operation)) {
			if (!promptId().equals(request.getString("promptId", null))) throw new MatchService.Failure("PROMPT_MISMATCH");
			String option = request.getString("optionId", null);
			if (step() == StepId.COIN_CHOICE && ("heads".equals(option) || "tails".equals(option)))
				command = new ClientCommandCoinChoice("heads".equals(option));
			else if (step() == StepId.RECEIVE_CHOICE && ("receive".equals(option) || "kick".equals(option)))
				command = new ClientCommandReceiveChoice("receive".equals(option));
			else throw new MatchService.Failure("INVALID_OPTION");
		} else if ("place".equals(operation)) {
			if (step() != StepId.SETUP) throw new MatchService.Failure("WRONG_PHASE");
			Player<?> player = game.getPlayerById(request.getString("playerId", null));
			Team team = "home".equals(role) ? game.getTeamHome() : game.getTeamAway();
			if (player == null || !team.hasPlayer(player)) throw new MatchService.Failure("WRONG_PLAYER");
			JsonValue to = request.get("to");
			FieldCoordinate coordinate;
			if (to.isNull()) {
				int box = "home".equals(role) ? FieldCoordinate.RSV_HOME_X : FieldCoordinate.RSV_AWAY_X;
				int y = 0;
				while (game.getFieldModel().getPlayer(new FieldCoordinate(box, y)) != null) y++;
				coordinate = new FieldCoordinate(box, y);
			}
			else {
				coordinate = new FieldCoordinate(to.asObject().get("x").asInt(), to.asObject().get("y").asInt());
				FieldCoordinateBounds half = "home".equals(role) ? FieldCoordinateBounds.HALF_HOME : FieldCoordinateBounds.HALF_AWAY;
				if (!half.isInBounds(coordinate) || game.getFieldModel().getPlayer(coordinate) != null)
					throw new MatchService.Failure("ILLEGAL_PLACEMENT");
			}
			command = new ClientCommandSetupPlayer(player.getId(), "home".equals(role) ? coordinate : coordinate.transform());
		} else if ("confirm".equals(operation)) {
			if (step() != StepId.SETUP) throw new MatchService.Failure("WRONG_PHASE");
			// The retained engine checks the exact current formation. Restore its temporary error dialog on rejection.
			IDialogParameter previous = game.getDialogParameter();
			if (!mechanic().checkSetup(state, game.isHomePlaying())) {
				game.setDialogParameter(previous);
				history.put(key, new Record(fingerprint, "ILLEGAL_SETUP"));
				return reply(id, "ILLEGAL_SETUP", false, role);
			}
			command = new ClientCommandEndTurn(TurnMode.SETUP, null);
		} else throw new MatchService.Failure("INVALID_REQUEST");
		int oldHalf = game.getHalf();
		int oldScore = homeScore() + awayScore();
		StepId oldStep = step();
		String oldActor = actor();
		try {
			// No legacy socket is registered for these private engine IDs. Authorization above is persisted-role based.
			if ("concede".equals(operation)) {
				pendingRoute = null;
				kickoffSelection.clear();
				Team conceding = "home".equals(role) ? game.getTeamHome() : game.getTeamAway();
				GameMechanic gameMechanic = (GameMechanic) game.getFactory(FactoryType.Factory.MECHANIC)
					.forName(Mechanic.Type.GAME.name());
				game.setConcededLegally(gameMechanic.isLegalConcession(game, conceding));
				if ("home".equals(role)) game.getGameResult().getTeamResultHome().setConceded(true);
				else game.getGameResult().getTeamResultAway().setConceded(true);
				state.getStepStack().clear();
				SequenceGeneratorFactory factory = game.getFactory(FactoryType.Factory.SEQUENCE_GENERATOR);
				((EndGame) factory.forName(SequenceGenerator.Type.EndGame.name()))
					.pushSequence(new EndGame.SequenceParams(state, true));
				state.startNextStep();
				if (!isComplete()) throw new IllegalStateException("Concession stopped at " + step()
					+ " with dialog " + game.getDialogParameter());
			} else if (command != null) state.handleCommand(new ReceivedCommand(command, "home".equals(role)));
			if (pendingRoute != null) continueRoute();
            kickoffSelection.clear();
			assertSupported();
			revision++;
			history.put(key, new Record(fingerprint, "ACCEPTED"));
			boolean newHalf = oldHalf > 0 && game.getHalf() != oldHalf;
			boolean touchdown = homeScore() + awayScore() != oldScore;
			if (!isComplete() && (newHalf || touchdown)) drive++;
			if (defaultSetup && step() == StepId.SETUP && (oldStep != StepId.SETUP || !oldActor.equals(actor())))
				deployDefaultSetup();
			recordEvent(isComplete() ? "FULL_TIME" : newHalf ? "HALFTIME" : touchdown ? "TOUCHDOWN" : "ACTION", role, request);
			return reply(id, "ACCEPTED", false, role);
		} catch (RuntimeException failure) {
			failed = true;
            MatchService.Failure unavailable = new MatchService.Failure("SESSION_UNAVAILABLE");
            unavailable.initCause(failure);
            throw unavailable;
		}
	}

	/** Apply ordinary native setup commands as part of the triggering mutation, before checkpoint/ack. */
	private void deployDefaultSetup() {
		Game game = state.getGame();
		boolean home = "home".equals(actor());
		Team team = home ? game.getTeamHome() : game.getTeamAway();
		java.util.ArrayList<Player<?>> eligible = new java.util.ArrayList<>();
		for (Player<?> player : team.getPlayers())
			if (game.getFieldModel().getPlayerState(player).canBeMovedDuringSetup()) eligible.add(player);
		FrozenTeam frozen = home ? document.home.team : document.away.team;
		eligible.sort(java.util.Comparator.comparingInt(player -> rosterSlot(frozen, player)));
		// Clear this side only, so prior-drive coordinates cannot occupy template squares.
		for (Player<?> player : eligible) {
			FieldCoordinate current = game.getFieldModel().getPlayerCoordinate(player);
			if (current == null || !FieldCoordinateBounds.FIELD.isInBounds(current)) continue;
			int box = home ? FieldCoordinate.RSV_HOME_X : FieldCoordinate.RSV_AWAY_X;
			int row = 0;
			while (game.getFieldModel().getPlayer(new FieldCoordinate(box, row)) != null) row++;
			FieldCoordinate reserve = new FieldCoordinate(box, row);
			state.handleCommand(new ReceivedCommand(new ClientCommandSetupPlayer(player.getId(), home ? reserve : reserve.transform()), home));
		}
		int[] rows = { 6, 7, 8, 3, 4, 5, 6, 8, 9, 10, 11 };
		for (int index = 0; index < Math.min(11, eligible.size()); index++) {
			int x = index < 3 ? 12 : 11;
			FieldCoordinate square = new FieldCoordinate(home ? x : 25 - x, rows[index]);
			state.handleCommand(new ReceivedCommand(new ClientCommandSetupPlayer(eligible.get(index).getId(), home ? square : square.transform()), home));
		}
	}

	public JsonObject reply(String requestId, String code, boolean duplicate, String role) {
		return new JsonObject().add("version", 1).add("type", "setupState").add("requestId", requestId)
			.add("code", failed ? "SESSION_UNAVAILABLE" : code).add("duplicate", !failed && duplicate)
			.add("state", failed ? JsonValue.NULL : view(role));
	}

	/** The same public game state as a player, with no player seat assigned. */
	public JsonObject spectatorView() {
		if (failed) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		return view("spectator");
	}

	private JsonObject view(String role) {
		Game game = state.getGame();
		JsonArray players = new JsonArray();
		for (Team team : new Team[] { game.getTeamHome(), game.getTeamAway() }) {
			for (Player<?> player : team.getPlayers()) {
				FrozenTeam frozen = team == game.getTeamHome() ? document.home.team : document.away.team;
				FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(player);
				boolean onPitch = FieldCoordinateBounds.FIELD.isInBounds(at);
				PlayerState playerState = game.getFieldModel().getPlayerState(player);
				JsonArray skills = new JsonArray();
				List<String> skillNames = new ArrayList<>();
				for (Skill skill : player.getSkillsIncludingTemporaryOnes()) skillNames.add(skill.getName());
				Collections.sort(skillNames);
				for (String skillName : skillNames) skills.add(skillName);
				players.add(new JsonObject().add("id", player.getId()).add("name", player.getName())
					.add("slot", rosterSlot(frozen, player)).add("art", artIdentity(frozen, player))
					.add("number", player.getNr()).add("position", positionName(player))
					.add("ma", player.getMovementWithModifiers(game)).add("st", player.getStrengthWithModifiers(game))
					.add("ag", player.getAgilityWithModifiers(game)).add("pa", player.getPassingWithModifiers(game))
					.add("av", player.getArmourWithModifiers(game)).add("skills", skills)
					.add("offPitch", offPitch(playerState, onPitch))
					.add("role", team == game.getTeamHome() ? "home" : "away")
					.add("state", playerState.getDescription())
					.add("x", onPitch ? JsonValue.valueOf(at.getX()) : JsonValue.NULL)
					.add("y", onPitch ? JsonValue.valueOf(at.getY()) : JsonValue.NULL));
			}
		}
		JsonValue prompt = JsonValue.NULL;
		if (step() == StepId.COIN_CHOICE || step() == StepId.RECEIVE_CHOICE) {
			boolean coin = step() == StepId.COIN_CHOICE;
			prompt = new JsonObject().add("id", promptId()).add("actor", actor()).add("kind", coin ? "coin" : "receive")
				.add("options", new JsonArray().add(coin ? "heads" : "receive").add(coin ? "tails" : "kick"));
		}
		JsonArray legal = new JsonArray();
        ActionSource source = new ActionSource();
        for (Action action : actions()) {
            JsonValue target = action.targetPlayerId != null ? new JsonObject().add("playerId", action.targetPlayerId)
                : action.targetSquare != null ? new JsonObject().add("x", action.targetSquare.getX()).add("y", action.targetSquare.getY()) : JsonValue.NULL;
            String sourcePlayerId = source.playerId(game, action);
            legal.add(new JsonObject().add("id", actionId(action)).add("kind", action.kind)
                .add("label", action.label).add("actor", action.role).add("target", target)
                .add("sourcePlayerId", sourcePlayerId == null ? JsonValue.NULL : JsonValue.valueOf(sourcePlayerId)));
        }
        FieldCoordinate ball = game.getFieldModel().getBallCoordinate();
        return new JsonObject().add("projectionVersion", 4).add("half", Math.max(1, Math.min(2, game.getHalf()))).add("drive", drive)
            .add("homeScore", homeScore()).add("awayScore", awayScore())
            .add("homeTurn", game.getTurnDataHome().getTurnNr()).add("awayTurn", game.getTurnDataAway().getTurnNr())
            .add("actions", legal).add("turn", game.getTurnData().getTurnNr()).add("turnMode", game.getTurnMode().name())
            .add("activePlayerId", game.getActingPlayer().getPlayerId())
            .add("ball", FieldCoordinateBounds.FIELD.isInBounds(ball) ? new JsonObject().add("x", ball.getX()).add("y", ball.getY()) : JsonValue.NULL)
            .add("matchId", matchId).add("revision", revision).add("callerRole", role)
			.add("phase", isComplete() ? "FULL_TIME" : step() == StepId.KICKOFF ? "READY_FOR_KICKOFF" : step() == StepId.SETUP ? "SETUP" : step() == StepId.COIN_CHOICE || step() == StepId.RECEIVE_CHOICE ? "PRE_MATCH" : "PLAY")
			.add("actor", actor()).add("prompt", prompt).add("players", players)
			.add("weather", game.getFieldModel().getWeather().name())
			.add("homeRerolls", game.getTurnDataHome().getReRolls()).add("awayRerolls", game.getTurnDataAway().getReRolls())
			.add("homeTeamName", game.getTeamHome().getName()).add("awayTeamName", game.getTeamAway().getName())
			.add("homeResources", resources(game.getTeamHome(), game.getTurnDataHome().getApothecaries()))
			.add("awayResources", resources(game.getTeamAway(), game.getTurnDataAway().getApothecaries()));
	}
	private JsonObject resources(Team team, int apothecaries) {
		return new JsonObject().add("apothecaries", apothecaries)
			.add("assistantCoaches", team.getAssistantCoaches()).add("cheerleaders", team.getCheerleaders());
	}
	private String positionName(Player<?> player) {
		String name = player.getPosition().getName();
		if (name != null && !name.isEmpty()) return name;
		String id = player.getPositionId();
		return id == null || id.isEmpty() ? "Player" : id;
	}
	private String offPitch(PlayerState playerState, boolean onPitch) {
		if (onPitch) return "pitch";
		switch (playerState.getBase()) {
			case PlayerState.RESERVE: return "reserve";
			case PlayerState.KNOCKED_OUT: return "knockedOut";
			case PlayerState.BADLY_HURT:
			case PlayerState.SERIOUS_INJURY:
			case PlayerState.RIP: return "casualty";
			case PlayerState.BANNED: return "sentOff";
			default: return "other";
		}
	}
	private JsonValue artIdentity(FrozenTeam frozen, Player<?> enginePlayer) {
		if (frozen.rosterId == null || frozen.rosterId.isEmpty()) return JsonValue.NULL;
		for (FrozenTeam.Player player : frozen.players)
			if ((frozen.sourceTeamId + ":" + player.id).equals(enginePlayer.getId()) && player.positionId != null && !player.positionId.isEmpty())
				return new JsonObject().add("rosterId", frozen.rosterId).add("positionId", player.positionId);
		return JsonValue.NULL;
	}
	private boolean matchesRecoveredView(JsonObject saved, String role) {
		JsonObject current = view(role);
		int version = saved.get("projectionVersion") == null ? 1 : saved.getInt("projectionVersion", -1);
		if (version < 1 || version > 4) return false;
		if (version < 4) {
			current.set("projectionVersion", 3);
			current.remove("homeTeamName"); current.remove("awayTeamName");
			current.remove("homeResources"); current.remove("awayResources");
			for (JsonValue item : current.get("players").asArray()) {
				JsonObject player = item.asObject();
				for (String field : new String[] { "number", "position", "ma", "st", "ag", "pa", "av", "skills", "offPitch" }) player.remove(field);
			}
			for (JsonValue item : current.get("actions").asArray()) item.asObject().remove("sourcePlayerId");
		}
		if (version == 1) {
			current.remove("projectionVersion");
			for (JsonValue item : current.get("players").asArray()) item.asObject().remove("art");
		} else if (version == 2) current.set("projectionVersion", 2);
		if (version < 3) for (JsonValue item : current.get("actions").asArray()) item.asObject().remove("target");
		return ordered(current).equals(saved);
	}

	private int rosterSlot(FrozenTeam frozen, Player<?> enginePlayer) {
		// Historical matches exposed the engine number as the public slot.
		if (frozen.teamName.isEmpty()) return enginePlayer.getNr();
		String playerId = enginePlayer.getId();
		for (FrozenTeam.Player player : frozen.players)
			if ((frozen.sourceTeamId + ":" + player.id).equals(playerId)) return player.slot;
		throw new IllegalStateException("Unrecognized frozen player");
	}

	private String actor() {
        List<Action> available = actions();
        if (!available.isEmpty()) return available.get(0).role;
		if (step() == StepId.RECEIVE_CHOICE) {
			String team = ((DialogReceiveChoiceParameter) state.getGame().getDialogParameter()).getChoosingTeamId();
			return team.equals(state.getGame().getTeamHome().getId()) ? "home" : "away";
		}
		return state.getGame().isHomePlaying() ? "home" : "away";
	}
	private String promptId() { return matchId + "-" + revision; }
	private StepId step() { return state.getCurrentStep() == null ? StepId.END_GAME : state.getCurrentStep().getId(); }
    private void assertSupported() {
        if (!isComplete() && state.getCurrentStep() == null) throw new IllegalStateException("No resident engine step");
    }
    private String actionId(Action action) { return revision + ":" + action.id; }
    private List<Action> actions() {
        if (isComplete()) return java.util.Collections.emptyList();
        List<Action> result = new KickoffActions(state, kickoffSelection).actions();
        if (result.isEmpty()) result = new CorePromptActions(state).actions();
        if (result.isEmpty()) result = new CoreTurnActions(state).actions();
        if (recoveryDice != null) result.sort(java.util.Comparator.comparing(action -> action.role + "\n" + action.id));
        return result;
    }

    public boolean isComplete() { return state.getGame().getFinished() != null; }
    private int homeScore() { return state.getGame().getGameResult().getTeamResultHome().getScore(); }
    private int awayScore() { return state.getGame().getGameResult().getTeamResultAway().getScore(); }
    private void recordEvent(String kind, String role, JsonValue decision) {
        JsonObject snapshot = view("home").set("actions", new JsonArray()).set("prompt", JsonValue.NULL);
        JsonObject event = new JsonObject().add("revision", revision).add("kind", kind).add("state", snapshot);
        replayBytes += event.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        events.add(event);
        if (transcriptV2) {
            NativeOutcomeCapture.Capture capture = new NativeOutcomeCapture().since(state.getGameLog(), transcript.nativeCursor());
            JsonArray nativeOutcomes = new JsonArray();
            capture.modelSyncs.forEach(nativeOutcomes::add);
            JsonValue accepted = decision.isObject() ? JsonObject.readFrom(canonical(decision.asObject())) : JsonValue.NULL;
            transcript.append(revision, kind, role, Math.max(System.currentTimeMillis(), transcript.lastTime()), accepted,
                nativeOutcomes, snapshot, capture.lastCommandNr);
        }
    }
    public CompletedMatch completedMatch() {
        if (!isComplete() || failed) throw new MatchService.Failure("NOT_COMPLETED");
		JsonObject result = new JsonObject().add("formatVersion", chatV1 ? 3 : transcriptV2 ? 2 : 1)
            .add("engineVersion", "ffb-3.4.0-bb2025-m3d.1").add("ruleset", document.home.team.ruleset)
            .add("catalogVersion", document.home.team.catalogVersion).add("presetId", document.home.team.presetId)
            .add("presetVersion", document.home.team.presetVersion).add("matchId", matchId)
            .add("homeScore", homeScore()).add("awayScore", awayScore()).add("finalRevision", revision)
            .add("events", events);
		if (transcriptV2) result.add("transcript", transcript.json());
		if (chatV1) result.add("chat", chat.json());
        return new CompletedMatch(result.toString());
    }
	public JsonObject transcriptPage(int from, int limit) {
		if (!transcriptV2) throw new MatchService.Failure("REPLAY_UNSUPPORTED");
		return transcript.page(from, limit);
	}
	public JsonObject chatPage(int from, int limit) {
		if (!chatV1) throw new MatchService.Failure("CHAT_UNAVAILABLE");
		return chat.page(from, limit);
	}
	public MatchChat.Outcome sendChat(String accountId, String role, String requestId, String content, long now) {
		if (!chatV1) throw new MatchService.Failure("CHAT_UNAVAILABLE");
		if (isComplete()) return chat.duplicate(accountId, requestId, content);
		return chat.append(accountId, role, requestId, content, revision, now);
	}
	/** A revision-bound forecast; neither the engine nor the checkpoint is changed. */
	public JsonObject routePreview(String role, int expectedRevision, JsonArray points) {
		if (!routeV2) throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		if (expectedRevision != revision) throw new MatchService.Failure("STALE_REVISION");
		if (failed || isComplete() || saveResume && saveResumeState.suspended())
			throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		if (!role.equals(actor()) || actions().stream().noneMatch(action -> role.equals(action.role)
			&& ("move".equals(action.kind) || "jump".equals(action.kind))))
			throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		if (points.size() < 1 || points.size() > 20) throw new MatchService.Failure("INVALID_ROUTE");
		List<FieldCoordinate> waypoints = new ArrayList<>();
		for (JsonValue value : points) {
			JsonObject point = value.asObject();
			if (point.size() != 2 || !point.names().contains("x") || !point.names().contains("y"))
				throw new MatchService.Failure("INVALID_ROUTE");
			waypoints.add(new FieldCoordinate(point.get("x").asInt(), point.get("y").asInt()));
		}
		return new RoutePlanner(state).preview(waypoints).add("revision", revision).add("actor", role);
	}
	private SetupMechanic mechanic() {
		MechanicsFactory factory = state.getGame().getFactory(FactoryType.Factory.MECHANIC);
		return (SetupMechanic) factory.forName(Mechanic.Type.SETUP.name());
	}
	private String canonical(JsonObject request) {
		JsonObject result = new JsonObject();
		request.names().stream().sorted().forEach(name -> {
			JsonValue value = request.get(name);
			if ("to".equals(name) && !value.isNull()) value = new JsonObject().add("x", value.asObject().get("x")).add("y", value.asObject().get("y"));
			result.add(name, value);
		});
		return result.toString();
	}
	private static final class Record {
		final String fingerprint, code;
		Record(String fingerprint, String code) { this.fingerprint = fingerprint; this.code = code; }
	}

	/** Remaining canonical squares after a route commit, retained through native prompts and recovery. */
	private static final class PendingRoute {
		final String actor, playerId;
		final int declaredRevision;
		final FieldCoordinate origin;
		final List<FieldCoordinate> steps = new ArrayList<>();
		int next;

		PendingRoute(String actor, int revision, JsonObject preview) {
			this.actor = actor;
			playerId = preview.get("playerId").asString();
			declaredRevision = revision;
			origin = coordinate(preview.get("from").asObject());
			for (JsonValue value : preview.get("steps").asArray()) {
				JsonObject step = value.asObject();
				if (step.size() != 5 || !step.names().containsAll(java.util.Arrays.asList(
					"x", "y", "dodge", "rush", "reactions"))) throw new IllegalArgumentException("Invalid route step");
				steps.add(new FieldCoordinate(step.get("x").asInt(), step.get("y").asInt()));
			}
			check();
		}

		PendingRoute(JsonObject saved) {
			if (saved.size() != 6 || !saved.names().containsAll(java.util.Arrays.asList(
				"actor", "playerId", "declaredRevision", "origin", "steps", "next")))
				throw new IllegalArgumentException("Invalid pending route shape");
			actor = saved.get("actor").asString();
			playerId = saved.get("playerId").asString();
			declaredRevision = saved.get("declaredRevision").asInt();
			origin = coordinate(saved.get("origin").asObject());
			for (JsonValue value : saved.get("steps").asArray()) steps.add(coordinate(value.asObject()));
			next = saved.get("next").asInt();
			check();
		}

		FieldCoordinate expectedPosition() { return next == 0 ? origin : steps.get(next - 1); }
		FieldCoordinate nextSquare() { return steps.get(next); }
		boolean complete() { return next >= steps.size(); }

		JsonObject json() {
			JsonArray path = new JsonArray();
			for (FieldCoordinate coordinate : steps) path.add(point(coordinate));
			return new JsonObject().add("actor", actor).add("playerId", playerId)
				.add("declaredRevision", declaredRevision).add("origin", point(origin))
				.add("steps", path).add("next", next);
		}

		private void check() {
			if (!("home".equals(actor) || "away".equals(actor)) || playerId.isEmpty()
				|| declaredRevision < 0 || !FieldCoordinateBounds.FIELD.isInBounds(origin)
				|| steps.isEmpty() || steps.size() > 20 || next < 0 || next >= steps.size())
				throw new IllegalArgumentException("Invalid pending route");
			FieldCoordinate previous = origin;
			for (FieldCoordinate coordinate : steps) {
				if (!FieldCoordinateBounds.FIELD.isInBounds(coordinate) || !coordinate.isAdjacent(previous))
					throw new IllegalArgumentException("Invalid pending route step");
				previous = coordinate;
			}
		}
		private static FieldCoordinate coordinate(JsonObject point) {
			if (point.size() != 2 || !point.names().contains("x") || !point.names().contains("y"))
				throw new IllegalArgumentException("Invalid route square");
			return new FieldCoordinate(point.get("x").asInt(), point.get("y").asInt());
		}
		private static JsonObject point(FieldCoordinate coordinate) {
			return new JsonObject().add("x", coordinate.getX()).add("y", coordinate.getY());
		}
	}

	/** Native adjacent actions remain the authority at every square and after every resumed prompt. */
	private void continueRoute() {
		while (pendingRoute != null) {
			Game game = state.getGame();
			Player<?> active = game.getActingPlayer().getPlayer();
			if (isComplete() || active == null || !pendingRoute.playerId.equals(active.getId())) {
				pendingRoute = null;
				return;
			}
			FieldCoordinate current = game.getFieldModel().getPlayerCoordinate(active);
			if (!pendingRoute.expectedPosition().equals(current)) {
				pendingRoute = null;
				return;
			}
			Action offered = null;
			for (Action action : actions()) {
				if ("move".equals(action.kind) && pendingRoute.actor.equals(action.role)
					&& pendingRoute.nextSquare().equals(action.targetSquare)) { offered = action; break; }
			}
			if (offered == null) {
				// An engine prompt may temporarily transfer the decision to the other coach.
				if (game.getDialogParameter() != null || step() != StepId.INIT_MOVING && step() != StepId.INIT_SELECTING) return;
				pendingRoute = null;
				return;
			}
			state.handleCommand(new ReceivedCommand(offered.command, "home".equals(pendingRoute.actor)));
			FieldCoordinate after = game.getFieldModel().getPlayerCoordinate(active);
			if (!pendingRoute.nextSquare().equals(after)) {
				if (game.getDialogParameter() == null) pendingRoute = null;
				return;
			}
			pendingRoute.next++;
			if (pendingRoute.complete()) pendingRoute = null;
		}
	}

	/** Private checkpoint state for a consent protocol; public projection is deliberately smaller. */
	private static final class SaveResumeState {
		static final long PROPOSAL_MILLIS = 5 * 60 * 1000L;
		static final long RETENTION_MILLIS = 30L * 24 * 60 * 60 * 1000L;
		static final int HISTORY_LIMIT = 256;
		long lastPlayerActivityAt;
		long suspendedAt = -1L;
		boolean abandoned;
		Proposal proposal;
		final Map<String, Record> history = new LinkedHashMap<>();

		SaveResumeState(long now) { lastPlayerActivityAt = now; }

		SaveResumeState(JsonObject json) {
			exact(json, "lastPlayerActivityAt", "suspendedAt", "abandoned", "proposal", "history");
			lastPlayerActivityAt = json.get("lastPlayerActivityAt").asLong();
			suspendedAt = json.get("suspendedAt").asLong();
			abandoned = json.get("abandoned").asBoolean();
			if (lastPlayerActivityAt < 0 || suspendedAt < -1) throw new IllegalArgumentException("Invalid save retention state");
			if (!json.get("proposal").isNull()) proposal = new Proposal(json.get("proposal").asObject());
			if (abandoned && proposal != null) throw new IllegalArgumentException("Abandoned match cannot have a proposal");
			if (proposal != null && ((suspendedAt >= 0) != "RESUME".equals(proposal.intent)))
				throw new IllegalArgumentException("Save/resume proposal does not match suspension state");
			for (JsonValue item : json.get("history").asArray()) {
				JsonObject entry = item.asObject();
				exact(entry, "key", "fingerprint", "code");
				String key = entry.get("key").asString();
				if (!key.matches("(home|away)\\n[A-Za-z0-9_-]{1,100}") || !"ACCEPTED".equals(entry.getString("code", null))
					|| history.put(key, new Record(entry.get("fingerprint").asString(), "ACCEPTED")) != null) throw new IllegalArgumentException("Invalid save request history");
			}
			if (history.size() > HISTORY_LIMIT) throw new IllegalArgumentException("Save request history limit");
		}

		boolean suspended() { return suspendedAt >= 0; }

		JsonObject json() {
			JsonArray entries = new JsonArray();
			history.forEach((key, entry) -> entries.add(new JsonObject().add("key", key).add("fingerprint", entry.fingerprint).add("code", entry.code)));
			return new JsonObject().add("lastPlayerActivityAt", lastPlayerActivityAt).add("suspendedAt", suspendedAt).add("abandoned", abandoned)
				.add("proposal", proposal == null ? JsonValue.NULL : proposal.json()).add("history", entries);
		}

		JsonObject publicJson() {
			String status = abandoned ? "ABANDONED" : proposal != null ? proposal.intent + "_PENDING" : suspended() ? "SUSPENDED" : "ACTIVE";
			JsonValue proposalId = proposal == null ? JsonValue.NULL : JsonValue.valueOf(proposal.id);
			JsonValue proposer = proposal == null ? JsonValue.NULL : JsonValue.valueOf(proposal.proposer);
			JsonValue expiresAt = proposal == null ? JsonValue.NULL : JsonValue.valueOf(proposal.expiresAt);
			return new JsonObject().add("status", status).add("proposalId", proposalId).add("proposer", proposer).add("expiresAt", expiresAt);
		}

		private static void exact(JsonObject object, String... names) {
			if (object.size() != names.length || !new java.util.HashSet<>(object.names()).equals(new java.util.HashSet<>(java.util.Arrays.asList(names))))
				throw new IllegalArgumentException("Unsupported save/resume shape");
		}
	}

	private static final class Proposal {
		final String id, intent, proposer;
		final int revision;
		final long createdAt, expiresAt;
		Proposal(String id, String intent, String proposer, int revision, long createdAt, long expiresAt) {
			this.id = id; this.intent = intent; this.proposer = proposer; this.revision = revision; this.createdAt = createdAt; this.expiresAt = expiresAt;
			if (!id.matches("[0-9a-f-]{36}") || !("SAVE".equals(intent) || "RESUME".equals(intent)) || !("home".equals(proposer) || "away".equals(proposer)))
				throw new IllegalArgumentException("Invalid save proposal");
			if (revision < 0 || createdAt < 0 || expiresAt != createdAt + SaveResumeState.PROPOSAL_MILLIS) throw new IllegalArgumentException("Invalid save proposal times");
		}
		Proposal(JsonObject json) {
			SaveResumeState.exact(json, "id", "intent", "proposer", "revision", "createdAt", "expiresAt");
			id = json.get("id").asString(); intent = json.get("intent").asString(); proposer = json.get("proposer").asString();
			revision = json.get("revision").asInt(); createdAt = json.get("createdAt").asLong(); expiresAt = json.get("expiresAt").asLong();
			if (!id.matches("[0-9a-f-]{36}") || !("SAVE".equals(intent) || "RESUME".equals(intent)) || !("home".equals(proposer) || "away".equals(proposer)))
				throw new IllegalArgumentException("Invalid save proposal");
			if (revision < 0 || createdAt < 0 || expiresAt != createdAt + SaveResumeState.PROPOSAL_MILLIS) throw new IllegalArgumentException("Invalid save proposal times");
		}
		JsonObject json() { return new JsonObject().add("id", id).add("intent", intent).add("proposer", proposer).add("revision", revision).add("createdAt", createdAt).add("expiresAt", expiresAt); }
	}
}
