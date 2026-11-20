package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.local.BrowserRequestTiming;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLNonTransientConnectionException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Handler;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

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
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Application-level durability contracts; native checkpoint encoding/round trips have their own integration tests. */
class SetupApplicationCheckpointTest {
	@Test void openStorageAdmissionRejectsBeforeNativeMutationAndAllowsLaterRetry() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.configureStorageAdmission(() -> { throw new SQLException("database breaker open"); });
			assertEquals("PERSISTENCE_FAILED", fixture.application.handle("home", request("action")).getString("code", null));
			assertEquals(0, fixture.executed.get());
			fixture.application.configureStorageAdmission(() -> { });
			assertEquals("ACCEPTED", fixture.application.handle("home", request("action")).getString("code", null));
			assertEquals(1, fixture.executed.get());
		}
	}
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
			when(fixture.matches.loadForSetup("home", MATCH)).thenThrow(new MatchService.Failure("NOT_FOUND"));
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

	@Test void stagedRequestsSkipCheckpointUntilConfirmation() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			SetupSession session = fixture.session();
			JsonObject stage = new JsonObject().add("type", "stagedPlacement").add("stageSeq", 1);
			for (int i = 1; i <= 10; i++) {
				JsonObject placement = request("placement-" + i).set("operation", "place").remove("actionId")
					.add("playerId", "player").add("to", new JsonObject().add("x", 8).add("y", 7));
				when(session.isStagedRequest(placement)).thenReturn(true);
				when(session.stagedPlacement()).thenReturn(stage);
				SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", placement);
				assertEquals("ACCEPTED", outcome.response().getString("code", null));
				assertSame(stage, outcome.placement());
				assertFalse(outcome.publish());
			}
			verify(fixture.recovery, never()).save(any(RecoveryRepository.Record.class), anyLong());
			verify(session, never()).recoveryArtifact();
			assertTrue(fixture.application.handleWithOutcome("home", request("confirm").set("operation", "confirm").remove("actionId")).publish());
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
			verify(session).recoveryArtifact();
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
	@Test void uncommittedUnknownActionRestoresBeforeOneEventualAcceptanceAndLaterMutation() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.failure = "MATCH_OUTCOME_UNKNOWN"; fixture.unknownCommitted = false;
			SetupApplication.HandleOutcome uncertain = fixture.application.handleWithOutcome("home", request("action"));
			assertEquals("MATCH_OUTCOME_UNKNOWN", uncertain.response().getString("code", null)); assertFalse(uncertain.publish());
			assertEquals("before", fixture.durable.get().json); assertEquals(4, fixture.durable.get().generation);
			fixture.failure = null;
			JsonObject accepted = fixture.application.handle("home", request("action"));
			assertEquals("ACCEPTED", accepted.getString("code", null)); assertFalse(accepted.getBoolean("duplicate", true));
			assertTrue(fixture.application.handle("home", request("action")).getBoolean("duplicate", false));
			assertEquals(2, fixture.executed.get()); assertEquals(5, fixture.durable.get().generation);
			assertEquals("ACCEPTED", fixture.application.handle("home", request("later")).getString("code", null));
			assertEquals(3, fixture.executed.get()); assertEquals(6, fixture.durable.get().generation);
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
			verify(fixture.session()).recoveryArtifact();
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

	@Test void coldLoadDefersNormalizationEvenWithSomeJdbcAllowanceRemaining() throws Exception {
		try (Fixture fixture = new Fixture()) {
			AtomicLong nanos = new AtomicLong();
			BrowserRequestTiming timing = new BrowserRequestTiming();
			when(fixture.recovery.find(MATCH)).thenAnswer(call -> {
				nanos.addAndGet(1_800_000_000);
				return fixture.durable.get();
			});
			fixture.normalizedArtifact = "restore-normalization";
			fixture.beforeSave = () -> {
				assertEquals(50, timing.budget().allowanceMillis(1000, JdbcConnections.WORK_RESERVE_MILLIS));
				nanos.addAndGet(51_000_000);
				throw new JdbcConnections.NotStarted();
			};
			JsonObject request = load();
			CaptureRequestProbe.Measurement loaded = new CaptureRequestProbe().measure(request, nanos::get,
				() -> fixture.application.handle("home", request));
			assertEquals(1800.0, loaded.timing().getDouble("recoveryRestoreMs", -1));
			assertEquals("ACCEPTED", loaded.response().getString("code", null));
			assertEquals("before", fixture.durable.get().json);
			verify(fixture.recovery, never()).save(any(RecoveryRepository.Record.class), anyLong());
			fixture.beforeSave = () -> { };
			assertEquals("ACCEPTED", fixture.application.handle("home", load()).getString("code", null));
			assertEquals("restore-normalization", fixture.durable.get().json);
			verify(fixture.recovery).save(any(RecoveryRepository.Record.class), eq(4L));
			assertEquals(1, fixture.construction.constructed().size());
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


	@Test void starvedTerminalRequestPublishesDurableStateAndReconcilesOnFreshTick() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			AtomicLong nanos = new AtomicLong();
			BrowserRequestTiming timing = new BrowserRequestTiming();
			when(fixture.session().isComplete()).thenAnswer(call -> fixture.executed.get() > 0);
			when(fixture.session().checkpointOwner()).thenReturn("home");
			fixture.beforeSave = () -> nanos.set(1_900_000_000L);
			doAnswer(call -> {
				if (timing.budget() != null && timing.budget().allowanceMillis(1000, JdbcConnections.WORK_RESERVE_MILLIS) == 0)
					throw new JdbcConnections.NotStarted();
				return null;
			}).when(fixture.matches).completeLoaded(anyString(), any(MatchDocument.class), any());
			AtomicReference<SetupApplication.HandleOutcome> outcome = new AtomicReference<>();
			new CaptureRequestProbe().measure(request("final-action"), nanos::get, () -> {
				outcome.set(fixture.application.handleWithOutcome("home", request("final-action")));
				return outcome.get().response();
			});
			assertEquals("ACCEPTED", outcome.get().response().getString("code", null));
			assertTrue(outcome.get().publish(), "The final checkpoint is durable even when the result write cannot start");
			assertEquals("after:final-action", fixture.durable.get().json);
			assertEquals(1, fixture.mapSize("pendingCompletions"));
			assertEquals(1, new CaptureRequestProbe().within(() -> fixture.application.expireReactiveDecisions()).size());
			assertEquals(0, fixture.mapSize("sessions"));
			assertEquals(0, fixture.mapSize("pendingCompletions"));
			assertEquals(1, fixture.executed.get(), "Reconciliation never repeats the native action");
		}
	}

	@Test void terminalStoreFailuresPublishAndReconcileWithoutAnotherClientRequest() throws Exception {
		for (Exception failure : new Exception[] { new SQLNonTransientConnectionException("connection reset", "08006"),
			new MatchService.OutcomeUnknown(MATCH),
			new MatchRepository.OutcomeUnknown(new MatchRepository.Record(MATCH, 4, "attempted"), new SQLException("unknown")) }) {
			try (Fixture fixture = new Fixture()) {
				fixture.application.handle("home", load());
				when(fixture.session().isComplete()).thenAnswer(call -> fixture.executed.get() > 0);
				when(fixture.session().checkpointOwner()).thenReturn("home");
				AtomicInteger writes = new AtomicInteger();
				doAnswer(call -> { if (writes.incrementAndGet() == 1) throw failure; return null; })
					.when(fixture.matches).completeLoaded(anyString(), any(MatchDocument.class), any());
				SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", request("final-store-failure"));
				assertEquals("ACCEPTED", outcome.response().getString("code", null), failure.getClass().getSimpleName());
				assertTrue(outcome.publish(), "A durable final checkpoint must be published despite a result-store failure");
				assertEquals("after:final-store-failure", fixture.durable.get().json);
				assertEquals(1, fixture.mapSize("sessions"));
				assertEquals(1, fixture.mapSize("pendingCompletions"));
				assertEquals(1, fixture.application.expireReactiveDecisions().size());
				assertEquals(0, fixture.mapSize("sessions"));
				assertEquals(0, fixture.mapSize("pendingCompletions"));
				assertEquals(2, writes.get());
				assertEquals(1, fixture.executed.get(), "Reconciliation must not repeat the native action");
			}
		}
	}

	@Test void deterministicCompletionFailuresReleaseWithoutRetryAndKeepPublishedFinalState() throws Exception {
		for (boolean materializationFails : new boolean[] {true, false}) {
			try (Fixture fixture = new Fixture(); CompletionLogs logs = new CompletionLogs()) {
				fixture.application.handle("home", load());
				terminalAction(fixture);
				if (materializationFails) when(fixture.session().completedMatch()).thenThrow(new IllegalStateException("private invalid result"));
				else doThrow(new IllegalArgumentException("private invalid result")).when(fixture.matches)
					.completeLoaded(anyString(), any(MatchDocument.class), any());
				SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", request("terminal-runtime"));
				assertEquals("ACCEPTED", outcome.response().getString("code", null));
				assertEquals("FULL_TIME", outcome.response().get("state").asObject().getString("phase", null));
				assertTrue(outcome.publish(), "A deterministic result failure cannot undo the durable terminal action");
				assertEquals("after:terminal-runtime", fixture.durable.get().json);
				assertEquals(0, fixture.mapSize("sessions"), "A deterministic failure must release its activation slot");
				assertEquals(0, fixture.mapSize("pendingCompletions"));
			assertEquals(1, fixture.application.lifecycleMetrics().getLong("terminalCompletionReleases", 0));
				for (int tick = 0; tick < 3; tick++) assertTrue(fixture.application.expireReactiveDecisions().isEmpty());
				verify(fixture.session(), times(1)).completedMatch();
				verify(fixture.matches, times(materializationFails ? 0 : 1)).completeLoaded(anyString(), any(MatchDocument.class), any());
				assertEquals(1, logs.messages.stream().filter(line -> line.startsWith("COMPLETION_TERMINAL phase=completion ")).count());
				assertTrue(logs.messages.stream().noneMatch(line -> line.contains("private invalid result")));
			}
		}
	}

	@Test void deterministicFailureOnDeferredAttemptStopsRetryingAndReleasesSession() throws Exception {
		for (boolean rejected : new boolean[] {false, true}) {
			try (Fixture fixture = new Fixture(); CompletionLogs logs = new CompletionLogs()) {
				fixture.application.handle("home", load());
				terminalAction(fixture);
				AtomicInteger attempts = new AtomicInteger();
				doAnswer(call -> {
					if (attempts.incrementAndGet() == 1) throw new SQLException("connection reset", "08006");
					if (rejected) throw new MatchService.Failure("COMPLETION_CONFLICT");
					throw new NullPointerException("private invalid result");
				}).when(fixture.matches).completeLoaded(anyString(), any(MatchDocument.class), any());
				SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", request("terminal-runtime"));
				assertTrue(outcome.publish());
				assertEquals("FULL_TIME", outcome.response().get("state").asObject().getString("phase", null));
				assertEquals(1, fixture.mapSize("pendingCompletions"));
				assertTrue(fixture.application.expireReactiveDecisions().isEmpty(), "The already-published terminal state stays authoritative");
				assertEquals(0, fixture.mapSize("sessions"));
				assertEquals(0, fixture.mapSize("pendingCompletions"));
				assertEquals(1, fixture.application.lifecycleMetrics().getLong("terminalCompletionReleases", 0));
				for (int tick = 0; tick < 3; tick++) assertTrue(fixture.application.expireReactiveDecisions().isEmpty());
				assertEquals(2, attempts.get(), "One recoverable failure and one terminal failure; no later attempts");
				assertEquals("after:terminal-runtime", fixture.durable.get().json);
				assertEquals(1, logs.messages.stream().filter(line -> rejected
					? line.startsWith("COMPLETION_REJECTED failureCode=COMPLETION_CONFLICT ")
					: line.startsWith("COMPLETION_TERMINAL phase=pending-completion ")).count());
			}
		}
	}

	private void terminalAction(Fixture fixture) throws Exception {
		when(fixture.session().isComplete()).thenAnswer(call -> fixture.executed.get() > 0);
		when(fixture.session().checkpointOwner()).thenReturn("home");
		doAnswer(call -> {
			fixture.executed.incrementAndGet();
			fixture.artifact.set("after:terminal-runtime");
			return reply(false).set("state", new JsonObject().add("phase", "FULL_TIME"));
		}).when(fixture.session()).apply(eq("home"), any(JsonObject.class), eq(NOW));
	}

	private static final class CompletionLogs extends Handler implements AutoCloseable {
		final List<String> messages = new ArrayList<>();
		final Logger logger = Logger.getLogger("com.fumbbl.ffb.server.match.persistence");
		CompletionLogs() { logger.addHandler(this); }
		@Override public void publish(LogRecord record) { messages.add(record.getMessage()); }
		@Override public void flush() { }
		@Override public void close() { logger.removeHandler(this); }
	}

	@Test void conflictingStoredResultReturnsDefinitiveRejectionWithoutPublishing() throws Exception {
		try (Fixture fixture = new Fixture(); CompletionLogs logs = new CompletionLogs()) {
			fixture.application.handle("home", load());
			when(fixture.session().isComplete()).thenAnswer(call -> fixture.executed.get() > 0);
			CompletedMatch attempted = mock(CompletedMatch.class);
			MatchDocument stored = fixture.matches.load("home", MATCH).document.completed(mock(CompletedMatch.class));
			MatchService conflictCheck = mock(MatchService.class);
			doCallRealMethod().when(conflictCheck).completeLoaded("home", stored, attempted);
			doAnswer(call -> { conflictCheck.completeLoaded("home", stored, attempted); return null; })
				.when(fixture.matches).completeLoaded(anyString(), any(MatchDocument.class), any());
			SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", request("conflicting-result"));
			assertEquals("COMPLETION_CONFLICT", outcome.response().getString("code", null));
			assertFalse(outcome.publish());
			assertEquals(0, fixture.application.lifecycleMetrics().getInt("residentSessions", -1));
			assertEquals(0, fixture.mapSize("generations"));
			assertEquals(0, fixture.mapSize("committedFingerprints"));
			assertTrue(logs.messages.stream().noneMatch(line -> line.startsWith("COMPLETION_TERMINAL")));
			assertEquals(0, fixture.mapSize("pendingCompletions"));
		}
	}

	@Test void deadlinePublishesTerminalCheckpointBeforeResultRetry() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			when(fixture.session().checkpointOwner()).thenReturn("home");
			when(fixture.session().reactiveDecisionDue(NOW)).thenReturn(true);
			when(fixture.session().isComplete()).thenAnswer(call -> "deadline-terminal".equals(fixture.artifact.get()));
			when(fixture.session().expireReactiveDecision(NOW)).thenAnswer(call -> {
				fixture.artifact.set("deadline-terminal"); return true;
			});
			assertEquals(1, fixture.application.expireReactiveDecisions().size(), "Both coaches must be notified on the expiry tick");
			assertEquals("deadline-terminal", fixture.durable.get().json);
			verify(fixture.matches, never()).completeLoaded(anyString(), any(MatchDocument.class), any());
			assertEquals(1, fixture.application.expireReactiveDecisions().size());
			assertEquals(0, fixture.mapSize("pendingCompletions"));
		}
	}

	@Test void timerRecordsResidentAbandonmentWithoutAnotherClientRequest() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			when(fixture.session().checkpointOwner()).thenReturn("home");
			when(fixture.session().abandonmentDue(NOW)).thenReturn(true);
			when(fixture.session().abandonIfInactive(NOW)).thenAnswer(call -> {
				fixture.artifact.set("abandoned"); return true;
			});
			fixture.application.expireReactiveDecisions();
			assertEquals("abandoned", fixture.durable.get().json);
			assertEquals(0, fixture.mapSize("sessions"));
			verify(fixture.session(), never()).expireReactiveDecision(NOW);
		}
	}

	@Test void missingResidentDropsPendingCompletionWithoutDatabaseAccess() throws Exception {
		try (Fixture fixture = new Fixture()) {
			Method queue = SetupApplication.class.getDeclaredMethod("queueCompletion", String.class);
			queue.setAccessible(true); queue.invoke(fixture.application, MATCH);
			fixture.application.expireReactiveDecisions();
			assertEquals(0, fixture.mapSize("pendingCompletions"));
			verify(fixture.matches, never()).loadForSetup(anyString(), anyString());
		}
	}

	@Test void evictedCompletionStillChecksForAConflictingStoredResult() throws Exception {
		for (boolean conflict : new boolean[] {false, true}) try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load()); terminalAction(fixture);
			AtomicInteger attempts = new AtomicInteger();
			doAnswer(call -> {
				if (attempts.incrementAndGet() == 1) throw new SQLException("retry");
				if (conflict) throw new MatchService.Failure("COMPLETION_CONFLICT");
				return null;
			}).when(fixture.matches).completeLoaded(anyString(), any(MatchDocument.class), any());
			fixture.application.handleWithOutcome("home", request("terminal-runtime"));
			assertEquals(1, fixture.mapSize("pendingCompletions"));
			Method evict = SetupApplication.class.getDeclaredMethod("releaseEngine", String.class);
			evict.setAccessible(true); evict.invoke(fixture.application, MATCH);
			fixture.restoringTerminal = true;
			MatchDocument completed = fixture.matches.load("home", MATCH).document.completed(mock(CompletedMatch.class));
			when(fixture.matches.loadForSetup("home", MATCH)).thenReturn(new MatchService.Result(completed, false));
			Map<String, JsonObject> changed = fixture.application.expireReactiveDecisions();
			assertEquals(2, attempts.get(), "Eviction must preserve the result identity check even after an unknown commit");
			assertEquals(conflict ? 0 : 1, changed.size());
			assertEquals(0, fixture.mapSize("pendingCompletions"));
			assertEquals(0, fixture.mapSize("sessions"));
		}
	}

	@Test void detachedRetryWorkStillConsumesTheActivationCeiling() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			Method queue = SetupApplication.class.getDeclaredMethod("queueCompletion", String.class);
			Method evict = SetupApplication.class.getDeclaredMethod("releaseEngine", String.class);
			queue.setAccessible(true); evict.setAccessible(true);
			Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
			@SuppressWarnings("unchecked") Map<String, SetupSession> sessions = (Map<String, SetupSession>) field.get(fixture.application);
			SetupSession terminal = fixture.session();
			for (int index = 0; index < 32; index++) {
				String id = index == 0 ? MATCH : "00000000-0000-0000-0000-%012d".formatted(index);
				sessions.put(id, terminal);
				if (index % 2 == 0) queue.invoke(fixture.application, id);
				else fixture.<SetupApplication.TimerRestore>map("pendingTimerRestores")
					.put(id, new SetupApplication.TimerRestore(NOW + 1000, true, -1, -1));
				evict.invoke(fixture.application, id);
			}
			assertEquals(16, fixture.mapSize("pendingCompletions"));
			assertEquals(16, fixture.mapSize("pendingTimerRestores"));
			assertEquals(0, fixture.mapSize("sessions"));
			String next = "00000000-0000-0000-0000-000000000999";
			MatchDocument document = new MatchDocument(next, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
				new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
			when(fixture.matches.loadForSetup("home", next)).thenReturn(new MatchService.Result(document, false));
			assertEquals("ACTIVATION_LIMIT", fixture.application.handle("home", load().set("matchId", next)).getString("code", null));
			assertEquals(16, fixture.mapSize("pendingCompletions"));
			assertEquals(16, fixture.mapSize("pendingTimerRestores"));
		}
	}

	@Test void aPreparedDocumentReadCannotEvictAResidentEngine() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			for (int index = 1; index <= 3; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index);
				fixture.<SetupSession>map("sessions").put(id, mock(SetupSession.class));
				fixture.<Long>map("lastAccess").put(id, NOW);
				fixture.rememberSize(id, 5L * 1024 * 1024);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			Connection connection = mock(Connection.class);
			PreparedStatement query = mock(PreparedStatement.class);
			ResultSet rows = mock(ResultSet.class);
			when(connection.prepareStatement(anyString())).thenReturn(query);
			when(query.executeQuery()).thenReturn(rows);
			when(rows.next()).thenReturn(true);
			when(rows.getString(1)).thenReturn(MATCH);
			String document = "{\"content\":\"" + "a".repeat(5 * 1024 * 1024) + "\"}";
			when(rows.getString(3)).thenReturn(document);

			assertEquals(document, new JdbcMatchRepository(() -> connection, fixture.memoryBudget).find(MATCH).json);
			assertEquals(3, fixture.mapSize("sessions"));
			assertEquals(0, fixture.application.lifecycleMetrics().getInt("memoryEvictions", -1));
		}
	}

	@Test void detachedTimerDoublesItsRetryDelayAfterRepeatedStorageRefusals() throws Exception {
		try (Fixture fixture = new Fixture()) {
			fixture.<SetupApplication.TimerRestore>map("pendingTimerRestores")
				.put(MATCH, new SetupApplication.TimerRestore(NOW, true, -1, -1));
			when(fixture.matches.loadForSetup("home", MATCH)).thenThrow(new SQLException("temporarily unavailable"));

			fixture.application.expireDecisions();
			fixture.time.set(NOW + 1_000);
			fixture.application.expireDecisions();
			fixture.time.set(NOW + 2_000);
			fixture.application.expireDecisions();
			verify(fixture.matches, times(2)).loadForSetup("home", MATCH);
			fixture.time.set(NOW + 3_000);
			fixture.application.expireDecisions();
			verify(fixture.matches, times(3)).loadForSetup("home", MATCH);
		}
	}

	@Test void restoringATimerDoesNotResetBackoffWhenItsCheckpointStillFails() throws Exception {
		try (Fixture fixture = new Fixture()) {
			Map<String, SetupApplication.TimerRestore> retries = fixture.map("pendingTimerRestores");
			retries.put(MATCH, new SetupApplication.TimerRestore(NOW, true, -1, -1));
			fixture.restoringReaction = true;
			fixture.failure = "PERSISTENCE_FAILED";

			fixture.application.expireDecisions();
			assertEquals(NOW + 1_000, retries.get(MATCH).retryAt());
			fixture.time.set(NOW + 1_000);
			fixture.application.expireDecisions();
			assertEquals(NOW + 3_000, retries.get(MATCH).retryAt());
			assertEquals("before", fixture.durable.get().json);
		}
	}

	@Test void aQuarantinedDetachedTimerKeepsOwnershipUntilTheBlockExpires() throws Exception {
		AtomicLong now = new AtomicLong(NOW);
		Clock safetyClock = mock(Clock.class);
		when(safetyClock.millis()).thenAnswer(call -> now.get());
		MatchSafetyJournal.StateStore store = mock(MatchSafetyJournal.StateStore.class);
		long expiry = NOW + 30 * 60_000;
		when(store.read()).thenReturn(new MatchSafetyJournal.State("prior", 0, "", 0, java.util.Set.of(), Map.of(MATCH, expiry)));
		try (MatchSafetyJournal safety = new MatchSafetyJournal(store, null, safetyClock);
			Fixture fixture = new Fixture(new MatchMemoryBudget(), safety)) {
			fixture.<SetupApplication.TimerRestore>map("pendingTimerRestores")
				.put(MATCH, new SetupApplication.TimerRestore(NOW, true, -1, -1));
			fixture.application.expireDecisions();
			assertEquals(1, fixture.mapSize("pendingTimerRestores"));
			fixture.time.set(expiry - 1);
			now.set(expiry - 1);
			fixture.application.expireDecisions();
			verify(fixture.recovery, never()).find(MATCH);
			fixture.time.set(expiry);
			now.set(expiry);
			fixture.restoringReaction = true;
			assertTrue(fixture.application.expireDecisions().containsKey(MATCH));
			assertEquals("expiry-committed", fixture.durable.get().json);
			assertEquals(0, fixture.mapSize("pendingTimerRestores"));
		}
	}

	@Test void aDecisionThatOvershootsTheDecodeLimitFinishesFromTheCommittedState() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			assertEquals("ACCEPTED", fixture.application.handle("home", load()).getString("code", null));
			SetupSession oversized = fixture.session();
			when(oversized.recoveryBytes()).thenAnswer(call -> fixture.artifact.get().startsWith("after:")
				? fixture.memoryBudget.decodedLimit() + 1L : 6L);
			fixture.stopOnRestore = true;

			SetupApplication.HandleOutcome stopped = fixture.application.handleWithOutcome("home", request("overflow"));
			assertEquals("MATCH_SIZE_LIMIT", stopped.response().getString("code", null));
			assertTrue(stopped.publish());
			assertEquals("FULL_TIME", stopped.response().get("state").asObject().getString("phase", null));
			assertEquals("before:terminal", fixture.durable.get().json);
			assertEquals(5, fixture.durable.get().generation);
		}
	}

	@Test void anOversizedTimerMutationPublishesTheCommittedScoreAndQueuesTheResult() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			SetupSession oversized = fixture.session();
			when(oversized.checkpointOwner()).thenReturn("home");
			when(oversized.reactiveDecisionDue(NOW)).thenReturn(true);
			when(oversized.expireReactiveDecision(NOW)).thenAnswer(call -> {
				fixture.artifact.set("after:expiry");
				return true;
			});
			when(oversized.recoveryBytes()).thenReturn(fixture.memoryBudget.decodedLimit() + 1L);
			fixture.stopOnRestore = true;

			SetupApplication.DeadlinePublication stopped = fixture.application.expireDecisions().get(MATCH);
			assertEquals("FULL_TIME", stopped.state().getString("phase", null));
			assertEquals("before:terminal", fixture.durable.get().json);
			assertEquals(1, fixture.mapSize("pendingCompletions"));
		}
	}

	@Test void pressureRejectedTimerRestoresAndExpiresAutomaticallyOnALaterTick() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			SetupSession current = fixture.session();
			when(current.hasPendingReactiveDecision()).thenReturn(true);
			when(current.reactiveDecisionDue(NOW)).thenReturn(true);
			when(current.checkpointOwner()).thenReturn("home");
			when(current.recoveryBytes()).thenReturn(5L * 1024 * 1024);
			when(current.expireReactiveDecision(NOW)).thenAnswer(call -> { fixture.artifact.set("uncommitted-expiry"); return true; });
			SetupSession quiet = null;
			for (int index = 1; index <= 2; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index);
				SetupSession reaction = mock(SetupSession.class); when(reaction.hasPendingReactiveDecision()).thenReturn(true);
				quiet = reaction;
				fixture.<SetupSession>map("sessions").put(id, reaction);
				fixture.rememberSize(id, 5L * 1024 * 1024 + 512 * 1024);
				fixture.<Long>map("lastAccess").put(id, NOW - index);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			assertTrue(fixture.application.expireReactiveDecisions().isEmpty());
			assertEquals("before", fixture.durable.get().json);
			assertEquals(1, fixture.mapSize("pendingTimerRestores"));
			assertFalse(fixture.<SetupSession>map("sessions").containsKey(MATCH));
			when(quiet.hasPendingReactiveDecision()).thenReturn(false);
			fixture.restoringReaction = true; fixture.time.set(NOW + 1000);
			assertTrue(fixture.application.expireReactiveDecisions().containsKey(MATCH));
			assertEquals("expiry-committed", fixture.durable.get().json);
			assertEquals(0, fixture.mapSize("pendingTimerRestores"));
		}
	}

	@Test void timerCanPublishAfterItsCheckpointEvictsALaterSession() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			SetupSession current = fixture.session();
			when(current.checkpointOwner()).thenReturn("home");
			when(current.reactiveDecisionDue(NOW)).thenReturn(true);
			when(current.recoveryBytes()).thenReturn(5L * 1024 * 1024);
			when(current.expireReactiveDecision(NOW)).thenAnswer(call -> { fixture.artifact.set("timer-growth"); return true; });
			for (int index = 1; index <= 2; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index);
				fixture.<SetupSession>map("sessions").put(id, mock(SetupSession.class));
				fixture.rememberSize(id, 5L * 1024 * 1024 + 512 * 1024);
				fixture.<Long>map("lastAccess").put(id, NOW - index);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			String timed = "00000000-0000-0000-0000-000000000002";
			when(fixture.<SetupSession>map("sessions").get(timed).hasPendingReactiveDecision()).thenReturn(true);
			fixture.<Long>map("lastAccess").put(timed, NOW - 1_800_001);
			assertEquals(1, fixture.application.expireReactiveDecisions().size());
			assertEquals("timer-growth", fixture.durable.get().json);
			assertEquals(1, fixture.application.lifecycleMetrics().getLong("memoryEvictions", 0));
			assertEquals(2, fixture.mapSize("sessions"));
			assertTrue(fixture.<SetupSession>map("sessions").containsKey(timed), "Pending reaction expiry must remain on the timer");
			when(current.reactiveDecisionDue(NOW)).thenReturn(false);
			SetupSession reaction = fixture.<SetupSession>map("sessions").get(timed);
			when(reaction.reactiveDecisionDue(NOW)).thenReturn(true);
			when(reaction.expireReactiveDecision(NOW)).thenReturn(true);
			when(reaction.checkpointOwner()).thenReturn("home");
			when(reaction.recoveryArtifact()).thenReturn("timed-expiry");
			when(reaction.reply(anyString(), anyString(), anyBoolean(), anyString())).thenReturn(reply(false));
			when(reaction.decorateSaveResume(any(JsonObject.class))).thenAnswer(call -> call.getArgument(0));
			MatchDocument timedDocument = new MatchDocument(timed, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
				new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
			when(fixture.matches.load("home", timed)).thenReturn(new MatchService.Result(timedDocument, false));
			fixture.<Long>map("generations").put(timed, 1L);
			AtomicReference<RecoveryRepository.Record> expiry = new AtomicReference<>();
			when(fixture.recovery.save(argThat(record -> record != null && timed.equals(record.matchId)), eq(1L)))
				.thenAnswer(call -> { expiry.set(call.getArgument(0)); return true; });
			assertTrue(fixture.application.expireReactiveDecisions().containsKey(timed));
			assertEquals("timed-expiry", expiry.get().json, "The protected reaction must still expire durably and publish");
		}
	}

	@Test void pinnedReactionEnginesRefusePressureAndReleaseAnUncommittedMutatedEngine() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			when(fixture.session().recoveryBytes()).thenReturn(5L * 1024 * 1024);
			for (int index = 1; index <= 2; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index);
				SetupSession timed = mock(SetupSession.class); when(timed.hasPendingReactiveDecision()).thenReturn(true);
				fixture.<SetupSession>map("sessions").put(id, timed);
				fixture.rememberSize(id, 5L * 1024 * 1024 + 512 * 1024);
				fixture.<Long>map("lastAccess").put(id, NOW - index);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", request("pinned-pressure"));
			assertEquals("ACTIVATION_LIMIT", outcome.response().getString("code", null)); assertFalse(outcome.publish());
			assertEquals("before", fixture.durable.get().json);
			assertFalse(fixture.<SetupSession>map("sessions").containsKey(MATCH));
			assertEquals(2, fixture.mapSize("sessions"));
			assertEquals("ACCEPTED", fixture.application.handle("home", load()).getString("code", null));
			assertEquals("before", fixture.artifact.get(), "Reload must reconcile the durable prefix, never the rejected mutation");
		}
	}

	@Test void uncertainCommittedExpiryPublishesTheReconciledStateWithoutAnotherNativeAction() throws Exception {
		for (boolean nextReaction : new boolean[] {false, true}) try (Fixture fixture = new Fixture()) {
			fixture.application.handle("home", load());
			SetupSession current = fixture.session();
			when(current.hasPendingReactiveDecision()).thenReturn(true);
			when(current.reactiveDecisionDue(NOW)).thenReturn(true);
			when(current.checkpointOwner()).thenReturn("home");
			when(current.expireReactiveDecision(NOW)).thenAnswer(call -> { fixture.artifact.set("committed-expiry"); return true; });
			fixture.failure = "MATCH_OUTCOME_UNKNOWN";
			assertTrue(fixture.application.expireReactiveDecisions().isEmpty());
			assertEquals("committed-expiry", fixture.durable.get().json);
			long committed = fixture.durable.get().generation;
			fixture.failure = null; fixture.restoringReaction = nextReaction; fixture.restoringReactionDue = false;
			fixture.time.set(NOW + 1000);
			assertTrue(fixture.application.expireReactiveDecisions().containsKey(MATCH));
			assertEquals(committed, fixture.durable.get().generation);
			verify(fixture.session(), never()).expireReactiveDecision(anyLong());
			assertEquals(0, fixture.mapSize("pendingTimerRestores"));
		}
	}

	@Test void detachedCompletionKeepsRetryingAfterTemporaryPinnedCapacityPressure() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(128L * 1024 * 1024))) {
			fixture.application.handle("home", load()); terminalAction(fixture);
			AtomicInteger attempts = new AtomicInteger();
			doAnswer(call -> { if (attempts.incrementAndGet() == 1) throw new SQLException("retry"); return null; })
				.when(fixture.matches).completeLoaded(anyString(), any(MatchDocument.class), any());
			fixture.application.handleWithOutcome("home", request("terminal-runtime"));
			Method evict = SetupApplication.class.getDeclaredMethod("releaseEngine", String.class); evict.setAccessible(true);
			evict.invoke(fixture.application, MATCH);
			fixture.durable.set(new RecoveryRepository.Record(MATCH, 5, "x".repeat(5 * 1024 * 1024)));
			SetupSession quiet = null;
			for (int index = 1; index <= 2; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index);
				SetupSession timed = mock(SetupSession.class); when(timed.hasPendingReactiveDecision()).thenReturn(true); quiet = timed;
				fixture.<SetupSession>map("sessions").put(id, timed);
				fixture.rememberSize(id, 5L * 1024 * 1024 + 512 * 1024);
				fixture.<Long>map("lastAccess").put(id, NOW - index);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			assertTrue(fixture.application.expireReactiveDecisions().isEmpty());
			assertEquals(1, fixture.mapSize("pendingCompletions")); assertEquals(1, attempts.get());
			when(quiet.hasPendingReactiveDecision()).thenReturn(false);
			fixture.restoringTerminal = true; fixture.time.set(NOW + 1000);
			assertTrue(fixture.application.expireReactiveDecisions().containsKey(MATCH));
			assertEquals(0, fixture.mapSize("pendingCompletions")); assertEquals(2, attempts.get());
		}
	}

	@Test void quarantineBlocksCoachReconnectAndObserverRestoreBeforeReadingRecovery() throws Exception {
		try (Fixture fixture = new Fixture()) {
			MatchSafetyJournal safety = mock(MatchSafetyJournal.class);
			doThrow(new MatchService.Failure("MATCH_QUARANTINED")).when(safety).requireAutomaticAvailable(MATCH);
			SetupApplication app = new SetupApplication(fixture.server, fixture.matches, fixture.recovery, false,
				fixture.clock, false, fixture.memoryBudget, safety);
			assertEquals("MATCH_QUARANTINED", app.handle("home", load()).getString("code", null));
			assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> app.spectatorView(MATCH)).code);
			assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> app.chatPage(MATCH, 0, 10)).code);
			verify(fixture.recovery, never()).find(anyString());
			assertTrue(fixture.construction.constructed().isEmpty());
		}
	}

	@Test void checkpointsOfThreeLargeActiveMatchesDoNotEvictEachOther() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(768L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			long bytes = 25L * 1024 * 1024;
			when(fixture.session().recoveryBytes()).thenReturn(bytes);
			fixture.rememberSize(MATCH, bytes);
			for (int index = 1; index <= 2; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index);
				fixture.<SetupSession>map("sessions").put(id, mock(SetupSession.class));
				fixture.rememberSize(id, bytes);
				fixture.<Long>map("lastAccess").put(id, NOW);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			for (int index = 0; index < 12; index++)
				assertEquals("ACCEPTED", fixture.application.handle("home", request("concurrent-" + index)).getString("code", null));
			assertEquals(3, fixture.mapSize("sessions"));
			assertEquals(0, fixture.application.lifecycleMetrics().getInt("memoryEvictions", -1));
		}
	}

	@Test void checkpointChargesFrozenHistoryAtItsRetainedSize() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(768L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			long mib = 1024L * 1024;
			SetupSession session = fixture.session();
			when(session.recoveryBytes()).thenReturn(3 * mib);
			when(session.frozenHistoryDecodedBytes()).thenReturn(2 * mib);
			when(session.frozenHistoryRetainedBytes()).thenReturn(3 * mib / 2);
			assertEquals("ACCEPTED", fixture.application.handle("home", request("frozen-growth")).getString("code", null));
			JsonObject metrics = fixture.application.lifecycleMetrics();
			assertEquals(11 * mib / 2, metrics.getLong("retainedBudgetBytes", -1));
			assertEquals(55 * mib / 2, metrics.getLong("workingReserveBytes", -1));
		}
	}

	@Test void checkpointGrowthEvictsAnUnpinnedEngineToReserveSpaceForFrozenHistoryExpansion() throws Exception {
		long mib = 1024L * 1024;
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(768 * mib))) {
			assertEquals("ACCEPTED", fixture.application.handle("home", load()).getString("code", null));
			String frozen = "00000000-0000-0000-0000-000000000001";
			String older = "00000000-0000-0000-0000-000000000002";
			SetupSession protectedEngine = mock(SetupSession.class);
			when(protectedEngine.hasPendingReactiveDecision()).thenReturn(true);
			fixture.<SetupSession>map("sessions").put(frozen, protectedEngine);
			fixture.<SetupSession>map("sessions").put(older, mock(SetupSession.class));
			fixture.<MatchMemoryBudget.ResidentSize>map("residentSizes").put(frozen,
				fixture.memoryBudget.residentSize(40 * mib, 39 * mib, 40 * mib));
			fixture.rememberSize(older, 28 * mib);
			for (String id : List.of(frozen, older)) {
				fixture.<Long>map("lastAccess").put(id, NOW - 1000);
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			when(fixture.session().recoveryBytes()).thenReturn(30 * mib);

			// Retained charges total 276 MiB. A fixed 280 MiB reserve fits; the required 396 MiB does not.
			assertEquals("ACCEPTED", fixture.application.handle("home", request("reserve-frozen-workspace")).getString("code", null));
			assertEquals(1, fixture.application.lifecycleMetrics().getLong("memoryEvictions", -1));
		}
	}

	@Test void memoryPressureEvictsATerminalMatchBeforeAnOlderActiveMatch() throws Exception {
		try (Fixture fixture = new Fixture(new MatchMemoryBudget(768L * 1024 * 1024))) {
			fixture.application.handle("home", load());
			String active = "00000000-0000-0000-0000-000000000001";
			String terminal = "00000000-0000-0000-0000-000000000002";
			for (String id : List.of(active, terminal)) {
				SetupSession session = mock(SetupSession.class);
				when(session.isComplete()).thenReturn(id.equals(terminal));
				fixture.<SetupSession>map("sessions").put(id, session);
				fixture.rememberSize(id, 20L * 1024 * 1024);
				fixture.<Long>map("lastAccess").put(id, NOW - (id.equals(active) ? 1000 : 500));
				fixture.<byte[]>map("committedFingerprints").put(id, new byte[32]);
			}
			Method admit = SetupApplication.class.getDeclaredMethod("admitDecoded", String.class, long.class);
			admit.setAccessible(true); admit.invoke(fixture.application, MATCH, 45L * 1024 * 1024);
			assertTrue(fixture.map("sessions").containsKey(active));
			assertFalse(fixture.map("sessions").containsKey(terminal));
		}
	}

	private JsonObject request(String id) { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "action")
		.add("requestId", id).add("matchId", MATCH).add("expectedRevision", 3).add("actionId", "server-action"); }
	private JsonObject load() { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load").add("requestId", "load").add("matchId", MATCH); }
	private static JsonObject reply(boolean duplicate) { return new JsonObject().add("code", "ACCEPTED").add("duplicate", duplicate).add("state", new JsonObject()); }

	private static final class Fixture implements AutoCloseable {
		final FantasyFootballServer server = mock(FantasyFootballServer.class);
		final MatchService matches = mock(MatchService.class);
		final RecoveryRepository recovery = mock(RecoveryRepository.class, org.mockito.Mockito.CALLS_REAL_METHODS);
		final AtomicReference<RecoveryRepository.Record> durable = new AtomicReference<>(new RecoveryRepository.Record(MATCH, 4, "before"));
		final AtomicReference<String> artifact = new AtomicReference<>();
		final AtomicInteger executed = new AtomicInteger();
		final MockedConstruction<RecoveryCheckpoint> validation;
		final MockedConstruction<SetupSession> construction;
		final SetupApplication application;
		String failure;
		String normalizedArtifact;
		SetupApplication.StorageAdmission beforeSave = () -> { };
		boolean unknownCommitted = true;
		boolean restoringTerminal;
		boolean restoringReaction;
		boolean restoringReactionDue = true;
		final AtomicLong time = new AtomicLong(NOW);
		final Clock clock = mock(Clock.class);
		final MatchMemoryBudget memoryBudget;
		final MatchSafetyJournal safety;
		boolean stopOnRestore;
		Fixture() throws Exception { this(new MatchMemoryBudget()); }
		Fixture(MatchMemoryBudget memoryBudget) throws Exception {
			this(memoryBudget, new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
		}
		Fixture(MatchMemoryBudget memoryBudget, MatchSafetyJournal safety) throws Exception {
			this.safety = safety;
			this.memoryBudget = memoryBudget;
			when(clock.millis()).thenAnswer(call -> time.get());
			MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
				new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
			when(matches.load("home", MATCH)).thenReturn(new MatchService.Result(document, false));
			when(matches.loadForSetup("home", MATCH)).thenReturn(new MatchService.Result(document, false));
			when(recovery.find(MATCH)).thenAnswer(call -> durable.get());
			when(recovery.save(any(RecoveryRepository.Record.class), anyLong())).thenAnswer(call -> {
				RecoveryRepository.Record record = call.getArgument(0);
				assertEquals(durable.get().generation, ((Long) call.getArgument(1)).longValue());
				beforeSave.requireAvailable();
				if ("RECOVERY_CONFLICT".equals(failure)) return false;
				if ("PERSISTENCE_FAILED".equals(failure)) throw new SQLException("unavailable");
				if ("MATCH_OUTCOME_UNKNOWN".equals(failure) && !unknownCommitted) throw new RecoveryRepository.OutcomeUnknown(record, new SQLException("unknown"));
				durable.set(record);
				if ("MATCH_OUTCOME_UNKNOWN".equals(failure)) throw new RecoveryRepository.OutcomeUnknown(record, new SQLException("unknown"));
				return true;
			});
			validation = mockConstruction(RecoveryCheckpoint.class, (checkpoint, context) ->
				when(checkpoint.validate(anyString())).thenAnswer(call -> {
					artifact.set(normalizedArtifact == null ? call.getArgument(0) : normalizedArtifact);
					return mock(RecoveryCheckpoint.Validated.class);
				}));
			construction = mockConstruction(SetupSession.class, (session, context) -> {
				if (restoringReaction) {
					AtomicBoolean pending = new AtomicBoolean(true);
					when(session.hasPendingReactiveDecision()).thenAnswer(call -> pending.get());
					when(session.reactiveDecisionDue(anyLong())).thenAnswer(call -> pending.get() && restoringReactionDue);
					when(session.checkpointOwner()).thenReturn("home");
					when(session.recoveryBytes()).thenReturn(5L * 1024 * 1024);
					when(session.expireReactiveDecision(anyLong())).thenAnswer(call -> { artifact.set("expiry-committed"); pending.set(false); return true; });
				}
				if (stopOnRestore) {
					when(session.isComplete()).thenAnswer(call -> artifact.get().endsWith(":terminal"));
					when(session.endedForSizeLimit()).thenAnswer(call -> artifact.get().endsWith(":terminal"));
					when(session.recoveryBytes()).thenAnswer(call -> (long) artifact.get().length());
					doAnswer(call -> { artifact.set(artifact.get() + ":terminal"); return null; }).when(session).endForSizeLimit(anyLong());
				} else when(session.isComplete()).thenAnswer(call -> restoringTerminal);
				when(session.recoveryArtifact()).thenAnswer(call -> artifact.get());
				when(session.reply(anyString(), anyString(), anyBoolean(), anyString())).thenAnswer(call -> {
					JsonObject response = reply(false).set("code", (String) call.getArgument(1));
					if (session.isComplete()) response.get("state").asObject().add("phase", "FULL_TIME");
					return response;
				});
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
		SetupApplication newApplication() { return new SetupApplication(server, matches, recovery, false, clock, false, memoryBudget, safety); }
		@SuppressWarnings("unchecked") <T> Map<String, T> map(String name) throws Exception { Field field = SetupApplication.class.getDeclaredField(name); field.setAccessible(true); return (Map<String, T>) field.get(application); }
		SetupSession session() { return construction.constructed().get(construction.constructed().size() - 1); }
		void rememberSize(String id, long decodedBytes) throws Exception {
			this.<MatchMemoryBudget.ResidentSize>map("residentSizes").put(id, memoryBudget.residentSize(decodedBytes, 0, 0));
		}
		int mapSize(String name) throws Exception { Field field = SetupApplication.class.getDeclaredField(name); field.setAccessible(true); return ((Map<?, ?>) field.get(application)).size(); }
		@Override public void close() {
			construction.close();
			validation.close();
		}
	}
}
