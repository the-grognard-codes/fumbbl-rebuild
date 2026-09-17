package com.fumbbl.gameservice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.core.JsonParser;
import org.eclipse.jetty.ee8.websocket.api.Session;
import org.eclipse.jetty.ee8.websocket.api.WebSocketAdapter;
import org.eclipse.jetty.ee8.websocket.api.WriteCallback;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledFuture;

public final class GameSocket extends WebSocketAdapter {
	private static final ObjectMapper JSON = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
	private static final int MAX_MESSAGE = 4096;
	private static final int MAX_CHAT = 1000;
	private static final Map<GameSocket, Boolean> SOCKETS = new ConcurrentHashMap<GameSocket, Boolean>();
	private static final Map<String, GameSocket> ACCOUNTS = new ConcurrentHashMap<String, GameSocket>();
	private static final ScheduledThreadPoolExecutor TIMEOUTS = timeoutExecutor();
	private static final Object MUTATION_LOCK = new Object();
	private static ScheduledThreadPoolExecutor timeoutExecutor() { ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1); executor.setRemoveOnCancelPolicy(true); return executor; }
	private final TokenVerifier verifier;
	private final AccountStore accounts;
	private final SessionManager sessions;
	private volatile String account;
	private volatile boolean closed;
	private OutboundDelivery delivery;
	private ScheduledFuture<?> authenticationTimeout;
	private ScheduledFuture<?> expiryTimeout;
	private long expiresAtMillis;
	private int messageCount;
	private long windowStarted;

	public GameSocket(TokenVerifier verifier, AccountStore accounts, SessionManager sessions) { this.verifier = verifier; this.accounts = accounts; this.sessions = sessions; }
	@Override public void onWebSocketConnect(Session session) {
		super.onWebSocketConnect(session);
		synchronized (MUTATION_LOCK) {
			if (SOCKETS.size() >= 1024) { close(1013, "busy"); return; }
			SOCKETS.put(this, Boolean.TRUE);
			delivery = new OutboundDelivery(new OutboundDelivery.Sink() {
				public boolean open() { return isConnected() && !closed; }
				public void close(int code, String reason) { GameSocket.this.close(code, reason); }
				public void write(String text, OutboundDelivery.Completion completion) {
					session.getRemote().sendString(text, new WriteCallback() {
						public void writeSuccess() { completion.succeeded(); }
						public void writeFailed(Throwable failure) { completion.failed(failure); }
					});
				}
			});
			session.setIdleTimeout(Duration.ofMinutes(5));
			authenticationTimeout = TIMEOUTS.schedule(() -> {
				synchronized (MUTATION_LOCK) { if (account == null) close(4001, "rejected"); }
			}, 10, TimeUnit.SECONDS);
		}
	}
	@Override public void onWebSocketBinary(byte[] payload, int offset, int length) { close(1003, "binary_not_supported"); }
	@Override public void onWebSocketText(String message) {
		try {
			if (closed) return;
			if (message == null || message.length() > MAX_MESSAGE) { error("invalid_message"); return; }
			if (!withinRate()) { close(1008, "rate_limited"); return; }
			JsonNode node = JSON.readTree(message); if (node == null || !node.isObject() || !node.has("type") || !node.get("type").isTextual()) { error("invalid_message"); return; }
			String type = node.get("type").asText();
			if (account == null) { authenticate(type, node); return; }
			synchronized (MUTATION_LOCK) {
			if (closed || expired()) { close(4003, "expired"); return; }
			if ("create".equals(type) && node.size() == 1) broadcast(sessions.create(account));
			else if ("join".equals(type) && node.size() == 2 && text(node, "code", 32, 32)) broadcast(sessions.join(account, node.get("code").asText()));
			else if ("chat".equals(type) && node.size() == 2 && text(node, "text", 1, MAX_CHAT)) broadcast(sessions.chat(account, node.get("text").asText()));
			else if ("leave".equals(type) && node.size() == 1) { broadcast(sessions.leave(account)); send("{\"type\":\"left\"}"); }
			else error("invalid_message");
			}
		} catch (SessionManager.GameException e) { error(e.code); }
		catch (Exception e) { error("invalid_message"); }
	}
	private void authenticate(String type, JsonNode node) throws IOException {
		if (!"authenticate".equals(type) || node.size() != 2 || !text(node, "token", 1, 3500)) { close(4001, "rejected"); return; }
		try {
			TokenVerifier.Identity identity = verifier.verify(node.get("token").asText());
			if (identity.expiresAtMillis <= System.currentTimeMillis()) throw new TokenVerifier.TokenRejectedException(true);
			synchronized (MUTATION_LOCK) {
				if (closed || !isConnected()) return;
				if (identity.expiresAtMillis <= System.currentTimeMillis()) throw new TokenVerifier.TokenRejectedException(true);
				String identified = accounts.accountFor(identity);
				if (ACCOUNTS.putIfAbsent(identified, this) != null) { close(4009, "duplicate"); return; }
				account = identified;
				expiresAtMillis = identity.expiresAtMillis;
				if (authenticationTimeout != null) authenticationTimeout.cancel(false);
				expiryTimeout = TIMEOUTS.schedule(() -> close(4003, "expired"), Math.max(1, expiresAtMillis - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
				send("{\"type\":\"authenticated\"}");
			}
		}
		catch (TokenVerifier.TokenRejectedException e) { close(e.expired ? 4003 : 4001, e.expired ? "expired" : "rejected"); }
	}
	@Override public void onWebSocketClose(int statusCode, String reason) { synchronized (MUTATION_LOCK) { closed = true; if (authenticationTimeout != null) authenticationTimeout.cancel(false); if (expiryTimeout != null) expiryTimeout.cancel(false); if (delivery != null) delivery.close(); SOCKETS.remove(this); if (account != null) { ACCOUNTS.remove(account, this); try { broadcast(sessions.disconnected(account)); } catch (SessionManager.GameException ignored) { } catch (IOException ignored) { } } } super.onWebSocketClose(statusCode, reason); }
	@Override public void onWebSocketError(Throwable cause) { /* never log client data or token-bearing exceptions */ }
	private boolean withinRate() { long now = System.currentTimeMillis(); if (now - windowStarted > 60000) { windowStarted = now; messageCount = 0; } return ++messageCount <= 30; }
	private boolean expired() { return expiresAtMillis <= System.currentTimeMillis(); }
	private boolean text(JsonNode node, String name, int minimum, int maximum) { return node.has(name) && node.get(name).isTextual() && node.get(name).asText().length() >= minimum && node.get(name).asText().length() <= maximum; }
	private void broadcast(SessionManager.Snapshot snapshot) throws IOException { for (GameSocket socket : SOCKETS.keySet()) if (socket.account != null && !socket.closed) { try { SessionManager.Snapshot recipient = socket.sessions.snapshot(socket.account); if (snapshot.code.equals(recipient.code)) socket.send(JSON.writeValueAsString(snapshotPayload(recipient))); } catch (SessionManager.GameException ignored) { } } }
	private Map<String, Object> snapshotPayload(SessionManager.Snapshot snapshot) { Map<String, Object> result = new java.util.LinkedHashMap<String, Object>(); result.put("type", "session"); result.put("code", snapshot.code); result.put("selfSlot", snapshot.selfSlot); result.put("slots", snapshot.slots); result.put("events", snapshot.events); return result; }
	private void error(String code) { try { send("{\"type\":\"error\",\"code\":\"" + code + "\"}"); } catch (IOException ignored) { } }
	private void send(String payload) throws IOException { if (delivery != null) delivery.send(payload); }
	private void close(int code, String reason) { closed = true; if (isConnected()) getSession().close(code, reason); }
}
