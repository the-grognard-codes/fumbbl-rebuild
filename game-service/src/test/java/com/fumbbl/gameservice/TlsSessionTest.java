package com.fumbbl.gameservice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TlsSessionTest {
	private static final String ORIGIN = "https://dev.molesunderthepitch.org";
	private static final ObjectMapper JSON = new ObjectMapper();
	@TempDir Path directory;
	private Server server;
	private HttpClient client;
	private String endpoint;
	private final AtomicInteger verifications = new AtomicInteger();
	private Path keyStore;

	@BeforeEach void startTlsService() throws Exception {
		keyStore = directory.resolve("test.p12");
		String executable = System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
		Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", executable).toString(),
			"-genkeypair", "-alias", "test", "-keyalg", "RSA", "-keysize", "2048", "-validity", "2",
			"-dname", "CN=localhost", "-ext", "SAN=dns:localhost,ip:127.0.0.1", "-storetype", "PKCS12",
			"-keystore", keyStore.toString(), "-storepass", "test-password", "-keypass", "test-password")
			.redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
		assertTrue(process.waitFor(30, TimeUnit.SECONDS));
		assertEquals(0, process.exitValue());
		KeyStore trust = KeyStore.getInstance("PKCS12");
		try (InputStream input = Files.newInputStream(keyStore)) { trust.load(input, "test-password".toCharArray()); }
		TrustManagerFactory managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
		managers.init(trust);
		SSLContext tls = SSLContext.getInstance("TLS");
		tls.init(null, managers.getTrustManagers(), null);
		client = HttpClient.newBuilder().sslContext(tls).connectTimeout(Duration.ofSeconds(5)).build();
		String database = directory.resolve("accounts").toString();
		ServiceConfig config = new ServiceConfig("dev-moles-under-the-pitch-org", ORIGIN, database,
			keyStore.toString(), "test-password", 0);
		TokenVerifier verifier = token -> {
			verifications.incrementAndGet();
			if (!token.equals("test-player-a") && !token.equals("test-player-b") && !token.equals("test-expiring")) throw new TokenVerifier.TokenRejectedException(false);
			return new TokenVerifier.Identity("https://securetoken.google.com/dev-moles-under-the-pitch-org", token, System.currentTimeMillis() + (token.equals("test-expiring") ? 500 : 60000));
		};
		server = GameServiceMain.createServer(config, verifier, new AccountStore(database), new SessionManager());
		server.start();
		endpoint = "wss://localhost:" + ((ServerConnector) server.getConnectors()[0]).getLocalPort() + "/session/v1";
	}

	@AfterEach void stopTlsService() throws Exception {
		if (client != null) client.close();
		if (server != null) server.stop();
	}

	@Test void twoTlsPeersSharePresenceChatAndReconnectWithoutIdentityLeakage() throws Exception {
		Peer first = connect(ORIGIN, "");
		Peer second = connect(ORIGIN, "");
		first.send("{\"type\":\"authenticate\",\"token\":\"test-player-a\"}");
		assertEquals("authenticated", first.next().path("type").asText());
		second.send("{\"type\":\"authenticate\",\"token\":\"test-player-b\"}");
		assertEquals("authenticated", second.next().path("type").asText());
		first.send("{\"type\":\"create\"}");
		JsonNode waiting = first.next();
		assertFalse(waiting.path("slots").get(1).path("occupied").asBoolean());
		String code = waiting.path("code").asText();
		second.send(JSON.writeValueAsString(Map.of("type", "join", "code", code)));
		JsonNode joinedA = first.next();
		JsonNode joinedB = second.next();
		assertEquals(joinedA.path("events"), joinedB.path("events"));
		assertEquals(0, joinedA.path("selfSlot").asInt());
		assertEquals(1, joinedB.path("selfSlot").asInt());
		assertTrue(joinedA.path("slots").get(1).path("connected").asBoolean());
		for (Peer sender : new Peer[] { first, second }) {
			sender.send(JSON.writeValueAsString(Map.of("type", "chat", "text", "<b>plain text</b>")));
			JsonNode a = first.next();
			JsonNode b = second.next();
			assertEquals(a.path("events"), b.path("events"));
			assertFalse(a.toString().contains("test-player"));
			assertFalse(a.toString().contains("securetoken"));
			assertEquals("<b>plain text</b>", a.path("events").get(a.path("events").size() - 1).path("text").asText());
		}
		first.send("{\"type\":\"chat\",\"text\":\"concurrent A\"}");
		second.send("{\"type\":\"chat\",\"text\":\"concurrent B\"}");
		for (int event = 0; event < 2; event++) assertEquals(first.next().path("events"), second.next().path("events"));
		second.socket.sendClose(1000, "done").join();
		JsonNode left = first.next();
		assertFalse(left.path("slots").get(1).path("connected").asBoolean());
		Peer returned = connect(ORIGIN, "");
		returned.send("{\"type\":\"authenticate\",\"token\":\"test-player-b\"}");
		assertEquals("authenticated", returned.next().path("type").asText());
		returned.send(JSON.writeValueAsString(Map.of("type", "join", "code", code)));
		JsonNode restored = returned.next();
		assertEquals(1, restored.path("selfSlot").asInt());
		assertEquals(first.next().path("events"), restored.path("events"));
		returned.send("{\"type\":\"leave\"}");
		assertEquals("left", returned.next().path("type").asText());
		assertFalse(first.next().path("slots").get(1).path("connected").asBoolean());
		first.socket.abort(); returned.socket.abort();
	}

	@Test void rejectsForeignOrMissingOriginAndQueryCredentialsBeforeVerification() {
		for (String origin : new String[] { null, "https://molesunderthepitch.org", "https://attacker.example" }) {
			Exception failure = assertThrows(Exception.class, () -> connect(origin, ""));
			assertTrue(failure.getCause() instanceof WebSocketHandshakeException);
		}
		assertThrows(Exception.class, () -> connect(ORIGIN, "?token=not-a-token"));
		assertEquals(0, verifications.get());
	}

	@Test void rejectsInvalidInitialTokenAndUnauthenticatedSessionCommands() throws Exception {
		Peer invalid = connect(ORIGIN, "");
		invalid.send("{\"type\":\"authenticate\",\"token\":\"invalid\"}");
		assertEquals(4001, invalid.closed.get(5, TimeUnit.SECONDS));
		Peer signedOut = connect(ORIGIN, "");
		signedOut.send("{\"type\":\"create\"}");
		// No snapshot or successful authentication is returned for unauthenticated commands.
		assertEquals(4001, signedOut.closed.get(5, TimeUnit.SECONDS));
		assertEquals(1, verifications.get());
		try (Connection database = DriverManager.getConnection("jdbc:h2:file:" + directory.resolve("accounts"), "sa", "");
			 ResultSet rows = database.createStatement().executeQuery("SELECT COUNT(*) FROM internal_account")) {
			assertTrue(rows.next());
			assertEquals(0, rows.getInt(1));
		}
		signedOut.socket.abort();
	}

	@Test void duplicateConnectionCannotReplaceOrOccupyAnotherSlot() throws Exception {
		Peer first = connect(ORIGIN, "");
		first.send("{\"type\":\"authenticate\",\"token\":\"test-player-a\"}");
		first.next();
		first.send("{\"type\":\"create\"}");
		String code = first.next().path("code").asText();
		Peer duplicate = connect(ORIGIN, "");
		duplicate.send("{\"type\":\"authenticate\",\"token\":\"test-player-a\"}");
		assertEquals(4009, duplicate.closed.get(5, TimeUnit.SECONDS));
		first.send("{\"type\":\"chat\",\"text\":\"still present\"}");
		JsonNode state = first.next();
		assertEquals(code, state.path("code").asText());
		assertFalse(state.path("slots").get(1).path("occupied").asBoolean());
		first.socket.abort();
	}

	@Test void validatesMembershipMessageShapeAndRateOverTls() throws Exception {
		Peer peer = connect(ORIGIN, "");
		peer.send("{\"type\":\"authenticate\",\"token\":\"test-player-a\"}");
		peer.next();
		peer.send("{\"type\":\"chat\",\"text\":\"outsider\"}");
		assertEquals("session_not_found", peer.next().path("code").asText());
		peer.send("{\"type\":\"create\",\"uid\":\"forged-identity\"}");
		assertEquals("invalid_message", peer.next().path("code").asText());
		peer.send("{\"type\":\"create\",\"type\":\"chat\"}");
		assertEquals("invalid_message", peer.next().path("code").asText());
		for (int i = 0; i < 27; i++) peer.send("{\"type\":\"unknown\"}");
		assertEquals(1008, peer.closed.get(5, TimeUnit.SECONDS));
	}

	@Test void rejectsOversizedTransportMessages() throws Exception {
		Peer peer = connect(ORIGIN, "");
		peer.send("x".repeat(4097));
		assertEquals(1009, peer.closed.get(5, TimeUnit.SECONDS));
	}

	@Test void expiresAnAuthenticatedConnectionWithoutWaitingForAnotherMessage() throws Exception {
		Peer peer = connect(ORIGIN, "");
		peer.send("{\"type\":\"authenticate\",\"token\":\"test-expiring\"}");
		assertEquals("authenticated", peer.next().path("type").asText());
		assertEquals(4003, peer.closed.get(5, TimeUnit.SECONDS));
	}

	@Test void configurationRejectsMixedProjectsOriginsAndEmulators() {
		Map<String, String> config = new HashMap<>(Map.of("GAME_ENV", "dev", "FIREBASE_PROJECT_ID", "dev-moles-under-the-pitch-org",
			"GAME_ORIGIN", ORIGIN, "GAME_DB_PATH", directory.resolve("config-db").toString(),
			"GAME_KEYSTORE", keyStore.toString(), "GAME_KEYSTORE_PASSWORD", "test-password"));
		assertEquals("dev-moles-under-the-pitch-org", ServiceConfig.fromEnvironment(config).projectId);
		config.put("FIREBASE_PROJECT_ID", "molesunderthepitch-dotorg");
		assertThrows(IllegalStateException.class, () -> ServiceConfig.fromEnvironment(config));
		config.put("GAME_ENV", "prod");
		assertThrows(IllegalStateException.class, () -> ServiceConfig.fromEnvironment(config));
		config.put("GAME_ORIGIN", "https://molesunderthepitch.org");
		assertEquals("molesunderthepitch-dotorg", ServiceConfig.fromEnvironment(config).projectId);
		config.put("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099");
		assertThrows(IllegalStateException.class, () -> ServiceConfig.fromEnvironment(config));
	}

	private Peer connect(String origin, String query) throws Exception {
		Peer peer = new Peer();
		WebSocket.Builder builder = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5));
		if (origin != null) builder.header("Origin", origin);
		peer.socket = builder.buildAsync(URI.create(endpoint + query), peer).get(5, TimeUnit.SECONDS);
		return peer;
	}

	private static final class Peer implements WebSocket.Listener {
		private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
		private final CompletableFuture<Integer> closed = new CompletableFuture<>();
		private final StringBuilder partial = new StringBuilder();
		private WebSocket socket;
		@Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }
		@Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
			partial.append(data);
			if (last) { messages.add(partial.toString()); partial.setLength(0); }
			webSocket.request(1);
			return CompletableFuture.completedFuture(null);
		}
		@Override public CompletionStage<?> onClose(WebSocket webSocket, int code, String reason) {
			closed.complete(code);
			return CompletableFuture.completedFuture(null);
		}
		void send(String message) { socket.sendText(message, true).join(); }
		JsonNode next() throws Exception {
			String text = messages.poll(5, TimeUnit.SECONDS);
			assertNotNull(text, "Expected a session response before timeout");
			return JSON.readTree(text);
		}
	}
}
