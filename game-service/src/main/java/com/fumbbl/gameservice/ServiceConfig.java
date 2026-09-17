package com.fumbbl.gameservice;

import java.io.File;
import java.util.Map;

public final class ServiceConfig {
	public final String projectId;
	public final String origin;
	public final String databasePath;
	public final String keyStore;
	public final String keyStorePassword;
	public final int port;
	ServiceConfig(String projectId, String origin, String databasePath, String keyStore, String keyStorePassword, int port) { this.projectId = projectId; this.origin = origin; this.databasePath = databasePath; this.keyStore = keyStore; this.keyStorePassword = keyStorePassword; this.port = port; }
	public static ServiceConfig fromEnvironment() {
		return fromEnvironment(System.getenv());
	}
	static ServiceConfig fromEnvironment(Map<String, String> environmentValues) {
		if (environmentValues.containsKey("FIREBASE_AUTH_EMULATOR_HOST")) throw new IllegalStateException("Firebase emulator is not permitted");
		String environment = required(environmentValues, "GAME_ENV");
		String project; String origin;
		if ("dev".equals(environment)) { project = "dev-moles-under-the-pitch-org"; origin = "https://dev.molesunderthepitch.org"; }
		else if ("prod".equals(environment)) { project = "molesunderthepitch-dotorg"; origin = "https://molesunderthepitch.org"; }
		else throw new IllegalStateException("GAME_ENV must be dev or prod");
		if (!project.equals(required(environmentValues, "FIREBASE_PROJECT_ID"))) throw new IllegalStateException("FIREBASE_PROJECT_ID does not match GAME_ENV");
		if (!origin.equals(required(environmentValues, "GAME_ORIGIN"))) throw new IllegalStateException("GAME_ORIGIN does not match GAME_ENV");
		String path = required(environmentValues, "GAME_DB_PATH"); String keyStore = required(environmentValues, "GAME_KEYSTORE"); if (!new File(keyStore).isFile()) throw new IllegalStateException("GAME_KEYSTORE is unavailable");
		int port = Integer.parseInt(environmentValues.getOrDefault("GAME_PORT", "8443"));
		if (port < 1 || port > 65535) throw new IllegalStateException("GAME_PORT must be a valid TCP port");
		return new ServiceConfig(project, origin, path, keyStore, required(environmentValues, "GAME_KEYSTORE_PASSWORD"), port);
	}
	private static String required(Map<String, String> environment, String name) { String value = environment.get(name); if (value == null || value.trim().isEmpty()) throw new IllegalStateException(name + " is required"); return value; }
}
