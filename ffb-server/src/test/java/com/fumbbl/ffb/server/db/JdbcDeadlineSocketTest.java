package com.fumbbl.ffb.server.db;

import org.junit.jupiter.api.Test;

import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcDeadlineSocketTest {
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
