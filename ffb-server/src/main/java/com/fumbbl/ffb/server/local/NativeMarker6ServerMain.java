package com.fumbbl.ffb.server.local;

import java.io.InputStream;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Properties;

/** Exact native environment profiles. No provisioning, grants, or migration entry point. */
public final class NativeMarker6ServerMain {
	// Retain ownership through all shutdown hooks; the OS releases it on process exit.
	private static FileLock runtimeLock;

	public static void main(String[] args) {
		try {
			if (args.length != 1) throw new IllegalArgumentException("Expected one native profile file");
			Properties properties = new Properties();
			try (InputStream input = Files.newInputStream(Paths.get(args[0]))) { properties.load(input); }
			new NativeMarker6ServerMain().start(properties);
		} catch (Exception rejected) {
			// JDBC, path and provider exception messages may contain private values.
			System.err.println("Native marker-6 startup rejected; verify profile, storage and secret provisioning.");
			System.exit(1);
		}
	}

	void validateProfile(Properties properties) throws Exception {
		String profile = properties.getProperty("local.browser.v2.proxy.profile");
		if (!"dev".equals(profile) && !"prod".equals(profile)) throw new IllegalArgumentException("Unknown native environment");
		Properties expected = new Properties();
		try (InputStream input = NativeMarker6ServerMain.class.getResourceAsStream("/local-schema/native-" + profile + ".properties")) {
			if (input == null) throw new IllegalStateException("Missing native profile contract");
			expected.load(input);
		}
		// No arbitrary JDBC parameters, secret paths, bind addresses, legacy flags, or log overrides.
		if (!expected.equals(properties)) throw new IllegalArgumentException("Native profile mismatch");
		if (System.getenv("FIREBASE_AUTH_EMULATOR_HOST") != null)
			throw new IllegalArgumentException("Native profiles forbid emulator credentials");
		new BrowserV2TransportPolicy(properties.getProperty("server.base"), properties.getProperty("local.browser.v2.proxy.profile"))
			.bindHost(properties.getProperty("local.transport.container.forwarding"));
	}

	private void start(Properties properties) throws Exception {
		validateProfile(properties);
		String state = "/var/lib/moles-game-v2-" + properties.getProperty("local.browser.v2.proxy.profile");
		for (String directory : new String[] {state, properties.getProperty("backup.dir"), properties.getProperty("server.log.folder")}) {
			Path path = Paths.get(directory);
			if (!Files.isDirectory(path) || !path.equals(path.toRealPath()))
				throw new IllegalArgumentException("Native directory missing or redirected");
		}
		runtimeLock = acquireRuntimeLock(Paths.get(state, "runtime.lock"));
		// Marker 6 is verified read-only by LocalSchema before server.run; never initialized.
		new LocalServerMain().startVerifiedProfile(properties);
	}

	FileLock acquireRuntimeLock(Path lockPath) throws Exception {
		if (Files.isSymbolicLink(lockPath)) throw new IllegalArgumentException("Redirected runtime lock");
		FileChannel channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
		try {
			FileLock lock = channel.tryLock();
			if (lock == null) throw new IllegalStateException("Native runtime already owns storage");
			return lock;
		} catch (Exception failure) { channel.close(); throw failure; }
	}
}
