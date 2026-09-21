package com.fumbbl.ffb.server.local;

import java.net.URI;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BrowserV2TransportPolicyTest {
	@Test void devProxyProfileCannotSelectProdLocalOriginsOrNonLoopbackBinding() {
		BrowserV2TransportPolicy policy = new BrowserV2TransportPolicy("http://127.0.0.1:22231", "dev");
		URI path = URI.create("/browser/v2");
		assertEquals("127.0.0.1", policy.bindHost(null));
		assertTrue(policy.permits(path, "game-dev.molesunderthepitch.org", "https://dev.molesunderthepitch.org"));
		for (String origin : new String[] {"http://localhost:5000", "http://dev.molesunderthepitch.org", "https://molesunderthepitch.org"})
			assertFalse(policy.permits(path, "game-dev.molesunderthepitch.org", origin));
		assertFalse(policy.permits(path, "game.molesunderthepitch.org", "https://dev.molesunderthepitch.org"));
		assertThrows(IllegalArgumentException.class, () -> policy.bindHost("true"));
		assertEquals(BrowserV2TransportPolicy.PROJECT, policy.firebaseProject());
		assertThrows(IllegalArgumentException.class, () -> new BrowserV2TransportPolicy("http://127.0.0.1:22231", "unknown"));
	}
	@Test void prodIsPinnedToItsOwnHostOriginAndFirebaseProject() {
		BrowserV2TransportPolicy policy = new BrowserV2TransportPolicy("http://127.0.0.1:22231", "prod");
		assertEquals(BrowserV2TransportPolicy.PROD_PROJECT, policy.firebaseProject());
		assertEquals("127.0.0.1", policy.bindHost("false"));
		assertTrue(policy.permits(URI.create("/browser/v2"), "game.molesunderthepitch.org", "https://molesunderthepitch.org"));
		for (String origin : new String[] {"https://dev.molesunderthepitch.org", "http://localhost:5000", "http://molesunderthepitch.org", "https://molesunderthepitch.org.evil", ""})
			assertFalse(policy.permits(URI.create("/browser/v2"), "game.molesunderthepitch.org", origin));
		assertFalse(policy.permits(URI.create("/browser/v2"), "game-dev.molesunderthepitch.org", "https://molesunderthepitch.org"));
		for (String path : new String[] {"/browser/v2?", "/browser/v2?token=x", "/browser/%76%32", "/session/v1", "/admin"})
			assertFalse(policy.permits(URI.create(path), "game.molesunderthepitch.org", "https://molesunderthepitch.org"));
		assertThrows(IllegalArgumentException.class, () -> policy.bindHost("true"));
	}
	@Test void exactLocalBoundaryRejectsNormalizationQueriesAndForeignAuthorities() {
		BrowserV2TransportPolicy policy = new BrowserV2TransportPolicy("http://127.0.0.1:22231");
		assertEquals("127.0.0.1", policy.bindHost(null));
		assertEquals("127.0.0.1", policy.bindHost("false"));
		assertThrows(IllegalArgumentException.class, () -> policy.bindHost("TRUE"));
		assertTrue(policy.permits(URI.create("http://127.0.0.1:22231/browser/v2"), "127.0.0.1:22231", "http://localhost:5000"));
		for (String path : new String[] {"/browser/v2/", "/browser/%76%32", "/browser/v2?", "/browser/v2?token=x", "/browser/v1", "/admin", "/spectator"})
			assertFalse(policy.permits(URI.create(path), "127.0.0.1:22231", "http://localhost:5000"));
		for (String base : new String[] {"http://0.0.0.0:22231", "https://dev.molesunderthepitch.org", "http://127.0.0.1:22231/", "http://user@127.0.0.1:22231", "http://127.0.0.1:22231?"})
			assertThrows(IllegalArgumentException.class, () -> new BrowserV2TransportPolicy(base));
	}
}
