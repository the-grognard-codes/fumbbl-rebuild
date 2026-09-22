package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.MatchRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.RecoveryRepository;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.team.SavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecoveryApplicationTest {
	private final List<Long> actionNanos = new ArrayList<>();
	private long sampledHeapPeak;
	private long maxSnapshotBytes;
	private final List<Long> queueNanos = new ArrayList<>();
	private com.fumbbl.ffb.server.local.BrowserMatchTransport measuredTransport;
	private TestServer measuredServer;
	private Thread measuredWorker;

	@org.junit.jupiter.api.AfterEach void stopMeasuredWorker() throws Exception {
		if (measuredTransport != null) measuredTransport.destroy();
		if (measuredServer != null) measuredServer.getServer().getCommunication().shutdown();
		if (measuredWorker != null) { measuredWorker.join(20000); assertFalse(measuredWorker.isAlive()); }
	}

	private JsonObject onWorker(java.util.function.Supplier<JsonObject> operation) throws Exception {
		if (measuredTransport == null) return operation.get();
		java.util.concurrent.CompletableFuture<JsonObject> result = new java.util.concurrent.CompletableFuture<>();
		long queued = System.nanoTime();
		assertTrue(measuredTransport.submit(() -> {
			queueNanos.add(System.nanoTime() - queued);
			try { result.complete(operation.get()); } catch (Throwable failure) { result.completeExceptionally(failure); }
		}, () -> result.completeExceptionally(new IllegalStateException("Unexpected ingress rejection"))));
		return result.get(30, java.util.concurrent.TimeUnit.SECONDS);
	}

	@Test void isolatedJdbcLifecyclePressure() throws Exception {
		String url = System.getenv("R4_TEST_JDBC_URL");
		org.junit.jupiter.api.Assumptions.assumeTrue(url != null, "Opt-in isolated R4 database required");
		System.out.println("R4_MEASUREMENT_PID=" + java.lang.ProcessHandle.current().pid());
		assertTrue(url.startsWith("jdbc:mariadb://127.0.0.1:"));
		String password = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(System.getenv("R4_TEST_PASSWORD_FILE"))), java.nio.charset.StandardCharsets.UTF_8).trim();
		com.fumbbl.ffb.server.match.JdbcMatchRepository.Connections connections = () -> java.sql.DriverManager.getConnection(url, "root", password);
		String databaseVersion;
		JsonObject databaseConfig;
		try (java.sql.Connection connection = connections.open(); java.sql.Statement statement = connection.createStatement();
			java.sql.ResultSet rows = statement.executeQuery("SELECT version, VERSION(), @@max_allowed_packet, @@innodb_flush_log_at_trx_commit, @@sync_binlog FROM ffb_local_schema")) {
			assertTrue(rows.next()); assertEquals(6, rows.getInt(1)); databaseVersion = rows.getString(2);
			databaseConfig = new JsonObject().add("schema", 6).add("driver", connection.getMetaData().getDriverVersion())
				.add("maxAllowedPacket", rows.getLong(3)).add("innodbFlushLogAtTrxCommit", rows.getInt(4)).add("syncBinlog", rows.getInt(5));
		}
		RosterCatalog catalog = new RosterCatalog();
		// Frozen synthetic source teams are in memory; prepared documents, checkpoints and results use real JDBC.
		SavedTeamService teams = new SavedTeamService(new Teams(), catalog);
		MatchService matches = new MatchService(new com.fumbbl.ffb.server.match.JdbcMatchRepository(connections::open), teams, catalog);
		RecoveryRepository recovery = new com.fumbbl.ffb.server.match.JdbcRecoveryRepository(connections::open);
		measuredServer = new TestServer();
		measuredTransport = new com.fumbbl.ffb.server.local.BrowserMatchTransport(measuredServer.getServer());
		measuredWorker = new Thread(measuredServer.getServer().getCommunication(), "r4-measured-communication"); measuredWorker.start();
		SetupApplication application = new SetupApplication(measuredServer.getServer(), matches, recovery, true);
		String home = teams.create("home", draft(catalog)).document.teamId;
		String away = teams.create("away", draft(catalog)).document.teamId;
		List<Long> reconnect = new ArrayList<>();
		com.eclipsesource.json.JsonArray ids = new com.eclipsesource.json.JsonArray();
		long started = System.nanoTime(), checkpointBytes = 0, replayBytes = 0;
		for (int lifetime = 0; lifetime < 34; lifetime++) {
			String id = matches.create("home", java.util.UUID.randomUUID().toString(), home, 1, "away").document.matchId;
			ids.add(id); matches.join("away", "join", id, 1, away, 1);
			accepted(onWorker(() -> application.activate("home", activate(id, "activate").toString())));
			JsonObject last = finish(application, id); String role = last.getString("testRole", null); last.remove("testRole");
			assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
			assertTrue(application.takeCompletionBroadcast(id));
			RecoveryRepository.Record durable = recovery.find(id);
			checkpointBytes = Math.max(checkpointBytes, durable.json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
			replayBytes = Math.max(replayBytes, matches.result("home", id).json().getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
			long reconnectStarted = System.nanoTime();
			accepted(onWorker(() -> application.handle("away", load(id, "reconnect")))); reconnect.add(System.nanoTime() - reconnectStarted);
			assertTrue(accepted(onWorker(() -> application.handle(role, last))).getBoolean("duplicate", false));
			assertEquals(durable.json, recovery.find(id).json); assertEquals(durable.generation, recovery.find(id).generation);
			assertEquals("MATCH_COMPLETED", onWorker(() -> application.handle(role, JsonObject.readFrom(last.toString()).set("requestId", "fresh"))).getString("code", null));
			assertFalse(application.takeCompletionBroadcast(id));
			// A deliberately blocked async recipient must disconnect without retaining messages or touching durable work.
			SlowSink sink = new SlowSink();
			com.fumbbl.ffb.server.local.BrowserMatchDelivery delivery = new com.fumbbl.ffb.server.local.BrowserMatchDelivery(sink, measuredTransport.getMetrics(), 64, 256 * 1024);
			for (int frame = 0; frame < 65; frame++) delivery.send("terminal-state-fixture");
			assertEquals(1013, sink.closeCode);
			assertEquals(0, measuredTransport.getMetrics().toJson().getLong("deliveryQueueDepth", -1));
		}
		Collections.sort(actionNanos); Collections.sort(reconnect); Collections.sort(queueNanos);
		JsonObject result = new JsonObject().add("workload", "34 serial native full matches; MariaDB/JDBC; deterministic kickoff fixtures; real communication worker and bounded ingress; 34 blocked delivery sinks")
			.add("databaseVersion", databaseVersion).add("java", System.getProperty("java.runtime.version"))
			.add("databaseConfig", databaseConfig).add("maxSnapshotBytes", maxSnapshotBytes)
			.add("elapsedMs", (System.nanoTime() - started) / 1000000).add("acceptedActions", actionNanos.size())
			.add("acceptedActionP95Ms", actionNanos.get((int) Math.ceil(actionNanos.size() * .95) - 1) / 1000000.0)
			.add("reconnectP95Ms", reconnect.get((int) Math.ceil(reconnect.size() * .95) - 1) / 1000000.0)
			.add("queueP95Ms", queueNanos.get((int) Math.ceil(queueNanos.size() * .95) - 1) / 1000000.0)
			.add("transport", measuredTransport.getMetrics().toJson())
			.add("sampledHeapPeakBytes", sampledHeapPeak).add("maxCheckpointBytes", checkpointBytes).add("maxReplayBytes", replayBytes)
			.add("lifecycle", application.lifecycleMetrics()).add("retainedSyntheticMatches", ids);
		java.nio.file.Path output = java.nio.file.Files.createTempFile(java.nio.file.Paths.get("target"), "r4-jdbc-lifecycle-", ".json");
		java.nio.file.Files.write(output, result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
		System.out.println("R4 JDBC lifecycle measurement: " + output + " " + result);
	}

	@Test void isolatedJdbcRetentionSerializesLastSlotAndPreservesExistingCheckpoint() throws Exception {
		String url = System.getenv("R4_TEST_JDBC_URL");
		org.junit.jupiter.api.Assumptions.assumeTrue(url != null, "Opt-in isolated R4 database required");
		assertEquals("jdbc:mariadb://127.0.0.1:23320/ffb_local", url);
		String password = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(System.getenv("R4_TEST_PASSWORD_FILE"))), java.nio.charset.StandardCharsets.UTF_8).trim();
		com.fumbbl.ffb.server.match.JdbcRecoveryRepository.Connections connections = () -> java.sql.DriverManager.getConnection(url, "root", password);
		int before;
		try (java.sql.Connection connection = connections.open(); java.sql.Statement statement = connection.createStatement();
			java.sql.ResultSet rows = statement.executeQuery("SELECT COUNT(*) FROM ffb_match_recovery")) { assertTrue(rows.next()); before = rows.getInt(1); }
		assertTrue(before < com.fumbbl.ffb.server.match.JdbcRecoveryRepository.MAX_RETAINED_RECORDS - 1);
		RecoveryRepository repository = new com.fumbbl.ffb.server.match.JdbcRecoveryRepository(connections, before + 1);
		List<RecoveryRepository.Record> records = new ArrayList<>();
		for (int index = 0; index < 2; index++) {
			Fixture fixture = fixture();
			new com.fumbbl.ffb.server.match.JdbcMatchRepository(connections::open).insert(fixture.repository.rows.get(fixture.id));
			SetupSession initial = new SetupSession(new TestServer().getServer(), fixture.matches.load("home", fixture.id).document, -10 - index, true, true);
			records.add(new RecoveryRepository.Record(fixture.id, 1, initial.recoveryArtifact()));
		}
		java.util.concurrent.ExecutorService writers = java.util.concurrent.Executors.newFixedThreadPool(2);
		java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
		List<java.util.concurrent.Future<Boolean>> outcomes = new ArrayList<>();
		try {
			for (RecoveryRepository.Record record : records) outcomes.add(writers.submit(() -> {
				start.await();
				try { return repository.save(record, 0); } catch (RecoveryRepository.RetentionLimit full) { return false; }
			}));
			start.countDown();
			boolean first = outcomes.get(0).get(20, java.util.concurrent.TimeUnit.SECONDS);
			boolean second = outcomes.get(1).get(20, java.util.concurrent.TimeUnit.SECONDS);
			assertTrue(first != second, "Exactly one last-slot admission");
			RecoveryRepository.Record winner = records.get(first ? 0 : 1), loser = records.get(first ? 1 : 0);
			assertFalse(repository.save(winner, 0));
			assertTrue(repository.save(new RecoveryRepository.Record(winner.matchId, 2, winner.json), 1));
			assertEquals(winner.json, new com.fumbbl.ffb.server.match.JdbcRecoveryRepository(connections, before + 1).find(winner.matchId).json);
			org.junit.jupiter.api.Assertions.assertThrows(RecoveryRepository.RetentionLimit.class, () -> repository.save(loser, 0));
			assertEquals(null, repository.find(loser.matchId));
			JsonObject evidence = new JsonObject().add("beforeRecords", before).add("fixtureLimit", before + 1)
				.add("admittedMatch", winner.matchId).add("rejectedPreparedMatch", loser.matchId).add("preservedGeneration", 2);
			java.nio.file.Path output = java.nio.file.Files.createTempFile(java.nio.file.Paths.get("target"), "r4-retention-", ".json");
			java.nio.file.Files.write(output, evidence.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
			System.out.println("R4 retention evidence: " + evidence);
		} finally { writers.shutdownNow(); assertTrue(writers.awaitTermination(20, java.util.concurrent.TimeUnit.SECONDS)); }
	}

	private static final class SlowSink implements com.fumbbl.ffb.server.local.BrowserMatchDelivery.Sink {
		private int closeCode;
		@Override public boolean isOpen() { return closeCode == 0; }
		@Override public void close(int code, String reason) { closeCode = code; }
		@Override public void send(String message, com.fumbbl.ffb.server.local.BrowserMatchDelivery.Completion completion) { /* deliberately never complete */ }
	}
	@Test void completedLifetimesReleaseCapacityAndPreserveDurableRetries() throws Exception {
		long started = System.nanoTime();
		List<Long> reconnectNanos = new ArrayList<>();
		long checkpointBytes = 0, replayBytes = 0;
		Fixture fixture = fixture();
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true);
		for (int lifetime = 0; lifetime < 34; lifetime++) {
			Fixture next = lifetime == 0 ? fixture : fixture();
			fixture.repository.rows.putAll(next.repository.rows);
			accepted(application.activate("home", activate(next.id, "activate").toString()));
			assertEquals(1, application.lifecycleMetrics().getInt("residentSessions", -1));
			JsonObject last = finish(application, next.id);
			String role = last.getString("testRole", null); last.remove("testRole");
			assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
			assertTrue(application.takeCompletionBroadcast(next.id));
			String checkpoint = fixture.recovery.rows.get(next.id).json;
			checkpointBytes = Math.max(checkpointBytes, checkpoint.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
			replayBytes = Math.max(replayBytes, fixture.matches.result("home", next.id).json().getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
			int writes = fixture.recovery.writes;
			assertTrue(accepted(application.handle(role, last)).getBoolean("duplicate", false));
			long reconnectStarted = System.nanoTime();
			accepted(application.handle("away", load(next.id, "reconnect")));
			reconnectNanos.add(System.nanoTime() - reconnectStarted);
			assertFalse(application.takeCompletionBroadcast(next.id));
			assertEquals("MATCH_COMPLETED", application.handle(role, JsonObject.readFrom(last.toString()).set("requestId", "new-action")).getString("code", null));
			assertEquals("REQUEST_ID_REUSED", application.handle(role, JsonObject.readFrom(last.toString()).set("actionId", "different")).getString("code", null));
			assertTrue(application.activate("home", activate(next.id, "activate").toString()).getBoolean("duplicate", false));
			assertEquals(checkpoint, fixture.recovery.rows.get(next.id).json);
			assertEquals(writes, fixture.recovery.writes);
			assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		}
		assertEquals(34, application.lifecycleMetrics().getLong("completedReleases", -1));
		Collections.sort(actionNanos); Collections.sort(reconnectNanos);
		JsonObject measurement = new JsonObject().add("workload", "34 serial native full matches; in-memory repositories; deterministic kickoff fixtures; direct worker calls")
			.add("java", System.getProperty("java.runtime.version")).add("os", System.getProperty("os.name"))
			.add("processors", Runtime.getRuntime().availableProcessors()).add("maxHeapBytes", Runtime.getRuntime().maxMemory())
			.add("elapsedMs", (System.nanoTime() - started) / 1000000).add("acceptedActions", actionNanos.size())
			.add("acceptedActionP95Ms", actionNanos.get((int) Math.ceil(actionNanos.size() * .95) - 1) / 1000000.0)
			.add("reconnectP95Ms", reconnectNanos.get((int) Math.ceil(reconnectNanos.size() * .95) - 1) / 1000000.0)
			.add("sampledHeapPeakBytes", sampledHeapPeak).add("maxCheckpointBytes", checkpointBytes).add("maxReplayBytes", replayBytes)
			.add("lifecycle", application.lifecycleMetrics());
		java.nio.file.Path output = java.nio.file.Files.createTempFile(java.nio.file.Paths.get("target"), "r4-lifecycle-", ".json");
		java.nio.file.Files.write(output, measurement.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
		System.out.println("R4 lifecycle measurement: " + output + " " + measurement);
	}

	@Test void completionWriteFailureKeepsTerminalRecoverableUntilReconciled() throws Exception {
		Fixture fixture = fixture();
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		fixture.repository.failCompletion = true;
		finish(application, fixture.id);
		assertEquals(1, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertFalse(application.takeCompletionBroadcast(fixture.id));
		fixture.repository.failCompletion = false;
		accepted(application.handle("home", load(fixture.id, "reconcile")));
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertTrue(application.takeCompletionBroadcast(fixture.id));
	}

	@Test void ambiguousCompletionCommitReconcilesRetryAndBroadcastWithoutAnotherWrite() throws Exception {
		Fixture fixture = fixture();
		MutableClock clock = new MutableClock();
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		fixture.repository.unknownCompletion = true;
		JsonObject last = finish(application, fixture.id);
		String role = last.getString("testRole", null); last.remove("testRole");
		assertEquals(1, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertFalse(application.takeCompletionBroadcast(fixture.id));
		int writes = fixture.recovery.writes;
		clock.now = 31 * 60 * 1000L;
		assertEquals("MATCH_COMPLETED", application.handle(role, JsonObject.readFrom(last.toString()).set("requestId", "fresh")).getString("code", null));
		assertFalse(application.takeCompletionBroadcast(fixture.id));
		assertEquals(1, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertTrue(accepted(application.handle(role, last)).getBoolean("duplicate", false));
		assertTrue(application.takeCompletionBroadcast(fixture.id));
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertTrue(accepted(application.handle(role, last)).getBoolean("duplicate", false));
		assertFalse(application.takeCompletionBroadcast(fixture.id));
		assertEquals(writes, fixture.recovery.writes);
		assertTrue(accepted(app(fixture).handle(role, last)).getBoolean("duplicate", false));
	}

	@Test void fullPoolRejectsThenIdleEvictionRestoresExactLostAcknowledgement() throws Exception {
		Fixture fixture = fixture(); MutableClock clock = new MutableClock();
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		JsonObject before = accepted(application.handle("home", load(fixture.id, "before"))).get("state").asObject();
		JsonObject request = choice(fixture.id, "lost-ack", before, "heads");
		accepted(application.handle(actor(before), request));
		String checkpoint = fixture.recovery.rows.get(fixture.id).json;
		Fixture completed = fixture(); fixture.repository.rows.putAll(completed.repository.rows);
		accepted(application.activate("home", activate(completed.id, "activate").toString()));
		JsonObject terminalRequest = finish(application, completed.id);
		String terminalRole = terminalRequest.getString("testRole", null); terminalRequest.remove("testRole");
		assertTrue(application.takeCompletionBroadcast(completed.id));
		for (int index = 1; index < 32; index++) {
			Fixture next = fixture(); fixture.repository.rows.putAll(next.repository.rows);
			accepted(application.activate("home", activate(next.id, "activate").toString()));
		}
		accepted(application.handle("away", load(completed.id, "completed-at-capacity")));
		assertTrue(accepted(application.handle(terminalRole, terminalRequest)).getBoolean("duplicate", false));
		assertEquals(32, application.lifecycleMetrics().getInt("residentSessions", -1));
		Fixture waiting = fixture(); fixture.repository.rows.putAll(waiting.repository.rows);
		clock.now = 30 * 60 * 1000L - 1;
		assertEquals("ACTIVATION_LIMIT", application.activate("home", activate(waiting.id, "activate").toString()).getString("code", null));
		assertFalse(fixture.recovery.rows.containsKey(waiting.id));
		clock.now++;
		assertEquals("AUTHENTICATION_REQUIRED", application.handle("intruder", load(fixture.id, "denied")).getString("code", null));
		assertEquals(32, application.lifecycleMetrics().getInt("residentSessions", -1));
		accepted(application.activate("home", activate(waiting.id, "activate").toString()));
		assertEquals(32, application.lifecycleMetrics().getLong("idleReleases", -1));
		assertEquals(1, application.lifecycleMetrics().getInt("residentSessions", -1));
		int writes = fixture.recovery.writes;
		assertTrue(accepted(application.handle(actor(before), request)).getBoolean("duplicate", false));
		assertEquals(checkpoint, fixture.recovery.rows.get(fixture.id).json);
		assertEquals(writes, fixture.recovery.writes);
		assertEquals(2, application.lifecycleMetrics().getInt("residentSessions", -1));
	}

	private static final class MutableClock extends java.time.Clock {
		private long now;
		MutableClock() { this(0L); }
		MutableClock(long now) { this.now = now; }
		void advance(long elapsed) { now += elapsed; }
		@Override public java.time.ZoneId getZone() { return java.time.ZoneOffset.UTC; }
		@Override public java.time.Clock withZone(java.time.ZoneId zone) { return this; }
		@Override public java.time.Instant instant() { return java.time.Instant.ofEpochMilli(now); }
		@Override public long millis() { return now; }
	}

	@Test void failedCheckpointDoesNotRetainAnEngineOrExecuteOnLoad() throws Exception {
		Fixture fixture = fixture();
		SetupApplication application = app(fixture);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		java.lang.reflect.Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
		SetupSession session = (SetupSession) ((Map<?, ?>) field.get(application)).get(fixture.id);
		java.lang.reflect.Field stateField = SetupSession.class.getDeclaredField("state"); stateField.setAccessible(true);
		com.fumbbl.ffb.server.GameState engine = org.mockito.Mockito.spy((com.fumbbl.ffb.server.GameState) stateField.get(session));
		org.mockito.Mockito.doThrow(new IllegalStateException("injected native failure")).when(engine)
			.handleCommand(org.mockito.ArgumentMatchers.any(com.fumbbl.ffb.server.net.ReceivedCommand.class));
		stateField.set(session, engine);
		JsonObject before = accepted(application.handle("home", load(fixture.id, "before"))).get("state").asObject();
		assertEquals("SESSION_UNAVAILABLE", application.handle(actor(before), choice(fixture.id, "fail", before, "heads")).getString("code", null));
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		assertEquals(1, application.lifecycleMetrics().getLong("failedReleases", -1));
		SetupApplication restored = app(fixture);
		String artifact = fixture.recovery.rows.get(fixture.id).json;
		assertEquals("SESSION_UNAVAILABLE", restored.handle("home", load(fixture.id, "failed")).getString("code", null));
		assertEquals(0, restored.lifecycleMetrics().getInt("residentSessions", -1));
		assertEquals(artifact, fixture.recovery.rows.get(fixture.id).json);
	}

	/** Native complete game with deterministic kickoff fixture dice; no product dice inputs. */
	private JsonObject finish(SetupApplication application, String id) throws Exception {
		java.lang.reflect.Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
		SetupSession session = (SetupSession) ((Map<?, ?>) field.get(application)).get(id);
		java.lang.reflect.Field stateField = SetupSession.class.getDeclaredField("state"); stateField.setAccessible(true);
		com.fumbbl.ffb.server.GameState engine = (com.fumbbl.ffb.server.GameState) stateField.get(session);
		JsonObject last = null; String role = null;
		for (int index = 0; index < 160 && !session.isComplete(); index++) {
			JsonObject view = accepted(onWorker(() -> application.handle("home", load(id, "view")))).get("state").asObject();
			role = view.getString("actor", null);
			if (!view.get("prompt").isNull()) {
				JsonObject prompt = view.get("prompt").asObject();
				last = choice(id, "decision-" + index, view, prompt.get("options").asArray().get(0).asString());
			} else if ("SETUP".equals(view.getString("phase", null))) {
				last = load(id, "confirm-" + index).set("operation", "confirm").add("expectedRevision", view.get("revision"));
			} else {
				JsonObject action = view.get("actions").asArray().get(0).asObject();
				if ("READY_FOR_KICKOFF".equals(view.getString("phase", null))) {
					engine.getDiceRoller().clearTestRolls();
					TestRolls.on(engine).general(1, 1, 3, 3, 3, 3, 3, 3);
					action = view.get("actions").asArray().get(82).asObject();
				} else for (com.eclipsesource.json.JsonValue candidate : view.get("actions").asArray())
					if ("endTurn".equals(candidate.asObject().getString("kind", null))) action = candidate.asObject();
				role = action.getString("actor", null);
				last = load(id, "action-" + index).set("operation", "action").add("expectedRevision", view.get("revision")).add("actionId", action.get("id"));
			}
			long actionStarted = System.nanoTime();
			String selectedRole = role; JsonObject selectedRequest = last;
			JsonObject response = onWorker(() -> application.handle(selectedRole, selectedRequest));
			actionNanos.add(System.nanoTime() - actionStarted);
			if (response.get("state") != null && !response.get("state").isNull())
				maxSnapshotBytes = Math.max(maxSnapshotBytes, response.get("state").toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
			sampledHeapPeak = Math.max(sampledHeapPeak, java.lang.management.ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed());
			if (!session.isComplete() || !("PERSISTENCE_FAILED".equals(response.getString("code", null))
				|| "MATCH_OUTCOME_UNKNOWN".equals(response.getString("code", null)))) accepted(response);
		}
		assertTrue(session.isComplete());
		return last.add("testRole", role);
	}
	@Test
	void recreatedApplicationRestoresAcceptedActivationAndRequestRetry() throws Exception {
		Fixture fixture = fixture();
		SetupApplication first = app(fixture);
		assertEquals("ACCEPTED", first.activate("home", activate(fixture.id, "activate").toString()).getString("code", null));
		assertNotNull(fixture.recovery.rows.get(fixture.id));
		JsonObject view = accepted(first.handle("home", load(fixture.id, "load"))).get("state").asObject();
		JsonObject choice = choice(fixture.id, "choose", view, "heads");
		assertEquals("ACCEPTED", first.handle(actor(view), choice).getString("code", null));

		SetupApplication restarted = app(fixture);
		assertTrue(restarted.activate("home", activate(fixture.id, "activate").toString()).getBoolean("duplicate", false));
		assertTrue(restarted.handle(actor(view), choice).getBoolean("duplicate", false));
		assertEquals("ACCEPTED", restarted.handle("home", load(fixture.id, "after")).getString("code", null));
	}

	@Test
	void unauthorizedCallsDoNotReadOrWriteRecoveryArtifacts() throws Exception {
		Fixture fixture = fixture();
		SetupApplication application = app(fixture);
		assertEquals("AUTHENTICATION_REQUIRED", application.activate("intruder", activate(fixture.id, "activate").toString()).getString("code", null));
		assertEquals("AUTHENTICATION_REQUIRED", application.handle("intruder", load(fixture.id, "load")).getString("code", null));
		assertEquals(0, fixture.recovery.reads);
		assertEquals(0, fixture.recovery.writes);
	}

	@Test
	void activatedMatchWithoutRecoveryArtifactFailsClosedWithoutReinitializing() throws Exception {
		Fixture fixture = fixture();
		fixture.matches.activate("home", "activate", fixture.id, 2);
		JsonObject response = app(fixture).handle("home", load(fixture.id, "load"));
		assertEquals("SESSION_UNAVAILABLE", response.getString("code", null));
		assertTrue(fixture.recovery.rows.isEmpty());
	}

	@Test
	void corruptRecoveryArtifactIsRejected() throws Exception {
		Fixture fixture = fixture();
		fixture.matches.activate("home", "activate", fixture.id, 2);
		fixture.recovery.rows.put(fixture.id, new RecoveryRepository.Record(fixture.id, 1, "{}"));
		assertEquals("RECOVERY_CORRUPT", app(fixture).handle("home", load(fixture.id, "load")).getString("code", null));
	}

	@Test
	void stagingFailureLeavesActivationRetryable() throws Exception {
		Fixture fixture = fixture();
		fixture.recovery.failure = Failure.BEFORE_WRITE;
		SetupApplication application = app(fixture);
		assertEquals("PERSISTENCE_FAILED", application.activate("home", activate(fixture.id, "activate").toString()).getString("code", null));
		assertEquals("AWAITING_SETUP", fixture.matches.load("home", fixture.id).document.lifecycle.name());
		assertEquals("ACCEPTED", application.activate("home", activate(fixture.id, "activate").toString()).getString("code", null));
		assertNotNull(fixture.recovery.rows.get(fixture.id));
	}

	@Test void retentionAdmissionRejectsBeforeActivationAndPreservesExistingRecovery() throws Exception {
		Fixture fixture = fixture(); SetupApplication application = app(fixture);
		fixture.recovery.full = true;
		assertEquals("RETENTION_LIMIT", application.activate("home", activate(fixture.id, "activate").toString()).getString("code", null));
		assertEquals("AWAITING_SETUP", fixture.matches.load("home", fixture.id).document.lifecycle.name());
		assertTrue(fixture.recovery.rows.isEmpty());
		assertEquals(1, application.lifecycleMetrics().getLong("retentionRejections", -1));
		fixture.recovery.full = false;
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		fixture.recovery.full = true;
		JsonObject state = accepted(application.handle("home", load(fixture.id, "current"))).get("state").asObject();
		JsonObject command = choice(fixture.id, "choice-at-capacity", state, "heads");
		accepted(application.handle(actor(state), command));
		assertTrue(accepted(application.handle(actor(state), command)).getBoolean("duplicate", false));
	}

	@Test
	void ambiguousCheckpointEvictsAndRetryReconcilesCommittedOrLostWrite() throws Exception {
		for (Failure failure : new Failure[] { Failure.COMMITTED_UNKNOWN, Failure.BEFORE_WRITE }) {
			Fixture fixture = fixture();
			SetupApplication application = app(fixture);
			assertEquals("ACCEPTED", application.activate("home", activate(fixture.id, "activate").toString()).getString("code", null));
			JsonObject view = accepted(application.handle("home", load(fixture.id, "load"))).get("state").asObject();
			JsonObject choice = choice(fixture.id, "choose", view, "heads");
			fixture.recovery.failure = failure;
			assertEquals(failure == Failure.COMMITTED_UNKNOWN ? "MATCH_OUTCOME_UNKNOWN" : "PERSISTENCE_FAILED",
				application.handle(actor(view), choice).getString("code", null));
			RecoveryRepository.Record durable = fixture.recovery.rows.get(fixture.id);
			assertEquals(failure == Failure.COMMITTED_UNKNOWN ? 2 : 1, durable.generation);
			JsonObject retry = application.handle(actor(view), choice);
			assertEquals("ACCEPTED", retry.getString("code", null));
			assertEquals(failure == Failure.COMMITTED_UNKNOWN, retry.getBoolean("duplicate", false));
			assertEquals(2, fixture.recovery.rows.get(fixture.id).generation);
		}
	}

	private SetupApplication app(Fixture fixture) throws Exception { return new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery); }

	@Test void defaultDeploymentCheckpointFailureAndLostAcknowledgementReconcileAtomically() throws Exception {
		for (Failure failure : new Failure[] { Failure.COMMITTED_UNKNOWN, Failure.BEFORE_WRITE }) {
			Fixture fixture = fixture();
			SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true);
			accepted(application.activate("home", activate(fixture.id, "activate").toString()));
			JsonObject first = accepted(application.handle("home", load(fixture.id, "first"))).get("state").asObject();
			JsonObject receive = accepted(application.handle(actor(first), choice(fixture.id, "coin", first, "heads"))).get("state").asObject();
			JsonObject transition = choice(fixture.id, "receive", receive, "receive");
			fixture.recovery.failure = failure;
			assertEquals(failure == Failure.COMMITTED_UNKNOWN ? "MATCH_OUTCOME_UNKNOWN" : "PERSISTENCE_FAILED",
				application.handle(actor(receive), transition).getString("code", null));
			SetupApplication restarted = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true);
			JsonObject response = accepted(restarted.handle(actor(receive), transition));
			assertEquals(failure == Failure.COMMITTED_UNKNOWN, response.getBoolean("duplicate", false));
			JsonObject state = response.get("state").asObject();
			assertEquals("SETUP", state.getString("phase", null));
			int deployed = 0;
			for (com.eclipsesource.json.JsonValue player : state.get("players").asArray()) if (!player.asObject().get("x").isNull()) deployed++;
			assertEquals(11, deployed);
			String artifact = fixture.recovery.rows.get(fixture.id).json;
			assertTrue(restarted.handle(actor(receive), transition).getBoolean("duplicate", false));
			assertEquals(artifact, fixture.recovery.rows.get(fixture.id).json);
		}
	}

	@Test void mutualSaveRequiresOtherPlayerPersistsAcrossRestartAndAbandonsAfterThirtyDays() throws Exception {
		Fixture fixture = fixture(); MutableClock clock = new MutableClock(1_700_000_000_000L);
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock, true);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		JsonObject view = accepted(application.handle("home", load(fixture.id, "load"))).get("state").asObject();
		JsonObject request = save(fixture.id, "save-request", view, "saveRequest", null);
		JsonObject pending = accepted(application.handle("home", request)).get("state").asObject();
		assertEquals("SAVE_PENDING", pending.get("saveResume").asObject().getString("status", null));
		String proposal = pending.get("saveResume").asObject().getString("proposalId", null);
		assertEquals("SAVE_PROPOSAL_OWNER", application.handle("home", save(fixture.id, "self-accept", view, "saveAccept", proposal)).getString("code", null));
		SetupApplication restarted = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock, true);
		JsonObject suspended = accepted(restarted.handle("away", save(fixture.id, "save-accept", view, "saveAccept", proposal))).get("state").asObject();
		assertEquals("SUSPENDED", suspended.get("saveResume").asObject().getString("status", null));
		assertEquals("MATCH_SUSPENDED", restarted.handle(actor(view), choice(fixture.id, "blocked-action", view, "heads")).getString("code", null));
		assertTrue(restarted.handle("away", save(fixture.id, "save-accept", view, "saveAccept", proposal)).getBoolean("duplicate", false));
		clock.advance(30L * 24 * 60 * 60 * 1000L + 1L);
		assertEquals("MATCH_ABANDONED", restarted.handle("home", load(fixture.id, "expired")).getString("code", null));
		JsonObject payload = JsonObject.readFrom(fixture.recovery.rows.get(fixture.id).json).get("payload").asObject();
		assertTrue(payload.get("saveResume").asObject().getBoolean("abandoned", false));
	}

	@Test void lostSaveAcceptanceAcknowledgementReconcilesWithoutASecondSuspension() throws Exception {
		Fixture fixture = fixture(); MutableClock clock = new MutableClock(1_700_000_000_000L);
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock, true);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		JsonObject view = accepted(application.handle("home", load(fixture.id, "load"))).get("state").asObject();
		JsonObject pending = accepted(application.handle("home", save(fixture.id, "request", view, "saveRequest", null))).get("state").asObject();
		String proposal = pending.get("saveResume").asObject().getString("proposalId", null);
		JsonObject accept = save(fixture.id, "accept", view, "saveAccept", proposal);
		fixture.recovery.failure = Failure.COMMITTED_UNKNOWN;
		assertEquals("MATCH_OUTCOME_UNKNOWN", application.handle("away", accept).getString("code", null));
		SetupApplication restarted = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock, true);
		JsonObject reconciled = accepted(restarted.handle("away", accept));
		assertTrue(reconciled.getBoolean("duplicate", false));
		assertEquals("SUSPENDED", reconciled.get("state").asObject().get("saveResume").asObject().getString("status", null));
	}

	@Test void cancelWinsTheSingleWorkerRaceWithAnOtherwiseValidAcceptance() throws Exception {
		Fixture fixture = fixture(); MutableClock clock = new MutableClock(1_700_000_000_000L);
		SetupApplication application = new SetupApplication(new TestServer().getServer(), fixture.matches, fixture.recovery, true, clock, true);
		accepted(application.activate("home", activate(fixture.id, "activate").toString()));
		JsonObject view = accepted(application.handle("home", load(fixture.id, "load"))).get("state").asObject();
		JsonObject pending = accepted(application.handle("home", save(fixture.id, "request", view, "saveRequest", null))).get("state").asObject();
		String proposal = pending.get("saveResume").asObject().getString("proposalId", null);
		JsonObject cancelled = accepted(application.handle("home", save(fixture.id, "cancel", view, "saveCancel", proposal))).get("state").asObject();
		assertEquals("ACTIVE", cancelled.get("saveResume").asObject().getString("status", null));
		assertEquals("SAVE_PROPOSAL_MISSING", application.handle("away", save(fixture.id, "accept", view, "saveAccept", proposal)).getString("code", null));
	}

	private JsonObject accepted(JsonObject response) { assertEquals("ACCEPTED", response.getString("code", null)); return response; }
	private JsonObject activate(String id, String requestId) {
		return new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "activate")
			.add("requestId", requestId).add("matchId", id).add("expectedRevision", 2);
	}
	private JsonObject load(String id, String requestId) {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load").add("requestId", requestId).add("matchId", id);
	}
	private JsonObject choice(String id, String requestId, JsonObject view, String option) {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", "choice").add("requestId", requestId)
			.add("matchId", id).add("expectedRevision", view.get("revision")).add("promptId", view.get("prompt").asObject().get("id")).add("optionId", option);
	}
	private JsonObject save(String id, String requestId, JsonObject view, String operation, String proposalId) {
		JsonObject request = new JsonObject().add("version", 1).add("type", "setup").add("operation", operation).add("requestId", requestId)
			.add("matchId", id).add("expectedRevision", view.get("revision"));
		if (proposalId != null) request.add("proposalId", proposalId);
		return request;
	}
	private String actor(JsonObject view) { return view.getString("actor", null); }

	private Fixture fixture() throws Exception {
		RosterCatalog catalog = new RosterCatalog();
		Teams records = new Teams(); SavedTeamService teams = new SavedTeamService(records, catalog);
		Matches repository = new Matches();
		MatchService matches = new MatchService(repository, teams, catalog);
		String home = teams.create("home", draft(catalog)).document.teamId;
		String away = teams.create("away", draft(catalog)).document.teamId;
		String id = matches.create("home", java.util.UUID.randomUUID().toString(), home, 1, "away").document.matchId;
		matches.join("away", "join", id, 1, away, 1);
		return new Fixture(matches, id, new Recovery(), repository);
	}

	private TeamDraft draft(RosterCatalog catalog) {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player("p" + slot, slot, "lineman", Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>();
		for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
		return new TeamDraft(RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, null, players, resources);
	}

	private static final class Fixture {
		private final MatchService matches;
		private final String id;
		private final Recovery recovery;
		private final Matches repository;
		private Fixture(MatchService matches, String id, Recovery recovery, Matches repository) { this.matches = matches; this.id = id; this.recovery = recovery; this.repository = repository; }
	}

	private enum Failure { BEFORE_WRITE, COMMITTED_UNKNOWN }
	private static final class Recovery implements RecoveryRepository {
		private boolean full;
		private final Map<String, Record> rows = new LinkedHashMap<>();
		private int reads, writes;
		private Failure failure;
		public Record find(String matchId) { reads++; return rows.get(matchId); }
		public boolean save(Record record, long expected) throws SQLException {
			if (full && expected == 0 && !rows.containsKey(record.matchId)) throw new RecoveryRepository.RetentionLimit();
			writes++;
			Failure next = failure; failure = null;
			if (next == Failure.BEFORE_WRITE) throw new SQLException("injected before write");
			Record prior = rows.get(record.matchId);
			if ((expected == 0 && prior != null) || (expected != 0 && (prior == null || prior.generation != expected))) return false;
			Record saved = new Record(record.matchId, expected + 1, record.json); rows.put(record.matchId, saved);
			if (next == Failure.COMMITTED_UNKNOWN) throw new OutcomeUnknown(saved, new SQLException("lost acknowledgement"));
			return true;
		}
	}

	private static final class Teams implements SavedTeamRepository {
		private final Map<String, Record> rows = new LinkedHashMap<>();
		public Record find(String owner, String id) { Record row = rows.get(id); return row != null && owner.equals(row.owner) ? row : null; }
		public List<Record> list(String owner) { return new ArrayList<>(rows.values()); }
		public void insert(Record record) { rows.put(record.teamId, record); }
		public boolean replace(Record record, int expected) { rows.put(record.teamId, record); return true; }
	}

	private static final class Matches implements MatchRepository {
		private boolean failCompletion;
		private boolean unknownCompletion;
		private final Map<String, Record> rows = new LinkedHashMap<>();
		public Record find(String id) { return rows.get(id); }
		public void insert(Record record) { rows.put(record.matchId, record); }
		public boolean replace(Record record, int expected) throws SQLException {
			if (failCompletion && expected == 3) throw new SQLException("injected completion write failure");
			Record prior = rows.get(record.matchId); if (prior == null || prior.documentVersion != expected) return false;
			rows.put(record.matchId, record);
			if (unknownCompletion && expected == 3) throw new MatchRepository.OutcomeUnknown(record, new SQLException("completion acknowledgement lost"));
			return true;
		}
	}
}
