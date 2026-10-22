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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

public class BrowserMatchTransportTest {
	@Test
	public void advisoryBacklogReservesAdmissionForGameplayAndReleasesBothBudgets() {
		QueueFixture fixture = new QueueFixture();
		AtomicInteger rejected = new AtomicInteger();
		try {
			for (int index = 0; index < BrowserMatchTransport.MAX_ADVISORY_WORK; index++) {
				assertTrue(fixture.transport.submit(advisory("movementRange"), () -> { }, rejected::incrementAndGet));
			}
			assertFalse(fixture.transport.submit(advisory("movementPreview"), () -> { }, rejected::incrementAndGet));
			for (int index = BrowserMatchTransport.MAX_ADVISORY_WORK; index < BrowserMatchTransport.MAX_INGRESS_WORK; index++) {
				assertTrue(fixture.transport.submit(() -> { }, rejected::incrementAndGet));
			}
			assertFalse(fixture.transport.submit(() -> { }, rejected::incrementAndGet));
			assertEquals(2, rejected.get());
			assertEquals(BrowserMatchTransport.MAX_INGRESS_WORK, fixture.depth());
			fixture.drain();
			assertEquals(0, fixture.depth());
			for (int index = 0; index < BrowserMatchTransport.MAX_ADVISORY_WORK; index++) {
				assertTrue(fixture.transport.submit(advisory("routePreview"), () -> { }, rejected::incrementAndGet));
			}
			fixture.drain();
			assertEquals(2, rejected.get());
			assertEquals(0, fixture.depth());
		} finally { fixture.transport.destroy(); }
	}

	@Test
	public void foregroundBurstsBoundAdvisoryStarvationAndBothLanesKeepFifoOrder() {
		QueueFixture fixture = new QueueFixture();
		List<String> handled = new ArrayList<>();
		try {
			fixture.transport.submit(advisory("movementRange"), () -> handled.add("range"), () -> { });
			fixture.transport.submit(advisory("movementPreview"), () -> handled.add("preview"), () -> { });
			for (int index = 0; index < 2 * BrowserMatchTransport.MAX_FOREGROUND_BURST; index++) {
				final String id = "action-" + index;
				fixture.transport.submit(() -> handled.add(id), () -> { });
			}
			fixture.drain();
			List<String> expected = new ArrayList<>();
			for (int index = 0; index < 2 * BrowserMatchTransport.MAX_FOREGROUND_BURST; index++) {
				expected.add("action-" + index);
				if (index == BrowserMatchTransport.MAX_FOREGROUND_BURST - 1) expected.add("range");
			}
			expected.add("preview");
			assertEquals(expected, handled);
			assertEquals(0, fixture.depth());
		} finally { fixture.transport.destroy(); }
	}

	@Test
	public void aRunningAdvisoryFinishesBeforeTheNextForegroundSelection() {
		QueueFixture fixture = new QueueFixture();
		List<String> handled = new ArrayList<>();
		try {
			fixture.transport.submit(advisory("movementRange"), () -> {
				handled.add("range-start");
				fixture.transport.submit(() -> handled.add("action"), () -> { });
				handled.add("range-end");
			}, () -> { });
			fixture.drain();
			assertEquals(java.util.Arrays.asList("range-start", "range-end", "action"), handled);
		} finally { fixture.transport.destroy(); }
	}

	@Test
	public void queuedDeadlineAndDisconnectCleanupRemainAheadOfLaterGameplay() {
		QueueFixture fixture = new QueueFixture();
		List<String> handled = new ArrayList<>();
		BrowserProtocol adapter = new BrowserProtocol() {
			public void receive(BrowserMatchAdapter.Connection connection, String text) { }
			public void disconnect(BrowserMatchAdapter.Connection connection) { }
			public void expireDecisions() { handled.add("deadline"); }
		};
		try {
			BrowserMatchSocket socket = mock(BrowserMatchSocket.class);
			assertTrue(fixture.transport.admitConnection());
			assertTrue(fixture.transport.connected(socket));
			fixture.transport.submit(advisory("movementRange"), () -> handled.add("range"), () -> { });
			fixture.transport.queueDecisionCheck(adapter);
			fixture.transport.disconnect(socket, () -> handled.add("disconnect"));
			fixture.transport.submit(() -> handled.add("action"), () -> { });
			fixture.drain();
			assertEquals(java.util.Arrays.asList("deadline", "disconnect", "action", "range"), handled);
			assertEquals(0, fixture.depth());
			assertEquals(0, fixture.transport.getMetrics().toJson().getLong("activeConnections", -1));
			fixture.transport.queueDecisionCheck(adapter);
			fixture.drain();
			assertEquals("deadline", handled.get(handled.size() - 1));
		} finally { fixture.transport.destroy(); }
	}

	@Test
	public void trustedControlDoesNotConsumeBrowserCapacityOrChangeIdleMetrics() {
		QueueFixture fixture = new QueueFixture();
		AtomicInteger controlled = new AtomicInteger(), rejected = new AtomicInteger();
		try {
			assertTrue(fixture.transport.submitControl(() -> {
				assertEquals(0, fixture.depth()); controlled.incrementAndGet();
			}, rejected::incrementAndGet));
			assertEquals(0, fixture.depth());
			fixture.drain();
			for (int index = 0; index < BrowserMatchTransport.MAX_INGRESS_WORK; index++) {
				assertTrue(fixture.transport.submit(() -> { }, rejected::incrementAndGet));
			}
			assertTrue(fixture.transport.submitControl(controlled::incrementAndGet, rejected::incrementAndGet));
			fixture.drain();
			assertEquals(2, controlled.get());
			assertEquals(0, rejected.get());
			assertEquals(0, fixture.depth());
			when(fixture.communication.execute(any(Runnable.class))).thenReturn(false);
			assertFalse(fixture.transport.submitControl(() -> { }, rejected::incrementAndGet));
			assertEquals(1, rejected.get());
			assertEquals(0, fixture.depth());
		} finally { fixture.transport.destroy(); }
	}

	@Test
	public void enqueueAndWorkFailuresReleaseAdmissionAndInvokeRejectionOnce() {
		QueueFixture fixture = new QueueFixture();
		AtomicInteger rejected = new AtomicInteger();
		try {
			when(fixture.communication.execute(any(Runnable.class))).thenReturn(false);
			assertFalse(fixture.transport.submit(advisory("movementRange"), () -> { }, rejected::incrementAndGet));
			when(fixture.communication.execute(any(Runnable.class))).thenThrow(new IllegalStateException("Unavailable"));
			assertThrows(IllegalArgumentException.class, () -> fixture.transport.submit(advisory("movementRange"), () -> { }, () -> {
				rejected.incrementAndGet(); throw new IllegalArgumentException("Rejected callback failed");
			}));
			assertEquals(2, rejected.get());
			assertEquals(0, fixture.depth());
			fixture.accept();
			assertTrue(fixture.transport.submit(advisory("movementRange"), () -> { throw new IllegalStateException("Work failed"); }, rejected::incrementAndGet));
			assertThrows(IllegalStateException.class, () -> fixture.queued.remove(0).run());
			assertEquals(0, fixture.depth());
			assertEquals(2, rejected.get());
			for (int index = 0; index < BrowserMatchTransport.MAX_ADVISORY_WORK; index++) {
				assertTrue(fixture.transport.submit(advisory("movementRange"), () -> { }, rejected::incrementAndGet));
			}
			fixture.drain();
			assertEquals(0, fixture.depth());
		} finally { fixture.transport.destroy(); }
	}

	private static String advisory(String type) {
		return "{\"version\":2,\"type\":\"" + type + "\",\"requestId\":\"guidance\"}";
	}

	private static class QueueFixture {
		private final ServerCommunication communication = mock(ServerCommunication.class);
		private final List<Runnable> queued = new ArrayList<>();
		private final BrowserMatchTransport transport;
		private QueueFixture() {
			FantasyFootballServer server = mock(FantasyFootballServer.class);
			when(server.getCommunication()).thenReturn(communication);
			accept();
			transport = new BrowserMatchTransport(server);
		}
		private void accept() {
			doAnswer(invocation -> {
				queued.add(invocation.getArgument(0)); return true;
			}).when(communication).execute(any(Runnable.class));
		}
		private void drain() { while (!queued.isEmpty()) queued.remove(0).run(); }
		private long depth() { return transport.getMetrics().toJson().getLong("ingressQueueDepth", -1); }
	}

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
