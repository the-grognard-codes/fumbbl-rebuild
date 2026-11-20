package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.local.BrowserRequestTiming;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.logging.Logger;

/** Invoked on the existing communication worker; optional private checkpoints preserve activated engines. */
public final class SetupApplication {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private final MatchPersistenceLog persistenceLog = new MatchPersistenceLog();
	private final ComputerOpponentService computerOpponents = new ComputerOpponentService(null);
	private final RecoveryCheckpoint checkpoints = new RecoveryCheckpoint();
	private final SetupStateReply setupReplies = new SetupStateReply();
	private final RecoveryArtifactFingerprint fingerprints = new RecoveryArtifactFingerprint();
	private final RecoveryJournal journal = new RecoveryJournal();
	private final MatchMemoryBudget memoryBudget;
	private final MatchSafetyJournal safety;
	private static final Logger LOG = Logger.getLogger("com.fumbbl.ffb.server.match.safety");
	private final Map<String, MatchMemoryBudget.ResidentSize> residentSizes = new LinkedHashMap<>();
	private long memoryEvictions;
	private final Map<String, MatchStopReason> stoppedMatches = new LinkedHashMap<>();
	/** Timer publication uses the normal bounded, locally authorized recipient path. */
	public Map<String, String> drainStoppedMatches() {
		Map<String, String> result = new LinkedHashMap<>();
		stoppedMatches.forEach((id, reason) -> result.put(id, reason.name())); stoppedMatches.clear(); return result;
	}
	private final Map<String, RecoveryJournal.Cursor> journalCursors = new LinkedHashMap<>();
	private final FantasyFootballServer server;
	private final MatchService matches;
	private final RecoveryRepository recovery;
	private final boolean defaultSetup;
	private final boolean saveResume;
	private final Clock clock;
	private SkillUsePreferenceService skillUsePreferences;
	public interface StorageAdmission { void requireAvailable() throws SQLException; }
	private StorageAdmission storageAdmission = () -> { };
	public void configureStorageAdmission(StorageAdmission admission) { storageAdmission = Objects.requireNonNull(admission); }

	public void configureSkillUsePreferences(SkillUsePreferenceService service) {
		this.skillUsePreferences = Objects.requireNonNull(service);
	}

	private void refreshSkillUsePreferences(String id, SetupSession session) throws SQLException {
		applySkillUsePreferences(session, readSkillUsePreferences(id));
	}

	private record MatchPreferences(SkillUsePreferences home, SkillUsePreferences away) { }

	private MatchPreferences readSkillUsePreferences(String id) throws SQLException {
		storageAdmission.requireAvailable();
		return skillUsePreferences == null ? null : new MatchPreferences(
			skillUsePreferences.loadForMatch(id, "home"), skillUsePreferences.loadForMatch(id, "away"));
	}

	private void applySkillUsePreferences(SetupSession session, MatchPreferences preferences) {
		if (preferences != null) session.configureSkillUsePreferences(preferences.home(), preferences.away());
	}
	private static final long IDLE_MILLIS = 30 * 60 * 1000L;
	private final Map<String, Long> lastAccess = new LinkedHashMap<>();
	private final Map<String, Long> generations = new LinkedHashMap<>();
	private final Map<String, byte[]> committedFingerprints = new LinkedHashMap<>();
	private enum RestoreCheckpoint { DEFERRED, HUMAN_DECISION_CLOCK }
	private final Map<String, RestoreCheckpoint> pendingRestoreCheckpoints = new LinkedHashMap<>();
	private static final long INITIAL_COMPLETION_BACKOFF_MILLIS = 1_000;
	private static final long MAX_COMPLETION_BACKOFF_MILLIS = 60_000;
	private record PendingCompletion(long retryAt, long nextDelayMillis, String terminalState) {
		PendingCompletion afterFailure(long now) {
			return new PendingCompletion(now + nextDelayMillis, Math.min(MAX_COMPLETION_BACKOFF_MILLIS, nextDelayMillis * 2), terminalState);
		}
	}
	private final LinkedHashMap<String, PendingCompletion> pendingCompletions = new LinkedHashMap<>();
	record TimerRestore(long retryAt, long nextDelayMillis, boolean reaction, long clockStartedAt, long generation) {
		TimerRestore(long retryAt, boolean reaction, long clockStartedAt, long generation) {
			this(retryAt, INITIAL_COMPLETION_BACKOFF_MILLIS, reaction, clockStartedAt, generation);
		}

		TimerRestore afterFailure(long now) {
			return new TimerRestore(now + nextDelayMillis, Math.min(MAX_COMPLETION_BACKOFF_MILLIS, nextDelayMillis * 2),
				reaction, clockStartedAt, generation);
		}

		TimerRestore afterQuarantine(long expiry) {
			return new TimerRestore(expiry, nextDelayMillis, reaction, clockStartedAt, generation);
		}
	}
	private final LinkedHashMap<String, TimerRestore> pendingTimerRestores = new LinkedHashMap<>();
	private static final int MAX_REJECTED_RECOVERIES = 128;
	private final Map<String, Long> rejectedRecoveryGenerations = new LinkedHashMap<>(16, 0.75f, true);
	private final Map<String, SetupSession> sessions = new LinkedHashMap<>();
	private final Map<String, String> pendingActivations = new LinkedHashMap<>();
	private long engineId = -2;
	private long completedReleases;
	private long terminalCompletionReleases;
	private long failedReleases;
	private long idleReleases;
	private long capacityRejections;
	private long restoredSessions;
	private long retentionRejections;
	// Legacy runtimes retain their completed engine under the historic 32-session limit.
	// Keep their peer-notification decision with that bounded resident lifetime.
	private final Set<String> legacyCompletionBroadcasted = new HashSet<>();
	/** The request reply and its publication decision are produced by one match-handling call. */
	public static final class HandleOutcome {
		private final JsonObject response;
		private final boolean publish;
		private final boolean staged;
		private final JsonObject placement;
		private HandleOutcome(JsonObject response, boolean publish, boolean staged, JsonObject placement) {
			this.response = response;
			this.publish = publish;
			this.staged = staged;
			this.placement = placement;
		}
		public JsonObject response() { return response; }
		public boolean publish() { return publish; }
		public boolean staged() { return staged; }
		public JsonObject placement() { return placement; }
	}

	private HandleOutcome outcome(JsonObject response, boolean publish) { return new HandleOutcome(response, publish, false, null); }

	private JsonObject publishedState(SetupSession session, String requestId) {
		return publishedState(session, requestId, "home");
	}

	private JsonObject publishedState(SetupSession session, String requestId, String role) {
		return session.decorateSaveResume(session.reply(requestId, "ACCEPTED", false, role)).get("state").asObject();
	}

	/** Worker-thread operational counters; contains no match IDs or private state. */
	public JsonObject lifecycleMetrics() {
		return new JsonObject().add("residentSessions", sessions.size()).add("residentLimit", memoryBudget.residentLimit())
			.add("decodedMatchLimitBytes", memoryBudget.decodedLimit()).add("appendMatchLimitBytes", memoryBudget.appendLimit())
			.add("retainedBudgetBytes", memoryBudget.retainedBytes(residentSizes.values(), detachedSlots(null)))
			.add("workingReserveBytes", memoryBudget.sharedWorkingBytes(residentSizes.values()))
			.add("memoryEvictions", memoryEvictions)
			.add("terminalCompletionReleases", terminalCompletionReleases)
			.add("pendingTimerRestores", pendingTimerRestores.size()).add("pendingActivations", pendingActivations.size()).add("completedReleases", completedReleases)
			.add("failedReleases", failedReleases).add("idleReleases", idleReleases).add("idleMillis", IDLE_MILLIS)
			.add("capacityRejections", capacityRejections).add("restoredSessions", restoredSessions)
			.add("retentionRejections", retentionRejections);
	}

	private void release(String id) { releaseEngine(id); pendingCompletions.remove(id); pendingTimerRestores.remove(id); }

	private void releaseEngine(String id) {
		sessions.remove(id);
		residentSizes.remove(id);
		generations.remove(id);
		committedFingerprints.remove(id);
		pendingRestoreCheckpoints.remove(id);
		journalCursors.remove(id);
		lastAccess.remove(id);
	}

	private void releaseCompleted(String id) {
		release(id);
		completedReleases++;
	}

	/** Called only on the communication worker after authorization. Durable checkpoints are never deleted. */
	private void releaseIdle() {
		if (recovery == null) return;
		long now = clock.millis();
		for (String id : new ArrayList<>(lastAccess.keySet())) {
			if (pendingRestoreCheckpoints.get(id) == RestoreCheckpoint.HUMAN_DECISION_CLOCK) continue;
			SetupSession session = sessions.get(id);
			if (now - lastAccess.get(id) >= IDLE_MILLIS && !session.isComplete() && !session.hasPendingReactiveDecision()) { release(id); idleReleases++; }
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

	/** Enables staged-placement checkpoints with optional save and resume. */
	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, boolean saveResume) {
		this(server, matches, recovery, defaultSetup, Clock.systemUTC(), saveResume);
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, Clock clock) {
		this(server, matches, recovery, defaultSetup, clock, false);
	}

	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, Clock clock, boolean saveResume) {
		this(server, matches, recovery, defaultSetup, clock, saveResume, new MatchMemoryBudget());
	}

	SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, Clock clock, boolean saveResume, MatchMemoryBudget memoryBudget) {
		this(server, matches, recovery, defaultSetup, clock, saveResume, memoryBudget, new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
	}

	/** Production injects the policy shared by repositories and an explicitly configured OOM tracker. */
	public SetupApplication(FantasyFootballServer server, MatchService matches, RecoveryRepository recovery, boolean defaultSetup, Clock clock, boolean saveResume, MatchMemoryBudget memoryBudget, MatchSafetyJournal safety) {
		if ((defaultSetup || saveResume) && recovery == null) throw new IllegalArgumentException("Versioned setup requires recovery");
		if (saveResume && !defaultSetup) throw new IllegalArgumentException("Save/resume requires the default checkpoint runtime");
		this.defaultSetup = defaultSetup;
		this.saveResume = saveResume;
		this.clock = Objects.requireNonNull(clock);
		this.memoryBudget = Objects.requireNonNull(memoryBudget);
		this.safety = Objects.requireNonNull(safety);
		safety.configureResidentMatches(this::trackedMatches);
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
				if (sessions.size() + pendingActivations.size() >= memoryBudget.residentLimit() && !pendingActivations.containsKey(matchId))
					return new JsonObject().add("version", 1).add("type", "preparedMatch").add("requestId", request.get("requestId"))
						.add("code", "ACTIVATION_LIMIT").add("duplicate", false).add("callerRole", JsonValue.NULL)
						.add("document", JsonValue.NULL).add("recoveryMatchId", JsonValue.NULL);
				pendingActivations.put(matchId, key);
			}
		} catch (SQLException failure) {
			persistenceLog.rejected("legacy-activation", matchId, request.getString("requestId", null), failure);
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
			storageAdmission.requireAvailable();
			MatchDocument document = matches.load(owner, id).document;

			releaseIdle();
			if (document.lifecycle == MatchDocument.Lifecycle.AWAITING_SETUP
				&& document.documentVersion == request.get("expectedRevision").asInt()
				&& request.get("requestId").asString().matches("[A-Za-z0-9_-]{1,100}")
				&& document.request(owner, request.get("requestId").asString()) == null) {
				if (retainedSlots() >= memoryBudget.residentLimit() && !sessions.containsKey(id) && !pendingCompletions.containsKey(id) && !pendingTimerRestores.containsKey(id)) { capacityRejections++; return preparedFailure(request, "ACTIVATION_LIMIT"); }
				RecoveryRepository.Record staged = recoveryRecord(id, true);
				if (staged == null) {
					// Persist an unpublished initial checkpoint first. Activation can then be retried after any crash.
					SetupSession initial = SetupSession.startRecoverable(server, document, engineId--, defaultSetup, saveResume);
					if (saveResume) initial.startSaveResumeRetention(clock.millis());
					long decodedBytes = initial.recoveryBytes();
					memoryBudget.requireDecodedBytes(decodedBytes);
					admitDecoded(id, decodedBytes);
					if (!recovery.save(new RecoveryRepository.Record(id, 1, initial.recoveryArtifact(), initial.computerWorkUntil()), 0))
						return preparedFailure(request, "CONFLICT");
				} else reconstruct(document, staged); // Reject incompatible staged state before activation.
			}
			JsonObject response = new MatchJson().handle(matches, owner, text);
			if ("ACCEPTED".equals(response.getString("code", null)) && !sessions.containsKey(id)) {
				MatchDocument activated = matches.load(owner, id).document;
				if (activated.lifecycle == MatchDocument.Lifecycle.ACTIVATED) restore(id, activated);
			}
			return response;
		} catch (RecoveryRepository.RetentionLimit full) { retentionRejections++; return preparedFailure(request, "RETENTION_LIMIT"); }
		catch (RecoveryRepository.OutcomeUnknown unknown) { return preparedFailure(request, "MATCH_OUTCOME_UNKNOWN"); }
		catch (SQLException unavailable) {
			persistenceLog.rejected("recoverable-activation", id, request.getString("requestId", null), unavailable);
			return preparedFailure(request, "PERSISTENCE_FAILED");
		}
		catch (MatchService.Failure rejected) { return preparedFailure(request, rejected.code); }
		catch (RuntimeException invalid) { return preparedFailure(request, "RECOVERY_CORRUPT"); }
	}

	private SetupSession restore(String id, MatchDocument document) throws SQLException {
		safety.requireAutomaticAvailable(id);
		requireResidentSlot(id);
		return withRecoveryRecord(id, true, record -> restoreFromRecord(document, record, Optional.empty()));
	}

	private <T> T withRecoveryRecord(String id, boolean restore, Function<RecoveryRepository.Record, T> operation) throws SQLException {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RECOVERY_RESTORE)) {
			return operation.apply(recoveryRecord(id, restore));
		}
	}

	private record ColdComputerLoad(SetupSession session, Optional<HandleOutcome> reply) { }

	private ColdComputerLoad coldComputerLoad(MatchDocument document, String role, String requestId) throws SQLException {
		return withRecoveryRecord(document.matchId, false, record -> {
			if (record == null) return new ColdComputerLoad(null, Optional.empty());
			Optional<RecoveryCheckpoint.Validated> validated;
			try { validated = Optional.of(checkpoints.validate(record.json)); }
			catch (RuntimeException invalid) {
				persistenceLog.coldComputerLoadFallback("checkpoint-validation", document.matchId, invalid);
				validated = Optional.empty();
			}
			Optional<HandleOutcome> reply = validated.flatMap(checkpoint ->
				checkpoints.computerReply(checkpoint, document, role, clock.millis()))
				.map(result -> outcome(setupReplies.create(requestId, result.code(), false, result.view()), false));
			if (reply.isPresent()) return new ColdComputerLoad(null, reply);
			return new ColdComputerLoad(restoreFromRecord(document, record, validated), Optional.empty());
		});
	}

	private SetupSession restoreFromRecord(MatchDocument document, RecoveryRepository.Record record,
		Optional<RecoveryCheckpoint.Validated> validated) {
		if (record == null) return null; // Never initialize an already active pre-R2 match.
		String id = document.matchId;
		requireResidentSlot(id);
		long decodedBytes = new Utf8Size().bytes(record.json);
		admitDecoded(id, decodedBytes);
		SetupSession session = reconstruct(document, record, validated);
		if (session.isFailed()) return session;
		MatchMemoryBudget.ResidentSize size = residentSize(session, decodedBytes);
		admitResident(id, size);
		TimerRestore retry = pendingTimerRestores.get(id);
		long clockStart = retry != null && retry.generation() == record.generation && retry.clockStartedAt() >= 0
			? retry.clockStartedAt() : clock.millis();
		boolean initializedDecisionClock = session.initializeHumanDecisionClock(clockStart);
		byte[] fingerprint = fingerprints.of(record.json);
		sessions.put(id, session);
		residentSizes.put(id, size);
		generations.put(id, record.generation);
		committedFingerprints.put(id, fingerprint);
		if (recovery.supportsJournal()) journalCursors.put(id, journal.cursor(record, session));
		if (!session.isComplete()) pendingRestoreCheckpoints.put(id,
			initializedDecisionClock ? RestoreCheckpoint.HUMAN_DECISION_CLOCK : RestoreCheckpoint.DEFERRED);
		lastAccess.put(id, clock.millis());
		pendingTimerRestores.remove(id);
		restoredSessions++;
		return session;
	}

	private RecoveryRepository.Record recoveryRecord(String id, boolean restore) throws SQLException {
		safety.requireAutomaticAvailable(id);
		Long rejected = rejectedRecoveryGenerations.get(id);
		if (rejected != null) {
			Long current = recovery.generation(id);
			if (rejected.equals(current)) throw new MatchService.Failure("RECOVERY_CORRUPT");
			rejectedRecoveryGenerations.remove(id);
		}
		return findRecovery(id, restore);
	}

	private RecoveryRepository.Record findRecovery(String id, boolean restore) throws SQLException {
		safety.requireAutomaticAvailable(id);
		try {
			RecoveryRepository.Record record = restore
				? recovery.findForRestore(id, bytes -> admitDecoded(id, bytes))
				: recovery.find(id);
			if (record != null) memoryBudget.requireDecodedBytes(new Utf8Size().bytes(record.json));
			return record;
		}
		catch (MatchService.Failure limited) {
			if ("MATCH_SIZE_LIMIT".equals(limited.code)) LOG.warning("MATCH_SIZE_LIMIT phase=load matchId=" + id + " limit=" + memoryBudget.decodedLimit());
			throw limited;
		}
		catch (RecoveryRepository.CorruptRecord corrupt) {
			rejectRecovery(corrupt.matchId, corrupt.generation);
			throw new MatchService.Failure("RECOVERY_CORRUPT");
		}
	}

	private SetupSession reconstruct(MatchDocument document, RecoveryRepository.Record record) {
		return reconstruct(document, record, Optional.empty());
	}

	private SetupSession reconstruct(MatchDocument document, RecoveryRepository.Record record,
		Optional<RecoveryCheckpoint.Validated> validated) {
		try {
			SetupSession session = new SetupSession(server, document,
				validated.orElseGet(() -> checkpoints.validate(record.json)));
			rejectedRecoveryGenerations.remove(document.matchId);
			return session;
		} catch (MatchService.Failure failure) {
			if ("RECOVERY_CORRUPT".equals(failure.code)) {
				// Cache only constructor rejection of this immutable checkpoint generation. Metadata
				// lookups and authorization remain live; SQL/capacity failures never enter this cache.
				rejectRecovery(document.matchId, record.generation);
			}
			throw failure;
		}
	}

	private void requireSize(String id, long bytes, int limit) {
		if (bytes <= limit) return;
		releaseEngine(id);
		LOG.warning("MATCH_SIZE_LIMIT phase=admission matchId=" + id + " decodedBytes=" + bytes + " limit=" + limit);
		throw new MatchService.Failure(MatchStopReason.MATCH_SIZE_LIMIT.name());
	}

	private boolean requireAppend(String id, SetupSession session) {
		MatchMemoryBudget.ResidentSize size = residentSizes.get(id);
		if (session.isComplete() || size == null || size.decodedBytes() < memoryBudget.appendLimit()) return false;
		session.endForSizeLimit(clock.millis());
		return true;
	}

	private void admitDecoded(String id, long decodedBytes) {
		// The frozen size is not known before reconstruction. Retain the full decode allowance here.
		admitResident(id, memoryBudget.residentSize(decodedBytes, 0, 0));
	}

	private MatchMemoryBudget.ResidentSize residentSize(SetupSession session, long decodedBytes) {
		return memoryBudget.residentSize(decodedBytes, session.frozenHistoryDecodedBytes(), session.frozenHistoryRetainedBytes());
	}

	private void admitResident(String id, MatchMemoryBudget.ResidentSize size) {
		if (recovery == null || fitsResidentBudget(id, size)) return;
		List<String> candidates = lastAccess.entrySet().stream().filter(entry -> !entry.getKey().equals(id))
			.sorted(java.util.Comparator.<Map.Entry<String, Long>, Boolean>comparing(entry -> {
				SetupSession session = sessions.get(entry.getKey());
				return !session.isComplete() && clock.millis() - entry.getValue() < IDLE_MILLIS;
			}).thenComparing(Map.Entry.comparingByValue())).map(Map.Entry::getKey).toList();
		for (String candidate : candidates) {
			if (fitsResidentBudget(id, size)) break;
			if (!committedFingerprints.containsKey(candidate)) continue;
			// These engines own server-driven expiry; evicting them would stall connected peers.
			if (sessions.get(candidate).hasPendingReactiveDecision()
				|| pendingRestoreCheckpoints.get(candidate) == RestoreCheckpoint.HUMAN_DECISION_CLOCK) continue;
			releaseEngine(candidate); memoryEvictions++;
		}
		if (!fitsResidentBudget(id, size)) throw new MatchService.Failure("ACTIVATION_LIMIT");
	}

	private boolean fitsResidentBudget(String id, MatchMemoryBudget.ResidentSize size) {
		List<MatchMemoryBudget.ResidentSize> sizes = new ArrayList<>(residentSizes.size() + 1);
		residentSizes.forEach((matchId, current) -> {
			if (!matchId.equals(id)) sizes.add(current);
		});
		sizes.add(size);
		return memoryBudget.admitsResidents(sizes, detachedSlots(id));
	}

	private long detachedSlots(String id) {
		return retainedIds().stream().filter(key -> !key.equals(id) && !sessions.containsKey(key)).count();
	}

	private Set<String> retainedIds() {
		Set<String> ids = new HashSet<>(sessions.keySet());
		ids.addAll(pendingCompletions.keySet()); ids.addAll(pendingTimerRestores.keySet());
		return ids;
	}

	private int retainedSlots() { return retainedIds().size(); }

	private void requireResidentSlot(String id) {
		if (retainedSlots() < memoryBudget.residentLimit() || pendingCompletions.containsKey(id) || pendingTimerRestores.containsKey(id)) return;
		capacityRejections++;
		throw new MatchService.Failure("ACTIVATION_LIMIT");
	}

	private void checkpointRecorded(String id, SetupSession session, MatchMemoryBudget.ResidentSize size) {
		residentSizes.put(id, size);
		if (session.endedForSizeLimit()) {
			stoppedMatches.put(id, MatchStopReason.MATCH_SIZE_LIMIT);
			LOG.warning("MATCH_SIZE_LIMIT phase=completed matchId=" + id + " decodedBytes=" + size.decodedBytes() + " limit=" + memoryBudget.decodedLimit());
		}
	}

	private void rejectRecovery(String id, long generation) {
		rejectedRecoveryGenerations.put(id, generation);
		if (rejectedRecoveryGenerations.size() > MAX_REJECTED_RECOVERIES)
			rejectedRecoveryGenerations.remove(rejectedRecoveryGenerations.keySet().iterator().next());
	}

	/** Unwinds the oversized engine before restoring the unchanged durable generation. */
	private static final class CheckpointOverflow extends RuntimeException {
		final long generation;

		CheckpointOverflow(long generation) { this.generation = generation; }
	}

	private void checkpoint(String owner, String id, SetupSession session) throws SQLException {
		if (recovery == null) return;
		long decodedBytes = session.recoveryBytes();
		if (!session.isComplete() && decodedBytes >= memoryBudget.appendLimit() && decodedBytes <= memoryBudget.decodedLimit()) {
			session.endForSizeLimit(clock.millis());
			decodedBytes = session.recoveryBytes();
		}
		if (decodedBytes > memoryBudget.decodedLimit()) {
			long generation = generations.get(id);
			releaseEngine(id);
			throw new CheckpointOverflow(generation);
		}
		try { if (timing.detailed()) {
			int[] counts = session.recoveryJournalCounts();
			timing.value(BrowserRequestTiming.Value.HISTORY_REQUESTS, counts[0]); timing.value(BrowserRequestTiming.Value.EVENTS, counts[1]);
			timing.value(BrowserRequestTiming.Value.NATIVE_COMMANDS, counts[2]); timing.value(BrowserRequestTiming.Value.TRANSCRIPT_RECORDS, counts[3]);
			JsonObject summary = session.browseSummary();
			timing.value(BrowserRequestTiming.Value.HALF, summary.getInt("half", 0)); timing.value(BrowserRequestTiming.Value.TURN, summary.getInt("turn", 0));
			timing.value(BrowserRequestTiming.Value.REVISION, session.revision());
		} } catch (RuntimeException unavailable) { /* Diagnostic context must not affect checkpoint behavior. */ }
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.CHECKPOINT)) {
			// The shared workspace was reserved at admission. Stable/smaller checkpoints need no cache churn.
			MatchMemoryBudget.ResidentSize size = residentSize(session, decodedBytes);
			if (size.growsFrom(residentSizes.get(id))) admitResident(id, size);
			RecoveryJournal.Cursor cursor = journalCursors.get(id);
			if (cursor != null) { timing.value(BrowserRequestTiming.Value.JOURNAL_ENTRIES, cursor.entries); timing.value(BrowserRequestTiming.Value.JOURNAL_BYTES, cursor.journalBytes); }
			long generation = generations.get(id);
			boolean compacting = false;
			if (cursor != null && !session.isFailed() && !session.isComplete()) {
				RecoveryJournal.Change change;
				try (BrowserRequestTiming.Scope encode = timing.span(BrowserRequestTiming.Phase.RECOVERY_SERIALIZE)) {
					change = journal.change(session, cursor, generation);
				}
				if (change == null) { timing.value(BrowserRequestTiming.Value.CHECKPOINT_PATH, 0); pendingRestoreCheckpoints.remove(id); return; }
				if (!change.compact && change.next.budget <= memoryBudget.decodedLimit()) {
					matches.load(owner, id); // Reauthorize before writing the durable generation.
					timing.value(BrowserRequestTiming.Value.CHECKPOINT_PATH, 1);
					try (BrowserRequestTiming.Scope store = timing.span(BrowserRequestTiming.Phase.CHECKPOINT_STORE)) {
						if (!recovery.append(new RecoveryRepository.Record(id, generation + 1, change.json, session.computerWorkUntil()), generation))
							throw new MatchService.Failure("RECOVERY_CONFLICT");
					}
					generations.put(id, generation + 1); journalCursors.put(id, change.next);
					checkpointRecorded(id, session, size);
					pendingRestoreCheckpoints.remove(id);
					return;
				}
				compacting = true;
			}
			FullCheckpoint checkpoint = fullCheckpoint(session, recovery.supportsJournal());
			String after = checkpoint.json();
			timing.value(BrowserRequestTiming.Value.CHECKPOINT_PATH, compacting ? 2 : 3);
			byte[] previous = committedFingerprints.get(id);
			if (previous == null) throw new MatchService.Failure("RECOVERY_CORRUPT");
			byte[] fingerprint;
			try (BrowserRequestTiming.Scope hash = timing.span(BrowserRequestTiming.Phase.RECOVERY_FINGERPRINT)) {
				fingerprint = fingerprints.of(after);
			}
			if (Arrays.equals(fingerprint, previous) && (cursor == null || cursor.entries == 0)) {
				timing.value(BrowserRequestTiming.Value.CHECKPOINT_PATH, 0);
				pendingRestoreCheckpoints.remove(id); return;
			}
			matches.load(owner, id);
			try (BrowserRequestTiming.Scope store = timing.span(BrowserRequestTiming.Phase.CHECKPOINT_STORE)) {
				if (!recovery.save(new RecoveryRepository.Record(id, generation + 1, after, session.computerWorkUntil()), generation))
					throw new MatchService.Failure("RECOVERY_CONFLICT");
			}
			generations.put(id, generation + 1);
			checkpointRecorded(id, session, size);
			committedFingerprints.put(id, fingerprint);
			if (checkpoint.cursor() != null) journalCursors.put(id, checkpoint.cursor());
			pendingRestoreCheckpoints.remove(id);
			if (session.isFailed()) { release(id); failedReleases++; }
		} catch (SQLException | RuntimeException failure) {
			release(id); // Reconcile the durable outcome before any further use.
			throw failure;
		}
	}

	private record SizeStopped(MatchDocument document, SetupSession session) { }

	private SizeStopped stopAtCommittedCheckpoint(String owner, String id, CheckpointOverflow overflow) throws SQLException {
		MatchDocument document = matches.loadForSetup(owner, id).document;
		if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("RECOVERY_CONFLICT");
		SetupSession terminal = withRecoveryRecord(id, true, record -> {
			if (record == null || record.generation != overflow.generation) throw new MatchService.Failure("RECOVERY_CONFLICT");
			return restoreFromRecord(document, record, Optional.empty());
		});
		try {
			if (terminal.isFailed() || terminal.isComplete()) throw new MatchService.Failure("RECOVERY_CONFLICT");
			terminal.endForSizeLimit(clock.millis());
			requireSize(id, terminal.recoveryBytes(), memoryBudget.decodedLimit());
			checkpoint(owner, id, terminal);
			return new SizeStopped(document, terminal);
		} catch (SQLException | RuntimeException failure) {
			releaseEngine(id);
			throw failure;
		}
	}

	private FullCheckpoint fullCheckpoint(SetupSession session, boolean withCursor) {
		JsonObject payload;
		RecoveryArtifactJson.Encoded artifact;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RECOVERY_SERIALIZE)) {
			if (!withCursor) return new FullCheckpoint(session.recoveryArtifact(), null);
			payload = session.recoveryCheckpointPayload();
			artifact = new RecoveryArtifactJson().encodeCanonicalCheckpoint(payload);
		}
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.RECOVERY_CURSOR)) {
			return new FullCheckpoint(artifact.envelope(), journal.checkpointCursor(payload, artifact,
				session.recoveryJournalCounts(), session.recoveryNativeEpoch()));
		}
	}

	private record FullCheckpoint(String json, RecoveryJournal.Cursor cursor) { }

	private JsonObject preparedFailure(JsonObject request, String code) {
		return new JsonObject().add("version", 1).add("type", "preparedMatch").add("requestId", request.get("requestId"))
			.add("code", code).add("duplicate", false).add("callerRole", JsonValue.NULL)
			.add("document", JsonValue.NULL).add("recoveryMatchId", JsonValue.NULL);
	}

	public JsonObject handle(String owner, JsonObject request) { return handleWithOutcome(owner, request).response(); }

	public record DeadlinePublication(JsonObject state, boolean saveResumeChanged, Optional<JsonObject> abandonedAwayState) { }

	public Map<String, JsonObject> expireReactiveDecisions() {
		Map<String, JsonObject> states = new LinkedHashMap<>();
		expireDecisions().forEach((id, publication) -> states.put(id, publication.state()));
		return states;
	}

	/** Timer callbacks enqueue this on the same communication worker as coach commands. */
	public Map<String, DeadlinePublication> expireDecisions() {
		Map<String, DeadlinePublication> changed = new LinkedHashMap<>();
		retryPendingCompletion(changed);
		restorePendingTimer(changed);
		// A legacy clock is durable even if its first cold load is the only request before eviction.
		// Use at most one fresh timer budget per tick for this restore maintenance.
		String clockCheckpoint = pendingRestoreCheckpoints.entrySet().stream()
			.filter(entry -> entry.getValue() == RestoreCheckpoint.HUMAN_DECISION_CLOCK)
			.map(Map.Entry::getKey).findFirst().orElse(null);
		for (String id : new ArrayList<>(sessions.keySet())) {
			if (pendingCompletions.containsKey(id)) continue;
			SetupSession session = sessions.get(id);
			if (session == null) continue; // An earlier checkpoint may evict another cached engine.
			try { safety.requireAutomaticAvailable(id); }
			catch (MatchService.Failure quarantined) { release(id); continue; }
			long now = clock.millis();
			boolean pendingReaction = session.hasPendingReactiveDecision();
			boolean abandonmentDue = recovery != null && session.abandonmentDue(now);
			boolean proposalDue = session.saveResumeProposalDue(now);
			boolean reactionDue = session.reactiveDecisionDue(now);
			boolean pendingDecisionClock = pendingRestoreCheckpoints.get(id) == RestoreCheckpoint.HUMAN_DECISION_CLOCK;
			boolean persistDecisionClock = id.equals(clockCheckpoint);
			if (!abandonmentDue && !proposalDue && !reactionDue && !persistDecisionClock) {
				if (!pendingReaction && !pendingDecisionClock) pendingTimerRestores.remove(id);
				continue;
			}
			TimerRestore previousRetry = pendingTimerRestores.remove(id);
			long uncommittedClock = pendingDecisionClock ? session.humanDecisionSince() : -1;
			long generation = generations.getOrDefault(id, -1L);
			try {
				try {
					expireMatchDecisions(id, session, now, proposalDue, reactionDue, persistDecisionClock, changed);
				} catch (CheckpointOverflow overflow) {
					String owner = session.checkpointOwner();
					session = null;
					SetupSession terminal = stopAtCommittedCheckpoint(owner, id, overflow).session();
					queueCompletion(id);
					changed.put(id, new DeadlinePublication(publishedState(terminal, "size-limit"), false, Optional.empty()));
				}
			} catch (SQLException | RuntimeException failure) {
				if (session != null && session.isFailed() && sessions.containsKey(id)) {
					try { checkpoint(session.checkpointOwner(), id, session); }
					catch (SQLException | RuntimeException unavailable) { /* Reconcile before reuse. */ }
				}
				// Reconcile uncertain mutations, while preserving automatic ownership of a timed decision.
				release(id);
				if (recovery != null && (pendingReaction || uncommittedClock >= 0) && (failure instanceof SQLException
					|| failure instanceof MatchService.Failure limited && "ACTIVATION_LIMIT".equals(limited.code)))
					pendingTimerRestores.putLast(id, new TimerRestore(now,
						previousRetry == null ? INITIAL_COMPLETION_BACKOFF_MILLIS : previousRetry.nextDelayMillis(),
						pendingReaction, uncommittedClock, generation).afterFailure(clock.millis()));
			}
		}
		releaseIdle();
		return changed;
	}

	private void expireMatchDecisions(String id, SetupSession session, long now, boolean proposalDue, boolean reactionDue,
		boolean persistDecisionClock, Map<String, DeadlinePublication> changed) throws SQLException {
		if (requireAppend(id, session)) {
			checkpoint(session.checkpointOwner(), id, session);
			queueCompletion(id);
			changed.put(id, new DeadlinePublication(publishedState(session, "size-limit"), false, Optional.empty()));
			return;
		}
		boolean expiredProposal = proposalDue && session.expireSaveResumeProposal(now);
		if (recovery != null && recordTimedAbandonment(id, session, now, changed)) return;
		boolean expiredReaction = false;
		if (reactionDue) {
			refreshSkillUsePreferences(id, session);
			expiredReaction = session.expireReactiveDecision(clock.millis());
		}
		if (recovery != null && expiredReaction && session.isComputerMatch()
			&& recordTimedAbandonment(id, session, now, changed)) return;
		if (!expiredProposal && !expiredReaction && !persistDecisionClock) return;
		checkpoint(session.checkpointOwner(), id, session);
		if (session.isComplete()) {
			if (recovery != null) queueCompletion(id);
			else matches.complete(session.checkpointOwner(), id, session.completedMatch());
		}
		if (expiredProposal || expiredReaction || session.endedForSizeLimit())
			changed.put(id, new DeadlinePublication(publishedState(session, "deadline"), expiredProposal, Optional.empty()));
	}

	private boolean recordTimedAbandonment(String id, SetupSession session, long now, Map<String, DeadlinePublication> changed)
		throws SQLException {
		if (!recordAbandonment(session.checkpointOwner(), id, session, now)) return false;
		// The checkpoint is durable and the session has been released. Keep each coach's view for delivery.
		changed.put(id, new DeadlinePublication(publishedState(session, "deadline"), false,
			Optional.of(publishedState(session, "deadline", "away"))));
		return true;
	}

	private boolean recordAbandonment(String owner, String id, SetupSession session, long now) throws SQLException {
		if (!session.abandonIfInactive(now)) return false;
		checkpoint(owner, id, session);
		release(id);
		return true;
	}

	private void queueCompletion(String id) {
		SetupSession session = sessions.get(id);
		if (session == null) return;
		pendingCompletions.putIfAbsent(id, new PendingCompletion(clock.millis(), INITIAL_COMPLETION_BACKOFF_MILLIS,
			publishedState(session, "completion").toString()));
	}

	private Set<String> trackedMatches() { return Set.copyOf(retainedIds()); }

	/** One bounded retry per timer task. Detached decisions and uncommitted clocks retain their slots. */
	private void restorePendingTimer(Map<String, DeadlinePublication> changed) {
		if (pendingTimerRestores.isEmpty() || timing.budget() != null
			&& timing.budget().allowanceMillis(1, JdbcConnections.WORK_RESERVE_MILLIS) == 0) return;
		long now = clock.millis();
		Map.Entry<String, TimerRestore> next = pendingTimerRestores.entrySet().stream()
			.filter(entry -> entry.getValue().retryAt() <= now && !sessions.containsKey(entry.getKey()))
			.findFirst().orElse(null);
		if (next == null) return;
		String id = next.getKey();
		TimerRestore retry = next.getValue();
		long expiry = safety.quarantineUntil(id);
		if (expiry > 0) {
			pendingTimerRestores.putLast(id, retry.afterQuarantine(expiry));
			return;
		}
		try {
			MatchDocument document = matches.loadForSetup("home", id).document;
			if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED)
				throw new MatchService.Failure("NOT_ACTIVATED");
			SetupSession session = restore(id, document);
			pendingTimerRestores.remove(id);
			if (session == null || session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
			if (session.isComplete()) queueCompletion(id);
			else {
				// Restoring the engine alone did not persist the timed decision. Keep its backoff through that write.
				if (retry.generation() < 0 || retry.generation() == generations.getOrDefault(id, -1L))
					pendingTimerRestores.putLast(id, retry);
				if (retry.reaction())
					changed.put(id, new DeadlinePublication(publishedState(session, "reaction-recovery"), false, Optional.empty()));
			}
		} catch (SQLException unavailable) {
			pendingTimerRestores.putLast(id, retry.afterFailure(clock.millis()));
			persistenceLog.rejected("timer-restore", id, null, unavailable);
		} catch (MatchService.Failure failure) {
			if ("ACTIVATION_LIMIT".equals(failure.code)) pendingTimerRestores.putLast(id, retry.afterFailure(clock.millis()));
			else {
				release(id);
				persistenceLog.timerRestoreRejected(id, failure);
			}
		} catch (RuntimeException invalid) {
			release(id);
			persistenceLog.timerRestoreRejected(id, invalid);
		}
	}

	/** At most one resident terminal result per tick, within the existing worker deadline. */
	private void retryPendingCompletion(Map<String, DeadlinePublication> changed) {
		if (pendingCompletions.isEmpty() || timing.budget() != null
			&& timing.budget().allowanceMillis(1, JdbcConnections.WORK_RESERVE_MILLIS) == 0) return;
		long now = clock.millis();
		Map.Entry<String, PendingCompletion> next = pendingCompletions.entrySet().stream()
			.filter(entry -> entry.getValue().retryAt() <= now).findFirst().orElse(null);
		if (next == null) return;
		String id = next.getKey();
		SetupSession session = sessions.get(id);
		try {
			safety.requireAutomaticAvailable(id);
			String owner = session == null ? "home" : session.checkpointOwner();

			MatchDocument document = matches.loadForSetup(owner, id).document;
			if (session == null) {
				RecoveryRepository.Record record = findRecovery(id, true);
				if (record == null) throw new MatchService.Failure("SESSION_UNAVAILABLE");
				admitDecoded(id, new Utf8Size().bytes(record.json));
				session = reconstruct(document, record);
				if (!session.isComplete()) throw new MatchService.Failure("NOT_COMPLETED");
			}
			matches.completeLoaded(owner, document, session.completedMatch());
			changed.put(id, new DeadlinePublication(publishedState(session, "completion"), false, Optional.empty()));
			releaseCompleted(id);
		} catch (MatchService.Failure rejected) {
			if ("ACTIVATION_LIMIT".equals(rejected.code)) {
				pendingCompletions.putLast(id, next.getValue().afterFailure(clock.millis()));
				return;
			}
			release(id);
			terminalCompletionReleases++;
			persistenceLog.pendingCompletionRejected(id, rejected);
		} catch (SQLException | MatchService.OutcomeUnknown failure) {
			// Only recoverable storage failures retain a slot for a later attempt.
			pendingCompletions.putLast(id, next.getValue().afterFailure(clock.millis()));
			persistenceLog.pendingCompletionFailed(id, failure);
		} catch (RuntimeException failure) {
			release(id);
			terminalCompletionReleases++;
			persistenceLog.completionTerminated("pending-completion", id, null, failure);
		}
	}

	public HandleOutcome handleWithOutcome(String owner, JsonObject request) {
		return handleWithOutcome(owner, request, false);
	}

	/** The caller must already have authenticated and authorized the separate computer service. */
	public HandleOutcome handleComputerWithOutcome(String authorizedRole, JsonObject request) {
		HandleOutcome result = handleWithOutcome(authorizedRole, request, true);
		SetupSession session = sessions.get(request.getString("matchId", null));
		JsonValue view = result.response().get("state");
		if (session != null && view != null && view.isObject()) {
			JsonObject computer = session.computerProjection();
			if (computer != null) view.asObject().add("computer", computer);
		}
		return result;
	}

	private HandleOutcome handleWithOutcome(String owner, JsonObject request, boolean computerChannel) {
		String requestId = request.getString("requestId", null);
		String phase = "match-load";
		try {
			validate(request, computerChannel);
			String id = request.getString("matchId", null);
			MatchDocument document = matches.loadForSetup(owner, id).document;
			if (computerChannel) {
				MatchDocument.Member member = computerOpponents.member(document);
				if (member == null || !member.role.equals(owner)) throw new MatchService.Failure("NOT_FOUND");
				owner = member.owner;
			}
			String role = owner.equals(document.home.owner) ? "home"
				: document.away != null && owner.equals(document.away.owner) ? "away" : null;
			if (role == null) throw new MatchService.Failure("NOT_FOUND");

			String operation = request.getString("operation", null);
			boolean computerLoad = computerChannel && "load".equals(operation);
			phase = "retained-concession";
			boolean completed = document.lifecycle == MatchDocument.Lifecycle.COMPLETED;
			if (completed && computerLoad) return completedArtifactReply(document, role, requestId);
			RecoveryRepository.Record retainedRecord = null;
			if (recovery != null && (completed || document.lifecycle == MatchDocument.Lifecycle.ACTIVATED
				&& ("concede".equals(operation) || "concessionStatus".equals(operation)))) {
				retainedRecord = completed ? recoveryRecord(id, false) : findRecovery(id, false);
				HandleOutcome retained = retainedConcessionOutcome(owner, document, role, request, retainedRecord);
				if (retained != null) return retained;
			}
			releaseIdle();
			phase = "completion";
			if (recovery != null && completed) return completedReplyWithOutcome(document, role, request, retainedRecord);
			SetupSession recovered = null;
			boolean cold = recovery != null && !sessions.containsKey(id) && document.lifecycle == MatchDocument.Lifecycle.ACTIVATED;
			MatchPreferences preferences = null;
			if (cold) {
				phase = "skill-use-preferences";
				// Read preferences before decoding a potentially large checkpoint while JDBC time remains.
				preferences = readSkillUsePreferences(id);
				phase = "restore";
				if (computerLoad) {
					ColdComputerLoad load = coldComputerLoad(document, role, requestId);
					if (load.reply().isPresent()) return load.reply().get();
					recovered = load.session();
				} else recovered = restore(id, document);
			}
			if (document.lifecycle == MatchDocument.Lifecycle.COMPLETED && !sessions.containsKey(id)) {
                if (!"load".equals(operation) && !"concessionStatus".equals(operation)) throw new MatchService.Failure("MATCH_COMPLETED");
                return completedArtifactReply(document, role, requestId);
            }
            if (document.lifecycle != MatchDocument.Lifecycle.COMPLETED && document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("NOT_ACTIVATED");
			SetupSession session = recovered == null ? sessions.get(id) : recovered;
			if (session == null) throw new MatchService.Failure("SESSION_UNAVAILABLE");
			if (session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
			phase = "skill-use-preferences";
			if (cold) applySkillUsePreferences(session, preferences);
			else refreshSkillUsePreferences(id, session);
			if (!"load".equals(operation) && !"concessionStatus".equals(operation) && requireAppend(id, session)) {
				checkpoint(owner, id, session);
				JsonObject ended = session.decorateSaveResume(session.reply(requestId, "ACCEPTED", false, role));
				if (complete(owner, document, session, requestId)) releaseCompleted(id);
				return outcome(ended, true);
			}
			phase = "checkpoint";
			if (recovery != null && !computerLoad) lastAccess.put(id, clock.millis());
			if (session.isComplete() && recovery != null && "load".equals(operation)) {
				phase = "completion";
				boolean recorded = complete(owner, document, session, requestId);
				JsonObject response = session.decorateSaveResume(session.reply(requestId, "ACCEPTED", false, role));
				if (recorded) { releaseCompleted(id); }
				return outcome(response, true);
			}
			// Human matches return the committed cold projection and defer maintenance to a fresh request budget.
			if (cold && "load".equals(operation) && !session.isComputerMatch())
				return outcome(session.decorateSaveResume(session.reply(requestId, "ACCEPTED", false, role)), false);
			long decisionTime = clock.millis();
			boolean expiredProposal = session.expireSaveResumeProposal(decisionTime);
			if (recordAbandonment(owner, id, session, decisionTime)) {
				return outcome(failure(requestId, "MATCH_ABANDONED"), false);
			}
			if (session.isComputerMatch() && session.isAbandoned()) {
				release(id);
				return outcome(failure(requestId, "MATCH_ABANDONED"), false);
			}
			// Leave optional restore maintenance for the next resident request's fresh budget.
			if (cold && "load".equals(operation) && !session.reactiveDecisionDue(decisionTime))
				return outcome(session.decorateSaveResume(session.reply(requestId, "ACCEPTED", false, role)), false);
			boolean readOnly = "load".equals(operation) || "concessionStatus".equals(operation);
			String maintenanceBefore = readOnly ? session.reactiveMaintenanceState() : null;
			boolean expiredDecision;
			try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
				expiredDecision = session.expireReactiveDecision(decisionTime);
			}
			catch (RuntimeException failure) { checkpoint(owner, id, session); throw failure; }
			if (expiredDecision) {
				if (session.isComputerMatch() && recordAbandonment(owner, id, session, decisionTime))
					return outcome(failure(requestId, "MATCH_ABANDONED"), false);
				checkpoint(owner, id, session);
				boolean recorded = false;
				if (session.isComplete()) {
					phase = "completion";
					recorded = complete(owner, document, session, requestId);
				}
				JsonObject expired = session.reply(requestId, "load".equals(operation) ? "ACCEPTED" : "STALE_REVISION", false, role);
				session.decorateSaveResume(expired);
				if (recorded && recovery != null) { releaseCompleted(id); }
				return outcome(expired, true);
			}
			JsonObject response;
			boolean staging = session.isStagedRequest(request);
			try {
				if (request.get("computerDecision") != null) session.validateComputerDecision(request);
				else if (computerChannel && document.computer != null
					&& ComputerOpponentService.BOGRUK_ID.equals(document.computer.opponentId)
					&& isComputerGameOperation(operation))
					throw new IllegalArgumentException("Missing Bogruk decision state");
				if ("load".equals(operation) || "concessionStatus".equals(operation)) response = session.reply(requestId, "ACCEPTED", false, role);
				else try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
					response = isSaveResumeOperation(operation) ? session.saveResume(role, request, clock.millis()) : session.apply(role, request, decisionTime);
				}
				if (staging) {
					boolean accepted = "ACCEPTED".equals(response.getString("code", null)) && !response.getBoolean("duplicate", false);
					return new HandleOutcome(session.decorateSaveResume(response), false, true, accepted ? session.stagedPlacement() : null);
				}
				if (request.get("computerDecision") != null && "ACCEPTED".equals(response.getString("code", null))
					&& !response.getBoolean("duplicate", false)) session.acceptComputerDecision(request);
				if ("ACCEPTED".equals(response.getString("code", null)) && !response.getBoolean("duplicate", false)
					&& !"load".equals(operation) && !"concessionStatus".equals(operation) && !isSaveResumeOperation(operation)) session.recordPlayerActivity(role, clock.millis());
			} catch (RuntimeException failure) {
				if (!staging) checkpoint(owner, id, session);
				throw failure;
			}
			if ("ILLEGAL_SETUP".equals(response.getString("code", null)) && response.get("state").isObject()
				&& session.usesStagedPlacements())
				return outcome(session.decorateSaveResume(response), false);
			// Resident reads cannot change history. Retain the first restored checkpoint and any
			// proposal/reaction/clock maintenance even when no native decision was executed.
			if (!(session.isComplete() && recovered != null) && (!readOnly || pendingRestoreCheckpoints.containsKey(id) || expiredProposal
				|| !Objects.equals(maintenanceBefore, session.reactiveMaintenanceState())))
				checkpoint(owner, id, session);
			if (session.endedForSizeLimit()) response = session.reply(requestId, "ACCEPTED", false, role);
			session.decorateSaveResume(response);
            // The terminal checkpoint commits the decision; a refused result write is reconciled on the timer.
			boolean publish = "ACCEPTED".equals(response.getString("code", null))
				&& !response.getBoolean("duplicate", false) && !"load".equals(operation) && !"concessionStatus".equals(operation);
			if (session.isComplete()) {
				phase = "completion";
				boolean recorded = complete(owner, document, session, requestId);
				publish = recovery == null ? legacyCompletionBroadcasted.add(id)
					: document.lifecycle != MatchDocument.Lifecycle.COMPLETED;
				if (recovery != null && recorded) { releaseCompleted(id); }
			}
            return outcome(response, publish);
		} catch (CheckpointOverflow overflow) {
			return handleSizeOverflow(owner, request, overflow);
		} catch (RecoveryRepository.OutcomeUnknown failure) { return outcome(failure(requestId, "MATCH_OUTCOME_UNKNOWN"), false); }
		catch (MatchService.OutcomeUnknown failure) { return outcome(failure(requestId, "MATCH_OUTCOME_UNKNOWN"), false); }
        catch (MatchService.Failure failure) { return outcome(failure(requestId, failure.code), false); }
		catch (SQLException failure) {
			persistenceLog.rejected(phase, request.getString("matchId", null), requestId, failure);
			return outcome(failure(requestId, "PERSISTENCE_FAILED"), false);
		}
		catch (RuntimeException failure) { return outcome(failure(requestId, "INVALID_REQUEST"), false); }
	}

	private HandleOutcome handleSizeOverflow(String owner, JsonObject request, CheckpointOverflow overflow) {
		String id = request.getString("matchId", null);
		String requestId = request.getString("requestId", null);
		try {
			SizeStopped stopped = stopAtCommittedCheckpoint(owner, id, overflow);
			SetupSession terminal = stopped.session();
			MatchDocument document = stopped.document();
			String role = owner.equals(document.home.owner) ? "home" : "away";
			JsonObject response = terminal.decorateSaveResume(terminal.reply(requestId, MatchStopReason.MATCH_SIZE_LIMIT.name(), false, role));
			if (complete(owner, document, terminal, requestId)) releaseCompleted(id);
			return outcome(response, true);
		} catch (RecoveryRepository.OutcomeUnknown failure) {
			return outcome(failure(requestId, "MATCH_OUTCOME_UNKNOWN"), false);
		} catch (SQLException failure) {
			persistenceLog.rejected("size-stop", id, requestId, failure);
			return outcome(failure(requestId, "PERSISTENCE_FAILED"), false);
		} catch (MatchService.Failure failure) {
			return outcome(failure(requestId, failure.code), false);
		} catch (RuntimeException failure) {
			persistenceLog.completionTerminated("size-stop", id, requestId, failure);
			return outcome(failure(requestId, "RECOVERY_CORRUPT"), false);
		}
	}

	/** The terminal checkpoint is the acceptance boundary; result reconciliation gets a later worker budget. */
	private boolean complete(String owner, MatchDocument document, SetupSession session, String requestId) throws SQLException {
		try {
			matches.completeLoaded(owner, document, session.completedMatch());
			pendingCompletions.remove(document.matchId);
			return true;
		}
		catch (SQLException | MatchService.OutcomeUnknown failure) {
			if (recovery == null) throw failure;
			queueCompletion(document.matchId);
			persistenceLog.completionDeferred(document.matchId, requestId, failure);
			return false;
		} catch (MatchService.Failure rejected) {
			if (recovery != null) { release(document.matchId); terminalCompletionReleases++; }
			throw rejected;
		} catch (RuntimeException failure) {
			if (recovery == null) throw failure;
			// The final action is already durable. Do not retry deterministic result failures.
			release(document.matchId);
			terminalCompletionReleases++;
			persistenceLog.completionTerminated("completion", document.matchId, requestId, failure);
			return false;
		}
	}

	/** Keep large retained administrative history outside the terminal engine reconstruction frame. */
	private HandleOutcome retainedConcessionOutcome(String owner, MatchDocument document, String role, JsonObject request,
		RecoveryRepository.Record record) throws SQLException {
		String id = document.matchId;
		String requestId = request.getString("requestId", null);
		String operation = request.getString("operation", null);
		if (record == null) return null;
		RetainedConcession retained = new RetainedConcession(record, document);
		if ("concessionStatus".equals(operation)) {
			SetupSession resident = sessions.get(id);
			return outcome(resident == null ? retainedReply(requestId, role, retained, false)
				: resident.reply(requestId, "ACCEPTED", false, role), false);
		}
		if (!retained.closed() && !("concede".equals(operation) && retained.unsupported())) return null;
		boolean duplicate = retained.closed() && !"load".equals(operation) && retained.duplicate(role, request);
		if (!retained.closed()) {
			duplicate = retained.close(role, request, clock.millis());
			matches.load(owner, id);
			try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.CHECKPOINT)) {
				String artifact = retained.artifact();
				memoryBudget.requireDecodedBytes(new Utf8Size().bytes(artifact));
				if (!recovery.save(new RecoveryRepository.Record(id, record.generation + 1, artifact, Long.MAX_VALUE), record.generation))
					throw new MatchService.Failure("RECOVERY_CONFLICT");
			}
		}
		boolean publish = document.lifecycle != MatchDocument.Lifecycle.COMPLETED;
		if (publish) { matches.complete(owner, id, retained.completed()); releaseCompleted(id); }
		else if (!retained.completed().equals(document.completion)) throw new MatchService.Failure("RECOVERY_CORRUPT");
		return outcome(retainedReply(requestId, role, retained, duplicate), publish);
	}

	private JsonObject retainedReply(String requestId, String role, RetainedConcession retained, boolean duplicate) {
		return setupReplies.create(requestId, "ACCEPTED", duplicate, retained.view(role));
	}

	private HandleOutcome completedArtifactReply(MatchDocument document, String role, String requestId) {
		return outcome(setupReplies.create(requestId, "ACCEPTED", false, completedState(document, role)), false);
	}

	/** Adds a live-only explanation without changing frozen replay or recovery schemas. */
	private JsonObject completedState(MatchDocument document, String role) {
		JsonObject artifact = JsonObject.readFrom(document.completion.json());
		JsonArray events = artifact.get("events").asArray();
		JsonObject terminal = events.get(events.size() - 1).asObject().get("state").asObject().set("callerRole", role);
		JsonValue transcript = artifact.get("transcript");
		if (transcript != null) {
			JsonArray records = transcript.asObject().get("records").asArray();
			JsonValue decision = records.get(records.size() - 1).asObject().get("decision");
			if (decision.isObject() && "sizeLimit".equals(decision.asObject().getString("operation", null))
				&& MatchStopReason.MATCH_SIZE_LIMIT.name().equals(decision.asObject().getString("reason", null)))
				terminal.add("stopReason", MatchStopReason.MATCH_SIZE_LIMIT.name());
		}
		return terminal;
	}

	private HandleOutcome completedReplyWithOutcome(MatchDocument document, String role, JsonObject request,
		RecoveryRepository.Record record) {
		if (record == null) {
			if (!"load".equals(request.getString("operation", null)) && !"concessionStatus".equals(request.getString("operation", null))) throw new MatchService.Failure("MATCH_COMPLETED");
			return completedArtifactReply(document, role, request.getString("requestId", null));
		}
		// Use the existing R2 validator, including native round-trip assertions. This transient
		// reconstruction never enters the resident pool and never receives an engine command.
		SetupSession terminal = reconstruct(document, record);
		if (!terminal.isComplete() || terminal.isFailed()
			|| !terminal.completedMatch().equals(document.completion))
			throw new MatchService.Failure("RECOVERY_CORRUPT");
		JsonObject response;
		if ("load".equals(request.getString("operation", null)) || "concessionStatus".equals(request.getString("operation", null))) {
			response = terminal.reply(request.getString("requestId", null), "ACCEPTED", false, role);
		} else try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
			response = terminal.apply(role, request);
		}
		if (response.get("state") != null && !response.get("state").isNull()) terminal.decorateSaveResume(response);
		boolean publish = sessions.containsKey(document.matchId) && "ACCEPTED".equals(response.getString("code", null));
		if (publish) {
			// A resident terminal engine means the earlier result commit was not acknowledged.
			releaseCompleted(document.matchId);
		}
		return outcome(response, publish);
	}

	public JsonObject failure(String id, String code) {
		return setupReplies.create(id, code, false, JsonValue.NULL);
	}

	/** Recipient-specific publication immediately after commit on the engine worker; caller authorizes first. */
	public JsonObject publishedState(String matchId, String role, boolean computer) throws SQLException {
		if (!("home".equals(role) || "away".equals(role)))
			throw new MatchService.Failure("NOT_FOUND");
		MatchDocument document = matches.load(role, matchId).document;
		if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) return null;
		if (computer) {
			MatchDocument.Member member = computerOpponents.member(document);
			if (member == null || !role.equals(member.role)) throw new MatchService.Failure("NOT_FOUND");
		}
		SetupSession session = sessions.get(matchId);
		PendingCompletion pending = pendingCompletions.get(matchId);
		if (session == null && pending != null && pending.terminalState() != null) {
			JsonObject view = JsonObject.readFrom(pending.terminalState()).set("callerRole", role);
			return new JsonObject().add("version", 1).add("type", "setupState").add("requestId", "broadcast")
				.add("code", "ACCEPTED").add("duplicate", false).add("state", view);
		}
		// Terminal sessions may already have been released. Keep their existing durable recovery path.
		if (session == null) return null;
		if (session.isFailed() || recovery != null && !committedFingerprints.containsKey(matchId))
			throw new MatchService.Failure("SESSION_UNAVAILABLE");
		// Called on the engine worker immediately after a successful checkpoint. Publication
		// must not expire decisions, refresh preferences or checkpoint the same state again.
		JsonObject response = session.decorateSaveResume(session.reply("broadcast", "ACCEPTED", false, role));
		if (computer) {
			JsonObject projection = session.computerProjection();
			if (projection != null) response.get("state").asObject().add("computer", projection);
		}
		return response;
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

	public Map<String, MatchDocument> browseDocuments(List<String> ids, LobbyReadBudget budget) throws SQLException {
		return matches.browseDocuments(ids, budget);
	}

	/** Durable frozen facts for an already authorized browse entry. */
	public MatchDocument browseDocument(String matchId) throws SQLException {
		return matches.load("home", matchId).document;
	}

	/** Scalar public states for an authorized page; never restores or touches a native engine. */
	public Map<String, JsonObject> browseStates(List<String> ids, LobbyReadBudget budget) throws SQLException {
		budget.entries(ids.size());
		Map<String, JsonObject> result = new LinkedHashMap<>();
		List<String> missing = new ArrayList<>();
		for (String id : ids) {
			budget.check();
			SetupSession resident = sessions.get(id);
			if (resident != null && !resident.isFailed()) result.put(id, resident.browseSummary());
			else missing.add(id);
		}
		if (recovery != null) for (RecoveryRepository.Record record : recovery.findAll(missing, budget).values()) {
			budget.check();
			try {
				JsonValue payloadValue = JsonObject.readFrom(record.json).get("payload");
				if (payloadValue == null || !payloadValue.isObject()) continue;
				JsonObject payload = payloadValue.asObject();
				if (!record.matchId.equals(payload.getString("matchId", null)) || payload.getBoolean("failed", false)) continue;
				JsonValue viewValue = payload.get("homeView");
				if (viewValue == null || !viewValue.isObject()) continue;
				JsonObject view = viewValue.asObject();
				if (!record.matchId.equals(view.getString("matchId", null)) || !"home".equals(view.getString("callerRole", null))) continue;
				result.put(record.matchId, browseScalars(view));
			} catch (RuntimeException invalid) { /* Stored scalar facts are unavailable for this entry. */ }
		}
		return result;
	}

	private JsonObject browseScalars(JsonObject view) {
		JsonObject result = new JsonObject();
		for (String field : Arrays.asList("phase", "half", "turn", "homeScore", "awayScore")) {
			JsonValue value = view.get(field);
			if (value != null && ("phase".equals(field) ? value.isString() : value.isNumber())) result.add(field, value);
		}
		return result;
	}

	/** Bounded public history; the caller must authorize the viewer for this active match first. */
	public JsonObject transcriptPage(String matchId, int from, int limit) throws SQLException {
		return transcriptPage(matchId, from, limit, true);
	}

	/** Best-effort history accompanying an authorized durable state; never restores or executes a native session. */
	public JsonObject liveTranscriptPage(String matchId, int revision) throws SQLException {
		return transcriptPage(matchId, revision, 1, false);
	}

	private JsonObject transcriptPage(String matchId, int from, int limit, boolean restoreMissing) throws SQLException {
		MatchDocument document = matches.load("home", matchId).document;
		if (document.lifecycle == MatchDocument.Lifecycle.COMPLETED) {
			JsonObject artifact = JsonObject.readFrom(document.completion.json());
			if (artifact.getInt("formatVersion", -1) != 2 && artifact.getInt("formatVersion", -1) != 3)
				throw new MatchService.Failure("REPLAY_UNSUPPORTED");
			return new MatchTranscript(artifact.get("transcript").asObject()).page(from, limit);
		}
		if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("NOT_FOUND");
		if (!restoreMissing && recovery == null) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (restoreMissing) {
			releaseIdle();
			if (recovery != null && !sessions.containsKey(matchId)) restore(matchId, document);
		}
		SetupSession session = sessions.get(matchId);
		if (session == null || session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (recovery != null) lastAccess.put(matchId, clock.millis());
		return session.transcriptPage(from, limit);
	}

	/** Public chat is kept with the checkpoint and copied into the immutable completed result. */
	public JsonObject chatPage(String matchId, int from, int limit) throws SQLException {
		MatchDocument document = matches.load("home", matchId).document;
		if (document.lifecycle == MatchDocument.Lifecycle.COMPLETED) {
			JsonObject artifact = JsonObject.readFrom(document.completion.json());
			if (artifact.getInt("formatVersion", -1) != 3) throw new MatchService.Failure("CHAT_UNAVAILABLE");
			return new MatchChat(artifact.get("chat").asObject()).page(from, limit);
		}
		if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("NOT_FOUND");
		releaseIdle();
		if (recovery != null && !sessions.containsKey(matchId)) restore(matchId, document);
		SetupSession session = sessions.get(matchId);
		if (session == null || session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (recovery != null) lastAccess.put(matchId, clock.millis());
		return session.chatPage(from, limit);
	}

	/** The protocol caller has already authorized this coach or live spectator. */
	public MatchChat.Outcome sendChat(String matchId, String accountId, String role, String requestId, String content) throws SQLException {
		try {
			return persistChat(matchId, accountId, role, requestId, content);
		} catch (CheckpointOverflow overflow) {
			stopAtCommittedCheckpoint("home", matchId, overflow);
			queueCompletion(matchId);
			throw new MatchService.Failure(MatchStopReason.MATCH_SIZE_LIMIT.name());
		}
	}

	private MatchChat.Outcome persistChat(String matchId, String accountId, String role, String requestId, String content) throws SQLException {
		MatchDocument document = matches.load("home", matchId).document;
		if (document.lifecycle == MatchDocument.Lifecycle.COMPLETED) {
			JsonObject artifact = JsonObject.readFrom(document.completion.json());
			if (artifact.getInt("formatVersion", -1) != 3) throw new MatchService.Failure("CHAT_UNAVAILABLE");
			return new MatchChat(artifact.get("chat").asObject()).duplicate(accountId, requestId, content);
		}
		if (document.lifecycle != MatchDocument.Lifecycle.ACTIVATED) throw new MatchService.Failure("NOT_FOUND");
		releaseIdle();
		if (recovery != null && !sessions.containsKey(matchId)) restore(matchId, document);
		SetupSession session = sessions.get(matchId);
		if (session == null || session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (recovery == null) throw new MatchService.Failure("CHAT_UNAVAILABLE");
		lastAccess.put(matchId, clock.millis());

		if (requireAppend(matchId, session)) {
			checkpoint("home", matchId, session); queueCompletion(matchId);
			throw new MatchService.Failure(MatchStopReason.MATCH_SIZE_LIMIT.name());
		}
		MatchChat.Outcome outcome = session.sendChat(accountId, role, requestId, content, clock.millis());
		checkpoint("home", matchId, session);
		if (session.endedForSizeLimit()) queueCompletion(matchId);
		return outcome;
	}

	/** Read-only route forecast for a registered coach; the transport has resolved account membership to a role. */
	public JsonObject routePreview(String role, String matchId, int revision, com.eclipsesource.json.JsonArray waypoints) throws SQLException {
		MatchDocument document = matches.load(role, matchId).document;
		if (!role.equals(document.home.owner) && (document.away == null || !role.equals(document.away.owner))
			|| document.lifecycle != MatchDocument.Lifecycle.ACTIVATED)
			throw new MatchService.Failure("NOT_FOUND");
		releaseIdle();
		if (recovery != null && !sessions.containsKey(matchId)) restore(matchId, document);
		SetupSession session = sessions.get(matchId);
		if (session == null || session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (recovery != null) lastAccess.put(matchId, clock.millis());
		return session.routePreview(role, revision, waypoints);
	}

	public JsonObject movementRange(String role, String matchId, int revision, String playerId) throws SQLException {
		return movementSession(role, matchId).movementRange(role, revision, playerId);
	}

	public JsonObject movementPreview(String role, String matchId, int revision, String playerId,
		String kind, String targetPlayerId, com.eclipsesource.json.JsonArray waypoints) throws SQLException {
		return movementSession(role, matchId).movementPreview(role, revision, playerId, kind, targetPlayerId, waypoints);
	}

	public JsonObject movementPreview(String role, String matchId, int revision, String playerId,
		String kind, String targetPlayerId, JsonObject targetSquare, com.eclipsesource.json.JsonArray waypoints) throws SQLException {
		return movementSession(role, matchId).movementPreview(role, revision, playerId, kind, targetPlayerId, targetSquare, waypoints);
	}

	private SetupSession movementSession(String role, String matchId) throws SQLException {
		MatchDocument document = matches.load(role, matchId).document;
		if (!role.equals(document.home.owner) && (document.away == null || !role.equals(document.away.owner))
			|| document.lifecycle != MatchDocument.Lifecycle.ACTIVATED)
			throw new MatchService.Failure("NOT_FOUND");
		releaseIdle();
		if (recovery != null && !sessions.containsKey(matchId)) restore(matchId, document);
		SetupSession session = sessions.get(matchId);
		if (session == null || session.isFailed()) throw new MatchService.Failure("SESSION_UNAVAILABLE");
		if (recovery != null) lastAccess.put(matchId, clock.millis());
		return session;
	}

	private void validate(JsonObject request, boolean computerChannel) {
		String operation = request.get("operation").asString();
		String[] base = { "version", "type", "operation", "requestId", "matchId" };
		List<String> fields = new ArrayList<>(Arrays.asList(base));
		if (computerChannel && request.get("computerDecision") != null) {
			if (!isComputerGameOperation(operation)) throw new IllegalArgumentException();
			fields.add("computerDecision");
		}
		if (!"load".equals(operation) && !"concessionStatus".equals(operation)) {
			fields.add("expectedRevision");
			if (request.get("expectedRevision").asInt() < 0) throw new IllegalArgumentException();
		}
		switch (operation) {
			case "load": case "concessionStatus": case "confirm": case "concede": case "saveRequest": case "resumeRequest": break;
			case "saveAccept": case "saveReject": case "saveCancel": case "resumeAccept": case "resumeReject": case "resumeCancel":
				fields.add("proposalId"); if (!request.get("proposalId").asString().matches("[0-9a-f-]{36}")) throw new IllegalArgumentException(); break;
			case "action":
                fields.add("actionId");
                if (request.get("actionId").asString().length() > 200) throw new IllegalArgumentException();
                if (request.get("playerIds") != null) {
                    fields.add("playerIds");
                    if (!request.get("actionId").asString().endsWith(":event-confirm")
                        || request.get("playerIds").asArray().size() > 16) throw new IllegalArgumentException();
                    for (JsonValue player : request.get("playerIds").asArray())
                        if (player.asString().isEmpty() || player.asString().length() > 200) throw new IllegalArgumentException();
                }
                break;
			case "route":
				fields.add("playerId"); fields.add("waypoints");
				if (request.get("playerId").asString().length() > 200) throw new IllegalArgumentException();
				com.eclipsesource.json.JsonArray waypoints = request.get("waypoints").asArray();
				if (waypoints.size() < 1 || waypoints.size() > 20) throw new IllegalArgumentException();
				for (JsonValue item : waypoints) {
					JsonObject point = item.asObject();
					if (point.size() != 2 || !point.names().contains("x") || !point.names().contains("y")) throw new IllegalArgumentException();
					point.get("x").asInt(); point.get("y").asInt();
				}
				break;
			case "movement":
				fields.add("playerId"); fields.add("kind"); fields.add("targetPlayerId"); fields.add("waypoints");
				if (request.get("targetSquare") != null) {
					fields.add("targetSquare");
					JsonObject square = request.get("targetSquare").asObject();
					if (!"pass".equals(request.getString("kind", null)) || !request.get("targetPlayerId").isNull()
						|| square.size() != 2 || !square.names().containsAll(java.util.Arrays.asList("x", "y"))
						|| square.get("x").asInt() < 0 || square.get("x").asInt() > 25
						|| square.get("y").asInt() < 0 || square.get("y").asInt() > 14) throw new IllegalArgumentException();
				}
				if (request.get("playerId").asString().length() > 200) throw new IllegalArgumentException();
				String kind = request.get("kind").asString();
				if (!("move".equals(kind) || "blitz".equals(kind) || "foul".equals(kind)
					|| "pass".equals(kind) || "handOff".equals(kind))) throw new IllegalArgumentException();
				if (request.get("targetPlayerId") != null && !request.get("targetPlayerId").isNull()
					&& request.get("targetPlayerId").asString().length() > 200) throw new IllegalArgumentException();
				com.eclipsesource.json.JsonArray movementPoints = request.get("waypoints").asArray();
				if (movementPoints.size() > 20 || "move".equals(kind) && movementPoints.isEmpty()) throw new IllegalArgumentException();
				for (JsonValue item : movementPoints) {
					JsonObject point = item.asObject();
					new MovementWaypoint(point);
				}
				break;
			case "choice": fields.add("promptId"); fields.add("optionId"); request.get("promptId").asString(); request.get("optionId").asString(); break;
            case "formation":
                fields.add("formationIndex");
                if (request.get("formationIndex").asInt() < 0 || request.get("formationIndex").asInt() > 2) throw new IllegalArgumentException();
                break;
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

	public static final Set<String> SAVE_RESUME_OPERATIONS = Set.of(
		"saveRequest", "saveAccept", "saveReject", "saveCancel", "resumeRequest", "resumeAccept", "resumeReject", "resumeCancel");

	private boolean isSaveResumeOperation(String operation) { return SAVE_RESUME_OPERATIONS.contains(operation); }

	private boolean isComputerGameOperation(String operation) {
		return Arrays.asList("action", "choice", "place", "confirm", "route", "movement").contains(operation);
	}
}
