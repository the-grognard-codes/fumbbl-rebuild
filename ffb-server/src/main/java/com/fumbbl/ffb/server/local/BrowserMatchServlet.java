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
	private BrowserFixtureControl fixtureControl;
	private final BrowserV2TransportPolicy policy;

	public BrowserMatchServlet(FantasyFootballServer server, BrowserProtocol adapter) {
		this.server = server;
		this.adapter = adapter;
		this.policy = adapter instanceof BrowserV2Adapter ? new BrowserV2TransportPolicy(server.getProperty("server.base"),
			server.getProperty("local.browser.v2.proxy.profile")) : null;
		this.transport = new BrowserMatchTransport(server);
	}

	@Override
	public void configure(JettyWebSocketServletFactory factory) {
		// The existing delivery watchdog bounds asynchronous writes to two seconds.
		factory.setCreator(this);
		if (adapter instanceof BrowserMatchAdapter && "/tmp/ffb-browser-control".equals(server.getProperty("local.browser.control.file"))) {
			fixtureControl = new BrowserFixtureControl(server, (BrowserMatchAdapter) adapter, this);
			fixtureControl.start();
		}
	}

	@Override
	public Object createWebSocket(JettyServerUpgradeRequest request, JettyServerUpgradeResponse response) {
		String origin = request.getHeader("Origin");
		if (policy != null && (request.getHeaders("Host").size() != 1
			|| !policy.permits(request.getRequestURI(), request.getHeader("Host"), origin))) {
			response.setStatusCode(403); return null;
		}
		if (request.getHeaders("Origin").size() != 1
			|| (policy == null && !allowedOrigin(origin, false))) {
			response.setStatusCode(403);
			return null;
		}
		// Version 1 is uncompressed text JSON; no negotiated decoding expansion.
		response.setExtensions(java.util.Collections.emptyList());
		return new BrowserMatchSocket(server, adapter, transport);
	}

	private boolean allowedOrigin(String origin, boolean versionTwo) {
		return "http://127.0.0.1:5173".equals(origin) || "http://localhost:5173".equals(origin)
			|| (versionTwo && ("http://127.0.0.1:5000".equals(origin) || "http://localhost:5000".equals(origin)));
	}

	public JsonObject getTransportMetrics() { return transport.getMetrics().toJson(); }

	public void closeConnections() { transport.closeConnections(); }

	@Override
	public void destroy() {
		if (fixtureControl != null) fixtureControl.close();
		transport.destroy();
		super.destroy();
	}
}
