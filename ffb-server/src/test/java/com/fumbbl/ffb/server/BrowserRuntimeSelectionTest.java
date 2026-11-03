package com.fumbbl.ffb.server;

import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BrowserRuntimeSelectionTest {

	@Test void defaultsToProductBrowserWithoutLocalDiagnosticFlag() {
		assertDoesNotThrow(() -> new FantasyFootballServer(ServerMode.STANDALONE, new Properties()));
	}

	@Test void retiredRuntimeCannotBeSelectedEvenInLocalMode() {
		Properties properties = new Properties();
		properties.setProperty("local.browser.v2.enabled", "false");
		assertThrows(IllegalArgumentException.class, () -> new FantasyFootballServer(ServerMode.STANDALONE, properties));
		properties.setProperty("server.local", "true");
		assertThrows(IllegalArgumentException.class, () -> new FantasyFootballServer(ServerMode.STANDALONE, properties));
	}

	@Test void explicitTrueRemainsCompatibleWithExistingV2Profiles() {
		Properties properties = new Properties();
		properties.setProperty("local.browser.v2.enabled", "true");
		assertDoesNotThrow(() -> new FantasyFootballServer(ServerMode.STANDALONE, properties));
	}

	@Test void malformedSelectionCannotSilentlyStartDiagnostics() {
		Properties properties = new Properties();
		properties.setProperty("server.local", "true");
		properties.setProperty("local.browser.v2.enabled", "typo");
		assertThrows(IllegalArgumentException.class, () -> new FantasyFootballServer(ServerMode.STANDALONE, properties));
	}
}
