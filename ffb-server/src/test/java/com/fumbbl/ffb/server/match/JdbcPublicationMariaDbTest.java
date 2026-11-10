package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.local.BrowserMatchServlet;
import com.fumbbl.ffb.server.local.BrowserSavedTeamJson;
import com.fumbbl.ffb.server.local.BrowserV2Adapter;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.net.ServerCommunication;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.servlet.ServletHolder;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Clock;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/** Actual SQL execution counts, current-state revocation and expiry under the real request/JDBC controls. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JdbcPublicationMariaDbTest {
	private static final String MATCH = "00000000-0000-0000-0000-000000000051";
	private static final String ISSUER = "https://securetoken.google.com/synthetic-publication";
	private String base, password, url;
	private boolean initialized;
	private final AtomicInteger queries = new AtomicInteger();
	private final AtomicLong millis = new AtomicLong(1_000);
	private final AtomicBoolean expireOnQuery = new AtomicBoolean();
	private final Clock clock = mock(Clock.class);
	private final CaptureRequestProbe requests = new CaptureRequestProbe();
	private JdbcRequestConnections connections;
	private JdbcV2PrincipalDirectory directory;

	@BeforeAll void schema() throws Exception {
		base = System.getenv("JDBC_BOUNDS_TEST_URL"); password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit synthetic publication database required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		url = base + "?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1";
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next(), "Synthetic schema must start empty"); }
			initialized = true;
			sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (9)");
			for (String name : new String[] {"003-prepared-matches", "006-v2-membership"}) try (InputStream input = getClass().getResourceAsStream("/local-schema/" + name + ".sql")) {
				for (String command : new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";")) if (!command.isBlank()) sql.execute(command);
			}
			sql.executeUpdate("INSERT INTO ffb_prepared_matches VALUES ('" + MATCH + "',3,'{}')");
		}
		when(clock.millis()).thenAnswer(ignored -> millis.get());
		connections = new JdbcRequestConnections(url, "root", password, true);
		directory = new JdbcV2PrincipalDirectory(this::counted, clock);
	}
	@BeforeEach void identities() throws Exception {
		millis.set(1_000); expireOnQuery.set(false);
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			for (String table : new String[] {"ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members"}) sql.executeUpdate("DELETE FROM " + table);
			for (int index = 0; index < 16; index++) {
				sql.executeUpdate("INSERT INTO ffb_v2_account VALUES ('" + account(index) + "','ACTIVE')");
				sql.executeUpdate("INSERT INTO ffb_v2_identity VALUES ('" + ISSUER + "','subject-" + index + "','" + account(index) + "','ACTIVE')");
				sql.executeUpdate("INSERT INTO ffb_v2_account_scope VALUES ('" + account(index) + "','PLAYER'),('" + account(index) + "','SPECTATOR')");
			}
			sql.executeUpdate("INSERT INTO ffb_v2_match_members VALUES ('" + MATCH + "','" + account(0) + "','home'),('" + MATCH + "','" + account(1) + "','away')");
		}
		queries.set(0);
	}
	@AfterAll void clean() throws Exception {
		if (connections != null) connections.close();
		if (!initialized) return;
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			for (String table : new String[] {"ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members", "ffb_prepared_matches", "ffb_local_schema"}) sql.execute("DROP TABLE IF EXISTS " + table);
		}
	}

	@Test void eachFamilyExecutesExactlyZeroOrOneRealSqlForZeroOneAndSixteenTargets() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) for (int count : new int[] {0, 1, 16}) {
			List<V2PublicationAuthorization.Target> targets = targets(family, count); int before = queries.get(); long started = System.nanoTime();
			V2PublicationAuthorization.Snapshot snapshot = requests.within(() -> directory.authorizePublication(MATCH, family, targets));
			assertEquals(count == 0 ? 0 : 1, queries.get() - before); assertEquals(count, snapshot.roles().size());
			assertTrue((System.nanoTime() - started) / 1_000_000 < 2_000);
			if (count == 16) {
				assertEquals("home", snapshot.role(0));
				assertEquals(family == V2PublicationAuthorization.Family.PREPARATION ? "home" : "away", snapshot.role(1));
				assertEquals(family == V2PublicationAuthorization.Family.PREPARATION ? "home" : "spectator", snapshot.role(15));
			}
			System.out.println("PUBLICATION_JDBC family=" + family + " targets=" + count + " queries=" + (queries.get() - before) + " elapsedMicros=" + (System.nanoTime() - started) / 1_000);
		}
	}
	@Test void accountIdentityScopeAndMembershipChangesDenyTheNextBatchAndRolesStayCurrent() throws Exception {
		List<V2PublicationAuthorization.Target> targets = targets(V2PublicationAuthorization.Family.STATE, 16);
		assertEquals(16, authorize(targets).roles().size());
		change("UPDATE ffb_v2_account SET state='DISABLED' WHERE account_id='" + account(0) + "'"); assertNull(authorize(targets).role(0));
		change("UPDATE ffb_v2_account SET state='ACTIVE' WHERE account_id='" + account(0) + "'");
		change("UPDATE ffb_v2_identity SET state='REVOKED' WHERE subject='subject-0'"); assertNull(authorize(targets).role(0));
		change("UPDATE ffb_v2_identity SET state='ACTIVE' WHERE subject='subject-0'");
		change("DELETE FROM ffb_v2_account_scope WHERE account_id='" + account(0) + "' AND scope='PLAYER'"); assertNull(authorize(targets).role(0));
		change("INSERT INTO ffb_v2_account_scope VALUES ('" + account(0) + "','PLAYER')");
		change("DELETE FROM ffb_v2_match_members WHERE role='home'"); assertNull(authorize(targets).role(0)); assertEquals("spectator", authorize(targets).role(2));
		change("DELETE FROM ffb_v2_match_members WHERE role='away'"); assertTrue(authorize(targets).roles().isEmpty());
		change("INSERT INTO ffb_v2_match_members VALUES ('" + MATCH + "','" + account(0) + "','away')"); assertEquals("away", authorize(targets).role(0));
	}
	@Test void identityOwnershipAndBinaryCaseCannotBeSubstituted() throws Exception {
		var target = new V2PublicationAuthorization.Target(new AuthenticatedPrincipal(account(0), EnumSet.allOf(ApplicationScope.class), 10_000, ISSUER, "SUBJECT-0", 100), V2PublicationAuthorization.Audience.PLAYER);
		assertTrue(authorize(List.of(target)).roles().isEmpty());
		change("UPDATE ffb_v2_identity SET account_id='" + account(1) + "' WHERE subject='subject-0'");
		assertNull(authorize(targets(V2PublicationAuthorization.Family.STATE, 1)).role(0));
	}
	@Test void expiryBeforeAndDuringTheQueryCannotGrantAnotherPushOrExtendItsToken() throws Exception {
		List<V2PublicationAuthorization.Target> targets = targets(V2PublicationAuthorization.Family.STATE, 16);
		millis.set(10_000); assertTrue(authorize(targets).roles().isEmpty()); assertEquals(0, queries.get());
		millis.set(1_000); expireOnQuery.set(true);
		assertTrue(authorize(targets).roles().isEmpty()); assertEquals(1, queries.get());
		assertEquals(10_000, targets.get(0).principal().expiresAtMillis());
	}
	@Test void computerSeatUsesTheSameBatchAndEncodedDocumentWithoutAdditionalAuthorizationQueries() throws Exception {
		ComputerOpponentService computers = new ComputerOpponentService(null);
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
		FrozenTeam team = fixture.document.away.team.copyForMatch(computers.cloneTeamId(MATCH, ComputerOpponentService.BOGRUK_ID), "away", ComputerOpponentService.BOGRUK_TEAM_NAME);
		var history = new LinkedHashMap<String, MatchDocument.Request>();
		history.put("home\ncreate", new MatchDocument.Request("create|" + fixture.document.home.team.sourceTeamId + "|1|away"));
		history.put("away\njoin", new MatchDocument.Request("join|" + MATCH + "|1|" + team.sourceTeamId + "|1"));
		history.put("home\nactivate", new MatchDocument.Request("activate|" + MATCH + "|2"));
		MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
			fixture.document.home, new MatchDocument.Member("away", "away", team), history).withComputer(computers.identity(MATCH, ComputerOpponentService.BOGRUK_ID));
		String encoded = new BoundedJsonStorageCodec(BoundedJsonStorageCodec.PREPARED_ENCODED_LIMIT, BoundedJsonStorageCodec.PREPARED_DECODED_LIMIT).encode(new MatchJson().storageText(document));
		try (Connection connection = direct(); PreparedStatement update = connection.prepareStatement("UPDATE ffb_prepared_matches SET document_json=? WHERE match_id=?")) {
			update.setString(1, encoded); update.setString(2, MATCH); update.executeUpdate();
		}
		change("DELETE FROM ffb_v2_match_members WHERE role='away'");
		change("INSERT INTO ffb_v2_match_members VALUES ('" + MATCH + "','" + computers.memberId() + "','away')");
		List<V2PublicationAuthorization.Target> targets = new ArrayList<>(targets(V2PublicationAuthorization.Family.STATE, 1));
		targets.add(new V2PublicationAuthorization.Target(null, V2PublicationAuthorization.Audience.COMPUTER));
		queries.set(0); assertEquals("away", authorize(targets).role(1)); assertEquals(1, queries.get());
		assertNull(requests.within(() -> directory.authorizePublication(MATCH, V2PublicationAuthorization.Family.CHAT, targets)).role(1));
		change("UPDATE ffb_prepared_matches SET document_json='{}' WHERE match_id='" + MATCH + "'");
		V2PublicationAuthorization.Snapshot corrupt = authorize(targets); assertNull(corrupt.role(1)); assertEquals("home", corrupt.role(0));
	}

	@Test void sixteenActualSocketsShareTheWorkerAndOneLocalSqlPerNonemptyFamilyIncludingTheOrigin() throws Exception {
		AtomicInteger incomingChecks = new AtomicInteger();
		V2PrincipalDirectory authority = new V2PrincipalDirectory() {
			@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) { throw new UnsupportedOperationException(); }
			@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) { incomingChecks.incrementAndGet(); return principal; }
			@Override public Snapshot authorizePublication(String matchId, Family family, List<Target> targets) throws java.sql.SQLException { return directory.authorizePublication(matchId, family, targets); }
		};
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.spectatorView(MATCH)).thenReturn(socketState("spectator").get("state").asObject());
		when(setup.publishedState(anyString(), anyString(), anyBoolean())).thenAnswer(call -> socketState(call.getArgument(1)));
		when(setup.handleWithOutcome(anyString(), any(JsonObject.class))).thenAnswer(call -> {
			SetupApplication.HandleOutcome outcome = mock(SetupApplication.HandleOutcome.class);
			when(outcome.response()).thenReturn(socketState(call.getArgument(0)).add("requestId", call.<JsonObject>getArgument(1).getString("requestId", null)));
			when(outcome.publish()).thenReturn(!"load".equals(call.<JsonObject>getArgument(1).getString("operation", ""))); return outcome;
		});
		when(setup.sendChat(anyString(), anyString(), anyString(), anyString(), anyString())).thenReturn(new MatchChat.Outcome(new JsonObject().add("index", 0), false));
		when(setup.chatPage(anyString(), anyInt(), anyInt())).thenReturn(new JsonObject().add("messages", new JsonArray()));
		V2PreparationService preparation = mock(V2PreparationService.class);
		when(preparation.handle(anyString(), any(JsonObject.class))).thenReturn(new JsonObject().add("type", "preparedMatch").add("code", "ACCEPTED").add("document", new JsonObject().add("matchId", MATCH)));
		V2MatchAccess access = new V2MatchAccess(new JdbcMatchMembershipRepository(connections), authority, clock);
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> socketPrincipal(Integer.parseInt(bearer)), access, setup, mock(MatchService.class), preparation, mock(BrowserSavedTeamJson.class));
		FantasyFootballServer host = mock(FantasyFootballServer.class); when(host.getDebugLog()).thenReturn(mock(DebugLog.class));
		ServerCommunication worker = new ServerCommunication(host); when(host.getCommunication()).thenReturn(worker);
		Thread engine = new Thread(worker, "publication-socket-worker"); engine.start();
		Server jetty = new Server(); ServerConnector connector = new ServerConnector(jetty); connector.setHost("127.0.0.1"); connector.setPort(0); jetty.addConnector(connector); connector.open();
		when(host.getProperty("server.base")).thenReturn("http://127.0.0.1:" + connector.getLocalPort());
		ServletContextHandler context = new ServletContextHandler(); context.setContextPath("/"); JettyWebSocketServletContainerInitializer.configure(context, null);
		BrowserMatchServlet servlet = new BrowserMatchServlet(host, adapter); context.addServlet(new ServletHolder(servlet), "/browser/v2"); jetty.setHandler(context);
		List<SocketClient> sockets = new ArrayList<>();
		HttpClient client = HttpClient.newHttpClient();
		try {
			jetty.start(); URI endpoint = URI.create("ws://127.0.0.1:" + connector.getLocalPort() + "/browser/v2");
			for (int index = 0; index < 16; index++) {
				SocketClient socket = new SocketClient(client, endpoint); sockets.add(socket);
				int identity = index < 14 ? index : index - 14;
				socket.send(new JsonObject().add("version", 2).add("type", "authenticate").add("requestId", "auth-" + index).add("bearer", Integer.toString(identity)).add("purpose", index >= 14 ? "preparation" : "play")); socket.read("authentication");
				if (index < 2) { socket.send(socketRequest("setup", "load-" + index).add("operation", "load")); socket.read("setupState"); }
				else if (index < 14) { socket.send(socketRequest("watch", "watch-" + index)); socket.read("setupState"); }
				else { socket.send(socketRequest("preparedMatch", "prepare-" + index).add("operation", "create")); socket.read("preparedMatch"); }
			}
			sockets.get(14).read("preparationChanged");
			assertEquals(16, servlet.getTransportMetrics().getLong("activeConnections", -1));
			try (SocketClient excess = new SocketClient(client, endpoint)) { assertEquals(1013, excess.closed.get(5, TimeUnit.SECONDS)); }
			queries.set(0); incomingChecks.set(0); long started = System.nanoTime();
			sockets.getFirst().send(socketRequest("setup", "state-origin").add("operation", "confirm")); sockets.getFirst().read("setupState");
			for (int index = 1; index < 14; index++) {
				JsonObject frame = sockets.get(index).read("setupState"); String role = frame.get("state").asObject().getString("callerRole", null);
				assertEquals(index == 1 ? "away" : "spectator", role); assertNull(frame.get("state").asObject().get("savedFormations"));
			}
			assertEquals(1, queries.get()); assertEquals(2, incomingChecks.get());
			assertTrue(System.nanoTime() - started < 2_000_000_000L);
			queries.set(0); incomingChecks.set(0);
			sockets.getFirst().send(socketRequest("matchChat", "chat-origin").add("operation", "send").add("text", "synthetic publication")); sockets.getFirst().read("matchChat");
			for (int index = 1; index < 14; index++) sockets.get(index).read("matchChat");
			assertEquals(1, queries.get()); assertEquals(1, incomingChecks.get());
			queries.set(0); incomingChecks.set(0);
			sockets.get(15).send(socketRequest("preparedMatch", "prep-origin").add("operation", "create")); sockets.get(15).read("preparedMatch"); sockets.get(14).read("preparationChanged");
			assertEquals(1, queries.get()); assertEquals(1, incomingChecks.get());
			assertTrue(servlet.getTransportMetrics().get("workerTasks").asArray().get(0).asObject().getLong("maxExecutionNanos", Long.MAX_VALUE) < 2_000_000_000L);
			System.out.println("PUBLICATION_SOCKETS total=16 stateTargets=13 chatTargets=13 preparationTargets=1 authorizationQueries=1_per_nonempty_family providerFanoutCalls=0");
		} finally {
			for (SocketClient socket : sockets) socket.close();
			long cleanupDeadline = System.nanoTime() + 5_000_000_000L;
			while (servlet.getTransportMetrics().getLong("activeConnections", -1) != 0 && System.nanoTime() < cleanupDeadline) Thread.sleep(5);
			try { assertEquals(0, servlet.getTransportMetrics().getLong("activeConnections", -1)); }
			finally { jetty.stop(); worker.shutdown(); engine.join(5_000); client.close(); assertFalse(engine.isAlive()); }
		}
	}
	private JsonObject socketRequest(String type, String requestId) { return new JsonObject().add("version", 2).add("type", type).add("requestId", requestId).add("matchId", MATCH); }
	private AuthenticatedPrincipal socketPrincipal(int index) { return new AuthenticatedPrincipal(account(index), EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), System.currentTimeMillis() + 3_600_000, ISSUER, "subject-" + index, 100); }
	private JsonObject socketState(String role) {
		JsonObject state = new JsonObject().add("matchId", MATCH).add("revision", 1).add("phase", "SETUP").add("actor", "home").add("callerRole", role);
		if ("home".equals(role)) state.add("savedFormations", new JsonArray().add(new JsonObject().add("index", 0).add("name", "synthetic")));
		return new JsonObject().add("type", "setupState").add("code", "ACCEPTED").add("state", state);
	}
	private static final class SocketClient implements WebSocket.Listener, AutoCloseable {
		private final BlockingQueue<JsonObject> messages = new LinkedBlockingQueue<>();
		private final StringBuilder text = new StringBuilder();
		final CompletableFuture<Integer> closed = new CompletableFuture<>();
		private final WebSocket socket;
		SocketClient(HttpClient client, URI endpoint) throws Exception { socket = client.newWebSocketBuilder().header("Origin", "http://localhost:5000").buildAsync(endpoint, this).get(5, TimeUnit.SECONDS); }
		@Override public void onOpen(WebSocket opened) { opened.request(1); }
		@Override public CompletionStage<?> onText(WebSocket opened, CharSequence fragment, boolean last) {
			text.append(fragment); if (last) { messages.add(JsonObject.readFrom(text.toString())); text.setLength(0); } opened.request(1); return CompletableFuture.completedFuture(null);
		}
		@Override public CompletionStage<?> onClose(WebSocket opened, int status, String reason) { closed.complete(status); return CompletableFuture.completedFuture(null); }
		@Override public void onError(WebSocket opened, Throwable failure) { closed.completeExceptionally(failure); }
		void send(JsonObject request) throws Exception { socket.sendText(request.toString(), true).get(5, TimeUnit.SECONDS); }
		JsonObject read(String type) throws Exception {
			JsonObject message = messages.poll(5, TimeUnit.SECONDS); assertNotNull(message, "Socket response required: " + type);
			assertEquals("ACCEPTED", message.getString("code", null)); assertEquals(type, message.getString("type", null)); return message;
		}
		@Override public void close() { socket.abort(); }
	}

	private V2PublicationAuthorization.Snapshot authorize(List<V2PublicationAuthorization.Target> targets) throws Exception {
		return requests.within(() -> directory.authorizePublication(MATCH, V2PublicationAuthorization.Family.STATE, targets));
	}
	private List<V2PublicationAuthorization.Target> targets(V2PublicationAuthorization.Family family, int count) {
		List<V2PublicationAuthorization.Target> targets = new ArrayList<>();
		for (int slot = 0; slot < count; slot++) {
			int identity = family == V2PublicationAuthorization.Family.PREPARATION ? 0 : slot;
			AuthenticatedPrincipal principal = new AuthenticatedPrincipal(account(identity), EnumSet.allOf(ApplicationScope.class), 10_000, ISSUER, "subject-" + identity, 100);
			targets.add(new V2PublicationAuthorization.Target(principal, slot < 2 || family == V2PublicationAuthorization.Family.PREPARATION ? V2PublicationAuthorization.Audience.PLAYER : V2PublicationAuthorization.Audience.SPECTATOR));
		}
		return targets;
	}
	private String account(int index) { return "aaaaaaaa-aaaa-aaaa-aaaa-%012d".formatted(index); }
	private Connection direct() throws Exception { return DriverManager.getConnection(url, "root", password); }
	private void change(String command) throws Exception { try (Connection connection = direct(); Statement sql = connection.createStatement()) { sql.executeUpdate(command); } }
	private Connection counted() throws java.sql.SQLException {
		Connection raw = connections.open();
		return Connection.class.cast(Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (self, method, arguments) -> {
			try {
				Object result = method.invoke(raw, arguments);
				if (!(result instanceof PreparedStatement prepared)) return result;
				return Proxy.newProxyInstance(PreparedStatement.class.getClassLoader(), new Class<?>[] {PreparedStatement.class}, (statement, operation, parameters) -> {
					try {
						if (operation.getName().equals("executeQuery")) queries.incrementAndGet();
						Object value = operation.invoke(prepared, parameters);
						if (operation.getName().equals("executeQuery") && expireOnQuery.getAndSet(false)) millis.set(10_000);
						return value;
					} catch (InvocationTargetException failure) { throw failure.getCause(); }
				});
			} catch (InvocationTargetException failure) { throw failure.getCause(); }
		}));
	}
}
