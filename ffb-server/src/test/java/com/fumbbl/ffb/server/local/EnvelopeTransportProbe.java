package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.eclipse.jetty.ee8.websocket.api.RemoteEndpoint;
import org.eclipse.jetty.ee8.websocket.api.Session;
import org.eclipse.jetty.ee8.websocket.api.WriteCallback;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Test-only observation/control seam; all work still uses production transport ownership. */
public final class EnvelopeTransportProbe {
	private final BrowserMatchTransport transport;
	private final Map<Long, JsonObject> samples = new LinkedHashMap<>();
	public EnvelopeTransportProbe(BrowserMatchServlet servlet) throws Exception {
		var field = BrowserMatchServlet.class.getDeclaredField("transport"); field.setAccessible(true);
		transport = (BrowserMatchTransport) field.get(servlet);
	}
	public <T> T control(Callable<T> action) throws Exception {
		CompletableFuture<T> result = new CompletableFuture<>();
		transport.submitControl(() -> { try { result.complete(action.call()); } catch (Throwable failure) { result.completeExceptionally(failure); } },
			() -> result.completeExceptionally(new IllegalStateException("Control rejected")));
		return result.get(30, TimeUnit.SECONDS);
	}
	public synchronized void collect() {
		for (var value : transport.getMetrics().toJson().get("workerTaskSamples").asArray()) {
			JsonObject sample = value.asObject(); samples.putIfAbsent(sample.getLong("sequence", -1), sample);
		}
	}
	public void pauseWorker(long millis) {
		transport.submitControl(() -> { try { Thread.sleep(millis); } catch (InterruptedException failure) { Thread.currentThread().interrupt(); } },
			() -> { throw new IllegalStateException("Saturation fixture rejected"); });
	}
	public synchronized JsonObject evidence() {
		collect(); JsonArray result = new JsonArray(); long expected = 0, missing = 0;
		for (var entry : samples.entrySet()) { missing += entry.getKey() - expected; expected = entry.getKey() + 1; result.add(entry.getValue()); }
		return new JsonObject().add("samples", result).add("missingSamples", missing).add("metrics", transport.getMetrics().toJson());
	}
	/** Exactly one controlled asynchronous write, alongside real TCP clients. */
	public JsonObject slowRecipient(FantasyFootballServer server, BrowserProtocol adapter) throws Exception {
		Session session = mock(Session.class); RemoteEndpoint remote = mock(RemoteEndpoint.class);
		when(session.isOpen()).thenReturn(true); when(session.getRemote()).thenReturn(remote);
		AtomicLong closed = new AtomicLong();
		doAnswer(call -> { closed.compareAndSet(0, System.nanoTime()); return null; }).when(session).close(anyInt(), anyString());
		doAnswer(call -> null).when(remote).sendString(anyString(), any(WriteCallback.class));
		BrowserMatchSocket socket = new BrowserMatchSocket(server, adapter, transport); socket.onConnect(session);
		long start = System.nanoTime(); socket.send("{\"type\":\"controlledWrite\"}");
		long deadline = start + TimeUnit.SECONDS.toNanos(8);
		while (closed.get() == 0 && System.nanoTime() < deadline) Thread.sleep(10);
		long writeExpired = closed.get(); control(() -> null);
		JsonObject result = new JsonObject().add("writeExpired", writeExpired != 0)
			.add("watchdogCloseMs", writeExpired == 0 ? -1 : (writeExpired - start) / 1e6)
			.add("cleanupBarrierMs", (System.nanoTime() - start) / 1e6)
			.add("remainingConnections", transport.getMetrics().toJson().getLong("activeConnections", -1));
		socket.onClose(1000, "cleanup"); return result;
	}
}
