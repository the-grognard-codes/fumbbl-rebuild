package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;

import java.lang.reflect.Field;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Application-level durability contracts; native checkpoint encoding/round trips have their own integration tests. */
class SetupApplicationCheckpointTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private static final long NOW = 2000000000000L;

	@Test void liveTranscriptNeverRestoresAnAbsentNativeSession() throws Exception {
		try (Fixture fixture = new Fixture()) {
			MatchService.Failure unavailable = assertThrows(MatchService.Failure.class,
				() -> fixture.application.liveTranscriptPage(MATCH, 3));
			assertEquals("SESSION_UNAVAILABLE", unavailable.code);
			assertEquals(0, fixture.construction.constructed().size());
			verify(fixture.recovery, never()).find(MATCH);
		}
	}

	@Test void publicationReadsCommittedStateWithoutAnotherCheckpointOrDecisionExecution() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", request("action"));
			assertEquals("ACCEPTED", fixture.application.publishedState(MATCH, "home", false).getString("code", null));
			assertEquals("ACCEPTED", fixture.application.publishedState(MATCH, "home", false).getString("code", null));
			verify(fixture.session()).recoveryArtifact();
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
			verify(fixture.session()).expireReactiveDecision(NOW);
			assertEquals(1, fixture.executed.get());
		}
	}

	@Test void publicationReauthorizesAndNeverRestoresAnEvictedSession() throws Exception {
		try (Fixture fixture = new Fixture()) {
			assertEquals(null, fixture.application.publishedState(MATCH, "home", false));
			verify(fixture.recovery, never()).find(MATCH);
			assertEquals(0, fixture.construction.constructed().size());
			when(fixture.matches.load("home", MATCH)).thenThrow(new MatchService.Failure("NOT_FOUND"));
			assertThrows(MatchService.Failure.class, () -> fixture.application.publishedState(MATCH, "home", false));
		}
	}

	@Test void legacyRuntimeWithoutDurableRecoveryKeepsLiveHistoryUnavailable() throws Exception {
		try (Fixture fixture = new Fixture()) {
			SetupApplication legacy = new SetupApplication(fixture.server, fixture.matches);
			MatchService.Failure unavailable = assertThrows(MatchService.Failure.class,
				() -> legacy.liveTranscriptPage(MATCH, 3));
			assertEquals("SESSION_UNAVAILABLE", unavailable.code);
			assertEquals(0, fixture.construction.constructed().size());
		}
	}

	@Test void liveTranscriptReusesLoadedPublicProjectionWithoutExecutingOrCheckpointing() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			JsonObject page = new JsonObject().add("formatVersion", 2);
			when(fixture.session().transcriptPage(3, 1)).thenReturn(page);
			assertSame(page, fixture.application.liveTranscriptPage(MATCH, 3));
			assertEquals(1, fixture.construction.constructed().size());
			assertEquals(0, fixture.executed.get());
			verify(fixture.recovery, never()).save(any(RecoveryRepository.Record.class), anyLong());
		}
	}

	@Test void acceptedActionSerializesOnlyAfterMutationAndDuplicateSkipsTheWrite() throws Exception {
		try (Fixture fixture = new Fixture()) {
			assertEquals("ACCEPTED", fixture.application.handle("home", request("action")).getString("code", null));
			assertEquals("after:action", fixture.durable.get().json); assertEquals(5, fixture.durable.get().generation);
			verify(fixture.session()).recoveryArtifact();
			assertTrue(fixture.application.handle("home", request("action")).getBoolean("duplicate", false));
			verify(fixture.session(), times(2)).recoveryArtifact();
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
			assertEquals(1, fixture.executed.get());
		}
	}

	@Test void failedConflictingAndUnknownCommitsReleaseFingerprintsBeforeRetry() throws Exception {
		for (String failure : new String[] {"PERSISTENCE_FAILED", "RECOVERY_CONFLICT", "MATCH_OUTCOME_UNKNOWN"}) {
			try (Fixture fixture = new Fixture()) {
				fixture.failure = failure;
				SetupApplication.HandleOutcome rejected = fixture.application.handleWithOutcome("home", request("action"));
				assertEquals(failure, rejected.response().getString("code", null)); assertFalse(rejected.publish());
				for (String field : new String[] {"sessions", "generations", "committedFingerprints", "lastAccess"})
					assertEquals(0, fixture.mapSize(field));
				fixture.failure = null;
				JsonObject retry = fixture.application.handle("home", request("action"));
				assertEquals("ACCEPTED", retry.getString("code", null));
				boolean committed = "MATCH_OUTCOME_UNKNOWN".equals(failure);
				assertEquals(committed, retry.getBoolean("duplicate", false));
				assertEquals(committed ? 1 : 2, fixture.executed.get());
				verify(fixture.recovery, times(committed ? 1 : 2)).save(any(RecoveryRepository.Record.class), eq(4L));
				assertEquals(5, fixture.durable.get().generation);
			}
		}
	}

	@Test void restartedApplicationUsesRestoredCommittedFingerprintForAnExactRetry() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", request("action"));
			SetupApplication restarted = fixture.newApplication();
			JsonObject retried = restarted.handle("home", request("action"));
			assertTrue(retried.getBoolean("duplicate", false));
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
			assertEquals(1, fixture.executed.get()); assertEquals(2, fixture.construction.constructed().size());
		}
	}

	@Test void residentReadOnlyLoadsRefreshTransientPreferencesWithoutSerializingHistory() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			verify(fixture.recovery, never()).save(any(RecoveryRepository.Record.class), anyLong());
			SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
			when(preferences.loadForMatch(eq(MATCH), anyString())).thenReturn(SkillUsePreferences.defaults());
			fixture.application.configureSkillUsePreferences(preferences);
			fixture.application.handle("home", load());
			fixture.application.handle("home", load());
			verify(fixture.session(), times(2)).configureSkillUsePreferences(any(SkillUsePreferences.class), any(SkillUsePreferences.class));
			assertEquals("before", fixture.durable.get().json);
			verify(fixture.session()).recoveryArtifact();
			verify(fixture.recovery, never()).save(any(RecoveryRepository.Record.class), anyLong());
		}
	}

	@Test void residentLoadPersistsProposalExpiryAndThenSkipsUnchangedReads() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			when(fixture.session().expireSaveResumeProposal(NOW)).thenAnswer(call -> {
				fixture.artifact.set("proposal-expired"); return true;
			});
			assertEquals("ACCEPTED", fixture.application.handle("home", load()).getString("code", null));
			assertEquals("proposal-expired", fixture.durable.get().json);
			when(fixture.session().expireSaveResumeProposal(NOW)).thenReturn(false);
			fixture.application.handle("home", load());
			verify(fixture.session(), times(2)).recoveryArtifact();
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
		}
	}

	@Test void firstLoadCheckpointsNormalizationEvenWhenASpectatorRestoredTheSession() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.spectatorView(MATCH);
			fixture.artifact.set("restore-normalization");
			fixture.application.handle("home", load());
			assertEquals("restore-normalization", fixture.durable.get().json);
			fixture.application.handle("home", load());
			verify(fixture.session()).recoveryArtifact();
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
		}
	}

	@Test void residentLoadPersistsReactionRefreshEvenWhenNoDecisionExpires() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			when(fixture.session().reactiveMaintenanceState()).thenReturn("before", "after");
			when(fixture.session().expireReactiveDecision(NOW)).thenAnswer(call -> {
				fixture.artifact.set("reaction-refreshed"); return false;
			});
			assertEquals("ACCEPTED", fixture.application.handle("home", load()).getString("code", null));
			assertEquals("reaction-refreshed", fixture.durable.get().json);
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
		}
	}

	@Test void residentLoadExpiryCommitFailureReleasesTheSessionBeforeReuse() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			when(fixture.session().expireSaveResumeProposal(NOW)).thenAnswer(call -> {
				fixture.artifact.set("proposal-expired"); return true;
			});
			fixture.failure = "PERSISTENCE_FAILED";
			SetupApplication.HandleOutcome failed = fixture.application.handleWithOutcome("home", load());
			assertEquals("PERSISTENCE_FAILED", failed.response().getString("code", null));
			assertFalse(failed.publish());
			assertEquals("before", fixture.durable.get().json);
			assertEquals(0, fixture.mapSize("sessions"));
		}
	}

	@Test void timerChatAndSaveResumeUseTheSameCommittedComparison() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			when(fixture.session().reactiveDecisionDue(NOW)).thenReturn(true);
			when(fixture.session().expireReactiveDecision(NOW)).thenAnswer(call -> { fixture.artifact.set("expired"); return true; });
			assertEquals(1, fixture.application.expireReactiveDecisions().size());
			assertEquals("expired", fixture.durable.get().json);
		}
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			MatchChat.Outcome chat = mock(MatchChat.Outcome.class);
			when(fixture.session().sendChat(anyString(), anyString(), anyString(), anyString(), anyLong())).thenAnswer(call -> {
				fixture.artifact.set("chat"); return chat;
			});
			assertSame(chat, fixture.application.sendChat(MATCH, "account", "home", "chat", "Hello"));
			assertEquals("chat", fixture.durable.get().json);
			when(fixture.session().saveResume(eq("home"), any(JsonObject.class), eq(NOW))).thenAnswer(call -> {
				fixture.artifact.set("save-proposal"); return reply(false);
			});
			fixture.application.handle("home", request("save").set("operation", "saveRequest").remove("actionId"));
			assertEquals("save-proposal", fixture.durable.get().json); assertEquals(6, fixture.durable.get().generation);
		}
	}

	private JsonObject request(String id) { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "action")
		.add("requestId", id).add("matchId", MATCH).add("expectedRevision", 3).add("actionId", "server-action"); }
	private JsonObject load() { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load").add("requestId", "load").add("matchId", MATCH); }
	private static JsonObject reply(boolean duplicate) { return new JsonObject().add("code", "ACCEPTED").add("duplicate", duplicate).add("state", new JsonObject()); }

	private static final class Fixture implements AutoCloseable {
		final FantasyFootballServer server = mock(FantasyFootballServer.class);
		final MatchService matches = mock(MatchService.class);
		final RecoveryRepository recovery = mock(RecoveryRepository.class);
		final AtomicReference<RecoveryRepository.Record> durable = new AtomicReference<>(new RecoveryRepository.Record(MATCH, 4, "before"));
		final AtomicReference<String> artifact = new AtomicReference<>();
		final AtomicInteger executed = new AtomicInteger();
		final MockedConstruction<SetupSession> construction;
		final SetupApplication application;
		String failure;
		Fixture() throws Exception {
			MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
				new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
			when(matches.load("home", MATCH)).thenReturn(new MatchService.Result(document, false));
			when(recovery.find(MATCH)).thenAnswer(call -> durable.get());
			when(recovery.save(any(RecoveryRepository.Record.class), anyLong())).thenAnswer(call -> {
				RecoveryRepository.Record record = call.getArgument(0);
				assertEquals(durable.get().generation, ((Long) call.getArgument(1)).longValue());
				if ("RECOVERY_CONFLICT".equals(failure)) return false;
				if ("PERSISTENCE_FAILED".equals(failure)) throw new SQLException("unavailable");
				durable.set(record);
				if ("MATCH_OUTCOME_UNKNOWN".equals(failure)) throw new RecoveryRepository.OutcomeUnknown(record, new SQLException("unknown"));
				return true;
			});
			construction = mockConstruction(SetupSession.class, (session, context) -> {
				artifact.set((String) context.arguments().get(2));
				when(session.recoveryArtifact()).thenAnswer(call -> artifact.get());
				when(session.reply(anyString(), anyString(), anyBoolean(), anyString())).thenReturn(reply(false));
				when(session.decorateSaveResume(any(JsonObject.class))).thenAnswer(call -> call.getArgument(0));
				when(session.apply(eq("home"), any(JsonObject.class), eq(NOW))).thenAnswer(call -> {
					String target = "after:" + ((JsonObject) call.getArgument(1)).getString("requestId", "");
					boolean duplicate = target.equals(artifact.get());
					if (!duplicate) { artifact.set(target); executed.incrementAndGet(); }
					return reply(duplicate);
				});
			});
			application = newApplication();
		}
		SetupApplication newApplication() { return new SetupApplication(server, matches, recovery, false, Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC)); }
		SetupSession session() { return construction.constructed().get(construction.constructed().size() - 1); }
		int mapSize(String name) throws Exception { Field field = SetupApplication.class.getDeclaredField(name); field.setAccessible(true); return ((Map<?, ?>) field.get(application)).size(); }
		@Override public void close() { construction.close(); }
	}
}
