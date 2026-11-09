package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcRequestConnections;

import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.net.Socket;
import java.sql.SQLException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcRequestDeadlineTest {
	@Test void exhaustedAndSubMillisecondUsableBudgetsNeverContactTheDriverOrOpenTheBreaker() throws Exception {
		AtomicLong nanos = new AtomicLong();
		BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, ignored -> { });
		try (JdbcRequestConnections connections = new JdbcRequestConnections(url(1, 1500), "synthetic", "synthetic")) {
			for (int index = 0; index < 4; index++) {
				try (BrowserRequestTiming.Scope scope = timing.handling(timing.queued())) {
					nanos.addAndGet(1_849_500_001L);
					assertThrows(JdbcRequestConnections.NotStarted.class, connections::open);
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
