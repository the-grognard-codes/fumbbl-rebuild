package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;

import java.lang.reflect.Field;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

class SetupApplicationReadOnlyLoadTest {
	private static final long HOUR = 60 * 60_000L;
	private static final long SAVED_RETENTION = 30 * 24 * HOUR;

	@Test void coldComputerLoadRefusesAnOversizedCheckpointBeforeValidation() throws Exception {
		Fixture fixture = new Fixture("away");
		MatchMemoryBudget budget = new MatchMemoryBudget(64L * 1024 * 1024);
		// Invalid JSON would yield RECOVERY_CORRUPT if checkpoint validation ran.
		fixture.recovery.record = new RecoveryRepository.Record(fixture.id, 1, "x".repeat(budget.decodedLimit() + 1));
		SetupApplication application = fixture.application(budget, new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
		JsonObject response = application.handleComputerWithOutcome("away", fixture.load()).response();
		assertEquals("MATCH_SIZE_LIMIT", response.getString("code", null));
		assertEquals(1, fixture.recovery.reads);
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
	}

	@Test void timerSkipsTheHumanDecisionClockCheckpointForAQuarantinedMatch() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		removePersistedDecisionClock(fixture);

		MatchSafetyJournal safety = mock(MatchSafetyJournal.class);
		SetupApplication application = fixture.application(new MatchMemoryBudget(), safety);
		assertEquals("ACCEPTED", application.handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));
		assertEquals(1, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertEquals(0, fixture.recovery.saves);
		int reads = fixture.recovery.reads;

		doThrow(new MatchService.Failure("MATCH_QUARANTINED")).when(safety).requireAutomaticAvailable(fixture.id);
		assertTrue(application.expireDecisions().isEmpty());
		assertEquals(reads, fixture.recovery.reads);
		assertEquals(0, fixture.recovery.saves);
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
	}

	@Test void timerPublishesTheDurableAbandonmentBeforeReleasingAResidentMatch() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		SetupApplication application = fixture.application();
		assertEquals("ACCEPTED", application.handle("home", fixture.load()).getString("code", null));

		fixture.now.addAndGet(HOUR);
		SetupApplication.DeadlinePublication publication = application.expireDecisions().get(fixture.id);
		assertEquals("ABANDONED", saveStatus(publication.state()));
		assertEquals("home", publication.state().getString("callerRole", null));
		assertEquals("ABANDONED", saveStatus(publication.abandonedAwayState().orElseThrow()));
		assertEquals("away", publication.abandonedAwayState().orElseThrow().getString("callerRole", null));
		assertTrue(retainedSave(fixture).getBoolean("abandoned", false));
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertTrue(application.expireReactiveDecisions().isEmpty());
	}

	@Test void evictedComputerMatchIsDurablyAbandonedOnFirstTouchAfterOneHour() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		SetupApplication application = fixture.application();
		application.handle("home", fixture.load());
		fixture.now.addAndGet(30 * 60_000L);
		application.expireReactiveDecisions();
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		fixture.now.addAndGet(30 * 60_000L - 1);
		assertEquals("ACCEPTED", application.handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));
		fixture.now.incrementAndGet();
		assertEquals("MATCH_ABANDONED", application.handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));
		assertEquals(1, fixture.recovery.saves);
		assertEquals("MATCH_ABANDONED", fixture.application().handle("home", fixture.load()).getString("code", null));
		assertEquals(1, fixture.recovery.saves);
	}

	@Test void computerTurnDoesNotUseHumanTimeAndEachHandoverStartsAFullHour() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "away");
		for (int turn = 0; turn < 2; turn++) {
			fixture.now.addAndGet(2 * HOUR);
			SetupApplication restarted = fixture.application();
			JsonObject waiting = stateOf(restarted.handleComputerWithOutcome("away", fixture.load()).response());
			assertEquals("away", waiting.getString("actor", null));
			JsonObject handover = stateOf(restarted.handleComputerWithOutcome("away",
				endTurn(fixture.engine, waiting, "computer-end-" + turn)).response());
			assertEquals("home", handover.getString("actor", null));
			assertEquals(fixture.now.get(), retainedSave(fixture).getLong("humanDecisionSince", -1));
			fixture.now.addAndGet(HOUR - 1);
			SetupApplication cold = fixture.application();
			JsonObject human = stateOf(cold.handle("home", fixture.load()));
			if (turn == 0) {
				JsonObject next = stateOf(cold.handle("home", endTurn(fixture.engine, human, "human-end")));
				assertEquals("away", next.getString("actor", null));
				assertEquals(null, retainedSave(fixture).get("humanDecisionSince"));
			} else {
				fixture.now.incrementAndGet();
				assertEquals("MATCH_ABANDONED", cold.handle("home", fixture.load()).getString("code", null));
			}
		}
	}

	@Test void legacyHumanWaitStartsItsClockWhenItIsFirstRestored() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		removePersistedDecisionClock(fixture);
		fixture.now.addAndGet(2 * HOUR);
		long touchedAt = fixture.now.get();
		SetupApplication application = fixture.application();
		assertEquals("ACCEPTED", application.handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));
		assertEquals(0, fixture.recovery.saves);
		fixture.now.addAndGet(30 * 60_000L);
		assertTrue(application.expireReactiveDecisions().isEmpty());
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertEquals(touchedAt, retainedSave(fixture).getLong("humanDecisionSince", -1));
		fixture.now.set(touchedAt + HOUR);
		assertEquals("MATCH_ABANDONED", fixture.application().handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));
	}

	@Test void timerRetryPersistsTheOriginalLegacyDecisionClockAfterStorageFailure() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		removePersistedDecisionClock(fixture);
		long firstLoadAt = fixture.now.get();
		SetupApplication application = fixture.application();
		assertEquals("ACCEPTED", application.handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));

		fixture.recovery.refuseCheckpoint = true;
		fixture.now.addAndGet(30 * 60_000);
		assertTrue(application.expireDecisions().isEmpty());
		assertEquals(0, fixture.recovery.saves);
		assertEquals(1, application.lifecycleMetrics().getInt("pendingTimerRestores", -1));

		fixture.recovery.refuseCheckpoint = false;
		fixture.now.addAndGet(1_000);
		assertTrue(application.expireDecisions().isEmpty());
		assertEquals(firstLoadAt, retainedSave(fixture).getLong("humanDecisionSince", -1));
		assertEquals(0, application.lifecycleMetrics().getInt("pendingTimerRestores", -1));
	}

	private void removePersistedDecisionClock(Fixture fixture) {
		JsonObject envelope = JsonObject.readFrom(fixture.recovery.record.json);
		JsonObject payload = envelope.get("payload").asObject();
		payload.get("saveResume").asObject().remove("humanDecisionSince");
		envelope.set("sha256", new JsonDigest().sha256(payload));
		fixture.recovery.record = new RecoveryRepository.Record(fixture.id, 1, envelope.toString());
	}

	@Test void savedComputerMatchIsResumableUntilThirtyDays() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		SetupApplication application = fixture.application();
		JsonObject suspended = saveComputerMatch(fixture, application);
		assertEquals("SUSPENDED", saveStatus(suspended));
		fixture.now.addAndGet(HOUR);
		SetupApplication cold = fixture.application();
		assertEquals("SUSPENDED", saveStatus(stateOf(cold.handleComputerWithOutcome("away", fixture.load()).response())));

		fixture.now.addAndGet(SAVED_RETENTION - HOUR - 1);
		JsonObject proposed = stateOf(cold.handle("home", proposal(fixture, suspended, "resumeRequest", "resume")));
		assertEquals("RESUME_PENDING", saveStatus(proposed));
		JsonObject resumed = stateOf(cold.handleComputerWithOutcome("away", proposal(fixture, proposed, "resumeAccept", "accept-resume")
			.add("proposalId", proposed.get("saveResume").asObject().get("proposalId"))).response());
		assertEquals("ACTIVE", saveStatus(resumed));
		assertEquals(fixture.now.get(), retainedSave(fixture).getLong("humanDecisionSince", -1));
	}

	@Test void savedComputerMatchIsAbandonedAtThirtyDaysAfterSuspension() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		fixture.now.addAndGet(HOUR - 1);
		saveComputerMatch(fixture, fixture.application());
		fixture.now.addAndGet(SAVED_RETENTION - 1);
		assertEquals("SUSPENDED", saveStatus(stateOf(fixture.application().handleComputerWithOutcome("away", fixture.load()).response())));
		fixture.now.incrementAndGet();
		assertEquals("MATCH_ABANDONED", fixture.application().handleComputerWithOutcome("away", fixture.load()).response().getString("code", null));
		assertTrue(retainedSave(fixture).getBoolean("abandoned", false));
	}

	@Test void consentProposalPausesTheClockWhileTheComputerOwesTheResponse() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		SetupApplication application = fixture.application();
		JsonObject active = stateOf(application.handle("home", fixture.load()));
		fixture.now.addAndGet(HOUR - 1);
		JsonObject proposed = stateOf(application.handle("home", proposal(fixture, active, "saveRequest", "offer")));
		assertEquals("SAVE_PENDING", saveStatus(proposed));
		assertEquals(null, retainedSave(fixture).get("humanDecisionSince"));
		fixture.now.incrementAndGet();
		assertEquals("SAVE_PENDING", saveStatus(stateOf(application.handleComputerWithOutcome("away", fixture.load()).response())));
		long expiry = proposed.get("saveResume").asObject().getLong("expiresAt", -1);
		fixture.now.set(expiry);
		SetupApplication.DeadlinePublication publication = application.expireDecisions().get(fixture.id);
		assertEquals("ACTIVE", saveStatus(publication.state()));
		assertEquals(proposed.getInt("revision", -1), publication.state().getInt("revision", -1));
		assertTrue(publication.saveResumeChanged());
		assertEquals(expiry, retainedSave(fixture).getLong("humanDecisionSince", -1));
	}

	@Test void humanResumeResponseOwnsTheDecisionWhileTheSavedRetentionStillApplies() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		SetupApplication application = fixture.application();
		JsonObject suspended = saveComputerMatch(fixture, application);
		fixture.now.addAndGet(HOUR);
		JsonObject proposed = stateOf(application.handleComputerWithOutcome("away",
			proposal(fixture, suspended, "resumeRequest", "computer-resume")).response());
		assertEquals("RESUME_PENDING", saveStatus(proposed));
		assertEquals(fixture.now.get(), retainedSave(fixture).getLong("humanDecisionSince", -1));
		fixture.now.set(proposed.get("saveResume").asObject().getLong("expiresAt", -1));
		assertEquals("SUSPENDED", saveStatus(application.expireReactiveDecisions().get(fixture.id)));
		assertEquals(null, retainedSave(fixture).get("humanDecisionSince"));
		assertEquals("SUSPENDED", saveStatus(stateOf(fixture.application().handle("home", fixture.load()))));
	}

	@Test void humanMatchKeepsItsThirtyDayDeadline() throws Exception {
		Fixture fixture = new Fixture();
		long start = fixture.now.get();
		assertFalse(fixture.engine.session.abandonmentDue(start + 3_600_000));
		assertFalse(fixture.engine.session.abandonmentDue(start + 30L * 24 * 3_600_000 - 1));
		assertTrue(fixture.engine.session.abandonIfInactive(start + 30L * 24 * 3_600_000));
	}

	@Test void runnableComputerColdLoadReadsPreferencesBeforeTheCheckpoint() throws Exception {
		runnableComputerColdLoadReadsPreferencesBeforeTheCheckpoint("home");
		runnableComputerColdLoadReadsPreferencesBeforeTheCheckpoint("away");
	}

	private void runnableComputerColdLoadReadsPreferencesBeforeTheCheckpoint(String computerRole) throws Exception {
		Fixture fixture = new Fixture(computerRole);
		String humanRole = otherRole(computerRole);
		moveToActor(fixture, humanRole);
		SetupApplication application = fixture.application();
		JsonObject initial = application.handle(humanRole, fixture.load()).get("state").asObject();
		JsonObject handover = application.handle(humanRole, endTurn(fixture.engine, initial, "pass-to-computer"));
		assertEquals(computerRole, handover.get("state").asObject().getString("actor", null));

		int readsBeforeLoad = fixture.recovery.reads;
		SetupApplication restarted = fixture.application();
		restarted.configureStorageAdmission(() -> assertEquals(readsBeforeLoad, fixture.recovery.reads,
			"The checkpoint read can exhaust the next JDBC operation's allowance"));
		JsonObject loaded = restarted.handleComputerWithOutcome(computerRole, fixture.load()).response();
		assertEquals("ACCEPTED", loaded.getString("code", null));
		JsonObject state = loaded.get("state").asObject();
		assertEquals(computerRole, state.getString("actor", null));
		assertEquals(computerRole, state.getString("callerRole", null));
		assertEquals("home".equals(computerRole) ? 1 : -1, state.get("computer").asObject().getInt("attackDirection", 0));
		assertEquals(1, restarted.lifecycleMetrics().getInt("restoredSessions", -1));
	}

	@Test void waitingComputerLoadsDoNotExtendResidencyOrRestoreAnIdleMatch() throws Exception {
		waitingComputerLoadsDoNotExtendResidencyOrRestoreAnIdleMatch("home");
		waitingComputerLoadsDoNotExtendResidencyOrRestoreAnIdleMatch("away");
	}

	@Test void coldComputerLoadRejectsRetiredCheckpointBeforeReturningTheStoredView() throws Exception {
		Fixture fixture = new Fixture("away");
		moveToActor(fixture, "home");
		JsonObject envelope = JsonObject.readFrom(fixture.recovery.record.json);
		JsonObject payload = envelope.get("payload").asObject();
		payload.set("recoveryVersion", 6).set("runtimeVersion", SetupSession.CHAT_RUNTIME);
		envelope.set("sha256", new JsonDigest().sha256(payload));
		fixture.recovery.record = new RecoveryRepository.Record(fixture.id, 1, envelope.toString());

		SetupApplication application = fixture.application();
		JsonObject response = application.handleComputerWithOutcome("away", fixture.load()).response();
		assertEquals("RECOVERY_UNSUPPORTED", response.getString("code", null));
		assertEquals(JsonValue.NULL, response.get("state"));
		assertEquals(0, application.lifecycleMetrics().getInt("restoredSessions", -1));
	}

	private void waitingComputerLoadsDoNotExtendResidencyOrRestoreAnIdleMatch(String computerRole) throws Exception {
		Fixture fixture = new Fixture(computerRole);
		String humanRole = otherRole(computerRole);
		moveToActor(fixture, humanRole);
		SetupApplication application = fixture.application();
		JsonObject initial = application.handle(humanRole, fixture.load()).get("state").asObject();
		assertEquals(humanRole, initial.getString("actor", null));
		long idleMillis = application.lifecycleMetrics().getLong("idleMillis", -1);
		fixture.now.addAndGet(idleMillis - 1000);
		assertEquals("ACCEPTED", application.handleComputerWithOutcome(computerRole, fixture.load()).response().getString("code", null));
		fixture.now.addAndGet(1000);
		application.expireReactiveDecisions();
		assertEquals(1, application.lifecycleMetrics().getInt("idleReleases", 0));
		JsonObject storedView = JsonObject.readFrom(fixture.recovery.record.json).get("payload").asObject()
			.get(computerRole + "View").asObject();
		for (int index = 0; index < 3; index++) {
			SetupApplication.HandleOutcome load = application.handleComputerWithOutcome(computerRole, fixture.load());
			assertEquals("ACCEPTED", load.response().getString("code", null));
			JsonObject waiting = load.response().get("state").asObject();
			assertEquals(computerRole, waiting.getString("callerRole", null));
			assertEquals(humanRole, waiting.getString("actor", null));
			assertEquals(storedView.get("actions"), waiting.get("actions"));
			assertEquals(initial.getInt("revision", -1), waiting.getInt("revision", -2));
			assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
			assertEquals(1, application.lifecycleMetrics().getInt("restoredSessions", -1));
		}
		SetupApplication.HandleOutcome resumed = application.handleWithOutcome(humanRole, endTurn(fixture.engine, initial, "returning-coach"));
		assertEquals("ACCEPTED", resumed.response().getString("code", null));
		assertTrue(resumed.publish());
		assertEquals(2, application.lifecycleMetrics().getInt("restoredSessions", -1));
	}

	@Test void completedMatchDocumentTakesPrecedenceOverWaitingCheckpoint() throws Exception {
		completedMatchDocumentTakesPrecedenceOverWaitingCheckpoint("home");
		completedMatchDocumentTakesPrecedenceOverWaitingCheckpoint("away");
	}

	private void completedMatchDocumentTakesPrecedenceOverWaitingCheckpoint(String computerRole) throws Exception {
		Fixture fixture = new Fixture(computerRole);
		String humanRole = otherRole(computerRole);
		moveToActor(fixture, humanRole);
		JsonObject current = fixture.engine.session.reply("load", "ACCEPTED", false, humanRole).get("state").asObject();
		assertEquals("ACCEPTED", fixture.engine.session.apply(humanRole, fixture.engine.request("concede", "end-match", current))
			.getString("code", null));
		MatchDocument completed = fixture.engine.document.completed(fixture.engine.session.completedMatch());
		when(fixture.matches.loadForSetup(computerRole, fixture.id)).thenReturn(new MatchService.Result(completed, false));

		SetupApplication.HandleOutcome outcome = fixture.application().handleComputerWithOutcome(computerRole, fixture.load());
		assertEquals("ACCEPTED", outcome.response().getString("code", null));
		JsonObject state = outcome.response().get("state").asObject();
		assertEquals("FULL_TIME", state.getString("phase", null));
		assertEquals(computerRole, state.getString("callerRole", null));
		assertEquals(0, fixture.recovery.reads);
	}

	private String otherRole(String role) { return "home".equals(role) ? "away" : "home"; }

	private JsonObject stateOf(JsonObject reply) {
		assertEquals("ACCEPTED", reply.getString("code", null));
		return reply.get("state").asObject();
	}

	private JsonObject retainedSave(Fixture fixture) {
		return JsonObject.readFrom(fixture.recovery.record.json).get("payload").asObject().get("saveResume").asObject();
	}

	private String saveStatus(JsonObject state) { return state.get("saveResume").asObject().getString("status", null); }

	private JsonObject proposal(Fixture fixture, JsonObject state, String operation, String requestId) {
		return fixture.load().set("operation", operation).set("requestId", requestId).add("expectedRevision", state.get("revision"));
	}

	private JsonObject saveComputerMatch(Fixture fixture, SetupApplication application) {
		JsonObject active = stateOf(application.handle("home", fixture.load()));
		JsonObject pending = stateOf(application.handle("home", proposal(fixture, active, "saveRequest", "offer-save")));
		return stateOf(application.handleComputerWithOutcome("away", proposal(fixture, pending, "saveAccept", "accept-save")
			.add("proposalId", pending.get("saveResume").asObject().get("proposalId"))).response());
	}

	private void moveToActor(Fixture fixture, String actor) {
		JsonObject view = fixture.initial;
		String currentActor = view.getString("actor", null);
		if (!actor.equals(currentActor)) {
			JsonObject response = fixture.engine.session.apply(currentActor, endTurn(fixture.engine, view, "fixture-pass-turn"));
			assertEquals("ACCEPTED", response.getString("code", null));
			view = response.get("state").asObject();
			fixture.engine.session.startSaveResumeRetention(fixture.now.get());
			fixture.recovery.record = new RecoveryRepository.Record(fixture.id, 1, fixture.engine.session.recoveryArtifact());
		}
		assertEquals(actor, view.getString("actor", null));
	}

	private static JsonObject endTurn(SetupSessionMovementTest.Fixture engine, JsonObject view, String requestId) {
		for (JsonValue value : view.get("actions").asArray()) {
			JsonObject action = value.asObject();
			if ("endTurn".equals(action.getString("kind", null))) return engine.request("action", requestId, view).add("actionId", action.get("id"));
		}
		throw new AssertionError("Expected a normal turn");
	}

	@Test void residentNativeLoadsDoNotEncodeHistoryAndPreferencesRefreshAfterRestore() throws Exception {
		Fixture fixture = new Fixture();
		SkillUsePreferences home = SkillUsePreferences.defaults().with(SkillUsePreferences.UseCase.FEND, SkillUsePreferences.Mode.ALWAYS_USE);
		SkillUsePreferences away = SkillUsePreferences.defaults().with(SkillUsePreferences.UseCase.DODGE_MOVEMENT, SkillUsePreferences.Mode.ALWAYS_ASK);
		when(fixture.preferences.loadForMatch(fixture.id, "home")).thenReturn(home);
		when(fixture.preferences.loadForMatch(fixture.id, "away")).thenReturn(away);
		String checkpoint = fixture.recovery.record.json;
		String nativeJson = state(fixture.engine.session).toJsonValue(true, 0).toString();
		fixture.engine.session.configureSkillUsePreferences(home, away);
		assertEquals(nativeJson, state(fixture.engine.session).toJsonValue(true, 0).toString());
		assertEquals(checkpoint, fixture.engine.session.recoveryArtifact(), "Policy references are not checkpoint state");
		try (MockedConstruction<RecoveryArtifactJson> codecs = mockConstruction(RecoveryArtifactJson.class,
			withSettings().defaultAnswer(CALLS_REAL_METHODS))) {
			SetupApplication application = fixture.application();
			assertEquals("ACCEPTED", application.handle("home", fixture.load()).getString("code", null));
			assertEquals(0, codecs.constructed().size(), "The cold load defers normalization/checkpoint validation");
			for (int index = 0; index < 5; index++) {
				fixture.now.addAndGet(1000);
				assertEquals("ACCEPTED", application.handle("home", fixture.load()).getString("code", null));
			}
			assertEquals(1, codecs.constructed().size(), "The resident loads encode only once for deferred normalization");
			assertEquals(0, fixture.recovery.saves);
			assertEquals(checkpoint, fixture.recovery.record.json);
			SetupSession resident = resident(application, fixture.id);
			assertTrue(state(resident).getOptionalSkillUse().alwaysUse(SkillUsePreferences.UseCase.FEND,
				state(resident).getGame().getTeamHome().getPlayers()[0]));
			assertTrue(state(resident).getOptionalSkillUse().alwaysAsk(SkillUsePreferences.UseCase.DODGE_MOVEMENT,
				state(resident).getGame().getTeamAway().getPlayers()[0]));
			assertEquals(checkpoint, resident.recoveryArtifact(), "Loads and policy refresh leave the durable native state unchanged");
		}
	}

	@Test void pendingNativeSaveProposalSurvivesRestoreAndItsExpiryIsCheckpointedOnce() throws Exception {
		Fixture fixture = new Fixture();
		try (MockedConstruction<RecoveryArtifactJson> codecs = mockConstruction(RecoveryArtifactJson.class,
			withSettings().defaultAnswer(CALLS_REAL_METHODS))) {
			SetupApplication initial = fixture.application();
			JsonObject state = initial.handle("home", fixture.load()).get("state").asObject();
			JsonObject proposal = initial.handle("home", fixture.load().set("operation", "saveRequest")
				.set("requestId", "save-once").add("expectedRevision", state.getInt("revision", -1))).get("state").asObject();
			assertEquals("SAVE_PENDING", proposal.get("saveResume").asObject().getString("status", null));
			SetupApplication restarted = fixture.application();
			JsonObject restored = restarted.handle("home", fixture.load()).get("state").asObject();
			assertEquals(proposal.get("saveResume"), restored.get("saveResume"));
			assertEquals(1, codecs.constructed().size());
			restarted.handle("home", fixture.load());
			assertEquals(2, codecs.constructed().size());
			fixture.now.set(proposal.get("saveResume").asObject().getLong("expiresAt", -1));
			JsonObject expired = restarted.handle("home", fixture.load()).get("state").asObject();
			assertEquals("ACTIVE", expired.get("saveResume").asObject().getString("status", null));
			assertEquals(3, codecs.constructed().size());
			assertEquals(2, fixture.recovery.saves, "Only proposal creation and expiry change the durable checkpoint");
			restarted.handle("home", fixture.load());
			assertEquals(3, codecs.constructed().size());
			JsonObject afterRestart = fixture.application().handle("home", fixture.load()).get("state").asObject();
			assertEquals("ACTIVE", afterRestart.get("saveResume").asObject().getString("status", null));
			assertTrue(JsonObject.readFrom(fixture.recovery.record.json).get("payload").asObject()
				.get("saveResume").asObject().get("proposal").isNull());
		}
	}

	@Test void fatalErrorBeforeCheckpointCommitRestoresLastAcceptedNativeRevision() throws Exception {
		Fixture fixture = new Fixture();
		SetupApplication initial = fixture.application();
		JsonObject ready = initial.handle("home", fixture.load()).get("state").asObject();
		JsonObject save = fixture.load().set("operation", "saveRequest").set("requestId", "save-before-crash")
			.add("expectedRevision", ready.getInt("revision", -1));
		JsonObject accepted = initial.handle("home", save);
		assertEquals("ACCEPTED", accepted.getString("code", null));
		JsonObject savedState = accepted.get("state").asObject();
		RecoveryRepository.Record committed = fixture.recovery.record;
		fixture.recovery.failBeforeCommit = true;
		JsonObject cancel = fixture.load().set("operation", "saveCancel").set("requestId", "cancel-interrupted")
			.add("expectedRevision", savedState.getInt("revision", -1))
			.add("proposalId", savedState.get("saveResume").asObject().get("proposalId"));
		assertThrows(AssertionError.class, () -> initial.handle("home", cancel));
		assertEquals(committed, fixture.recovery.record);
		fixture.recovery.failBeforeCommit = false;
		JsonObject restored = fixture.application().handle("home", fixture.load()).get("state").asObject();
		assertEquals(savedState.get("revision"), restored.get("revision"));
		assertEquals(savedState.get("saveResume"), restored.get("saveResume"));
	}

	private static GameState state(SetupSession session) throws Exception {
		Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
	}
	private static SetupSession resident(SetupApplication application, String id) throws Exception {
		Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
		return (SetupSession) ((java.util.Map<?, ?>) field.get(application)).get(id);
	}
	private static final class Fixture {
		final SetupSessionMovementTest.Fixture engine;
		final String id;
		final JsonObject initial;
		final AtomicLong now = new AtomicLong(System.currentTimeMillis());
		final SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
		final MatchService matches = mock(MatchService.class);
		final MemoryRecovery recovery;
		final Clock clock = new Clock() {
			@Override public ZoneId getZone() { return ZoneOffset.UTC; }
			@Override public Clock withZone(ZoneId zone) { return this; }
			@Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
		};
		Fixture() throws Exception { this(null); }
		Fixture(boolean computer) throws Exception { this(computer ? "away" : null); }
		Fixture(String computerRole) throws Exception {
			engine = new SetupSessionMovementTest.Fixture(0, true, computerRole);
			id = engine.document.matchId;
			initial = engine.advanceToTurn();
			engine.session.startSaveResumeRetention(now.get());
			recovery = new MemoryRecovery(id, engine.session.recoveryArtifact());
			when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.load("away", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.loadForSetup("home", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.loadForSetup("away", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(preferences.loadForMatch(eq(id), anyString())).thenReturn(SkillUsePreferences.defaults());
		}
		SetupApplication application() {
			return application(new MatchMemoryBudget(), new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
		}
		SetupApplication application(MatchMemoryBudget budget, MatchSafetyJournal safety) {
			SetupApplication application = new SetupApplication(engine.server, matches, recovery, true, clock, true, budget, safety);
			application.configureSkillUsePreferences(preferences); return application;
		}
		JsonObject load() { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load")
			.add("requestId", "load").add("matchId", id); }
	}
	private static final class MemoryRecovery implements RecoveryRepository {
		Record record; int saves, reads;
		boolean failBeforeCommit;
		boolean refuseCheckpoint;
		MemoryRecovery(String id, String artifact) { record = new Record(id, 1, artifact); }
		@Override public Record find(String id) { reads++; return record; }
		@Override public boolean save(Record next, long expected) throws SQLException {
			if (refuseCheckpoint) throw new SQLException("checkpoint refused");
			if (failBeforeCommit) throw new AssertionError("injected fatal checkpoint failure");
			assertEquals(record.generation, expected); record = next; saves++; return true;
		}
	}
}
