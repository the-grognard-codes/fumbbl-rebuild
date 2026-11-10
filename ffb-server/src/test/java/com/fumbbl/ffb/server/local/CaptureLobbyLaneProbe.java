package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.net.ServerCommunication;

import com.eclipsesource.json.JsonObject;

import java.util.concurrent.ConcurrentLinkedQueue;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Uses the real lane selector, deadline scopes and metrics; the test supplies a single-owner pump. */
public final class CaptureLobbyLaneProbe {
	public JsonObject measure(boolean foreground, Runnable read, Runnable gameplay) {
		FantasyFootballServer server = mock(FantasyFootballServer.class);
		ServerCommunication communication = mock(ServerCommunication.class);
		when(server.getCommunication()).thenReturn(communication);
		ConcurrentLinkedQueue<Runnable> queue = new ConcurrentLinkedQueue<>();
		when(communication.execute(any())).thenAnswer(call -> { queue.add(call.getArgument(0)); return true; });
		BrowserMatchTransport transport = new BrowserMatchTransport(server);
		long started = System.nanoTime();
		long[] gameplayNanos = new long[1];
		try {
			for (int index = 0; index < 8; index++) transport.submit(foreground ? null
				: "{\"version\":2,\"type\":\"browse\"}", read, () -> { throw new AssertionError("Unexpected admission rejection"); });
			transport.submit(() -> { gameplay.run(); gameplayNanos[0] = System.nanoTime() - started; }, () -> { throw new AssertionError("Gameplay rejected"); });
			Runnable work; while ((work = queue.poll()) != null) work.run();
			return new JsonObject().add("forcedForeground", foreground).add("queuedReads", 8)
				.add("gameplayEndToEndMs", gameplayNanos[0] / 1e6).add("metrics", transport.getMetrics().toJson());
		} finally { transport.destroy(); }
	}
}
