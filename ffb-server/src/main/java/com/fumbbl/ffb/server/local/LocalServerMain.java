package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.ServerMode;
import com.fumbbl.ffb.server.db.DbConnectionManager;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Properties;
/** Container-only entry point. No live credentials or destructive initDb argument. */
public class LocalServerMain {
	static final String MARKER6_DB_URL = "jdbc:mariadb://host.docker.internal:23316/ffb_local";
	static final String REVIEW_DB_URL = "jdbc:mariadb://host.docker.internal:23317/ffb_local";
	static final String ACCEPTANCE_DB_URL = "jdbc:mariadb://host.docker.internal:23318/ffb_local";
	static final String MARKER6_DB_USER = "ffb_m6_runtime";

	public static void main(String[] args) throws Exception {
		if (args.length != 1) {
			throw new IllegalArgumentException("Expected a local server properties file");
		}
		Properties properties = new Properties();
		try (InputStream input = Files.newInputStream(Paths.get(args[0]))) {
			properties.load(input);
		}
		validateProfile(properties);
		new LocalServerMain().startVerifiedProfile(properties);
	}

	/** Caller must validate its entire profile before reading secrets or opening JDBC. */
	void startVerifiedProfile(Properties properties) throws Exception {
		// Both container and fixed native profiles reach this path after their own validation.
		// Reject a retired runtime before reading either profile's secrets.
		if (!"true".equals(properties.getProperty("local.browser.v2.enabled", "true")))
			throw new IllegalArgumentException("Browser V1 is retired; local.browser.v2.enabled must be omitted or true");
		properties.setProperty("db.password", readSecret(properties, "db.password.file"));
		FantasyFootballServer server = new FantasyFootballServer(ServerMode.STANDALONE, properties);
		Class.forName(properties.getProperty("db.driver"));
		DbConnectionManager manager = new DbConnectionManager(server);
		manager.setDbUrl(properties.getProperty("db.url"));
		manager.setDbUser(properties.getProperty("db.user"));
		manager.setDbPassword(properties.getProperty("db.password"));
		manager.setDbType("mariadb");
		new LocalSchema().initialize(manager);
		// Also drain partially started resources if startup fails after opening the listener.
		Runtime.getRuntime().addShutdownHook(new Thread(server::shutdownResources, "local-server-shutdown"));
		try {
			server.run();
		} catch (Exception failure) {
			if ("marker6-dev-native".equals(properties.getProperty("runtime.profile"))
				|| "marker6-prod-native".equals(properties.getProperty("runtime.profile"))) throw failure;
			failure.printStackTrace();
			server.stop(99);
		}
	}

	/** Allows only separately provisioned V2 database profiles. */
	static void validateProfile(Properties properties) {
		String selection = properties.getProperty("local.browser.v2.enabled", "true");
		if (!"true".equals(selection))
			throw new IllegalArgumentException("Browser V1 is retired; local.browser.v2.enabled must be omitted or true");
		boolean permittedDatabase = (MARKER6_DB_URL.equals(properties.getProperty("db.url")) || REVIEW_DB_URL.equals(properties.getProperty("db.url"))
				|| ACCEPTANCE_DB_URL.equals(properties.getProperty("db.url")))
				&& MARKER6_DB_USER.equals(properties.getProperty("db.user"));
		if (!"true".equals(properties.getProperty("server.local")) || !permittedDatabase) {
			throw new IllegalArgumentException("Local startup requires an approved local database profile");
		}
		if (!BrowserV2TransportPolicy.PROJECT.equals(properties.getProperty("local.browser.v2.firebase.project"))) {
			throw new IllegalArgumentException("Marker-6 local startup requires the approved DEV Firebase project");
		}
		if ("prod".equals(properties.getProperty("local.browser.v2.proxy.profile")))
			throw new IllegalArgumentException("Local database profiles cannot select PROD transport");
		new BrowserV2TransportPolicy(properties.getProperty("server.base"), properties.getProperty("local.browser.v2.proxy.profile"))
			.bindHost(properties.getProperty("local.transport.container.forwarding"));
		if (System.getenv("FIREBASE_AUTH_EMULATOR_HOST") != null)
			throw new IllegalArgumentException("The live DEV runtime forbids Firebase emulator credentials");
		for (String key : properties.stringPropertyNames()) {
			if (key.startsWith("fumbbl.") || key.startsWith("backup.s3.")) {
				throw new IllegalArgumentException("Live service configuration is forbidden in the local profile");
			}
		}
	}

	private String readSecret(Properties properties, String key) throws Exception {
		String path = properties.getProperty(key);
		if (path == null) {
			throw new IllegalArgumentException("Missing " + key);
		}
		String secret = new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8).trim();
		if (secret.isEmpty()) {
			throw new IllegalArgumentException("Empty " + key);
		}
		return secret;
	}
}
