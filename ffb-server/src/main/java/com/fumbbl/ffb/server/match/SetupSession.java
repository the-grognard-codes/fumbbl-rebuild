package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.IDialogParameter;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogReceiveChoiceParameter;
import com.fumbbl.ffb.factory.MechanicsFactory;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
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
import com.fumbbl.ffb.server.step.generator.SequenceGenerator;
import com.fumbbl.ffb.server.step.generator.StartGame;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import java.util.Date;
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
	private boolean defaultSetup;
	private boolean saveResume;
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
		if (defaultSetup && !recoverable) throw new IllegalArgumentException("Default setup requires a versioned recovery lifetime");
		if (saveResume && !recoverable) throw new IllegalArgumentException("Save/resume requires a versioned recovery lifetime");
		this.defaultSetup = defaultSetup;
		this.saveResume = saveResume;
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
		 recordEvent("START");
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
			if ((!r2 && !r41)
				|| !"ffb-3.4.0-bb2025-m3d.1".equals(payload.getString("engineVersion", null))
				|| payload.getInt("replayVersion", -1) != 1)
				throw new MatchService.Failure("RECOVERY_UNSUPPORTED");
			defaultSetup = !LEGACY_RUNTIME.equals(runtime);
			saveResume = r41;
			if (r2) exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView");
			else exactRecovery(payload, "recoveryVersion", "runtimeVersion", "engineVersion", "replayVersion", "matchId", "frozen",
				"revision", "drive", "failed", "native", "dice", "testRolls", "turnTimeStarted", "lastCommandNr", "history",
				"kickoffSelection", "eventsJson", "pendingTerminal", "homeView", "awayView", "saveResume");
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
			if (r41) saveResumeState = new SaveResumeState(payload.get("saveResume").asObject());
			assertSupported();
			if (!ordered(recoveryNative()).equals(payload.get("native"))) throw new IllegalArgumentException("Native state did not round-trip");
			if (!ordered(view("home")).equals(payload.get("homeView")) || !ordered(view("away")).equals(payload.get("awayView")))
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
		JsonObject payload = new JsonObject().add("recoveryVersion", saveResume ? 3 : 2)
			.add("runtimeVersion", saveResume ? SAVE_RESUME_RUNTIME : defaultSetup ? DEFAULT_SETUP_RUNTIME : LEGACY_RUNTIME)
			.add("engineVersion", "ffb-3.4.0-bb2025-m3d.1").add("replayVersion", 1).add("matchId", matchId)
			.add("frozen", frozen()).add("revision", revision).add("drive", drive).add("failed", failed)
			.add("native", recoveryNative()).add("dice", recoveryDice.snapshot()).add("testRolls", rolls)
			.add("turnTimeStarted", state.getTurnTimeStarted()).add("lastCommandNr", state.getLastCommandNr()).add("history", requests).add("kickoffSelection", selections)
			.add("eventsJson", events.toString()).add("pendingTerminal", isComplete()).add("homeView", view("home")).add("awayView", view("away"));
		if (saveResume) payload.add("saveResume", saveResumeState.json());
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
		if (replayBytes > 16 * 1024 * 1024 - 128 * 1024) throw new MatchService.Failure("REPLAY_LIMIT");
		if (history.size() >= 8192) throw new MatchService.Failure("REQUEST_HISTORY_LIMIT");
		if (request.get("expectedRevision").asInt() != revision) throw new MatchService.Failure("STALE_REVISION");
		if (!"action".equals(request.getString("operation", null)) && !role.equals(actor())) throw new MatchService.Failure("WRONG_ACTOR");
		String operation = request.getString("operation", null);
		ClientCommand command;
		Game game = state.getGame();
		if ("action".equals(operation)) {
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
                recordEvent("SELECTION");
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
			state.handleCommand(new ReceivedCommand(command, "home".equals(role)));
            kickoffSelection.clear();
			assertSupported();
			revision++;
			history.put(key, new Record(fingerprint, "ACCEPTED"));
			boolean newHalf = oldHalf > 0 && game.getHalf() != oldHalf;
			boolean touchdown = homeScore() + awayScore() != oldScore;
			if (!isComplete() && (newHalf || touchdown)) drive++;
			if (defaultSetup && step() == StepId.SETUP && (oldStep != StepId.SETUP || !oldActor.equals(actor())))
				deployDefaultSetup();
			recordEvent(isComplete() ? "FULL_TIME" : newHalf ? "HALFTIME" : touchdown ? "TOUCHDOWN" : "ACTION");
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
				players.add(new JsonObject().add("id", player.getId()).add("name", player.getName())
					.add("slot", rosterSlot(frozen, player)).add("art", artIdentity(frozen, player))
					.add("role", team == game.getTeamHome() ? "home" : "away")
                    .add("state", game.getFieldModel().getPlayerState(player).getDescription())
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
        for (Action action : actions()) legal.add(new JsonObject().add("id", actionId(action)).add("kind", action.kind)
            .add("label", action.label).add("actor", action.role));
        FieldCoordinate ball = game.getFieldModel().getBallCoordinate();
        return new JsonObject().add("projectionVersion", 2).add("half", Math.max(1, Math.min(2, game.getHalf()))).add("drive", drive)
            .add("homeScore", homeScore()).add("awayScore", awayScore())
            .add("homeTurn", game.getTurnDataHome().getTurnNr()).add("awayTurn", game.getTurnDataAway().getTurnNr())
            .add("actions", legal).add("turn", game.getTurnData().getTurnNr()).add("turnMode", game.getTurnMode().name())
            .add("activePlayerId", game.getActingPlayer().getPlayerId())
            .add("ball", FieldCoordinateBounds.FIELD.isInBounds(ball) ? new JsonObject().add("x", ball.getX()).add("y", ball.getY()) : JsonValue.NULL)
            .add("matchId", matchId).add("revision", revision).add("callerRole", role)
			.add("phase", isComplete() ? "FULL_TIME" : step() == StepId.KICKOFF ? "READY_FOR_KICKOFF" : step() == StepId.SETUP ? "SETUP" : step() == StepId.COIN_CHOICE || step() == StepId.RECEIVE_CHOICE ? "PRE_MATCH" : "PLAY")
			.add("actor", actor()).add("prompt", prompt).add("players", players)
			.add("weather", game.getFieldModel().getWeather().name())
			.add("homeRerolls", game.getTurnDataHome().getReRolls()).add("awayRerolls", game.getTurnDataAway().getReRolls());
	}
	private JsonValue artIdentity(FrozenTeam frozen, Player<?> enginePlayer) {
		if (frozen.rosterId == null || frozen.rosterId.isEmpty()) return JsonValue.NULL;
		for (FrozenTeam.Player player : frozen.players)
			if ((frozen.sourceTeamId + ":" + player.id).equals(enginePlayer.getId()) && player.positionId != null && !player.positionId.isEmpty())
				return new JsonObject().add("rosterId", frozen.rosterId).add("positionId", player.positionId);
		return JsonValue.NULL;
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
    private void recordEvent(String kind) {
        JsonObject snapshot = view("home").set("actions", new JsonArray()).set("prompt", JsonValue.NULL);
        JsonObject event = new JsonObject().add("revision", revision).add("kind", kind).add("state", snapshot);
        replayBytes += event.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        events.add(event);
    }
    public CompletedMatch completedMatch() {
        if (!isComplete() || failed) throw new MatchService.Failure("NOT_COMPLETED");
        return new CompletedMatch(new JsonObject().add("formatVersion", 1)
            .add("engineVersion", "ffb-3.4.0-bb2025-m3d.1").add("ruleset", document.home.team.ruleset)
            .add("catalogVersion", document.home.team.catalogVersion).add("presetId", document.home.team.presetId)
            .add("presetVersion", document.home.team.presetVersion).add("matchId", matchId)
            .add("homeScore", homeScore()).add("awayScore", awayScore()).add("finalRevision", revision)
            .add("events", events).toString());
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
