package com.fumbbl.ffb.server.net;

import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BrowserEngineQueueTest {

	@Test void drainsAcceptedWorkInOrderAndRejectsWorkAfterShutdown() throws Exception {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication queue = new ServerCommunication(server);
		List<Integer> order = Collections.synchronizedList(new ArrayList<>());
		CountDownLatch entered = new CountDownLatch(1);
		assertTrue(queue.execute(() -> { entered.countDown(); order.add(1); }));
		assertTrue(queue.execute(() -> order.add(2)));
		Thread worker = new Thread(queue);
		worker.start();
		assertTrue(entered.await(5, TimeUnit.SECONDS));
		queue.shutdown();
		worker.join(5000);
		assertFalse(worker.isAlive());
		assertEquals(Arrays.asList(1, 2), order);
		assertFalse(queue.execute(() -> order.add(3)));
	}

	@Test void commandFailureDoesNotStrandFollowingBrowserWork() throws Exception {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		DebugLog log = mock(DebugLog.class);
		when(server.getDebugLog()).thenReturn(log);
		ServerCommunication queue = new ServerCommunication(server);
		CountDownLatch following = new CountDownLatch(1);
		assertTrue(queue.execute(() -> { throw new IllegalStateException("test command failure"); }));
		assertTrue(queue.execute(following::countDown));
		Thread worker = new Thread(queue);
		worker.start();
		try { assertTrue(following.await(5, TimeUnit.SECONDS)); }
		finally { queue.shutdown(); worker.join(5000); }
		verify(log).logWithOutGameId(any(IllegalStateException.class));
	}

	@Test void workerHealthDetectsStallAndRecoversWhenWorkResumes() throws Exception {
		AtomicLong now = new AtomicLong();
		ServerCommunication queue = new ServerCommunication(null, now::get, status -> { });
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		CountDownLatch following = new CountDownLatch(1);
		assertFalse(queue.isHealthy());
		queue.execute(() -> {
			entered.countDown();
			try { release.await(); }
			catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
		});
		queue.execute(following::countDown);
		Thread worker = new Thread(queue);
		worker.start();
		try {
			assertTrue(entered.await(5, TimeUnit.SECONDS));
			now.set(TimeUnit.SECONDS.toNanos(9));
			assertTrue(queue.isHealthy());
			now.set(TimeUnit.SECONDS.toNanos(10));
			assertFalse(queue.isHealthy());
			release.countDown();
			assertTrue(following.await(5, TimeUnit.SECONDS));
			assertTrue(queue.isHealthy());
		} finally {
			release.countDown();
			queue.shutdown();
			worker.join(5000);
		}
		assertFalse(queue.isHealthy());
	}

	@Test void fatalErrorStopsHealthAndLeavesQueuedWorkUnrun() throws Exception {
		AtomicInteger exit = new AtomicInteger();
		ServerCommunication queue = new ServerCommunication(null, System::nanoTime, exit::set);
		CountDownLatch following = new CountDownLatch(1);
		queue.execute(() -> { throw new AssertionError("test fatal worker failure"); });
		queue.execute(following::countDown);
		Thread worker = new Thread(queue);
		worker.start();
		worker.join(5000);
		assertFalse(worker.isAlive());
		assertEquals(1, exit.get());
		assertFalse(queue.isHealthy());
		assertFalse(queue.execute(() -> { }));
		assertEquals(1, following.getCount());
	}

	@Test void fatalWorkerHaltsTheJvmWithOneContextualLog(@TempDir Path temporary) throws Exception {
		Path output = temporary.resolve("worker.log");
		Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
			"-cp", System.getProperty("java.class.path"), FatalWorkerProcess.class.getName())
			.redirectErrorStream(true).redirectOutput(output.toFile()).start();
		try {
			assertTrue(process.waitFor(15, TimeUnit.SECONDS));
			assertEquals(1, process.exitValue());
			String log = Files.readString(output);
			assertEquals(1, log.lines().filter(line -> line.contains("Fatal browser-engine failure: type=setup matchId="
				+ "12345678-1234-1234-1234-123456789abc")).count(), log);
			assertTrue(log.contains("StackOverflowError: injected worker failure"), log);
			assertFalse(log.contains("Shutdown hook ran"), log);
		} finally {
			if (process.isAlive()) process.destroyForcibly();
		}
	}

	public static class FatalWorkerProcess {
		public static void main(String[] arguments) {
			Runtime.getRuntime().addShutdownHook(new Thread(() -> System.err.println("Shutdown hook ran")));
			ServerCommunication queue = new ServerCommunication(null);
			queue.execute(() -> {
				queue.describeWork("setup", "12345678-1234-1234-1234-123456789abc");
				throw new StackOverflowError("injected worker failure");
			});
			new Thread(queue, "browser-engine").start();
		}
	}
}
