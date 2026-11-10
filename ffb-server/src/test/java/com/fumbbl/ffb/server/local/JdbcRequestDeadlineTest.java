package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;

import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.net.ServerCommunication;

import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.net.Socket;
import java.sql.SQLException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.ArgumentMatchers.any;

class JdbcRequestDeadlineTest {
	@Test void sustainedOutageOpensBreakerAndExpiryDisconnectAndUnrelatedControlStillProgress() throws Exception {
		try (ServerSocket listener = new ServerSocket(0, 4, java.net.InetAddress.getByAddress(new byte[] {127, 0, 0, 1}));
			JdbcRequestConnections connections = new JdbcRequestConnections(url(listener.getLocalPort(), 120), "synthetic", "synthetic")) {
			CompletableFuture<Void> peers = CompletableFuture.runAsync(() -> {
				for (int request = 0; request < 3; request++) try (Socket socket = listener.accept()) {
					socket.getOutputStream().write(new byte[] {0, 4, 0, 0});
					for (int part = 0; part < 20; part++) { socket.getOutputStream().write(10); socket.getOutputStream().flush(); Thread.sleep(20); }
				} catch (Exception expectedCancellation) { }
			});
			FantasyFootballServer server = mock(FantasyFootballServer.class);
			ServerCommunication communication = mock(ServerCommunication.class); List<Runnable> queue = new ArrayList<>();
			when(server.getCommunication()).thenReturn(communication);
			when(communication.execute(any(Runnable.class))).thenAnswer(call -> { queue.add(call.getArgument(0)); return true; });
			BrowserMatchTransport transport = new BrowserMatchTransport(server);
			AtomicLong progress = new AtomicLong(); BrowserProtocol adapter = mock(BrowserProtocol.class);
			doAnswer(call -> { progress.incrementAndGet(); return null; }).when(adapter).expireDecisions();
			try {
				BrowserMatchSocket socket = mock(BrowserMatchSocket.class);
				assertTrue(transport.admitConnection()); assertTrue(transport.connected(socket));
				for (int index = 0; index < 32; index++) assertTrue(transport.submit(() -> assertThrows(SQLException.class, connections::open), () -> { throw new AssertionError(); }));
				transport.queueDecisionCheck(adapter); transport.disconnect(socket, progress::incrementAndGet);
				transport.submitControl(progress::incrementAndGet, () -> { throw new AssertionError(); });
				queue.forEach(Runnable::run);
				assertEquals(3, connections.connectionAttempts(), "Open circuit must not repeat JDBC work for queued requests");
				assertEquals(3, progress.get());
				assertEquals(0, transport.getMetrics().toJson().getLong("activeConnections", -1));
				assertEquals(0, transport.getMetrics().toJson().getLong("ingressQueueDepth", -1));
				assertEquals(null, new BrowserRequestTiming().budget());
			} finally { transport.destroy(); }
			peers.get(3, TimeUnit.SECONDS);
		}
	}
	@Test void exhaustedAndSubMillisecondUsableBudgetsNeverContactTheDriverOrOpenTheBreaker() throws Exception {
		AtomicLong nanos = new AtomicLong();
		BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, ignored -> { });
		try (JdbcRequestConnections connections = new JdbcRequestConnections(url(1, 1500), "synthetic", "synthetic")) {
			for (int index = 0; index < 4; index++) {
				try (BrowserRequestTiming.Scope scope = timing.handling(timing.queued())) {
					nanos.addAndGet(1_849_500_001L);
					assertThrows(JdbcConnections.NotStarted.class, connections::open);
				}
			}
			assertEquals(0, connections.connectionAttempts());
		}
	}
	@Test void partialHandshakeTrickleCannotRenewTheAbsoluteAcquisitionAllowance() throws Exception {
		try (ServerSocket listener = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress());
			JdbcRequestConnections connections = new JdbcRequestConnections(url(listener.getLocalPort(), 180), "synthetic", "synthetic")) {
			CompletableFuture<Void> peer = CompletableFuture.runAsync(() -> {
				try (Socket socket = listener.accept()) {
					socket.getOutputStream().write(new byte[] {0, 4, 0, 0}); // Announce an incomplete 1,024-byte handshake.
					for (int index = 0; index < 30; index++) { socket.getOutputStream().write(10); socket.getOutputStream().flush(); Thread.sleep(35); }
				} catch (Exception expectedCancellation) { /* The actual client socket is closed by the deadline. */ }
			});
			long started = System.nanoTime();
			assertThrows(SQLException.class, connections::open);
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
			assertTrue(elapsed < 1000, "Underlying driver acquisition returned in " + elapsed + " ms");
			peer.get(2, TimeUnit.SECONDS);
			assertEquals(1, connections.connectionAttempts());
		}
	}
	private String url(int port, int socketMillis) {
		return "jdbc:mariadb://127.0.0.1:" + port + "/synthetic?connectTimeout=100&socketTimeout=" + socketMillis
			+ "&sessionVariables=innodb_lock_wait_timeout=1";
	}
}
