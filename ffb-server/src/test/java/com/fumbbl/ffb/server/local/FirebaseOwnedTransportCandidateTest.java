package com.fumbbl.ffb.server.local;

import com.google.api.client.http.GenericUrl;
import com.google.api.client.http.ByteArrayContent;
import com.google.auth.oauth2.ComputeEngineCredentials;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.auth.oauth2.UserCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;

import com.eclipsesource.json.JsonObject;
import com.sun.net.httpserver.HttpServer;

import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.junit.jupiter.api.Test;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.Section;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLServerSocket;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FirebaseOwnedTransportCandidateTest {
	private static final String PROJECT = "owned-transport-spike";

	@Test void coldUserAndServiceCredentialsVerifyThroughRealDnsTlsOAuthAndRevocationWithinOneAllocation() throws Exception {
		for (boolean service : new boolean[] {false, true}) {
			try (TlsProvider provider = new TlsProvider(); FirebaseDnsCandidateTest.DnsServer server = dns();
				FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), provider.clientTrust(), provider.port())) {
				GoogleCredentials credentials = service ? ServiceAccountCredentials.newBuilder().setClientEmail("synthetic@example.invalid")
					.setPrivateKey(provider.privateKey()).setScopes(List.of("https://www.googleapis.com/auth/cloud-platform"))
					.setHttpTransportFactory(() -> transport).build().createWithCustomRetryStrategy(false)
					: UserCredentials.newBuilder().setClientId("synthetic").setClientSecret("synthetic").setRefreshToken("synthetic")
					.setHttpTransportFactory(() -> transport).build();
				String token = provider.token();
				FirebaseApp app = app(transport, credentials);
				FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
				try (operation) {
					assertEquals("synthetic", FirebaseAuth.getInstance(app).verifyIdToken(token, true).getUid());
					assertTrue(operation.elapsedMillis() < 1_000, "Cold operation returned in " + operation.elapsedMillis() + " ms");
					assertEquals(3, provider.paths.size());
					assertTrue(provider.paths.get(0).contains("/robot/")); assertEquals("/token", provider.paths.get(1));
					assertTrue(provider.paths.get(2).contains("accounts:lookup"));
					assertReleased(operation, transport);
					System.out.println("FIREBASE_OWNED_SPIKE cold service=" + service + " elapsedMs=" + operation.elapsedMillis() + " dnsQueries=" + server.queries.get());
				} finally { app.delete(); }
				assertEquals(0, operation.openChannels()); assertEquals(0, transport.destinations());
			}
		}
	}

	@Test void computeCredentialFactoryAndMetadataRefreshRemainInsideTheSameColdVerification() throws Exception {
		AtomicInteger metadataCalls = new AtomicInteger();
		HttpServer metadata = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		metadata.createContext("/", exchange -> {
			metadataCalls.incrementAndGet();
			String body = exchange.getRequestURI().getPath().contains("universe") ? "googleapis.com" : "{\"access_token\":\"synthetic\",\"expires_in\":3600,\"token_type\":\"Bearer\"}";
			byte[] bytes = body.getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(200, bytes.length);
			try (var output = exchange.getResponseBody()) { output.write(bytes); }
		});
		metadata.start();
		try (TlsProvider provider = new TlsProvider(); FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), provider.clientTrust(),
				uri -> "https".equals(uri.getScheme()) ? provider.port() : metadata.getAddress().getPort())) {
			ComputeEngineCredentials credentials = ComputeEngineCredentials.newBuilder().setHttpTransportFactory(() -> transport).build();
			String token = provider.token(); FirebaseApp app = app(transport, credentials);
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				assertEquals("synthetic", FirebaseAuth.getInstance(app).verifyIdToken(token, true).getUid());
				assertTrue(operation.elapsedMillis() < 1_000);
				assertEquals(1, metadataCalls.get()); assertEquals(2, provider.paths.size());
				assertReleased(operation, transport);
				System.out.println("FIREBASE_OWNED_SPIKE compute elapsedMs=" + operation.elapsedMillis() + " metadataCalls=" + metadataCalls.get());
			} finally { app.delete(); }
			assertEquals(0, operation.openChannels()); assertEquals(0, transport.destinations());
		} finally { metadata.stop(0); }
	}

	@Test void stalledTlsHandshakeClosesTheActualTcpChannelBeforeOperationReturn() throws Exception {
		try (ServerSocket listener = new ServerSocket(0); TlsProvider trust = new TlsProvider(); FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), trust.clientTrust(), listener.getLocalPort())) {
			CompletableFuture<Boolean> closed = CompletableFuture.supplyAsync(() -> {
				try (Socket peer = listener.accept()) {
					peer.setSoTimeout(2_000);
					int first = peer.getInputStream().read();
					if (first != 22) return false; // TLS handshake record; never respond to it.
					while (peer.getInputStream().read() >= 0) { }
					return true;
				} catch (IOException failure) { throw new IllegalStateException(failure); }
			});
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				assertThrows(IOException.class, () -> transport.createRequestFactory().buildGetRequest(new GenericUrl("https://www.googleapis.com/key")).execute());
				assertTrue(operation.elapsedMillis() < 1_000, "TLS stall returned in " + operation.elapsedMillis());
				assertEquals(0, operation.openChannels());
				assertReleased(operation, transport);
				assertTrue(closed.get(1, TimeUnit.SECONDS));
				System.out.println("FIREBASE_OWNED_SPIKE tlsStall elapsedMs=" + operation.elapsedMillis() + " peerClosed=true channels=0");
			}
			assertEquals(0, transport.destinations());
		}
	}

	@Test void realOAuth503DoesNotInvokeServiceOrFirebaseBackoff() throws Exception {
		for (boolean service : new boolean[] {false, true}) {
			try (TlsProvider provider = new TlsProvider(new Behavior("/token", 503, false, 0)); FirebaseDnsCandidateTest.DnsServer server = dns();
				FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), provider.clientTrust(), provider.port())) {
				GoogleCredentials credentials = service ? ServiceAccountCredentials.newBuilder().setClientEmail("synthetic@example.invalid")
					.setPrivateKey(provider.privateKey()).setScopes(List.of("https://www.googleapis.com/auth/cloud-platform"))
					.setHttpTransportFactory(() -> transport).build().createWithCustomRetryStrategy(false)
					: UserCredentials.newBuilder().setClientId("synthetic").setClientSecret("synthetic").setRefreshToken("synthetic").setHttpTransportFactory(() -> transport).build();
				String token = provider.token(); FirebaseApp app = app(transport, credentials);
				FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
				try (operation) {
					assertThrows(FirebaseAuthException.class, () -> FirebaseAuth.getInstance(app).verifyIdToken(token, true));
					assertEquals(List.of(200, 503), operation.statuses()); assertEquals(2, provider.paths.size());
					assertTrue(operation.elapsedMillis() < 1_000, "OAuth failure exceeded allocation");
					assertReleased(operation, transport);
					System.out.println("FIREBASE_OWNED_SPIKE oauth503 service=" + service + " elapsedMs=" + operation.elapsedMillis() + " attempts=" + operation.attempts());
				} finally { app.delete(); }
				assertEquals(0, operation.openChannels()); assertEquals(0, transport.destinations());
			}
		}
	}

	@Test void coldSequentialDelaysCannotReceiveThreeIndependentAllocations() throws Exception {
		try (TlsProvider provider = new TlsProvider(new Behavior("*", 200, false, 350)); FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), provider.clientTrust(), provider.port())) {
			GoogleCredentials credentials = UserCredentials.newBuilder().setClientId("synthetic").setClientSecret("synthetic").setRefreshToken("synthetic").setHttpTransportFactory(() -> transport).build();
			String token = provider.token(); FirebaseApp app = app(transport, credentials);
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				assertThrows(FirebaseAuthException.class, () -> FirebaseAuth.getInstance(app).verifyIdToken(token, true));
				assertTrue(operation.elapsedMillis() < 1_000); assertEquals(3, provider.paths.size());
				assertEquals(0, operation.openChannels());
				assertReleased(operation, transport);
				System.out.println("FIREBASE_OWNED_SPIKE delayedCold elapsedMs=" + operation.elapsedMillis() + " attempts=" + operation.attempts());
			} finally { app.delete(); }
		}
	}

	@Test void stalledOAuthRefreshClosesItsSocketAndCannotBackoffOutsideDeadline() throws Exception {
		try (TlsProvider provider = new TlsProvider(new Behavior("/token", 200, true, 0)); FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), provider.clientTrust(), provider.port())) {
			GoogleCredentials credentials = ServiceAccountCredentials.newBuilder().setClientEmail("synthetic@example.invalid").setPrivateKey(provider.privateKey())
				.setScopes(List.of("https://www.googleapis.com/auth/cloud-platform")).setHttpTransportFactory(() -> transport).build().createWithCustomRetryStrategy(false);
			String token = provider.token(); FirebaseApp app = app(transport, credentials);
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				assertThrows(FirebaseAuthException.class, () -> FirebaseAuth.getInstance(app).verifyIdToken(token, true));
				assertTrue(operation.elapsedMillis() < 1_000); assertEquals(2, provider.paths.size());
				assertEquals(0, operation.openChannels());
				assertReleased(operation, transport);
				System.out.println("FIREBASE_OWNED_SPIKE oauthStall elapsedMs=" + operation.elapsedMillis() + " attempts=" + operation.attempts());
			} finally { app.delete(); }
		}
	}

	@Test void unavailableLocalAcceptBacklogRefusesConnectAndReleasesItsChannel() throws Exception {
		List<Socket> fillers = new ArrayList<>();
		try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getLoopbackAddress()); TlsProvider trust = new TlsProvider();
			FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), trust.clientTrust(), listener.getLocalPort())) {
			boolean saturated = false;
			for (int count = 0; count < 32; count++) {
				Socket socket = new Socket();
				try { socket.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), listener.getLocalPort()), 30); fillers.add(socket); }
				catch (java.net.SocketTimeoutException expected) { socket.close(); saturated = true; break; }
				catch (java.net.ConnectException expected) { socket.close(); saturated = true; break; }
			}
			assertTrue(saturated, "Fixture could not saturate the local accept backlog");
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				assertThrows(IOException.class, () -> transport.createRequestFactory().buildGetRequest(new GenericUrl("http://www.googleapis.com/connect")).execute());
				assertTrue(operation.elapsedMillis() < 1_000); assertEquals(0, operation.startedWrites());
				assertEquals(0, operation.openChannels());
				assertReleased(operation, transport);
				System.out.println("FIREBASE_OWNED_SPIKE connectFailure elapsedMs=" + operation.elapsedMillis() + " startedWrites=0 channels=0");
			}
		} finally { for (Socket socket : fillers) socket.close(); }
	}

	@Test void stalledUploadClosesTheActualChannelWithoutWaitingForWriteCompletion() throws Exception {
		CountDownLatch release = new CountDownLatch(1);
		try (ServerSocket listener = uploadListener(); TlsProvider trust = new TlsProvider(); FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), trust.clientTrust(), listener.getLocalPort())) {
			transport.sendBufferBytes(1_024);
			CompletableFuture<Boolean> closed = CompletableFuture.supplyAsync(() -> {
				try (Socket peer = listener.accept()) {
					peer.setReceiveBufferSize(1_024); peer.setSoTimeout(2_000);
					int tail = 0; while (tail != 0x0d0a0d0a) { int next = peer.getInputStream().read(); if (next < 0) return false; tail = (tail << 8) | next; }
					if (!release.await(2, TimeUnit.SECONDS)) return false;
					while (peer.getInputStream().read() >= 0) { }
					return true;
				} catch (Exception failure) { throw new IllegalStateException(failure); }
			});
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				assertThrows(IOException.class, () -> transport.createRequestFactory().buildPostRequest(new GenericUrl("http://www.googleapis.com/upload"), new ByteArrayContent("application/octet-stream", new byte[262_144])).execute());
				assertTrue(operation.elapsedMillis() < 1_000); assertEquals(1, operation.startedWrites()); assertEquals(0, operation.completedWrites());
				assertEquals(0, operation.openChannels()); assertReleased(operation, transport);
				long returnedMillis = operation.elapsedMillis(); release.countDown();
				assertTrue(closed.get(2, TimeUnit.SECONDS));
				System.out.println("FIREBASE_OWNED_SPIKE writeStall elapsedMs=" + returnedMillis + " completedWrites=0 channels=0 peerClosed=true");
			} finally { release.countDown(); }
		}
	}
	private void assertReleased(FirebaseOwnedTransportCandidate.Operation operation, FirebaseOwnedTransportCandidate transport) {
		operation.close();
		assertTrue(operation.elapsedMillis() < 1_000, "Whole operation including cleanup exceeded allocation: " + operation.elapsedMillis());
		assertEquals(0, operation.openChannels()); assertEquals(0, transport.destinations());
	}

	@Test void hostnameAndCertificateTrustRemainEnforced() throws Exception {
		for (boolean wrongHost : new boolean[] {false, true}) {
			try (TlsProvider provider = new TlsProvider(new Behavior("", 200, true, 0)); FirebaseDnsCandidateTest.DnsServer server = dns();
				FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()),
					wrongHost ? provider.clientTrust() : new SslContextFactory.Client(), provider.port())) {
				FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
				try (operation) {
					IOException failure = assertThrows(IOException.class, () -> transport.createRequestFactory().buildGetRequest(
						new GenericUrl(wrongHost ? "https://wrong.invalid/key" : "https://www.googleapis.com/key")).execute());
					boolean handshake = false;
					for (Throwable cause = failure; cause != null; cause = cause.getCause()) if (cause instanceof javax.net.ssl.SSLHandshakeException) handshake = true;
					assertTrue(handshake, "TLS verification must reject this certificate"); assertReleased(operation, transport);
				}
			}
		}
	}

	@Test void exhaustedSharedBudgetAndLateChannelCreationNeverStartNetworkWork() throws Exception {
		java.util.concurrent.atomic.AtomicLong nanos = new java.util.concurrent.atomic.AtomicLong();
		BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, ignored -> { });
		try (TlsProvider provider = new TlsProvider(); FirebaseDnsCandidateTest.DnsServer server = dns();
			FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(new FirebaseDnsCandidate(server.address()), provider.clientTrust(), provider.port())) {
			try (BrowserRequestTiming.Scope scope = timing.handling(timing.queued())) {
				nanos.set(1_000_000_000L); assertThrows(IOException.class, transport::begin); assertEquals(0, server.queries.get());
			}
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin(); operation.close();
			try (java.nio.channels.SocketChannel late = java.nio.channels.SocketChannel.open()) {
				assertThrows(IOException.class, () -> operation.track(late)); assertFalse(late.isOpen());
				assertEquals(0, server.queries.get()); assertEquals(0, transport.destinations());
			}
		}
	}
	private ServerSocket uploadListener() throws IOException {
		ServerSocket socket = new ServerSocket(); socket.setReceiveBufferSize(1_024);
		socket.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0)); return socket;
	}

	private FirebaseDnsCandidateTest.DnsServer dns() throws IOException {
		return new FirebaseDnsCandidateTest.DnsServer(query -> {
			var answer = FirebaseDnsCandidateTest.answer(query);
			answer.addRecord(new ARecord(query.getQuestion().getName(), DClass.IN, 30, InetAddress.getLoopbackAddress()), Section.ANSWER);
			return answer;
		});
	}
	private FirebaseApp app(FirebaseOwnedTransportCandidate transport, GoogleCredentials credentials) {
		return FirebaseApp.initializeApp(FirebaseOptions.builder().setProjectId(PROJECT).setCredentials(credentials).setHttpTransport(transport)
			.setConnectTimeout(250).setReadTimeout(900).setWriteTimeout(900).build(), "owned-spike-" + UUID.randomUUID());
	}

	private record Behavior(String path, int status, boolean stall, int delayMillis) { }
	private static final class TlsProvider implements AutoCloseable {
		final List<String> paths = new CopyOnWriteArrayList<>();
		private final KeyStore store;
		private final SSLServerSocket server;
		private final Thread thread;
		private volatile Throwable failure;
		private volatile Socket active;
		TlsProvider() throws Exception { this(new Behavior("", 200, false, 0)); }
		TlsProvider(Behavior behavior) throws Exception {
			store = KeyStore.getInstance("PKCS12");
			try (var input = getClass().getResourceAsStream("/firebase-spike/owned-transport.p12")) { store.load(input, "synthetic".toCharArray()); }
			KeyManagerFactory keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()); keys.init(store, "synthetic".toCharArray());
			SSLContext ssl = SSLContext.getInstance("TLS"); ssl.init(keys.getKeyManagers(), null, null);
			server = (SSLServerSocket) ssl.getServerSocketFactory().createServerSocket(0, 8, InetAddress.getLoopbackAddress());
			thread = Thread.ofPlatform().daemon(true).name("synthetic-firebase-tls").start(() -> {
				try {
					while (!server.isClosed()) try (Socket peer = server.accept()) {
						active = peer; peer.setSoTimeout(2_000);
						ByteArrayOutputStream bytes = new ByteArrayOutputStream(); int tail = 0;
						while (tail != 0x0d0a0d0a) { int value = peer.getInputStream().read(); if (value < 0) throw new IOException("Incomplete request"); bytes.write(value); tail = (tail << 8) | value; }
						String headers = bytes.toString(StandardCharsets.ISO_8859_1); String path = headers.split(" ")[1]; paths.add(path);
						for (String line : headers.split("\r\n")) if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) peer.getInputStream().readNBytes(Integer.parseInt(line.substring(line.indexOf(':') + 1).trim()));
						boolean special = behavior.path.equals("*") || path.equals(behavior.path);
						if (special && behavior.stall) { while (peer.getInputStream().read() >= 0) { } active = null; continue; }
						if (special && behavior.delayMillis > 0) Thread.sleep(behavior.delayMillis);
						String body;
						if (path.contains("/robot/")) body = new JsonObject().add("synthetic", "-----BEGIN CERTIFICATE-----\n" + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(store.getCertificate("synthetic").getEncoded()) + "\n-----END CERTIFICATE-----\n").toString();
						else if (path.equals("/token")) body = "{\"access_token\":\"synthetic\",\"expires_in\":3600,\"token_type\":\"Bearer\"}";
						else body = "{\"users\":[{\"localId\":\"synthetic\",\"disabled\":false,\"validSince\":\"1\"}]}";
						byte[] content = body.getBytes(StandardCharsets.UTF_8);
						int status = special ? behavior.status : 200;
						peer.getOutputStream().write(("HTTP/1.1 " + status + " Synthetic\r\nContent-Type: application/json\r\nCache-Control: max-age=3600\r\nContent-Length: " + content.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
						peer.getOutputStream().write(content); peer.getOutputStream().flush(); active = null;
					}
				} catch (Throwable stopped) { if (!server.isClosed() && behavior.delayMillis == 0 && !behavior.stall) failure = stopped; }
			});
		}
		int port() { return server.getLocalPort(); }
		PrivateKey privateKey() throws Exception { return (PrivateKey) store.getKey("synthetic", "synthetic".toCharArray()); }
		SslContextFactory.Client clientTrust() throws Exception {
			KeyStore trust = KeyStore.getInstance("PKCS12"); trust.load(null, null); trust.setCertificateEntry("synthetic", store.getCertificate("synthetic"));
			SslContextFactory.Client ssl = new SslContextFactory.Client(); ssl.setTrustStore(trust); ssl.setEndpointIdentificationAlgorithm("HTTPS"); return ssl;
		}
		String token() throws Exception {
			long now = Instant.now().getEpochSecond(); Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
			String header = encoder.encodeToString("{\"alg\":\"RS256\",\"kid\":\"synthetic\"}".getBytes(StandardCharsets.UTF_8));
			String claims = new JsonObject().add("aud", PROJECT).add("iss", "https://securetoken.google.com/" + PROJECT).add("sub", "synthetic").add("iat", now).add("auth_time", now).add("exp", now + 3600).toString();
			String payload = header + "." + encoder.encodeToString(claims.getBytes(StandardCharsets.UTF_8));
			Signature signature = Signature.getInstance("SHA256withRSA"); signature.initSign(privateKey()); signature.update(payload.getBytes(StandardCharsets.US_ASCII));
			return payload + "." + encoder.encodeToString(signature.sign());
		}
		@Override public void close() throws Exception {
			server.close(); Socket peer = active; if (peer != null) peer.close(); thread.join(2_000);
			assertFalse(thread.isAlive()); if (failure != null) throw new AssertionError("TLS fixture failed", failure);
		}
	}
}
