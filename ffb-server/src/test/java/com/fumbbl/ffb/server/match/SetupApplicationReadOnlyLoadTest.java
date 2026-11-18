package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

class SetupApplicationReadOnlyLoadTest {
	@Test void runnableComputerColdLoadReadsPreferencesBeforeTheCheckpoint() throws Exception {
		Fixture fixture = new Fixture(true);
		SetupApplication application = fixture.application();
		JsonObject initial = application.handle("home", fixture.load()).get("state").asObject();
		JsonObject handover = application.handle("home", endTurn(fixture.engine, initial, "pass-to-computer"));
		assertEquals("away", handover.get("state").asObject().getString("actor", null));

		int readsBeforeLoad = fixture.recovery.reads;
		SetupApplication restarted = fixture.application();
		restarted.configureStorageAdmission(() -> assertEquals(readsBeforeLoad, fixture.recovery.reads,
			"The checkpoint read can exhaust the next JDBC operation's allowance"));
		JsonObject loaded = restarted.handleComputerWithOutcome(fixture.load()).response();
		assertEquals("ACCEPTED", loaded.getString("code", null));
		assertEquals("away", loaded.get("state").asObject().getString("actor", null));
		assertEquals(1, restarted.lifecycleMetrics().getInt("restoredSessions", -1));
	}

	@Test void waitingComputerLoadsDoNotExtendResidencyOrRestoreAnIdleMatch() throws Exception {
		Fixture fixture = new Fixture(true);
		SetupApplication application = fixture.application();
		JsonObject initial = application.handle("home", fixture.load()).get("state").asObject();
		assertEquals("home", initial.getString("actor", null));
		long idleMillis = application.lifecycleMetrics().getLong("idleMillis", -1);
		fixture.now.addAndGet(idleMillis - 1000);
		assertEquals("ACCEPTED", application.handleComputerWithOutcome(fixture.load()).response().getString("code", null));
		fixture.now.addAndGet(1000);
		application.expireReactiveDecisions();
		assertEquals(1, application.lifecycleMetrics().getInt("idleReleases", 0));
		for (int index = 0; index < 3; index++) {
			SetupApplication.HandleOutcome load = application.handleComputerWithOutcome(fixture.load());
			assertEquals("ACCEPTED", load.response().getString("code", null));
			JsonObject waiting = load.response().get("state").asObject();
			assertEquals("away", waiting.getString("callerRole", null));
			assertEquals(initial.getInt("revision", -1), waiting.getInt("revision", -2));
			assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
			assertEquals(1, application.lifecycleMetrics().getInt("restoredSessions", -1));
		}
		SetupApplication.HandleOutcome resumed = application.handleWithOutcome("home", endTurn(fixture.engine, initial, "returning-coach"));
		assertEquals("ACCEPTED", resumed.response().getString("code", null));
		assertTrue(resumed.publish());
		assertEquals(2, application.lifecycleMetrics().getInt("restoredSessions", -1));
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
		final AtomicLong now = new AtomicLong(System.currentTimeMillis());
		final SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
		final MatchService matches = mock(MatchService.class);
		final MemoryRecovery recovery;
		final Clock clock = new Clock() {
			@Override public ZoneId getZone() { return ZoneOffset.UTC; }
			@Override public Clock withZone(ZoneId zone) { return this; }
			@Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
		};
		Fixture() throws Exception { this(false); }
		Fixture(boolean computer) throws Exception {
			engine = new SetupSessionMovementTest.Fixture(0, true, computer);
			id = engine.document.matchId;
			JsonObject active = engine.advanceToTurn();
			if (computer && "away".equals(active.getString("actor", null))) {
				JsonObject accepted = engine.session.apply("away", endTurn(engine, active, "pass-to-home"));
				assertEquals("ACCEPTED", accepted.getString("code", null));
			}
			engine.session.startSaveResumeRetention(now.get());
			recovery = new MemoryRecovery(id, engine.session.recoveryArtifact());
			when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.loadForSetup("home", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(matches.loadForSetup("away", id)).thenReturn(new MatchService.Result(engine.document, false));
			when(preferences.loadForMatch(eq(id), anyString())).thenReturn(SkillUsePreferences.defaults());
		}
		SetupApplication application() {
			SetupApplication application = new SetupApplication(engine.server, matches, recovery, true, clock, true);
			application.configureSkillUsePreferences(preferences); return application;
		}
		JsonObject load() { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load")
			.add("requestId", "load").add("matchId", id); }
	}
	private static final class MemoryRecovery implements RecoveryRepository {
		Record record; int saves, reads;
		boolean failBeforeCommit;
		MemoryRecovery(String id, String artifact) { record = new Record(id, 1, artifact); }
		@Override public Record find(String id) { reads++; return record; }
		@Override public boolean save(Record next, long expected) {
			if (failBeforeCommit) throw new AssertionError("injected fatal checkpoint failure");
			assertEquals(record.generation, expected); record = next; saves++; return true;
		}
	}
}
