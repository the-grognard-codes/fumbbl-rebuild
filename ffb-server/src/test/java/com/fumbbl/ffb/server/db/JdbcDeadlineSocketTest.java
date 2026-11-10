package com.fumbbl.ffb.server.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JdbcDeadlineSocketTest {
	@Test void expiredAcquisitionCannotResetItsAllowanceAtDeferredSocketCreation() throws Exception {
		ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1);
		try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}))) {
			JdbcRequestConfiguration configuration = new JdbcRequestConfiguration("jdbc:mariadb://127.0.0.1:" + server.getLocalPort()
				+ "/synthetic?connectTimeout=30&socketTimeout=40&sessionVariables=innodb_lock_wait_timeout=1", "synthetic", "synthetic");
			try (JdbcDeadlineSocketFactory.Open plan = new JdbcDeadlineSocketFactory.Open(configuration, timer, 30, 40)) {
				Thread.sleep(75);
				assertThrows(SocketTimeoutException.class, () -> new JdbcDeadlineSocketFactory().createSocket());
				server.setSoTimeout(50);
				assertThrows(SocketTimeoutException.class, server::accept);
			}
		} finally { timer.shutdownNow(); }
	}
	@Test void absoluteCancellationReleasesAnActuallyBlockedSocketWrite() throws Exception {
		ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1);
		CountDownLatch accepted = new CountDownLatch(1), finish = new CountDownLatch(1);
		try (ServerSocket server = new ServerSocket(0, 1, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}));
			JdbcDeadlineSocketFactory.TimedSocket socket = new JdbcDeadlineSocketFactory.TimedSocket(timer)) {
			CompletableFuture<Void> peer = CompletableFuture.runAsync(() -> {
				try (Socket remote = server.accept()) { remote.setReceiveBufferSize(1024); accepted.countDown(); finish.await(3, TimeUnit.SECONDS); }
				catch (Exception failure) { throw new IllegalStateException(failure); }
			});
			socket.setSendBufferSize(1024); socket.connect(new InetSocketAddress("127.0.0.1", server.getLocalPort()), 100);
			assertTrue(accepted.await(1, TimeUnit.SECONDS));
			byte[] payload = new byte[8 * 1024 * 1024];
			socket.arm(50); long started = System.nanoTime();
			assertThrows(IOException.class, () -> socket.getOutputStream().write(payload));
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 1000);
			assertTrue(socket.disarm()); finish.countDown(); peer.get(2, TimeUnit.SECONDS);
		} finally { finish.countDown(); timer.shutdownNow(); }
	}
	@Test void cancellationIsObservableEvenWhenDriverCleanupSwallowsTheSocketException() throws Exception {
		ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1);
		try (JdbcDeadlineSocketFactory.TimedSocket socket = new JdbcDeadlineSocketFactory.TimedSocket(timer)) {
			socket.arm(1);
			long limit = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
			while (!socket.isClosed() && System.nanoTime() < limit) Thread.sleep(2);
			assertTrue(socket.isClosed());
			assertTrue(socket.disarm(), "A swallowed close IOException still represents a cleanup timeout");
		} finally { timer.shutdownNow(); }
	}
	@Test void cancelledOldTimerCannotCloseANewerOperation() throws Exception {
		ScheduledThreadPoolExecutor timer = new ScheduledThreadPoolExecutor(1);
		try (JdbcDeadlineSocketFactory.TimedSocket socket = new JdbcDeadlineSocketFactory.TimedSocket(timer)) {
			socket.arm(10); assertFalse(socket.disarm());
			socket.arm(1000); Thread.sleep(25);
			assertFalse(socket.isClosed()); assertFalse(socket.disarm());
		} finally { timer.shutdownNow(); }
	}
}
