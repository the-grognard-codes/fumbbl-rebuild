package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.net.ServerCommunication;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class BrowserMatchTransportTest {
	@Test
	public void deadlineChecksQueueAtMostOnceAndRetryAfterEnqueueFailures() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		List<Runnable> queued = new ArrayList<>();
		AtomicInteger attempts = new AtomicInteger(), expired = new AtomicInteger();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			int attempt = attempts.incrementAndGet();
			if (attempt == 1) throw new IllegalStateException("Queue temporarily unavailable");
			if (attempt == 2) return false;
			queued.add(invocation.getArgument(0)); return true;
		});
		BrowserProtocol adapter = new BrowserProtocol() {
			public void receive(BrowserMatchAdapter.Connection connection, String text) { }
			public void disconnect(BrowserMatchAdapter.Connection connection) { }
			public void expireDecisions() { expired.incrementAndGet(); }
		};
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		transport.queueDecisionCheck(adapter); transport.queueDecisionCheck(adapter);
		transport.queueDecisionCheck(adapter); transport.queueDecisionCheck(adapter);
		assertEquals(3, attempts.get()); assertEquals(1, queued.size()); assertEquals(0, expired.get());
		queued.get(0).run(); assertEquals(1, expired.get());
		transport.queueDecisionCheck(adapter); assertEquals(2, queued.size());
		transport.destroy(); queued.get(1).run(); transport.queueDecisionCheck(adapter);
		assertEquals(1, expired.get()); assertEquals(4, attempts.get());
	}

	@Test
	public void ingressCapRejectsBrowserWorkWhileCommunicationWorkerIsBlockedAndRecoversWhenItDrains() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		List<Runnable> queuedWork = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			queuedWork.add(invocation.getArgument(0));
			return true;
		});
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		AtomicInteger rejected = new AtomicInteger();

		for (int index = 0; index < BrowserMatchTransport.MAX_INGRESS_WORK; index++) {
			assertTrue(transport.submit(() -> { }, rejected::incrementAndGet));
		}
		assertFalse(transport.submit(() -> { }, rejected::incrementAndGet));
		assertEquals(BrowserMatchTransport.MAX_INGRESS_WORK, queuedWork.size());
		assertEquals(1, rejected.get());
		assertEquals(BrowserMatchTransport.MAX_INGRESS_WORK,
			transport.getMetrics().toJson().getLong("ingressQueueDepth", -1));

		for (Runnable work : queuedWork) work.run();
		assertEquals(0, transport.getMetrics().toJson().getLong("ingressQueueDepth", -1));
		assertTrue(transport.submit(() -> { }, rejected::incrementAndGet));
		queuedWork.get(queuedWork.size() - 1).run();
		transport.destroy();
	}

	@Test
	public void connectionAcquiredBeforeShutdownCannotRegisterAfterIt() {
		BrowserMatchTransport transport = new BrowserMatchTransport(mock(FantasyFootballServer.class));
		assertTrue(transport.admitConnection());
		transport.destroy();
		assertFalse(transport.connected(mock(BrowserMatchSocket.class)));
		assertEquals(0, transport.getMetrics().toJson().getLong("activeConnections", -1));
		assertFalse(transport.admitConnection());
	}

	@Test
	public void shutdownDoesNotWaitForBlockedCommunicationWork() {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		List<Runnable> queuedWork = new ArrayList<>();
		when(server.getCommunication()).thenReturn(communication);
		when(communication.execute(any(Runnable.class))).thenAnswer(invocation -> {
			queuedWork.add(invocation.getArgument(0));
			return true;
		});
		BrowserMatchTransport transport = new BrowserMatchTransport(server);

		for (int index = 0; index < BrowserMatchTransport.MAX_INGRESS_WORK; index++) {
			assertTrue(transport.submit(() -> { }, () -> { }));
		}
		transport.destroy();
		assertEquals(BrowserMatchTransport.MAX_INGRESS_WORK,
			transport.getMetrics().toJson().getLong("ingressQueueDepth", -1));
		for (Runnable work : queuedWork) work.run();
		assertEquals(0, transport.getMetrics().toJson().getLong("ingressQueueDepth", -1));
	}
}
