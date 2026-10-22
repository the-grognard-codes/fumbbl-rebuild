package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

class SetupApplicationReadOnlyLoadTest {
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
			assertEquals(1, codecs.constructed().size(), "The first restored load retains normalization/checkpoint validation");
			for (int index = 0; index < 5; index++) {
				fixture.now.addAndGet(1000);
				assertEquals("ACCEPTED", application.handle("home", fixture.load()).getString("code", null));
			}
			assertEquals(1, codecs.constructed().size(), "Unchanged resident loads must not encode the full history");
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
			assertEquals(3, codecs.constructed().size());
			restarted.handle("home", fixture.load());
			assertEquals(3, codecs.constructed().size());
			fixture.now.set(proposal.get("saveResume").asObject().getLong("expiresAt", -1));
			JsonObject expired = restarted.handle("home", fixture.load()).get("state").asObject();
			assertEquals("ACTIVE", expired.get("saveResume").asObject().getString("status", null));
			assertEquals(4, codecs.constructed().size());
			assertEquals(2, fixture.recovery.saves, "Only proposal creation and expiry change the durable checkpoint");
			restarted.handle("home", fixture.load());
			assertEquals(4, codecs.constructed().size());
			JsonObject afterRestart = fixture.application().handle("home", fixture.load()).get("state").asObject();
			assertEquals("ACTIVE", afterRestart.get("saveResume").asObject().getString("status", null));
			assertTrue(JsonObject.readFrom(fixture.recovery.record.json).get("payload").asObject()
				.get("saveResume").asObject().get("proposal").isNull());
		}
	}

	private static GameState state(SetupSession session) throws Exception {
		Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
	}
	private static SetupSession resident(SetupApplication application, String id) throws Exception {
		Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
		return (SetupSession) ((java.util.Map<?, ?>) field.get(application)).get(id);
	}
	private static final class Fixture {
		final SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
		final String id = engine.document.matchId;
		final AtomicLong now = new AtomicLong(System.currentTimeMillis());
		final SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
		final MatchService matches = mock(MatchService.class);
		final MemoryRecovery recovery;
		final Clock clock = new Clock() {
			@Override public ZoneId getZone() { return ZoneOffset.UTC; }
			@Override public Clock withZone(ZoneId zone) { return this; }
			@Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
		};
		Fixture() throws Exception {
			engine.advanceToTurn();
			engine.session.startSaveResumeRetention(now.get());
			recovery = new MemoryRecovery(id, engine.session.recoveryArtifact());
			when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
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
		Record record; int saves;
		MemoryRecovery(String id, String artifact) { record = new Record(id, 1, artifact); }
		@Override public Record find(String id) { return record; }
		@Override public boolean save(Record next, long expected) {
			assertEquals(record.generation, expected); record = next; saves++; return true;
		}
	}
}
