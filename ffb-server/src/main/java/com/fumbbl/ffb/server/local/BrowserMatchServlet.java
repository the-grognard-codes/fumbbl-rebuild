package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.FantasyFootballServer;

import org.eclipse.jetty.ee8.websocket.server.JettyServerUpgradeRequest;
import org.eclipse.jetty.ee8.websocket.server.JettyServerUpgradeResponse;
import org.eclipse.jetty.ee8.websocket.server.JettyWebSocketCreator;
import org.eclipse.jetty.ee8.websocket.server.JettyWebSocketServlet;
import org.eclipse.jetty.ee8.websocket.server.JettyWebSocketServletFactory;

public class BrowserMatchServlet extends JettyWebSocketServlet implements JettyWebSocketCreator {
	private final BrowserProtocol adapter;
	private final FantasyFootballServer server;
	private final BrowserMatchTransport transport;
	private final BrowserV2TransportPolicy policy;

	public BrowserMatchServlet(FantasyFootballServer server, BrowserProtocol adapter) {
		this.server = server;
		this.adapter = adapter;
		this.policy = new BrowserV2TransportPolicy(server.getProperty("server.base"),
			server.getProperty("local.browser.v2.proxy.profile"));
		this.transport = new BrowserMatchTransport(server);
		this.transport.startDecisionChecks(adapter);
	}

	@Override
	public void configure(JettyWebSocketServletFactory factory) {
		// The existing delivery watchdog bounds asynchronous writes to two seconds.
		factory.setCreator(this);
	}

	@Override
	public Object createWebSocket(JettyServerUpgradeRequest request, JettyServerUpgradeResponse response) {
		String origin = request.getHeader("Origin");
		if (request.getHeaders("Host").size() != 1
			|| !policy.permits(request.getRequestURI(), request.getHeader("Host"), origin)) {
			response.setStatusCode(403); return null;
		}
		if (request.getHeaders("Origin").size() != 1) {
			response.setStatusCode(403);
			return null;
		}
		// The browser protocol uses uncompressed text JSON; no negotiated decoding expansion.
		response.setExtensions(java.util.Collections.emptyList());
		return new BrowserMatchSocket(server, adapter, transport);
	}

	public JsonObject getTransportMetrics() { return transport.getMetrics().toJson(); }

	@Override
	public void destroy() {
		transport.destroy();
		super.destroy();
	}
}
