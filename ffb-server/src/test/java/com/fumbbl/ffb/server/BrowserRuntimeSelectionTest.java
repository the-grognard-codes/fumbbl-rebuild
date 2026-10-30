package com.fumbbl.ffb.server;

import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BrowserRuntimeSelectionTest {

	@Test void defaultsToProductBrowserWithoutLocalDiagnosticFlag() {
		assertTrue(new FantasyFootballServer(ServerMode.STANDALONE, new Properties()).isBrowserV2());
	}

	@Test void diagnosticsRequireAnExplicitLocalSelection() {
		Properties properties = new Properties();
		properties.setProperty("local.browser.v2.enabled", "false");
		assertThrows(IllegalArgumentException.class, () -> new FantasyFootballServer(ServerMode.STANDALONE, properties));
		properties.setProperty("server.local", "true");
		assertFalse(new FantasyFootballServer(ServerMode.STANDALONE, properties).isBrowserV2());
	}

	@Test void malformedSelectionCannotSilentlyStartDiagnostics() {
		Properties properties = new Properties();
		properties.setProperty("server.local", "true");
		properties.setProperty("local.browser.v2.enabled", "typo");
		assertThrows(IllegalArgumentException.class, () -> new FantasyFootballServer(ServerMode.STANDALONE, properties));
	}
}
