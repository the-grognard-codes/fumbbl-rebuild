package com.fumbbl.gameservice;

import org.eclipse.jetty.server.HttpConfiguration;
import org.eclipse.jetty.server.HttpConnectionFactory;
import org.eclipse.jetty.server.SecureRequestCustomizer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.eclipse.jetty.server.SslConnectionFactory;
import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.servlet.ServletHolder;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.ee8.websocket.server.JettyServerUpgradeRequest;
import org.eclipse.jetty.ee8.websocket.server.JettyServerUpgradeResponse;
import org.eclipse.jetty.ee8.websocket.server.JettyWebSocketCreator;
import org.eclipse.jetty.ee8.websocket.server.JettyWebSocketServlet;
import org.eclipse.jetty.ee8.websocket.server.JettyWebSocketServletFactory;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;

public final class GameServiceMain {
	public static void main(String[] args) throws Exception {
		ServiceConfig config = ServiceConfig.fromEnvironment();
		final TokenVerifier verifier = new FirebaseTokenVerifier(config.projectId);
		final AccountStore accounts = new AccountStore(config.databasePath);
		final SessionManager sessions = new SessionManager();
		Server server = createServer(config, verifier, accounts, sessions);
		server.setStopAtShutdown(true);
		server.start(); server.join();
	}
	static Server createServer(ServiceConfig config, TokenVerifier verifier, AccountStore accounts, SessionManager sessions) {
		Server server = new Server();
		SslContextFactory.Server ssl = new SslContextFactory.Server(); ssl.setKeyStorePath(config.keyStore); ssl.setKeyStorePassword(config.keyStorePassword);
		ssl.setIncludeProtocols("TLSv1.2", "TLSv1.3");
		HttpConfiguration https = new HttpConfiguration(); https.addCustomizer(new SecureRequestCustomizer());
		ServerConnector connector = new ServerConnector(server, new SslConnectionFactory(ssl, "http/1.1"), new HttpConnectionFactory(https)); connector.setPort(config.port); server.addConnector(connector);
		ServletContextHandler context = new ServletContextHandler(ServletContextHandler.NO_SESSIONS); context.setContextPath("/"); server.setHandler(context);
		JettyWebSocketServletContainerInitializer.configure(context, null);
		context.addServlet(new ServletHolder(new SessionServlet(config.origin, verifier, accounts, sessions)), "/session/v1");
		return server;
	}
	private static final class SessionServlet extends JettyWebSocketServlet implements JettyWebSocketCreator {
		private final String origin; private final TokenVerifier verifier; private final AccountStore accounts; private final SessionManager sessions;
		SessionServlet(String origin, TokenVerifier verifier, AccountStore accounts, SessionManager sessions) { this.origin = origin; this.verifier = verifier; this.accounts = accounts; this.sessions = sessions; }
		@Override public void configure(JettyWebSocketServletFactory factory) { factory.setCreator(this); factory.setMaxTextMessageSize(4096); }
		@Override public Object createWebSocket(JettyServerUpgradeRequest request, JettyServerUpgradeResponse response) { if (request.getHeaders("Origin").size() != 1 || !origin.equals(request.getHeader("Origin")) || request.getRequestURI().getQuery() != null) { response.setStatusCode(403); return null; } response.setExtensions(java.util.Collections.emptyList()); return new GameSocket(verifier, accounts, sessions); }
	}
}
