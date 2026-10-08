package com.fumbbl.ffb.test;

import com.fumbbl.ffb.server.match.MatchChat;
import com.fumbbl.ffb.server.match.MatchService;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

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

	@Test void spectatorNumbersFollowFirstPostsAcrossPagesRestartAndExactRetry() throws Exception {
		String second = "dddddddd-dddd-dddd-dddd-dddddddddddd", third = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
		MatchChat chat = new MatchChat();
		chat.append(HOME, "home", "home", "Home hello", 1, 1000);
		chat.append(WATCHER, "spectator", "watch-one", "First spectator", 1, 1100);
		chat.append(AWAY, "away", "away", "Away hello", 1, 1200);
		chat.append(second, "spectator", "watch-two", "Second spectator", 1, 1300);
		chat.append(WATCHER, "spectator", "watch-again", "First spectator again", 1, 2200);
		for (int index = 0; index < 30; index++) chat.append(HOME, "home", "filler-" + index, "Coach message " + index, 1, 4000 + index * 1000);
		assertThrows(IllegalArgumentException.class, () -> chat.append(third, "spectator", "bad", "bad\nmessage", 1, 35000));
		chat.append(third, "spectator", "watch-three", "Third spectator on a later page", 1, 36000);
		chat.append(WATCHER, "spectator", "watch-late", "First spectator on the later page", 1, 37000);
		assertEquals(2, chat.page(0, 32).getInt("formatVersion", -1));
		JsonArray first = chat.page(0, 32).get("messages").asArray();
		assertTrue(first.get(0).asObject().get("spectatorNumber").isNull());
		assertEquals(1, first.get(1).asObject().getInt("spectatorNumber", -1));
		assertEquals(2, first.get(3).asObject().getInt("spectatorNumber", -1));
		assertEquals(1, first.get(4).asObject().getInt("spectatorNumber", -1));
		JsonObject saved = JsonObject.readFrom(chat.json().toString());
		assertEquals(1, saved.getInt("formatVersion", -1));
		assertTrue(saved.get("messages").asArray().get(1).asObject().get("spectatorNumber") == null);
		MatchChat restored = new MatchChat(saved);
		assertEquals(chat.json(), restored.json(), "Presentation numbering does not rewrite durable history");
		assertEquals(chat.page(32, 32), restored.page(32, 32));
		JsonArray late = restored.page(32, 32).get("messages").asArray();
		assertEquals(3, late.get(3).asObject().getInt("spectatorNumber", -1));
		assertEquals(1, late.get(4).asObject().getInt("spectatorNumber", -1));
		assertTrue(restored.append(third, "spectator", "watch-three", "Third spectator on a later page", 9, 38000).duplicate);
		assertEquals(chat.page(32, 32), restored.page(32, 32));
		JsonObject evidence = new JsonObject().add("pages", new JsonArray().add(chat.page(0, 32)).add(chat.page(32, 32)))
			.add("late", restored.page(32, 32));
		Files.write(Paths.get("target", "chat-speakers.json"), evidence.toString().getBytes(StandardCharsets.UTF_8));
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
