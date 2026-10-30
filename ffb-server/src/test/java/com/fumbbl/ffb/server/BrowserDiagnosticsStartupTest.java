package com.fumbbl.ffb.server;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Field;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.file.Path;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BrowserDiagnosticsStartupTest {

	@TempDir Path logs;

	@Test void actualDiagnosticStartupExposesOnlyTheRetainedBrowserEndpoint() throws Exception {
		Properties properties = new Properties();
		properties.setProperty("server.local", "true");
		properties.setProperty("local.browser.v2.enabled", "false");
		properties.setProperty("local.browser.home.token", "diagnostic-home-test");
		properties.setProperty("local.browser.away.token", "diagnostic-away-test");
		properties.setProperty("server.port", "0");
		properties.setProperty("server.base", "http://127.0.0.1:22227");
		properties.setProperty("server.log.folder", logs.toString());
		properties.setProperty("db.driver", "org.mariadb.jdbc.Driver");
		FantasyFootballServer server = new FantasyFootballServer(ServerMode.STANDALONE, properties);
		try {
			server.run();
			Field listener = FantasyFootballServer.class.getDeclaredField("httpServer");
			listener.setAccessible(true);
			int port = ((ServerConnector) ((Server) listener.get(server)).getConnectors()[0]).getLocalPort();
			assertEquals(405, status(port, "/browser/v1"));
			for (String path : new String[] {"/browser/v2", "/command", "/admin", "/gamestate", "/backup", "/replay"})
				assertEquals(404, status(port, path), path);
		} finally { server.shutdownResources(); }
	}

	private int status(int port, String path) throws Exception {
		HttpURLConnection connection = (HttpURLConnection) URI.create("http://127.0.0.1:" + port + path).toURL().openConnection();
		connection.setConnectTimeout(5000);
		connection.setReadTimeout(5000);
		try { return connection.getResponseCode(); }
		finally { connection.disconnect(); }
	}
}
