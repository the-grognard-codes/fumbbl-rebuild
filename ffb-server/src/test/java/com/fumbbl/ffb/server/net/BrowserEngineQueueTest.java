package com.fumbbl.ffb.server.net;

import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

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
}
