package com.fumbbl.ffb.server.local;

import com.google.api.client.http.GenericUrl;
import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.LowLevelHttpRequest;
import com.google.api.client.http.LowLevelHttpResponse;
import com.google.api.client.testing.http.MockLowLevelHttpResponse;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.auth.oauth2.UserCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;

import org.eclipse.jetty.client.BytesRequestContent;
import org.eclipse.jetty.client.ContentResponse;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.Request;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** #504 gate experiments only. No candidate in this file is approved for production. */
class FirebaseTransportFeasibilityTest {
	private static final String PROJECT = "synthetic-spike";
	@TempDir Path temporary;

	@Test void pinnedFirebaseDefault503HandlerRetriesAndSleepsOutsideLowLevelTransport() throws Exception {
		ScriptedTransport transport = new ScriptedTransport(true);
		FirebaseApp app = app(transport, GoogleCredentials.create(new com.google.auth.oauth2.AccessToken("synthetic", new Date(Long.MAX_VALUE))));
		try {
			long start = System.nanoTime();
			assertThrows(FirebaseAuthException.class, () -> FirebaseAuth.getInstance(app).getUser("synthetic"));
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
			assertEquals(5, transport.attempts.get());
			assertTrue(elapsed >= 7_000, "Expected 500+1000+2000+4000 ms SDK backoff, got " + elapsed);
			System.out.println("FIREBASE_SPIKE default503 attempts=5 elapsedMs=" + elapsed);
		} finally { app.delete(); }
	}

	@Test void terminalTransportFailuresBypassFirebaseResponseBackoffAndIOExceptionIsNotRetried() throws Exception {
		ScriptedTransport transport = new ScriptedTransport(false);
		FirebaseApp app = app(transport, GoogleCredentials.create(new com.google.auth.oauth2.AccessToken("synthetic", new Date(Long.MAX_VALUE))));
		try {
			long start = System.nanoTime();
			assertThrows(FirebaseAuthException.class, () -> FirebaseAuth.getInstance(app).getUser("synthetic"));
			assertEquals(1, transport.attempts.get());
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
			assertTrue(elapsed < 500, "Unexpected Firebase backoff: " + elapsed);
			System.out.println("FIREBASE_SPIKE terminalIOException attempts=1 elapsedMs=" + elapsed);
		} finally { app.delete(); }
	}

	@Test void actual503ConversionPreventsFirebaseBackoff() throws Exception {
		try (ServerSocket server = new ServerSocket(0); Candidate transport = new Candidate()) {
			CompletableFuture<Void> peer = CompletableFuture.runAsync(() -> {
				try (Socket socket = server.accept()) {
					socket.setSoTimeout(2_000);
					readHeaders(socket);
					socket.getOutputStream().write("HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
					socket.getOutputStream().flush();
				} catch (IOException failure) { throw new IllegalStateException(failure); }
			});
			transport.route = "http://127.0.0.1:" + server.getLocalPort();
			FirebaseApp app = app(transport, GoogleCredentials.create(new com.google.auth.oauth2.AccessToken("synthetic", new Date(Long.MAX_VALUE))));
			try {
				transport.begin(1_000);
				long start = System.nanoTime();
				assertThrows(FirebaseAuthException.class, () -> FirebaseAuth.getInstance(app).getUser("synthetic"));
				long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
				assertEquals(1, transport.allowances.size());
				assertEquals(List.of(503), transport.statuses);
				assertTrue(elapsed < 1_000, "Actual 503 conversion returned in " + elapsed);
				peer.get(2, TimeUnit.SECONDS);
				System.out.println("FIREBASE_SPIKE actual503 attempts=1 elapsedMs=" + elapsed);
			} finally { app.delete(); }
		}
	}

	@Test void serviceAccountFactoryAloneDoesNotDisableOAuthIOExceptionBackoffButPublicRetryCloneDoes() throws Exception {
		ScriptedTransport transport = new ScriptedTransport(false);
		ServiceAccountCredentials credential = ServiceAccountCredentials.newBuilder()
			.setClientEmail("synthetic@example.invalid").setPrivateKey(privateKey())
			.setScopes(List.of("https://www.googleapis.com/auth/cloud-platform"))
			.setHttpTransportFactory(() -> transport).build();
		long start = System.nanoTime();
		assertThrows(IOException.class, credential::refreshAccessToken);
		assertTrue(transport.attempts.get() > 1);
		System.out.println("FIREBASE_SPIKE oauthDefault attempts=" + transport.attempts.get()
			+ " elapsedMs=" + TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
		transport.attempts.set(0);
		start = System.nanoTime();
		assertThrows(IOException.class, () -> credential.createWithCustomRetryStrategy(false).refreshAccessToken());
		assertEquals(1, transport.attempts.get());
		long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
		assertTrue(elapsed < 500, "Unexpected OAuth backoff: " + elapsed);
		System.out.println("FIREBASE_SPIKE oauthNoRetry attempts=1 elapsedMs=" + elapsed);
	}

	@Test void coldKeyOAuthAndRevocationUseSameTransportAndOneOperationDeadline() throws Exception {
		BrowserRequestTiming timing = new BrowserRequestTiming();
		try (BrowserRequestTiming.Scope ignored = timing.handling(timing.queued()); Candidate transport = new Candidate()) {
			transport.begin(1_000);
			UserCredentials credential = user(transport);
			FirebaseApp app = app(transport, credential);
			try {
				FirebaseAuth auth = FirebaseAuth.getInstance(app);
				assertEquals("synthetic", auth.verifyIdToken(token(), true).getUid());
				assertEquals(List.of("key", "oauth", "revocation"), transport.operations);
				assertTrue(transport.allowances.get(2) < transport.allowances.get(0));
				assertTrue(transport.remainingMillis() > 0);
				System.out.println("FIREBASE_SPIKE cold operations=" + transport.operations + " allowancesMs=" + transport.allowances);
			} finally { app.delete(); }
		}
	}

	@Test void mergedBudgetRefusesAFullProviderAllocationAfterEarlierRequestWork() throws Exception {
		AtomicLong nanos = new AtomicLong();
		BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, ignored -> { });
		try (Candidate transport = new Candidate(); BrowserRequestTiming.Scope ignored = timing.handling(timing.queued())) {
			nanos.set(1_000_000_000L);
			assertThrows(IOException.class, () -> transport.begin(1_000));
			assertEquals(0, transport.operations.size());
			assertEquals(1_000_000_000L, timing.budget().remainingNanos());
		}
	}

	@Test void responseTrickleReturnsAndClosesActualSocketWithinAllocation() throws Exception {
		try (ServerSocket server = new ServerSocket(0); Candidate transport = new Candidate()) {
			CompletableFuture<Boolean> closed = CompletableFuture.supplyAsync(() -> {
				try (Socket peer = server.accept()) {
					peer.setSoTimeout(2_000);
					// Consume request headers, then announce a body which never arrives.
					readHeaders(peer);
					peer.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 10000\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
					peer.getOutputStream().flush();
					return peer.getInputStream().read() == -1;
				} catch (IOException failure) { throw new IllegalStateException(failure); }
			});
			transport.route = "http://127.0.0.1:" + server.getLocalPort();
			transport.begin(1_000);
			long start = System.nanoTime();
			assertThrows(IOException.class, () -> transport.createRequestFactory().buildGetRequest(new GenericUrl("https://www.googleapis.com/key")).execute());
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
			assertTrue(elapsed < 1_250, "Actual request returned in " + elapsed);
			assertTrue(closed.get(2, TimeUnit.SECONDS), "Deadline must close the peer socket");
			System.out.println("FIREBASE_SPIKE stalledBody elapsedMs=" + elapsed + " peerClosed=true");
		}
	}

	@Test void jettyDnsTimeoutDoesNotProveUnderlyingResolverReturn() throws Exception {
		// Isolate the JDK resolver SPI to a child JVM; never install it in the test runner.
		Path services = temporary.resolve("META-INF/services");
		Files.createDirectories(services);
		Files.writeString(services.resolve("java.net.spi.InetAddressResolverProvider"), FirebaseDnsFeasibilityProbe.StalledResolver.class.getName());
		String classpath = temporary + java.io.File.pathSeparator + System.getProperty("java.class.path");
		Process child = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
			"-cp", classpath, FirebaseDnsFeasibilityProbe.class.getName()).redirectErrorStream(true).start();
		try {
			assertTrue(child.waitFor(15, TimeUnit.SECONDS), "DNS experiment did not terminate");
			String output = new String(child.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
			assertEquals(0, child.exitValue(), output);
			assertTrue(output.contains("resolverStillRunning=true"), output);
			System.out.print(output);
		} finally {
			child.destroyForcibly();
			assertTrue(child.waitFor(5, TimeUnit.SECONDS), "DNS child remained alive after forced termination");
		}
	}
	private void readHeaders(Socket socket) throws IOException {
		int tail = 0;
		while (tail != 0x0d0a0d0a) {
			int next = socket.getInputStream().read();
			if (next < 0) throw new IOException("Peer closed before complete headers");
			tail = (tail << 8) | next;
		}
	}

	private UserCredentials user(HttpTransport transport) {
		return UserCredentials.newBuilder().setClientId("synthetic").setClientSecret("synthetic")
			.setRefreshToken("synthetic").setHttpTransportFactory(() -> transport).build();
	}
	private FirebaseApp app(HttpTransport transport, GoogleCredentials credentials) {
		return FirebaseApp.initializeApp(FirebaseOptions.builder().setProjectId(PROJECT).setCredentials(credentials)
			.setHttpTransport(transport).setConnectTimeout(200).setReadTimeout(500).setWriteTimeout(500).build(), "spike-" + UUID.randomUUID());
	}
	private KeyStore fixture() throws Exception {
		KeyStore store = KeyStore.getInstance("PKCS12");
		try (var stream = getClass().getResourceAsStream("/firebase-spike/synthetic.p12")) { store.load(stream, "synthetic".toCharArray()); }
		return store;
	}
	private PrivateKey privateKey() throws Exception { return (PrivateKey) fixture().getKey("synthetic", "synthetic".toCharArray()); }
	private String token() throws Exception {
		long now = Instant.now().getEpochSecond();
		String header = "{\"alg\":\"RS256\",\"kid\":\"synthetic\",\"typ\":\"JWT\"}";
		String claims = "{\"aud\":\"" + PROJECT + "\",\"iss\":\"https://securetoken.google.com/" + PROJECT
			+ "\",\"sub\":\"synthetic\",\"iat\":" + now + ",\"auth_time\":" + now + ",\"exp\":" + (now + 3600) + "}";
		Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
		String body = encoder.encodeToString(header.getBytes(StandardCharsets.UTF_8)) + "." + encoder.encodeToString(claims.getBytes(StandardCharsets.UTF_8));
		Signature signature = Signature.getInstance("SHA256withRSA"); signature.initSign(privateKey()); signature.update(body.getBytes(StandardCharsets.US_ASCII));
		return body + "." + encoder.encodeToString(signature.sign());
	}

	private static final class ScriptedTransport extends HttpTransport {
		final AtomicInteger attempts = new AtomicInteger();
		final boolean response;
		ScriptedTransport(boolean response) { this.response = response; }
		@Override protected LowLevelHttpRequest buildRequest(String method, String url) {
			return new LowLevelHttpRequest() {
				@Override public void addHeader(String name, String value) { }
				@Override public LowLevelHttpResponse execute() throws IOException {
					attempts.incrementAndGet();
					if (!response) throw new IOException("Synthetic terminal provider failure");
					return new MockLowLevelHttpResponse().setStatusCode(503).setContentType("application/json").setContent("{\"error\":{\"message\":\"UNAVAILABLE\"}}");
				}
			};
		}
	}

	/** Candidate only: public Jetty I/O seam plus in-memory synthetic cold-path responses. */
	private final class Candidate extends HttpTransport implements AutoCloseable {
		final HttpClient client = new HttpClient();
		final List<String> operations = new ArrayList<>();
		final List<Long> allowances = new ArrayList<>();
		final List<Integer> statuses = new ArrayList<>();
		long deadline;
		String route;
		Candidate() throws Exception { client.setFollowRedirects(false); client.setAddressResolutionTimeout(200); client.start(); }
		void begin(int millis) throws IOException {
			BrowserRequestTiming.Budget budget = new BrowserRequestTiming().budget();
			if (budget != null && budget.allowanceMillis(millis, 150) < millis) throw new IOException("Insufficient shared request budget");
			deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(millis);
		}
		long remainingMillis() { return TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime()); }
		@Override protected LowLevelHttpRequest buildRequest(String method, String url) throws IOException {
			if (remainingMillis() <= 0) throw new IOException("Operation allocation exhausted before attempt");
			return new LowLevelHttpRequest() {
				@Override public void addHeader(String name, String value) { /* No real credential is ever sent by this spike. */ }
				@Override public LowLevelHttpResponse execute() throws IOException {
					long remaining = remainingMillis();
					if (remaining <= 0) throw new IOException("Operation allocation exhausted");
					allowances.add(remaining);
					if (route != null) {
						Request request = client.newRequest(route).method(method).timeout(remaining, TimeUnit.MILLISECONDS);
						try {
							if (getStreamingContent() != null) { ByteArrayOutputStream body = new ByteArrayOutputStream(); getStreamingContent().writeTo(body); request.body(new BytesRequestContent(body.toByteArray())); }
							ContentResponse response = request.send();
							statuses.add(response.getStatus());
							if (response.getStatus() >= 300) throw new IOException("Terminal HTTP failure: " + response.getStatus());
							return new MockLowLevelHttpResponse().setStatusCode(response.getStatus()).setContent(response.getContent());
						} catch (Exception failure) { throw new IOException("Candidate transport failed", failure); }
					}
					String content;
					if (url.contains("/robot/")) {
						operations.add("key");
						try {
							String pem = "-----BEGIN CERTIFICATE-----\n" + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(fixture().getCertificate("synthetic").getEncoded()) + "\n-----END CERTIFICATE-----\n";
							content = new com.eclipsesource.json.JsonObject().add("synthetic", pem).toString();
						} catch (Exception failure) { throw new IOException(failure); }
					} else if (url.contains("oauth2")) { operations.add("oauth"); content = "{\"access_token\":\"synthetic\",\"token_type\":\"Bearer\",\"expires_in\":3600}";
					} else { operations.add("revocation"); content = "{\"users\":[{\"localId\":\"synthetic\",\"disabled\":false,\"validSince\":\"1\"}]}"; }
					return new MockLowLevelHttpResponse().setStatusCode(200).setContentType("application/json").addHeader("Cache-Control", "max-age=3600").setContent(content);
				}
			};
		}
		@Override public void close() throws Exception { client.stop(); }
	}
}
