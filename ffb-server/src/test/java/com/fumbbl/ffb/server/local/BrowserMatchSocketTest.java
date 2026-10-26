package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.eclipse.jetty.ee8.websocket.api.Session;
import org.eclipse.jetty.ee8.websocket.api.RemoteEndpoint;
import org.eclipse.jetty.ee8.websocket.api.WriteCallback;
import org.eclipse.jetty.ee8.websocket.server.JettyServerUpgradeRequest;
import org.eclipse.jetty.ee8.websocket.server.JettyServerUpgradeResponse;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Arrays;
import java.nio.charset.StandardCharsets;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class BrowserMatchSocketTest {
	@Test
	public void largeSolidDefenceReplyReachesTheClientWithoutClosingItsSocket() throws Exception {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		BrowserProtocol adapter = mock(BrowserProtocol.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		Session session = mock(Session.class);
		RemoteEndpoint remote = mock(RemoteEndpoint.class);
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> { ((Runnable) invocation.getArgument(0)).run(); return true; });
		when(session.isOpen()).thenReturn(true);
		when(session.getRemote()).thenReturn(remote);
		List<String> received = new ArrayList<>();
		doAnswer(invocation -> {
			received.add(invocation.getArgument(0));
			((WriteCallback) invocation.getArgument(1)).writeSuccess();
			return null;
		}).when(remote).sendString(any(String.class), any(WriteCallback.class));
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		try {
			BrowserMatchSocket socket = new BrowserMatchSocket(server, adapter, transport);
			socket.onConnect(session);
			JsonArray actions = new JsonArray();
			for (int player = 0; player < 6; player++) for (int square = 0; square < 195; square++) {
				String playerId = "00000000-0000-0000-0000-00000000000" + player;
				actions.add(new JsonObject().add("id", "event-" + playerId + "-" + square)
					.add("label", "Redeploy selected defence player to square " + square).add("actor", "home")
					.add("kind", "kickoffMove").add("sourcePlayerId", playerId)
					.add("target", new JsonObject().add("x", square % 13).add("y", square / 13)));
			}
			String reply = new JsonObject().add("version", 2).add("type", "setupState")
				.add("state", new JsonObject().add("turnMode", "SOLID_DEFENCE").add("actions", actions)).toString();
			assertTrue(reply.getBytes(StandardCharsets.UTF_8).length > 256 * 1024);
			socket.sendWithOptionalPredecessor("history", reply);
			assertEquals(Arrays.asList("history", reply), received);
			verify(session, never()).close(anyInt(), any(String.class));
			assertEquals(0, transport.getMetrics().toJson().getLong("deliveryQueueBytes", -1));
		} finally { transport.destroy(); }
	}
	@Test
	public void committedGameplayBypassesQueuedAdvisoryReadsWithoutReorderingOtherRequests() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		Session session = mock(Session.class);
		List<Runnable> queued = new ArrayList<>();
		List<String> received = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(session.isOpen()).thenReturn(true);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			queued.add(invocation.getArgument(0)); return true;
		});
		BrowserProtocol adapter = new BrowserProtocol() {
			public void receive(BrowserMatchAdapter.Connection connection, String text) { received.add(text); }
			public void disconnect(BrowserMatchAdapter.Connection connection) { }
		};
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		BrowserMatchSocket socket = new BrowserMatchSocket(server, adapter, transport);
		socket.onConnect(session);
		String authentication = "{\"version\":2,\"type\":\"authenticate\",\"requestId\":\"auth\",\"bearer\":\"test-token\"}";
		String range = "{\"version\":2,\"type\":\"movementRange\",\"requestId\":\"range\",\"matchId\":\"match\",\"expectedRevision\":7,\"playerId\":\"player\"}";
		String preview = "{\"version\":2,\"type\":\"movementPreview\",\"requestId\":\"preview\",\"matchId\":\"match\",\"expectedRevision\":7,\"playerId\":\"player\",\"kind\":\"move\",\"targetPlayerId\":null,\"waypoints\":[]}";
		String first = "{\"version\":2,\"type\":\"setup\",\"requestId\":\"first\",\"operation\":\"action\",\"matchId\":\"match\",\"expectedRevision\":7,\"actionId\":\"select\"}";
		String second = first.replace("first", "second");
		socket.onText(authentication); socket.onText(range); socket.onText(preview);
		socket.onText(first); socket.onText(second);
		for (Runnable work : queued) work.run();
		assertEquals(java.util.Arrays.asList(authentication, first, second, range, preview), received);
		transport.destroy();
	}

	@Test
	public void disconnectedAdvisorySocketCannotReachAdapterOrDelayAnotherSocketGameplay() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		BrowserMatchAdapter adapter = mock(BrowserMatchAdapter.class);
		List<Runnable> queued = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			queued.add(invocation.getArgument(0)); return true;
		});
		Session retiredSession = mock(Session.class), activeSession = mock(Session.class);
		when(retiredSession.isOpen()).thenReturn(true);
		when(activeSession.isOpen()).thenReturn(true);
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		BrowserMatchSocket retired = new BrowserMatchSocket(server, adapter, transport);
		BrowserMatchSocket active = new BrowserMatchSocket(server, adapter, transport);
		retired.onConnect(retiredSession); active.onConnect(activeSession);
		retired.onText("{\"version\":2,\"type\":\"movementRange\",\"requestId\":\"retired\"}");
		String mutation = "{\"version\":2,\"type\":\"setup\",\"requestId\":\"active\",\"operation\":\"action\"}";
		active.onText(mutation);
		retired.onClose(1000, "closed");
		queued.get(0).run();
		verify(adapter).receive(active, mutation);
		for (int index = 1; index < queued.size(); index++) queued.get(index).run();
		verify(adapter, never()).receive(eq(retired), any(String.class));
		verify(adapter, times(1)).disconnect(retired);
		assertEquals(0, transport.getMetrics().toJson().getLong("ingressQueueDepth", -1));
		transport.destroy();
	}

	@Test
	public void servletOperatorControlIsAnOrderedBarrierBeforeLaterGameplay() throws Exception {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		List<Runnable> queued = new java.util.concurrent.CopyOnWriteArrayList<>();
		List<String> handled = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			queued.add(invocation.getArgument(0)); return true;
		});
		BrowserProtocol adapter = new BrowserProtocol() {
			public void receive(BrowserMatchAdapter.Connection connection, String text) { handled.add(text); }
			public void disconnect(BrowserMatchAdapter.Connection connection) { }
		};
		BrowserMatchServlet servlet = new BrowserMatchServlet(server, adapter);
		try {
			JettyServerUpgradeRequest request = mock(JettyServerUpgradeRequest.class);
			when(request.getHeader("Origin")).thenReturn("http://localhost:5173");
			when(request.getHeaders("Origin")).thenReturn(java.util.Collections.singletonList("http://localhost:5173"));
			BrowserMatchSocket socket = (BrowserMatchSocket) servlet.createWebSocket(request, mock(JettyServerUpgradeResponse.class));
			Session session = mock(Session.class);
			when(session.isOpen()).thenReturn(true);
			socket.onConnect(session);
			String range = "{\"version\":2,\"type\":\"movementRange\",\"requestId\":\"range\"}";
			String action = "{\"version\":2,\"type\":\"setup\",\"requestId\":\"action\",\"operation\":\"action\"}";
			socket.onText(range);
			servlet.submitControl(() -> handled.add("operator"), () -> { throw new AssertionError("Unexpected rejection"); });
			socket.onText(action);
			while (!queued.isEmpty()) queued.remove(0).run();
			assertEquals(java.util.Arrays.asList("operator", action, range), handled);
		} finally {
			// This unit fixture has no Jetty servlet lifecycle to destroy.
			java.lang.reflect.Field transport = BrowserMatchServlet.class.getDeclaredField("transport");
			transport.setAccessible(true);
			((BrowserMatchTransport) transport.get(servlet)).destroy();
		}
	}

	@Test
	public void queuedBrowserMessageCannotReachAdapterAfterFixtureResetRetiresSocket() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		BrowserMatchAdapter adapter = mock(BrowserMatchAdapter.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		Session session = mock(Session.class);
		List<Runnable> queuedWork = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(session.isOpen()).thenReturn(true);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			queuedWork.add(invocation.getArgument(0));
			return true;
		});
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		BrowserMatchSocket socket = new BrowserMatchSocket(server, adapter, transport);

		socket.onConnect(session);
		socket.onText("{\"type\":\"join\"}");
		socket.closeFromEngineWorker();
		queuedWork.get(0).run();
		socket.onClose(1000, "closed");

		verify(adapter, never()).receive(any(BrowserMatchAdapter.Connection.class), any(String.class));
		verify(adapter, times(1)).disconnect(socket);
		verify(session, times(1)).close(eq(1012), any(String.class));
		transport.destroy();
	}

	@Test
	public void failedConnectionSetupReleasesAdmissionWithoutJettyCloseCallback() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		BrowserMatchAdapter adapter = mock(BrowserMatchAdapter.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			((Runnable) invocation.getArgument(0)).run();
			return true;
		});
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		for (int index = 0; index < 32; index++) {
			Session broken = mock(Session.class);
			when(broken.isOpen()).thenReturn(true);
			doThrow(new IllegalStateException("closed during setup")).when(broken).setIdleTimeout(java.time.Duration.ofMinutes(15));
			new BrowserMatchSocket(server, adapter, transport).onConnect(broken);
		}
		assertEquals(0, transport.getMetrics().toJson().getLong("activeConnections", -1));
		Session healthy = mock(Session.class);
		when(healthy.isOpen()).thenReturn(true);
		new BrowserMatchSocket(server, adapter, transport).onConnect(healthy);
		verify(healthy).setIdleTimeout(java.time.Duration.ofMinutes(15));
		assertEquals(1, transport.getMetrics().toJson().getLong("activeConnections", -1));
		assertEquals(0, transport.getMetrics().toJson().getLong("admissionRejected", -1));
		transport.destroy();
	}

	@Test
	public void unadmittedSocketIgnoresFrames() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		BrowserMatchAdapter adapter = mock(BrowserMatchAdapter.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		Session session = mock(Session.class);
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		when(server.getCommunication()).thenReturn(communication);
		when(session.isOpen()).thenReturn(true);
		for (int index = 0; index < BrowserMatchTransport.MAX_CONNECTIONS; index++) transport.admitConnection();
		BrowserMatchSocket socket = new BrowserMatchSocket(server, adapter, transport);

		socket.onConnect(session);
		socket.onText("{\"type\":\"join\"}");
		socket.onClose(1000, "closed");

		verify(session).close(eq(1013), any(String.class));
		verify(communication, never()).execute(any(Runnable.class));
		transport.destroy();
	}
}
