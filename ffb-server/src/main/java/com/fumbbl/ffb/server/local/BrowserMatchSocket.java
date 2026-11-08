package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;

import org.eclipse.jetty.ee8.websocket.api.Session;
import org.eclipse.jetty.ee8.websocket.api.WriteCallback;
import org.eclipse.jetty.ee8.websocket.api.annotations.OnWebSocketClose;
import org.eclipse.jetty.ee8.websocket.api.annotations.OnWebSocketConnect;
import org.eclipse.jetty.ee8.websocket.api.annotations.OnWebSocketMessage;
import org.eclipse.jetty.ee8.websocket.api.annotations.OnWebSocketError;
import org.eclipse.jetty.ee8.websocket.api.annotations.WebSocket;

import java.util.concurrent.atomic.AtomicBoolean;

@WebSocket(maxTextMessageSize = 16 * 1024)
public class BrowserMatchSocket implements BrowserConnection {
	private final BrowserProtocol adapter;
	private final FantasyFootballServer server;
	private final BrowserMatchTransport transport;
	private final AtomicBoolean active = new AtomicBoolean();
	private volatile BrowserMatchDelivery delivery;
	private volatile Session session;
	private volatile boolean diagnosticsEnabled;
	private volatile boolean detailsEnabled;
	private final BrowserRequestTiming timing = new BrowserRequestTiming();

	public BrowserMatchSocket(FantasyFootballServer server, BrowserProtocol adapter, BrowserMatchTransport transport) {
		this.server = server;
		this.adapter = adapter;
		this.transport = transport;
	}

	@OnWebSocketConnect
	public void onConnect(Session session) {
		this.session = session;
		if (!transport.admitConnection()) {
			session.close(1013, "Local browser connection limit reached");
			return;
		}
		active.set(true);
		if (!transport.connected(this)) {
			active.set(false);
			session.close(1012, "Local browser transport stopping");
			return;
		}
		try {
			session.setIdleTimeout(java.time.Duration.ofMinutes(15));
			delivery = new BrowserMatchDelivery(new SessionSink(session), transport.getMetrics(),
				BrowserMatchTransport.MAX_OUTBOUND_MESSAGES, BrowserMatchTransport.MAX_OUTBOUND_BYTES);
		} catch (RuntimeException exception) {
			retire(1011, "Local browser connection setup failed");
		}
	}

	@OnWebSocketMessage
	public void onText(String message) {
		if (!active.get() || session == null || !session.isOpen()) return;
		transport.submit(message, () -> {
			if (!active.get() || !session.isOpen()) return;
			try {
				adapter.receive(this, message);
			} catch (RuntimeException exception) {
				// Protocol failures never log request bodies or provider exception details.
				retireFromEngineWorker(1011, "Browser protocol unavailable; reconnect for a full snapshot");
			}
		}, () -> retire(1013, "Local browser transport overloaded"), diagnosticsEnabled);
	}

	@OnWebSocketClose
	public void onClose(int statusCode, String reason) {
		boolean wasActive = active.getAndSet(false);
		BrowserMatchDelivery activeDelivery = delivery;
		if (activeDelivery != null) activeDelivery.close();
		if (wasActive) {
			transport.disconnect(this, () -> adapter.disconnect(this));
		}
	}

	@OnWebSocketMessage
	public void onBinary(byte[] bytes, int offset, int length) {
		retire(1003, "Browser protocol requires text JSON");
	}

	@OnWebSocketError
	public void onError(Throwable failure) {
		// Jetty may report a failure before its close notification. Release once.
		retire(1011, "Browser transport failed; reconnect for a full snapshot");
	}

	@Override
	public void diagnosticsEnabled(boolean enabled) { diagnosticsEnabled = enabled; }
	@Override public void diagnosticDetailsEnabled(boolean enabled) { detailsEnabled = enabled; }
	@Override public boolean diagnosticDetailsEnabled() { return diagnosticsEnabled && detailsEnabled; }
	@Override public void sendDiagnosticTrace(String message) {
		BrowserMatchDelivery activeDelivery = delivery;
		if (active.get() && diagnosticDetailsEnabled() && activeDelivery != null) activeDelivery.sendTrace(message);
	}

	@Override
	public void sendDiagnostics(String message) {
		BrowserMatchDelivery activeDelivery = delivery;
		if (active.get() && diagnosticsEnabled && activeDelivery != null) activeDelivery.sendOptional(message);
	}

	@Override
	public void send(String message) {
		BrowserMatchDelivery.WriteObserver observer = timing.claimWriteObserver();
		if (!active.get()) { unobserved(observer, "closed"); return; }
		BrowserMatchDelivery activeDelivery = delivery;
		if (activeDelivery != null) activeDelivery.sendWithOptionalPredecessor(null, message, observer);
		else unobserved(observer, "unavailable");
	}

	@Override
	public void sendWithOptionalPredecessor(String optional, String mandatory) {
		BrowserMatchDelivery.WriteObserver observer = timing.claimWriteObserver();
		if (!active.get()) { unobserved(observer, "closed"); return; }
		BrowserMatchDelivery activeDelivery = delivery;
		if (activeDelivery != null) activeDelivery.sendWithOptionalPredecessor(optional, mandatory, observer);
		else unobserved(observer, "unavailable");
	}
	private void unobserved(BrowserMatchDelivery.WriteObserver observer, String status) {
		if (observer != null) try { observer.completed(status, -1, -1, -1); } catch (RuntimeException ignored) { }
	}

	@Override
	public void close(int statusCode, String reason) {
		retireFromEngineWorker(statusCode, reason);
	}

	void closeFromEngineWorker() {
		retireFromEngineWorker(1012, "Browser transport stopping; reconnect for a full snapshot");
	}

	private void retireFromEngineWorker(int statusCode, String reason) {
		if (active.getAndSet(false)) transport.disconnectFromEngineWorker(this, () -> adapter.disconnect(this));
		BrowserMatchDelivery activeDelivery = delivery;
		if (activeDelivery != null) activeDelivery.close();
		closeSession(statusCode, reason);
	}

	void expireDelivery(long now) {
		BrowserMatchDelivery activeDelivery = delivery;
		if (activeDelivery != null) activeDelivery.expireIfStalled(now, BrowserMatchTransport.OUTBOUND_WRITE_TIMEOUT_MS);
	}

	private void retire(int statusCode, String reason) {
		if (active.getAndSet(false)) transport.disconnect(this, () -> adapter.disconnect(this));
		BrowserMatchDelivery activeDelivery = delivery;
		if (activeDelivery != null) activeDelivery.close();
		closeSession(statusCode, reason);
	}

	private void closeSession(int statusCode, String reason) {
		Session activeSession = session;
		if (activeSession != null && activeSession.isOpen()) activeSession.close(statusCode, reason);
	}

	private class SessionSink implements BrowserMatchDelivery.Sink {
		private final Session session;
		private SessionSink(Session session) { this.session = session; }
		@Override public boolean isOpen() { return session.isOpen(); }
		@Override public void close(int statusCode, String reason) { retire(statusCode, reason); }
		@Override public void send(String message, BrowserMatchDelivery.Completion completion) {
			session.getRemote().sendString(message, new WriteCallback() {
				@Override public void writeFailed(Throwable failure) { completion.failed(failure); }
				@Override public void writeSuccess() { completion.succeeded(); }
			});
		}
	}
}
