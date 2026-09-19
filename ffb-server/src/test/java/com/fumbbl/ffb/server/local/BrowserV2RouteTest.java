package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.net.ServerCommunication;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Loopback contract for the v2-only servlet surface and WebSocket upgrade boundary. */
class BrowserV2RouteTest {
	private BrowserV2Adapter adapter;
	private Server jetty;
	private int port;

	@BeforeEach void startJetty() throws Exception {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		adapter = mock(BrowserV2Adapter.class);
		when(server.getCommunication()).thenReturn(communication);
		when(server.getProperty(anyString())).thenReturn(null);
		when(communication.execute(any(Runnable.class))).thenAnswer(call -> { ((Runnable) call.getArgument(0)).run(); return true; });
		jetty = new Server();
		ServerConnector connector = new ServerConnector(jetty); connector.setHost("127.0.0.1"); connector.setPort(0); jetty.addConnector(connector);
		ServletContextHandler context = new ServletContextHandler(); context.setContextPath("/");
		JettyWebSocketServletContainerInitializer.configure(context, null);
		BrowserV2Runtime.mountRoutes(context, server, adapter);
		jetty.setHandler(context); jetty.start(); port = connector.getLocalPort();
	}

	@AfterEach void stopJetty() throws Exception { if (jetty != null) jetty.stop(); }

	@Test void legacyAndAdministrativeRoutesAreNotMounted() throws Exception {
		for (String path : new String[] {"/browser/v1", "/session/v1", "/admin", "/command", "/gamestate", "/backup", "/replay", "/spectator"}) {
			String response = http(path);
			assertTrue(response.startsWith("HTTP/1.1 404"), path + " was exposed: " + response);
		}
		String v2 = http("/browser/v2");
		assertTrue(v2.startsWith("HTTP/1.1 404") || v2.startsWith("HTTP/1.1 405"), v2);
	}

	@Test void websocketRejectsMissingWrongDuplicateOriginAndQuery() throws Exception {
		assertEquals(403, upgradeStatus("/browser/v2", new String[0]));
		assertEquals(403, upgradeStatus("/browser/v2", new String[] {"https://example.invalid"}));
		assertEquals(403, upgradeStatus("/browser/v2", new String[] {"http://localhost:5001"}));
		assertEquals(403, upgradeStatus("/browser/v2", new String[] {"http://127.0.0.1:5173", "https://example.invalid"}));
		assertEquals(403, upgradeStatus("/browser/v2?bearer=forbidden", new String[] {"http://127.0.0.1:5173"}));
	}

	@Test void websocketAcceptsOnlyConfiguredV2LoopbackOrigins() throws Exception {
		for (String origin : new String[] {"http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5000", "http://localhost:5000"}) {
			try (RawWebSocket socket = open("/browser/v2", new String[] {origin})) {
				assertTrue(socket.header.startsWith("HTTP/1.1 101"), origin + ": " + socket.header);
			}
		}
	}

	@Test void websocketAcceptsVersionTwoPathDeliversAuthenticationAndRejectsBinary() throws Exception {
		CountDownLatch received = new CountDownLatch(1);
		doAnswer(call -> { received.countDown(); return null; }).when(adapter).receive(any(BrowserMatchAdapter.Connection.class), anyString());
		try (RawWebSocket socket = open("/browser/v2", new String[] {"http://localhost:5173"})) {
			assertTrue(socket.header.startsWith("HTTP/1.1 101"), socket.header);
			socket.send(0x1, "{\"version\":2,\"type\":\"authenticate\",\"requestId\":\"auth\",\"bearer\":\"opaque\"}".getBytes(StandardCharsets.UTF_8));
			assertTrue(received.await(5, TimeUnit.SECONDS));
			socket.send(0x2, new byte[] {1});
			assertEquals(1003, socket.closeCode());
		}
	}

	private String http(String path) throws IOException {
		try (Socket socket = socket()) {
			socket.getOutputStream().write(("GET " + path + " HTTP/1.1\r\nHost: 127.0.0.1:" + port + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
			socket.getOutputStream().flush(); return header(socket.getInputStream());
		}
	}

	private RawWebSocket open(String path, String[] origins) throws IOException {
		Socket socket = socket();
		StringBuilder request = new StringBuilder("GET ").append(path).append(" HTTP/1.1\r\nHost: 127.0.0.1:").append(port)
			.append("\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ")
			.append(Base64.getEncoder().encodeToString(new byte[16])).append("\r\n");
		for (String origin : origins) request.append("Origin: ").append(origin).append("\r\n");
		request.append("\r\n"); socket.getOutputStream().write(request.toString().getBytes(StandardCharsets.ISO_8859_1)); socket.getOutputStream().flush();
		return new RawWebSocket(socket, header(socket.getInputStream()));
	}
	private int upgradeStatus(String path, String[] origins) throws IOException {
		try (RawWebSocket socket = open(path, origins)) { return Integer.parseInt(socket.header.substring(9, 12)); }
	}

	private Socket socket() throws IOException { Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), port); socket.setSoTimeout(5000); return socket; }
	private String header(InputStream input) throws IOException {
		ByteArrayOutputStream output = new ByteArrayOutputStream(); int matched = 0; byte[] end = "\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1);
		while (matched < end.length) { int next = input.read(); if (next < 0) break; output.write(next); matched = next == end[matched] ? matched + 1 : next == end[0] ? 1 : 0; }
		return new String(output.toByteArray(), StandardCharsets.ISO_8859_1);
	}

	private static final class RawWebSocket implements AutoCloseable {
		private final Socket socket; private final InputStream input; private final String header; private final SecureRandom random = new SecureRandom();
		private RawWebSocket(Socket socket, String header) throws IOException { this.socket = socket; this.header = header; this.input = socket.getInputStream(); }
		private void send(int opcode, byte[] payload) throws IOException {
			socket.getOutputStream().write(0x80 | opcode); socket.getOutputStream().write(0x80 | payload.length);
			byte[] mask = new byte[4]; random.nextBytes(mask); socket.getOutputStream().write(mask);
			for (int index = 0; index < payload.length; index++) socket.getOutputStream().write(payload[index] ^ mask[index % 4]); socket.getOutputStream().flush();
		}
		private int closeCode() throws IOException {
			assertEquals(0x8, input.read() & 15); int length = input.read() & 127; assertTrue(length >= 2);
			return (input.read() << 8) | input.read();
		}
		@Override public void close() throws IOException { socket.close(); }
	}
}
