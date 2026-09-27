package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.MatchChat;
import com.fumbbl.ffb.server.match.MatchService;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchChatTest {
	private static final String HOME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private static final String AWAY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
	private static final String WATCHER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

	@Test void coachAndSpectatorMessagesRoundTripWithServerOrderAndExactRetry() {
		MatchChat chat = new MatchChat();
		MatchChat.Outcome home = chat.append(HOME, "home", "one", "Good luck!", 4, 1000);
		assertFalse(home.duplicate);
		assertEquals(0, home.message.getInt("index", -1));
		assertEquals(4, home.message.getInt("revision", -1));
		assertTrue(chat.append(HOME, "home", "one", "Good luck!", 5, 2000).duplicate);
		assertEquals("REQUEST_ID_REUSED", assertThrows(MatchService.Failure.class,
			() -> chat.append(HOME, "home", "one", "Changed", 5, 2000)).code);
		chat.append(AWAY, "away", "two", "You too!", 4, 1100);
		chat.append(WATCHER, "spectator", "three", "Watching", 5, 1200);
		assertEquals(3, chat.page(0, 32).getInt("total", -1));
		assertEquals(3, chat.page(1, 2).getInt("next", -1));
		assertEquals(2, chat.page(1, 2).get("messages").asArray().size());
		MatchChat restored = new MatchChat(JsonObject.readFrom(chat.json().toString()));
		assertEquals(chat.json(), restored.json());
		assertTrue(restored.duplicate(WATCHER, "three", "Watching").duplicate);
		assertEquals(3, restored.page(0, 32).get("messages").asArray().size());
	}

	@Test void rateAndContentLimitsRejectBeforeAppendingOrConsumingARequestId() {
		MatchChat chat = new MatchChat();
		chat.append(HOME, "home", "one", "First", 1, 1000);
		assertEquals("CHAT_RATE_LIMIT", assertThrows(MatchService.Failure.class,
			() -> chat.append(HOME, "home", "two", "Second", 1, 1999)).code);
		assertThrows(IllegalArgumentException.class, () -> chat.append(HOME, "home", "bad", " <script>\n", 1, 2000));
		assertEquals(1, chat.page(0, 32).getInt("total", -1));
		chat.append(HOME, "home", "two", "Second", 1, 2000);
		assertEquals(2, chat.page(0, 32).getInt("total", -1));
	}
}
