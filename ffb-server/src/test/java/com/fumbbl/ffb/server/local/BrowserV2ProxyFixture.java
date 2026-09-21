package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.ServerMode;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchMembership;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;
import com.fumbbl.ffb.server.match.VerifiedIdentity;
import com.fumbbl.ffb.server.net.ServerCommunication;

import java.time.Clock;
import java.util.EnumSet;
import java.util.Properties;

import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;

/** Test-only Linux transport fixture: real Jetty/adapter/worker, synthetic principal and empty membership. */
public final class BrowserV2ProxyFixture {
	public static void main(String[] args) throws Exception {
		int port = Integer.parseInt(args[0]);
		Properties properties = new Properties();
		properties.setProperty("server.local", "true");
		properties.setProperty("server.base", "http://127.0.0.1:" + port);
		properties.setProperty("local.browser.v2.proxy.profile", "dev");
		FixtureServer server = new FixtureServer(properties);
		Thread worker = new Thread(server.getCommunication(), "proxy-fixture-single-worker");
		worker.setDaemon(true); worker.start();
		AuthenticatedPrincipal principal = new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
			EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), Long.MAX_VALUE);
		V2PrincipalAuthenticator verifier = bearer -> {
			if (!"synthetic-dev-only".equals(bearer)) throw new V2PrincipalAuthenticator.Rejected();
			return principal;
		};
		V2PrincipalDirectory directory = new V2PrincipalDirectory() {
			public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) { return principal; }
			public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal current) { return current; }
		};
		MatchMembershipRepository memberships = new MatchMembershipRepository() {
			public MatchMembership find(String matchId, String accountId) { return null; }
			public boolean hasMatch(String matchId) { return false; }
			public void insert(MatchMembership membership) { throw new UnsupportedOperationException(); }
		};
		BrowserV2Adapter adapter = new BrowserV2Adapter(verifier, new V2MatchAccess(memberships, directory, Clock.systemUTC()), null, null, null, null);
		Server jetty = new Server();
		ServerConnector connector = new ServerConnector(jetty); connector.setHost("127.0.0.1"); connector.setPort(port); jetty.addConnector(connector);
		ServletContextHandler context = new ServletContextHandler(); context.setContextPath("/");
		JettyWebSocketServletContainerInitializer.configure(context, null);
		BrowserV2Runtime.mountRoutes(context, server, adapter); jetty.setHandler(context);
		jetty.start(); System.out.println("PROXY_FIXTURE_READY");
		jetty.join();
	}

	private static final class FixtureServer extends FantasyFootballServer {
		private final ServerCommunication communication;
		FixtureServer(Properties properties) { super(ServerMode.STANDALONE, properties); communication = new ServerCommunication(this); }
		@Override public ServerCommunication getCommunication() { return communication; }
	}
}
