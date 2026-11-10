package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.ServerMode;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.BrowserMatchServlet;
import com.fumbbl.ffb.server.local.BrowserSavedTeamJson;
import com.fumbbl.ffb.server.local.BrowserV2Adapter;
import com.fumbbl.ffb.server.local.EnvelopeTransportProbe;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import com.google.firebase.auth.UserRecord;
import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.servlet.ServletHolder;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.management.ManagementFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Opt-in integrated local capture. Reports target failures without turning them into missing samples. */
class OperatingEnvelopeTest {
	@TempDir Path logs;
	private static final String PROJECT = "synthetic-envelope", ISSUER = "https://securetoken.google.com/" + PROJECT;
	private static final String HOME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", AWAY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
	private final JsonArray requests = new JsonArray(), resources = new JsonArray(), boundaries = new JsonArray();
	private int sequence;
	private String phase = "warmup";
	private final List<Client> clients = new ArrayList<>();
	private URI endpoint;
	private final HttpClient http = HttpClient.newHttpClient();

	@Test void captureIntegratedEnvelope() throws Exception {
		String base = System.getenv("ENVELOPE_TEST_URL"), password = System.getenv("ENVELOPE_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit isolated envelope schema required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_envelope_test")) throw new IllegalArgumentException("Synthetic loopback schema only");
		Path output = Path.of(System.getenv("ENVELOPE_TEST_OUTPUT"));
		Files.writeString(output.resolveSibling("java-pid.txt"), Long.toString(ProcessHandle.current().pid()));
		JsonObject report = new JsonObject().add("requests", requests).add("resources", resources)
			.add("provider", "production Firebase verification/cache/breaker with bounded SDK double; no external Firebase latency")
			.add("socketMix", "2 authenticated coaches, 1 authenticated spectator, 13 idle real TCP sockets; one active match at a time, 32 resident")
			.add("loggingLevel", 1).add("actionSchedule", "3 repetitions, 8 durable endTurn actions each; 500ms minimum interval plus completion time; lobby pair each iteration")
			.add("controlTimingAvailable", true).add("phaseBoundaries", boundaries);
		int databasePort = Integer.parseInt(base.split(":")[3].split("/")[0]);
		Properties properties = new Properties();
		FantasyFootballServer nativeServer = new FantasyFootballServer(ServerMode.STANDALONE, properties);
		nativeServer.setDebugLog(new DebugLog(nativeServer, logs.resolve("envelope.log").toFile(), logs.toFile(), 1));
		ServerCommunication worker = new ServerCommunication(nativeServer); nativeServer.setCommunication(worker);
		Thread engine = new Thread(worker, "envelope-single-engine"); engine.start();
		Server jetty = new Server();
		EnvelopeTransportProbe[] observation = new EnvelopeTransportProbe[1];
		var sampler = Executors.newSingleThreadScheduledExecutor();
		try (EnvelopeDatabaseProxy proxy = new EnvelopeDatabaseProxy(databasePort);
			JdbcRequestConnections connections = new JdbcRequestConnections("jdbc:mariadb://127.0.0.1:" + proxy.port()
				+ "/ffb_envelope_test?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1", "root", password, false)) {
			initialize(base, password);
			JdbcMatchRepository documents = new JdbcMatchRepository(connections::open);
			JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(connections::open, true);
			JdbcMatchMembershipRepository membership = new JdbcMatchMembershipRepository(connections);
			SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
			fixture.advanceToTurn(); fixture.session.startSaveResumeRetention(System.currentTimeMillis());
			Path seed = Path.of(System.getenv("ENVELOPE_SEED_FILE"));
			if (!Files.exists(seed)) Files.writeString(seed, fixture.session.recoveryArtifact());
			String initial = Files.readString(seed);
			JsonObject payload = JsonObject.readFrom(initial).get("payload").asObject();
			String seedId = payload.getString("matchId", fixture.document.matchId);
			report.add("seedSha256", java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(initial.getBytes(StandardCharsets.UTF_8))));
			List<String> ids = new ArrayList<>();
			for (int index = 0; index < 32; index++) {
				String id = "00000000-0000-0000-0000-%012d".formatted(index + 100); ids.add(id);
				Map<String, MatchDocument.Request> history = new LinkedHashMap<>();
				history.put("home\ncreate", new MatchDocument.Request("create|00000000-0000-0000-0000-000000000011|1|away"));
				history.put("away\njoin", new MatchDocument.Request("join|" + id + "|1|00000000-0000-0000-0000-000000000012|1"));
				history.put("home\nactivate", new MatchDocument.Request("activate|" + id + "|2"));
				MatchDocument document = new MatchDocument(id, 3, "away", MatchDocument.Lifecycle.ACTIVATED, fixture.document.home, fixture.document.away, history);
				documents.insert(new MatchRepository.Record(id, 3, new MatchJson().storageText(document)));
				String artifact = new RecoveryArtifactJson().encode(JsonObject.readFrom(payload.toString().replace(seedId, id)), 128 * 1024 * 1024);
				assertTrue(recovery.save(new RecoveryRepository.Record(id, 1, artifact), 0));
				membership.insert(new MatchMembership(id, HOME, "home")); membership.insert(new MatchMembership(id, AWAY, "away"));
			}
			MatchService matches = new MatchService(documents, null, new RosterCatalog());
			SetupApplication application = new SetupApplication(nativeServer, matches, recovery, true, true);
			application.configureStorageAdmission(connections::requireAvailable);
			AtomicBoolean providerOutage = new AtomicBoolean(); AtomicInteger providerCalls = new AtomicInteger();
			FirebaseAuth auth = mock(FirebaseAuth.class);
			when(auth.verifyIdToken(anyString(), anyBoolean())).thenAnswer(call -> {
				FirebaseToken token = mock(FirebaseToken.class); String role = call.getArgument(0);
				when(token.getUid()).thenReturn(role); when(token.getClaims()).thenReturn(Map.of("aud", PROJECT, "iss", ISSUER,
					"exp", System.currentTimeMillis() / 1000 + 3600, "auth_time", System.currentTimeMillis() / 1000 - 10)); return token;
			});
			when(auth.getUser(anyString())).thenAnswer(call -> {
				providerCalls.incrementAndGet();
				if (providerOutage.get()) { Thread.sleep(250); throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.AVAILABILITY); }
				UserRecord user = mock(UserRecord.class); when(user.isDisabled()).thenReturn(false); when(user.getTokensValidAfterTimestamp()).thenReturn(0L); return user;
			});
			try (FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(auth, PROJECT,
				new JdbcV2PrincipalDirectory(connections::open, Clock.systemUTC()))) {
				V2MatchAccess access = new V2MatchAccess(membership, verifier.liveDirectory(), Clock.systemUTC());
				BrowserV2Adapter adapter = new BrowserV2Adapter(verifier, access, application, matches, mock(V2PreparationService.class), mock(BrowserSavedTeamJson.class));
				ServerConnector connector = new ServerConnector(jetty); connector.setHost("127.0.0.1"); connector.setPort(0); jetty.addConnector(connector); connector.open();
				properties.setProperty("server.base", "http://127.0.0.1:" + connector.getLocalPort());
				ServletContextHandler context = new ServletContextHandler(); context.setContextPath("/"); JettyWebSocketServletContainerInitializer.configure(context, null);
				BrowserMatchServlet servlet = new BrowserMatchServlet(nativeServer, adapter); context.addServlet(new ServletHolder(servlet), "/browser/v2"); jetty.setHandler(context); jetty.start();
				endpoint = URI.create("ws://127.0.0.1:" + connector.getLocalPort() + "/browser/v2");
				EnvelopeTransportProbe probe = new EnvelopeTransportProbe(servlet); observation[0] = probe;
				sampler.scheduleAtFixedRate(() -> {
					probe.collect(); var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
					synchronized (resources) { resources.add(new JsonObject().add("atMillis", System.currentTimeMillis())
						.add("heapBytes", ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed())
						.add("processCpuNanos", os.getProcessCpuTime()).add("processCpuLoad", os.getProcessCpuLoad())); }
				}, 0, 100, TimeUnit.MILLISECONDS);
				Client home = connect("home"), away = connect("away");
				for (String id : ids) accepted(home, setup(id, "load"));
				report.add("residentAfterLoad", probe.control(application::lifecycleMetrics));
				assertEquals(32, report.get("residentAfterLoad").asObject().getInt("residentSessions", -1));
				Client spectator = connect("spectator");
				for (int index = 0; index < 13; index++) connect(null);
				report.add("admittedSockets", servlet.getTransportMetrics().getLong("activeConnections", -1));
				try (Client excess = new Client()) { report.add("seventeenthCloseCode", excess.closed.get(5, TimeUnit.SECONDS)); }
				for (int repeat = 0; repeat < 3; repeat++) {
					beginPhase(probe, "healthy-" + repeat); String id = ids.get(repeat);
					JsonObject state = accepted(home, setup(id, "load")).get("state").asObject(); accepted(away, setup(id, "load"));
					accepted(spectator, request("watch").add("matchId", id));
					for (int action = 0; action < 8; action++) {
						JsonObject command = action(id, state);
						Client actor = "home".equals(state.getString("actor", "")) ? home : away;
						state = accepted(actor, command).get("state").asObject();
						call(home, request("currentMatches").add("after", JsonValue.NULL));
						call(spectator, request("browse").add("includeDetails", true));
						Thread.sleep(500);
					}
				}
				beginPhase(probe, "reconnect"); String id = ids.get(3); JsonObject state = accepted(home, setup(id, "load")).get("state").asObject();
				JsonObject durable = action(id, state); boolean homeActor = "home".equals(state.getString("actor", ""));
				Client actor = homeActor ? home : away; JsonObject committed = accepted(actor, durable);
				actor.close(); probe.control(() -> null); if (homeActor) home = connect("home"); else away = connect("away");
				JsonObject duplicate = accepted(homeActor ? home : away, durable);
				report.add("reconnectDuplicate", duplicate.getBoolean("duplicate", false)).add("reconnectRevisionUnchanged",
					committed.get("state").asObject().getInt("revision", -1) == duplicate.get("state").asObject().getInt("revision", -2));
				SetupApplication restored = new SetupApplication(nativeServer, matches, recovery, true, true);
				JsonObject recovered = probe.control(() -> restored.handleWithOutcome("home", setup(id, "load").set("version", 1)).response());
				report.add("durableRecoveryCode", recovered.getString("code", "missing")).add("durableRecoveryRevision",
					recovered.get("state").asObject().getInt("revision", -1));
				report.add("committedRevision", committed.get("state").asObject().getInt("revision", -2));
                JsonObject restoredState = recovered.get("state").asObject(), committedState = committed.get("state").asObject();
                boolean sameState = true;
                for (String field : List.of("revision", "phase", "actor", "players", "ball", "homeScore", "awayScore", "turnMode"))
                    sameState &= java.util.Objects.equals(committedState.get(field), restoredState.get(field));
                report.add("durablePublicStateMatches", sameState);
                report.add("recoveryFixture", "one additional application instance rehydrates the durable state on the same owner thread; discarded at harness process exit, not a process-kill test");
                assertTrue(sameState, "Durable public state must survive rehydration");
				beginPhase(probe, "slow-recipient");
				clients.get(3).close(); Thread.sleep(100); probe.control(() -> null);
				CompletableFuture<JsonObject> slow = CompletableFuture.supplyAsync(() -> {
                    try { return probe.slowRecipient(nativeServer, adapter); } catch (Exception failure) { throw new java.util.concurrent.CompletionException(failure); }
                });
                Thread.sleep(200); accepted(home, setup(ids.get(0), "load"));
                report.add("slowRecipient", slow.get(10, TimeUnit.SECONDS));
				beginPhase(probe, "provider-outage"); Thread.sleep(5100); providerOutage.set(true); clients.get(4).close(); int callsBefore = providerCalls.get();
				for (int index = 0; index < 20; index++) { call(home, setup(ids.get(0), "load")); Thread.sleep(100); }
				report.add("providerOutageAttempts", providerCalls.get() - callsBefore);
				providerOutage.set(false); Thread.sleep(5100); callsBefore = providerCalls.get();
				accepted(home, setup(ids.get(0), "load")); report.add("providerRecoveryAttempts", providerCalls.get() - callsBefore);
				beginPhase(probe, "database-outage"); proxy.unavailable = true; clients.get(5).close(); int databaseBefore = proxy.attempts.get();
				for (int index = 0; index < 20; index++) { call(home, setup(ids.get(0), "load")); Thread.sleep(100); }
				report.add("databaseOutageAttempts", proxy.attempts.get() - databaseBefore);
				proxy.unavailable = false; Thread.sleep(5100); databaseBefore = proxy.attempts.get();
				accepted(home, setup(ids.get(0), "load")); report.add("databaseRecoveryConnections", proxy.attempts.get() - databaseBefore);
				beginPhase(probe, "completed-release");
				for (String match : ids) {
					JsonObject live = accepted(home, setup(match, "load")).get("state").asObject();
					call(home, setup(match, "concede").add("expectedRevision", live.getInt("revision", -1)));
				}
				report.add("residentAfterCompletion", probe.control(application::lifecycleMetrics));
				beginPhase(probe, "ingress-saturation");
				probe.pauseWorker(250);
                List<CompletableFuture<JsonObject>> burst = new ArrayList<>();
				for (int index = 0; index < 160; index++) {
                    long sentAt = System.nanoTime();
                    burst.add(home.send(request("currentMatches").add("after", JsonValue.NULL)).whenComplete((response, failure) -> {
                        synchronized (requests) { requests.add(new JsonObject().add("phase", "ingress-saturation").add("type", "currentMatches").add("operation", "")
                            .add("code", failure == null ? response.getString("code", "missing") : "CLOSED_OR_SEND_FAILED")
                            .add("endToEndMs", (System.nanoTime() - sentAt) / 1e6)); }
                    }));
                }
				int replies = 0, unanswered = 0; for (var pending : burst) { try { pending.get(3, TimeUnit.SECONDS); replies++; } catch (Exception failure) { unanswered++; } }
				report.add("burstSubmitted", burst.size()).add("burstReplies", replies).add("burstUnansweredOrClosed", unanswered);
				beginPhase(probe, "cleanup");
                for (Client client : clients) client.close();
				long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
				while (servlet.getTransportMetrics().getLong("activeConnections", -1) != 0 && System.nanoTime() < deadline) Thread.sleep(10);
				probe.control(() -> null); report.add("finalTransport", probe.evidence());
                assertEquals(0, probe.control(application::lifecycleMetrics).getInt("residentSessions", -1));
                assertEquals(0, servlet.getTransportMetrics().getLong("activeConnections", -1));
                assertEquals(0, probe.evidence().getLong("missingSamples", -1));
                assertTrue(report.getBoolean("reconnectDuplicate", false));
                assertTrue(report.getBoolean("reconnectRevisionUnchanged", false));
                assertEquals(report.getInt("committedRevision", -1), report.getInt("durableRecoveryRevision", -2));
                assertEquals(3, report.getInt("providerOutageAttempts", -1));
                assertEquals(1, report.getInt("providerRecoveryAttempts", -1));
                assertEquals(3, report.getInt("databaseOutageAttempts", -1));
			}
		} finally {
			for (Client client : clients) client.close(); sampler.shutdownNow(); sampler.awaitTermination(5, TimeUnit.SECONDS);
			if (observation[0] != null) report.set("finalTransport", observation[0].evidence());
			Files.writeString(output, report.toString());
			jetty.stop(); worker.shutdown(); engine.join(25000); nativeServer.shutdownResources();
		}
	}
	private void beginPhase(EnvelopeTransportProbe probe, String next) throws Exception {
        probe.control(() -> null); probe.collect();
        long count = 0; for (JsonValue row : probe.evidence().get("metrics").asObject().get("workerTasks").asArray()) count += row.asObject().getLong("count", 0);
        phase = next; boundaries.add(new JsonObject().add("phase", next).add("sequence", count).add("atMillis", System.currentTimeMillis()));
        System.out.println("ENVELOPE_PHASE " + next);
    }
    private void initialize(String url, String password) throws Exception {
		try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next(), "Schema must be newly owned and empty"); }
			sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (8)");
			for (String name : new String[] {"003-prepared-matches", "005-match-recovery", "006-v2-membership", "007-current-matches-index", "008-skill-use-preferences", "009-recovery-journal"})
				try (var input = getClass().getResourceAsStream("/local-schema/" + name + ".sql")) {
					for (String statement : new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";")) if (!statement.isBlank()) sql.execute(statement);
				}
			String spectator = "cccccccc-cccc-cccc-cccc-cccccccccccc";
			for (String role : new String[] {"home", "away", "spectator"}) {
				String account = "home".equals(role) ? HOME : "away".equals(role) ? AWAY : spectator;
				sql.executeUpdate("INSERT INTO ffb_v2_account VALUES ('" + account + "','ACTIVE')");
				sql.executeUpdate("INSERT INTO ffb_v2_identity VALUES ('" + ISSUER + "','" + role + "','" + account + "','ACTIVE')");
				sql.executeUpdate("INSERT INTO ffb_v2_account_scope VALUES ('" + account + "','SPECTATOR')");
				if (!"spectator".equals(role)) sql.executeUpdate("INSERT INTO ffb_v2_account_scope VALUES ('" + account + "','PLAYER')");
			}
		}
	}
	private JsonObject request(String type) { return new JsonObject().add("version", 2).add("type", type).add("requestId", "envelope-" + ++sequence); }
	private JsonObject setup(String id, String operation) { return request("setup").add("matchId", id).add("operation", operation); }
	private JsonObject action(String id, JsonObject state) {
		for (JsonValue value : state.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", "")))
			return setup(id, "action").add("expectedRevision", state.getInt("revision", -1)).add("actionId", value.asObject().get("id"));
		throw new AssertionError("Expected a regular turn for declared workload");
	}
	private Client connect(String role) throws Exception { Client client = new Client(); clients.add(client); if (role != null) accepted(client, request("authenticate").add("bearer", role)); return client; }
	private JsonObject accepted(Client client, JsonObject request) throws Exception { JsonObject response = call(client, request); assertEquals("ACCEPTED", response.getString("code", "missing"), response.toString()); return response; }
	private JsonObject call(Client client, JsonObject request) throws Exception {
		long start = System.nanoTime(); String code = "TIMEOUT_OR_CLOSED";
		try { JsonObject response = client.send(request).get(10, TimeUnit.SECONDS); code = response.getString("code", "missing"); return response; }
		finally { requests.add(new JsonObject().add("phase", phase).add("type", request.getString("type", ""))
			.add("operation", request.getString("operation", "")).add("code", code).add("endToEndMs", (System.nanoTime() - start) / 1e6)); }
	}
	private final class Client implements WebSocket.Listener, AutoCloseable {
		private final Map<String, CompletableFuture<JsonObject>> pending = new ConcurrentHashMap<>();
		private final StringBuilder text = new StringBuilder();
		private final CompletableFuture<Integer> closed = new CompletableFuture<>();
		private final WebSocket socket;
        private CompletableFuture<WebSocket> writing;
		Client() throws Exception { socket = http.newWebSocketBuilder().header("Origin", "http://localhost:5000").buildAsync(endpoint, this).get(10, TimeUnit.SECONDS); writing = CompletableFuture.completedFuture(socket); }
		@Override public void onOpen(WebSocket opened) { opened.request(1); }
		@Override public CompletionStage<?> onText(WebSocket opened, CharSequence part, boolean last) {
			text.append(part); if (last) { JsonObject response = JsonObject.readFrom(text.toString()); text.setLength(0);
				JsonValue key = response.get("requestId"); if (key != null && key.isString()) { var future = pending.remove(key.asString()); if (future != null) future.complete(response); } }
			opened.request(1); return null;
		}
		@Override public CompletionStage<?> onClose(WebSocket opened, int status, String reason) { closed.complete(status); fail(); return null; }
		@Override public void onError(WebSocket opened, Throwable failure) { closed.completeExceptionally(failure); fail(); }
		private void fail() { for (var future : pending.values()) future.completeExceptionally(new IllegalStateException("Socket closed")); }
		synchronized CompletableFuture<JsonObject> send(JsonObject request) {
			CompletableFuture<JsonObject> response = new CompletableFuture<>(); pending.put(request.getString("requestId", ""), response);
			writing = writing.thenCompose(ready -> ready.sendText(request.toString(), true));
            writing.whenComplete((sent, failure) -> { if (failure != null) response.completeExceptionally(failure); }); return response;
		}
		@Override public void close() { socket.abort(); fail(); }
	}
}
