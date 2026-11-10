package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.RecoveryRepository;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.net.ServerCommunication;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.mockito.Answers;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.sql.SQLException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ResourceLock("ffb.browser.timing")
class BrowserRequestTimingTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private final AtomicLong nanos = new AtomicLong();
	private final List<String> lines = new ArrayList<>();
	private final Clock clock = mock(Clock.class);
	private final BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, clock, lines::add);
	private String previous;

	@BeforeEach void enable() {
		previous = System.getProperty("ffb.browser.timing"); System.setProperty("ffb.browser.timing", "true");
		when(clock.millis()).thenAnswer(call -> 2000000000000L + nanos.get() / 1000000);
	}
	@AfterEach void restore() {
		if (previous == null) System.clearProperty("ffb.browser.timing"); else System.setProperty("ffb.browser.timing", previous);
	}

	@Test void disabledRequestsStillHaveBudgetAndInvalidOperationsEmitNothing() {
		System.clearProperty("ffb.browser.timing");
		assertNotNull(timing.queued());
		System.setProperty("ffb.browser.timing", "true");
		for (JsonObject request : new JsonObject[] { action().set("operation", "unbounded-secret"),
			action().set("requestId", "unsafe\nidentifier"), action().set("operation", 1), action().set("type", "authenticate") }) {
			try (BrowserRequestTiming.Scope ignored = timing.handling(timing.queued())) { timing.selectRequest(request); }
		}
		assertTrue(lines.isEmpty());
	}

	@Test void serverLogSeparatesLocalAuthorizationReuseAndCheckpointPreparation() {
		try (BrowserRequestTiming.Scope handling = timing.handling(timing.queued())) {
			timing.selectRequest(action());
			try (BrowserRequestTiming.Scope local = timing.span(BrowserRequestTiming.Phase.LOCAL_AUTHORIZATION)) { nanos.addAndGet(3000000); }
			try (BrowserRequestTiming.Scope reuse = timing.span(BrowserRequestTiming.Phase.FIREBASE_REUSE)) { }
			try (BrowserRequestTiming.Scope cursor = timing.span(BrowserRequestTiming.Phase.RECOVERY_CURSOR)) { nanos.addAndGet(5000000); }
			try (BrowserRequestTiming.Scope hash = timing.span(BrowserRequestTiming.Phase.RECOVERY_FINGERPRINT)) { nanos.addAndGet(2000000); }
		}
		JsonObject event = JsonObject.readFrom(lines.get(0).substring("FFB_BROWSER_TIMING ".length()));
		assertEquals(3, event.getDouble("localAuthorizationMs", -1));
		assertEquals(1, event.getInt("localAuthorizationChecks", -1));
		assertEquals(1, event.getInt("firebaseReuseHits", -1));
		assertEquals(0, event.getInt("firebaseLookups", -1));
		assertEquals(5, event.getDouble("recoveryCursorMs", -1));
		assertEquals(2, event.getDouble("recoveryFingerprintMs", -1));
	}

	@Test void telemetryIsOptInAllowlistedClampedAndSnapshotsActiveNestedPhasesBeforePublication() {
		System.clearProperty("ffb.browser.timing");
		List<String> telemetry = new ArrayList<>();
		BrowserConnection connection = new BrowserConnection() {
			@Override public void send(String message) { }
			@Override public void sendDiagnostics(String message) { telemetry.add(message); }
		};
		BrowserRequestTiming.Request queued = timing.queued();
		nanos.addAndGet(2000000);
		try (BrowserRequestTiming.Scope work = timing.handling(queued)) {
			timing.selectRequest(action());
			timing.enableReplies(connection);
			try (BrowserRequestTiming.Scope outer = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
				nanos.addAndGet(1000000);
				try (BrowserRequestTiming.Scope inner = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
					nanos.addAndGet(2000000);
					timing.reply(connection, new JsonObject().add("requestId", "timed-action"), () -> nanos.addAndGet(100000000));
				}
			}
			nanos.addAndGet(500000000); // Later publication is outside the acknowledged request boundary.
			timing.reply(connection, new JsonObject().add("requestId", "timed-action"), () -> { });
		}
		assertTrue(lines.isEmpty());
		assertEquals(1, telemetry.size());
		JsonObject durations = JsonObject.readFrom(telemetry.getFirst()).get("timing").asObject();
		assertEquals(3.0, durations.get("handlingMs").asDouble());
		assertEquals(2.0, durations.get("queueWaitMs").asDouble());
		assertEquals(3.0, durations.get("sessionApplyMs").asDouble());
		assertEquals(java.util.Set.of("queueWaitMs", "handlingMs", "authorizationMs", "sessionApplyMs", "checkpointMs", "recoverySerializeMs", "checkpointSqlMs"),
			new java.util.HashSet<>(durations.names()));
		telemetry.clear();
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
			timing.selectRequest(action()); timing.enableReplies(connection);
			nanos.addAndGet(4000000000000L);
			timing.reply(connection, new JsonObject().add("requestId", "timed-action"), () -> { });
		}
		assertEquals(3600000, JsonObject.readFrom(telemetry.getFirst()).get("timing").asObject().getDouble("handlingMs", -1));
		for (JsonObject.Member member : JsonObject.readFrom(telemetry.getFirst()).get("timing").asObject()) {
			double value = member.getValue().asDouble();
			assertTrue(Double.isFinite(value) && value >= 0 && value <= 3600000);
		}
	}

	@Test void optionalTelemetryFailureCannotChangeMandatoryReplyOrLeakIntoNextRequest() {
		System.clearProperty("ffb.browser.timing");
		java.util.concurrent.atomic.AtomicInteger replies = new java.util.concurrent.atomic.AtomicInteger();
		BrowserConnection connection = new BrowserConnection() {
			@Override public void send(String message) { }
			@Override public void sendDiagnostics(String message) { throw new IllegalStateException("diagnostics unavailable"); }
		};
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
			timing.selectRequest(action()); timing.enableReplies(connection);
			timing.reply(connection, new JsonObject().add("requestId", "timed-action"), replies::incrementAndGet);
		}
		timing.reply(connection, new JsonObject().add("requestId", "timed-action"), replies::incrementAndGet);
		assertEquals(2, replies.get());
		assertTrue(lines.isEmpty());
	}

	@Test void readOnlyRequestsEmitOnlyBoundedCorrelationFields() {
		for (String type : new String[] { "routePreview", "movementPreview", "movementRange", "matchTranscript", "watch", "currentMatches", "browse", "catalog", "setup" }) {
			lines.clear();
			JsonObject request = action().set("type", type).set("operation", "load")
				.add("bearer", "private-token").add("playerId", "private-player").add("payload", "private-payload");
			try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) { timing.selectRequest(request); }
			assertEquals(1, lines.size(), type);
			JsonObject event = JsonObject.readFrom(lines.get(0).substring("FFB_BROWSER_TIMING ".length()));
			assertEquals(type, event.getString("requestType", null));
			assertEquals("setup".equals(type) ? "load" : "read", event.getString("operation", null));
			assertFalse(lines.get(0).contains("private-"));
			assertFalse(lines.get(0).contains(MATCH));
		}
	}

	@Test void nestedSpansCountOnceAndFailureClearsWorkerContext() {
		BrowserRequestTiming.Request queued = timing.queued();
		nanos.set(2000000);
		assertThrows(IllegalStateException.class, () -> {
			try (BrowserRequestTiming.Scope work = timing.handling(queued)) {
				timing.selectRequest(action().add("bearer", "private-token").add("accountId", "private-account"));
				try (BrowserRequestTiming.Scope outer = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
					nanos.addAndGet(1000000);
					try (BrowserRequestTiming.Scope inner = timing.span(BrowserRequestTiming.Phase.SESSION_APPLY)) {
						nanos.addAndGet(3000000);
						throw new IllegalStateException("private-engine-state");
					}
				}
			}
		});
		JsonObject event = event();
		assertEquals(2.0, event.get("queueWaitMs").asDouble());
		assertEquals(4.0, event.get("sessionApplyMs").asDouble());
		assertEquals(4.0, event.get("handlingMs").asDouble());
		assertEquals(6.0, event.get("totalMs").asDouble());
		assertEquals(2000000000002L, event.get("serverStartUtcMs").asLong());
		assertEquals(2000000000006L, event.get("serverEndUtcMs").asLong());
		assertEquals(0.0, event.get("checkpointMs").asDouble());
		assertEquals(26, event.size());
		assertFalse(lines.get(0).contains("private-"));
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
			try (BrowserRequestTiming.Scope span = timing.span(BrowserRequestTiming.Phase.CHECKPOINT)) { nanos.incrementAndGet(); }
		}
		assertEquals(1, lines.size());
	}

	@Test void publisherMeasuresViewerFanoutIncludingSendFailure() throws Exception {
		for (boolean failSend : new boolean[] { false, true }) {
			lines.clear();
			V2MatchAccess access = mock(V2MatchAccess.class);
			new PublicationTestGrants().allow(access, target -> "spectator");
			SetupApplication setup = mock(SetupApplication.class);
			when(setup.spectatorView(MATCH)).thenReturn(new JsonObject());
			ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
			BrowserConnection viewer = mock(BrowserConnection.class, call -> {
				if ("send".equals(call.getMethod().getName())) {
					nanos.addAndGet(3000000);
					if (failSend) throw new IllegalStateException("viewer unavailable");
				}
				return Answers.RETURNS_DEFAULTS.answer(call);
			});
			publisher.watch(viewer, mock(com.fumbbl.ffb.server.match.AuthenticatedPrincipal.class), MATCH, "watch-request");
			try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
				timing.selectRequest(action());
				nanos.addAndGet(2000000);
				publisher.publish(MATCH, null, new JsonObject());
			}
			assertEquals(failSend ? 6.0 : 3.0, event().get("publicationMs").asDouble());
			assertEquals(failSend ? 8.0 : 5.0, event().get("handlingMs").asDouble());
		}
	}

	@Test void clockFailuresNeverEscapeAndAlwaysClearWorkerContext() {
		BrowserRequestTiming unavailable = new BrowserRequestTiming(() -> { throw new IllegalStateException("clock unavailable"); }, clock, lines::add);
		// A failed monotonic clock cannot silently disable enforcement. Wall-clock diagnostics remain optional.
		assertThrows(IllegalStateException.class, unavailable::queued);
		doThrow(new IllegalStateException("wall clock unavailable")).when(clock).millis();
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) { timing.selectRequest(action()); }
		assertTrue(lines.isEmpty());
		doReturn(2000000000000L).when(clock).millis();
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
			timing.selectRequest(action());
			doThrow(new IllegalStateException("wall clock unavailable")).when(clock).millis();
		}
		doReturn(2000000000000L).when(clock).millis();
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) { }
		assertTrue(lines.isEmpty());
	}

	@Test void budgetStartsAtExecutionAndNestedHelpersCannotExtendIt() {
		System.clearProperty("ffb.browser.timing");
		BrowserRequestTiming.Request queued = timing.queued();
		nanos.set(5_000_000_000L); // Queue wait consumes no worker allowance.
		assertNull(timing.budget());
		assertThrows(IllegalStateException.class, () -> {
			try (BrowserRequestTiming.Scope outer = timing.handling(queued)) {
				BrowserRequestTiming.Budget budget = timing.budget();
				assertEquals(2000, budget.allowanceMillis(3000, 0));
				nanos.addAndGet(1_500_000_000L);
				try (BrowserRequestTiming.Scope nested = timing.handling(timing.queued())) {
					assertSame(budget, timing.budget());
					assertEquals(450, budget.allowanceMillis(1500, 50));
					nanos.addAndGet(449_500_001L);
					assertEquals(0, budget.allowanceMillis(500, 50));
				}
				assertSame(budget, timing.budget());
				throw new IllegalStateException("unwind");
			}
		});
		assertNull(timing.budget());
		assertTrue(lines.isEmpty());
	}

	@Test void fullTaskMeasurementIncludesLoggingAndObservesOverrunEvenWhenOutputFails() {
		List<BrowserRequestTiming.TaskMeasurement> measurements = new ArrayList<>();
		BrowserRequestTiming slowOutput = new BrowserRequestTiming(nanos::get, clock, line -> {
			assertNotNull(timing.budget());
			nanos.addAndGet(100_000_000);
			throw new IllegalStateException("optional log sink failure");
		});
		try (BrowserRequestTiming.Scope scope = slowOutput.handling(slowOutput.queued(), measurements::add)) {
			slowOutput.selectRequest(action());
			nanos.addAndGet(1_950_000_000L);
		}
		assertEquals(2_050_000_000L, measurements.getFirst().executionNanos());
		assertTrue(measurements.getFirst().overrun());
		assertNull(timing.budget());
	}

	@Test void controlAndIngressMetricsIncludeFullTaskAndCleanupWithoutCorrelation() {
		System.clearProperty("ffb.browser.timing");
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		List<Runnable> queue = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(call -> { queue.add(call.getArgument(0)); return true; });
		BrowserMatchTransport transport = new BrowserMatchTransport(server, timing);
		try {
			BrowserProtocol protocol = mock(BrowserProtocol.class);
			org.mockito.Mockito.doAnswer(call -> { assertNotNull(timing.budget()); nanos.addAndGet(3_000_000); return null; }).when(protocol).expireDecisions();
			transport.queueDecisionCheck(protocol);
			transport.submitControl(() -> { assertNotNull(timing.budget()); nanos.addAndGet(2_100_000_000L); }, () -> { });
			transport.submit(() -> { nanos.addAndGet(4_000_000); }, () -> { });
			nanos.addAndGet(7_000_000);
			queue.forEach(Runnable::run);
			JsonArray tasks = transport.getMetrics().toJson().get("workerTasks").asArray();
			assertEquals(1, tasks.get(0).asObject().getLong("count", -1));
			assertEquals(4_000_000, tasks.get(0).asObject().getLong("executionNanos", -1));
			assertEquals(1, tasks.get(1).asObject().getLong("overruns", -1));
			assertEquals(7_000_000, tasks.get(2).asObject().getLong("queueNanos", -1));
			assertEquals(3_000_000, tasks.get(2).asObject().getLong("executionNanos", -1));
			assertNull(timing.budget());
			assertTrue(lines.isEmpty());
		} finally { transport.destroy(); }
	}

	@Test void diagnosticOutputFailureDoesNotEscapeOrContaminateTheNextRequest() {
		BrowserRequestTiming broken = new BrowserRequestTiming(nanos::get, line -> { throw new IllegalStateException("sink unavailable"); });
		try (BrowserRequestTiming.Scope work = broken.handling(broken.queued())) { broken.selectRequest(action()); }
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) { }
		assertTrue(lines.isEmpty());
	}

	@Test void adapterSelectsReadOnlyRequestsAfterEnvelopeVersionCheckAndPreservesReply() throws SQLException {
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(any(), any())).thenThrow(new MatchService.Failure("NOT_FOUND"));
		BrowserV2Adapter adapter = new BrowserV2Adapter(mock(com.fumbbl.ffb.server.match.V2PrincipalAuthenticator.class), access, null, null, null, null);
		BrowserConnection connection = mock(BrowserConnection.class);
		JsonObject request = new JsonObject().add("version", 1).add("type", "routePreview")
			.add("requestId", "timed-preview").add("matchId", MATCH).add("expectedRevision", 3)
			.add("waypoints", new JsonArray().add(new JsonObject().add("x", 1).add("y", 2)));
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) { adapter.receive(connection, request.toString()); }
		assertTrue(lines.isEmpty());
		request.set("version", 2);
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) { adapter.receive(connection, request.toString()); }
		assertEquals(1, lines.size());
		JsonObject event = JsonObject.readFrom(lines.get(0).substring("FFB_BROWSER_TIMING ".length()));
		assertEquals("routePreview", event.getString("requestType", null));
		assertEquals("read", event.getString("operation", null));
		org.mockito.Mockito.verify(connection).send("{\"type\":\"error\",\"requestId\":\"timed-preview\",\"code\":\"NOT_FOUND\",\"version\":2}");
	}

	@Test void transportMeasuresQueueAndV2SelectsRequestsWithoutChangingTheReply() throws Exception {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		List<Runnable> queued = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(call -> { queued.add(call.getArgument(0)); return true; });
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(any(), any())).thenThrow(new MatchService.Failure("NOT_FOUND"));
		BrowserV2Adapter adapter = new BrowserV2Adapter(mock(com.fumbbl.ffb.server.match.V2PrincipalAuthenticator.class), access, null, null, null, null);
		BrowserConnection connection = mock(BrowserConnection.class);
		try {
			BrowserMatchTransport transport = new BrowserMatchTransport(server, timing);
			try {
				assertTrue(transport.submit(() -> {
					nanos.addAndGet(3000000);
					adapter.receive(connection, action().set("version", 2).toString());
				}, () -> { throw new AssertionError("Unexpected rejection"); }));
				assertTrue(lines.isEmpty());
				nanos.set(7000000);
				queued.get(0).run();
				assertEquals(7.0, event().get("queueWaitMs").asDouble());
				assertEquals(10.0, event().get("totalMs").asDouble());
				org.mockito.Mockito.verify(connection).send("{\"type\":\"error\",\"requestId\":\"timed-action\",\"code\":\"NOT_FOUND\",\"version\":2}");
			} finally { transport.destroy(); }
		} finally { assertEquals(1, lines.size()); }
	}

	@Test void applicationSeparatesApplyAndCheckpointIncludingPersistenceFailure() throws Exception {
		for (boolean failSave : new boolean[] { false, true }) {
			lines.clear(); nanos.set(0);
			MatchService matches = mock(MatchService.class);
			RecoveryRepository recovery = mock(RecoveryRepository.class);
			// The clock-aware apply overload is package-private to the match application.
			SetupSession session = mock(SetupSession.class, call -> {
				if ("apply".equals(call.getMethod().getName()) && call.getArguments().length == 3) {
					nanos.addAndGet(3000000); return new JsonObject().add("code", "ACCEPTED").add("duplicate", false);
				}
				return Answers.RETURNS_DEFAULTS.answer(call);
			});
			SetupApplication application = new SetupApplication(mock(FantasyFootballServer.class), matches, recovery, false,
				Clock.fixed(Instant.ofEpochMilli(2000000000000L), ZoneOffset.UTC));
			MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
				new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
			Constructor<MatchService.Result> constructor = MatchService.Result.class.getDeclaredConstructor(MatchDocument.class, boolean.class);
			constructor.setAccessible(true);
			when(matches.load("home", MATCH)).thenReturn(constructor.newInstance(document, false));
			put(application, "sessions", MATCH, session); put(application, "generations", MATCH, 4L);
			put(application, "committedFingerprints", MATCH, MessageDigest.getInstance("SHA-256").digest("before".getBytes(StandardCharsets.UTF_8)));
			when(session.recoveryArtifact()).thenReturn("after");
			when(session.expireReactiveDecision(anyLong())).thenAnswer(call -> { nanos.addAndGet(1000000); return false; });
			when(recovery.save(any(RecoveryRepository.Record.class), eq(4L))).thenAnswer(call -> {
				assertTrue(lines.isEmpty()); nanos.addAndGet(5000000);
				if (failSave) throw new SQLException("private database details");
				return true;
			});
			try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
				timing.selectRequest(action());
				SetupApplication.HandleOutcome outcome = application.handleWithOutcome("home", action());
				assertEquals(failSave ? "PERSISTENCE_FAILED" : "ACCEPTED", outcome.response().getString("code", null));
				assertEquals(!failSave, outcome.publish());
				nanos.addAndGet(2000000); // Projection/publication work after the application returns.
			}
			assertEquals(4.0, event().get("sessionApplyMs").asDouble());
			assertEquals(5.0, event().get("checkpointMs").asDouble());
			assertEquals(5.0, event().get("checkpointStoreMs").asDouble());
			assertEquals(0.0, event().get("recoverySerializeMs").asDouble());
			assertEquals(11.0, event().get("handlingMs").asDouble());
		}
	}

	@Test void applicationSeparatesFailedRestoreFromEngineAndCheckpoint() throws Exception {
		MatchService matches = mock(MatchService.class);
		RecoveryRepository recovery = mock(RecoveryRepository.class);
		SetupApplication application = new SetupApplication(mock(FantasyFootballServer.class), matches, recovery, false,
			Clock.fixed(Instant.ofEpochMilli(2000000000000L), ZoneOffset.UTC));
		MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
			new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
		Constructor<MatchService.Result> constructor = MatchService.Result.class.getDeclaredConstructor(MatchDocument.class, boolean.class);
		constructor.setAccessible(true);
		when(matches.load("home", MATCH)).thenReturn(constructor.newInstance(document, false));
		when(recovery.find(MATCH)).thenAnswer(call -> {
			nanos.addAndGet(6000000); throw new SQLException("private recovery failure");
		});
		try (BrowserRequestTiming.Scope work = timing.handling(timing.queued())) {
			timing.selectRequest(action());
			assertEquals("PERSISTENCE_FAILED", application.handle("home", action()).getString("code", null));
		}
		assertEquals(6.0, event().get("recoveryRestoreMs").asDouble());
		assertEquals(6.0, event().get("handlingMs").asDouble());
		assertEquals(0.0, event().get("sessionApplyMs").asDouble());
		assertEquals(0.0, event().get("checkpointMs").asDouble());
		assertFalse(lines.get(0).contains("private"));
	}

	@SuppressWarnings("unchecked")
	private void put(SetupApplication application, String fieldName, String key, Object value) throws Exception {
		Field field = SetupApplication.class.getDeclaredField(fieldName); field.setAccessible(true);
		((Map<String, Object>) field.get(application)).put(key, value);
	}
	private JsonObject event() {
		assertEquals(1, lines.size());
		assertTrue(lines.get(0).startsWith("FFB_BROWSER_TIMING "));
		JsonObject event = JsonObject.readFrom(lines.get(0).substring("FFB_BROWSER_TIMING ".length()));
		assertEquals("timed-action", event.getString("requestId", null));
		assertEquals("setup", event.getString("requestType", null));
		assertEquals("action", event.getString("operation", null));
		return event;
	}
	private JsonObject action() {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", "action").add("requestId", "timed-action")
			.add("matchId", MATCH).add("expectedRevision", 3).add("actionId", "server-action");
	}
}
