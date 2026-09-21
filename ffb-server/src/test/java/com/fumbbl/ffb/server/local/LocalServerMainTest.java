package com.fumbbl.ffb.server.local;

import java.util.Properties;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LocalServerMainTest {
	@Test void marker6AcceptsOnlyTargetUrlUserAndFirebaseProject() {
		Properties properties = base();
		properties.setProperty("local.browser.v2.enabled", "true");
		properties.setProperty("db.url", LocalServerMain.MARKER6_DB_URL);
		properties.setProperty("db.user", LocalServerMain.MARKER6_DB_USER);
		properties.setProperty("local.browser.v2.firebase.project", BrowserV2TransportPolicy.PROJECT);
		properties.setProperty("server.base", "http://127.0.0.1:22231");
		assertDoesNotThrow(() -> LocalServerMain.validateProfile(properties));
		Properties foreign = (Properties) properties.clone();
		foreign.setProperty("local.browser.v2.firebase.project", "molesunderthepitch-dotorg");
		assertThrows(IllegalArgumentException.class, () -> LocalServerMain.validateProfile(foreign));
		Properties prodTransport = (Properties) properties.clone();
		prodTransport.setProperty("local.browser.v2.proxy.profile", "prod");
		assertThrows(IllegalArgumentException.class, () -> LocalServerMain.validateProfile(prodTransport));

		Properties wrongUrl = (Properties) properties.clone();
		wrongUrl.setProperty("db.url", LocalServerMain.LEGACY_DB_URL);
		assertThrows(IllegalArgumentException.class, () -> LocalServerMain.validateProfile(wrongUrl));
	}

	@Test void legacyProfileCannotSelectMarker6TargetOrLiveSettings() {
		Properties properties = base();
		assertDoesNotThrow(() -> LocalServerMain.validateProfile(properties));
		Properties wrongTarget = (Properties) properties.clone();
		wrongTarget.setProperty("db.url", LocalServerMain.MARKER6_DB_URL);
		assertThrows(IllegalArgumentException.class, () -> LocalServerMain.validateProfile(wrongTarget));

		Properties liveSetting = base();
		liveSetting.setProperty("fumbbl.server", "forbidden");
		assertThrows(IllegalArgumentException.class, () -> LocalServerMain.validateProfile(liveSetting));
	}

	private Properties base() {
		Properties properties = new Properties();
		properties.setProperty("server.local", "true");
		properties.setProperty("db.url", LocalServerMain.LEGACY_DB_URL);
		return properties;
	}
}
