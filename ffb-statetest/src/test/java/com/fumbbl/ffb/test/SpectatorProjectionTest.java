package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.SetupSession;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SpectatorProjectionTest {
	@Test void spectatorUsesPlayerStateAndRecoveryWithoutPrivateEngineData() throws Exception {
		SetupSession fixture = new SetupSessionTest().session(11);
		Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true);
		MatchDocument document = (MatchDocument) field.get(fixture);
		TestServer server = new TestServer();
		SetupSession recoverable = new SetupSession(server.getServer(), document, -7, true);
		JsonObject view = recoverable.spectatorView();
		String json = view.toString();
		assertEquals(recoverable.reply("read", "ACCEPTED", false, "home").get("state").asObject().set("callerRole", "spectator"), view);
		assertFalse(json.contains("dice"));
		assertFalse(json.contains("requests"));
		assertFalse(json.contains("homeOwner"));
		assertTrue(view.get("players").asArray().size() > 0);
		assertEquals("spectator", view.getString("callerRole", null));
		SetupSession restored = new SetupSession(server.getServer(), document, recoverable.recoveryArtifact());
		assertEquals(view, restored.spectatorView());
	}
}
