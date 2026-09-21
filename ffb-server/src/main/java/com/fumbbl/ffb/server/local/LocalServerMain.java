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
	static final String LEGACY_DB_URL = "jdbc:mariadb://database:3306/ffb_local";
	static final String MARKER6_DB_URL = "jdbc:mariadb://host.docker.internal:23316/ffb_local";
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
		properties.setProperty("db.password", readSecret(properties, "db.password.file"));
		properties.setProperty("admin.password", readSecret(properties, "admin.password.file"));
		properties.setProperty("backup.password", properties.getProperty("admin.password"));
		String coachPassword = readSecret(properties, "local.coach.password.file");
		if (!coachPassword.matches("[0-9a-f]{32}")) {
			throw new IllegalArgumentException("Fixture coach secret must be an MD5 hex digest for the legacy local protocol");
		}
		boolean marker6 = Boolean.parseBoolean(properties.getProperty("local.browser.v2.enabled"));
		if (!marker6) {
			properties.setProperty("local.browser.home.token", readSecret(properties, "local.browser.home.token.file"));
			properties.setProperty("local.browser.away.token", readSecret(properties, "local.browser.away.token.file"));
		}
		FantasyFootballServer server = new FantasyFootballServer(ServerMode.STANDALONE, properties);
		Class.forName(properties.getProperty("db.driver"));
		DbConnectionManager manager = new DbConnectionManager(server);
		manager.setDbUrl(properties.getProperty("db.url"));
		manager.setDbUser(properties.getProperty("db.user"));
		manager.setDbPassword(properties.getProperty("db.password"));
		manager.setDbType("mariadb");
		new LocalSchema().initialize(manager, coachPassword, marker6);
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

	/** Allows only the retained legacy Compose profile or the separately provisioned marker-6 target. */
	static void validateProfile(Properties properties) {
		boolean marker6 = Boolean.parseBoolean(properties.getProperty("local.browser.v2.enabled"));
		boolean permittedDatabase = marker6
			? MARKER6_DB_URL.equals(properties.getProperty("db.url")) && MARKER6_DB_USER.equals(properties.getProperty("db.user"))
			: LEGACY_DB_URL.equals(properties.getProperty("db.url"));
		if (!"true".equals(properties.getProperty("server.local")) || !permittedDatabase) {
			throw new IllegalArgumentException("Local startup requires an approved local database profile");
		}
		if (marker6 && !BrowserV2TransportPolicy.PROJECT.equals(properties.getProperty("local.browser.v2.firebase.project"))) {
			throw new IllegalArgumentException("Marker-6 local startup requires the approved DEV Firebase project");
		}
		if (marker6) {
			if ("prod".equals(properties.getProperty("local.browser.v2.proxy.profile")))
				throw new IllegalArgumentException("Local database profiles cannot select PROD transport");
			new BrowserV2TransportPolicy(properties.getProperty("server.base"), properties.getProperty("local.browser.v2.proxy.profile"))
				.bindHost(properties.getProperty("local.transport.container.forwarding"));
			if (System.getenv("FIREBASE_AUTH_EMULATOR_HOST") != null)
				throw new IllegalArgumentException("The live DEV runtime forbids Firebase emulator credentials");
		}
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
