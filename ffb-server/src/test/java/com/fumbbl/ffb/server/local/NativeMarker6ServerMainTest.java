package com.fumbbl.ffb.server.local;

import java.io.InputStream;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;

class NativeMarker6ServerMainTest {
	@Test void onlyOneRuntimeCanOwnStorageAndExistingLockEvidenceIsNotTruncated(@TempDir Path directory) throws Exception {
		Path path = directory.resolve("runtime.lock");
		Files.write(path, "retained-sentinel".getBytes(java.nio.charset.StandardCharsets.UTF_8));
		NativeMarker6ServerMain launcher = new NativeMarker6ServerMain();
		FileLock first = launcher.acquireRuntimeLock(path);
		try {
			assertThrows(OverlappingFileLockException.class, () -> launcher.acquireRuntimeLock(path));
		} finally { first.channel().close(); }
		assertEquals("retained-sentinel", new String(Files.readAllBytes(path), java.nio.charset.StandardCharsets.UTF_8));
		FileLock next = launcher.acquireRuntimeLock(path);
		next.channel().close();
	}
	@Test void acceptsOnlyTheEntireFixedNativeDevContractBeforeAnyIo() throws Exception {
		Properties expected = profile();
		NativeMarker6ServerMain launcher = new NativeMarker6ServerMain();
		assertDoesNotThrow(() -> launcher.validateProfile(expected));
		for (String key : expected.stringPropertyNames()) {
			Properties changed = (Properties) expected.clone();
			changed.setProperty(key, expected.getProperty(key) + "-foreign");
			assertThrows(IllegalArgumentException.class, () -> launcher.validateProfile(changed), key);
			Properties missing = (Properties) expected.clone(); missing.remove(key);
			assertThrows(IllegalArgumentException.class, () -> launcher.validateProfile(missing), key);
		}
	}

	@Test void refusesRetainedStorageH2ProdAndStartupMutationFlags() throws Exception {
		for (String[] override : new String[][] {
			{"db.url", LocalServerMain.MARKER6_DB_URL}, {"db.url", LocalServerMain.LEGACY_DB_URL},
			{"db.url", "jdbc:h2:/var/lib/moles-game/accounts"}, {"db.url", "jdbc:mariadb://127.0.0.1:3306/ffb_local"},
			{"backup.dir", "/var/lib/moles-game"}, {"local.browser.v2.proxy.profile", "prod"},
			{"local.browser.v2.firebase.project", "molesunderthepitch-dotorg"}, {"initDb", "true"},
			{"db.password", "synthetic"}, {"fumbbl.server", "foreign"}, {"local.transport.container.forwarding", "true"}}) {
			Properties properties = profile(); properties.setProperty(override[0], override[1]);
			assertThrows(IllegalArgumentException.class, () -> new NativeMarker6ServerMain().validateProfile(properties));
		}
	}

	private Properties profile() throws Exception {
		return profile("dev");
	}

	@Test void prodRequiresItsEntireExactContractAndRejectsEveryMixedDevField() throws Exception {
		Properties prod = profile("prod"), dev = profile("dev");
		NativeMarker6ServerMain launcher = new NativeMarker6ServerMain();
		assertDoesNotThrow(() -> launcher.validateProfile(prod));
		for (String key : prod.stringPropertyNames()) {
			Properties changed = (Properties) prod.clone(); changed.setProperty(key, prod.getProperty(key) + "-foreign");
			assertThrows(IllegalArgumentException.class, () -> launcher.validateProfile(changed), key);
			Properties missing = (Properties) prod.clone(); missing.remove(key);
			assertThrows(IllegalArgumentException.class, () -> launcher.validateProfile(missing), key);
			if (!prod.getProperty(key).equals(dev.getProperty(key))) {
				Properties mixed = (Properties) prod.clone(); mixed.setProperty(key, dev.getProperty(key));
				assertThrows(IllegalArgumentException.class, () -> launcher.validateProfile(mixed), key);
			}
		}
	}

	private Properties profile(String environment) throws Exception {
		Properties properties = new Properties();
		try (InputStream input = getClass().getResourceAsStream("/local-schema/native-" + environment + ".properties")) { properties.load(input); }
		return properties;
	}
}
