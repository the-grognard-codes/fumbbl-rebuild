package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupBrowseSummaryTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";

	@Test void readsOnlyPublicScalarsFromCheckpointWithoutRecoveringEngine() throws Exception {
		RecoveryRepository recovery = mock(RecoveryRepository.class);
		SetupApplication setup = new SetupApplication(null, mock(MatchService.class), recovery);
		JsonObject view = new JsonObject().add("matchId", MATCH).add("callerRole", "home")
			.add("phase", "PLAY").add("half", 2).add("turn", 7).add("homeScore", 3).add("awayScore", 1)
			.add("actions", "private-actions").add("actor", "private-actor");
		JsonObject artifact = new JsonObject().add("payload", new JsonObject().add("matchId", MATCH)
			.add("failed", false).add("homeView", view)
			.add("native", String.join("", Collections.nCopies(1000, "private-native"))))
			.add("sha256", String.join("", Collections.nCopies(64, "0")));
		BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(
			BoundedJsonStorageCodec.RECOVERY_ENCODED_LIMIT, BoundedJsonStorageCodec.RECOVERY_DECODED_LIMIT);
		String stored = codec.encode(artifact.toString());
		assertNotEquals(artifact.toString(), stored);
		when(recovery.findAll(any(), any())).thenReturn(Map.of(MATCH, new RecoveryRepository.Record(MATCH, 1, codec.decode(stored))));

		JsonObject summary = setup.browseStates(List.of(MATCH), new LobbyReadBudget()).get(MATCH);
		assertEquals(5, summary.size());
		assertEquals("PLAY", summary.getString("phase", null));
		assertEquals(7, summary.getInt("turn", -1));
		assertEquals(3, summary.getInt("homeScore", -1));
	}

	@Test void missingHomeViewLeavesOnlyThatEntryUnavailable() throws Exception {
		RecoveryRepository recovery = mock(RecoveryRepository.class);
		SetupApplication setup = new SetupApplication(null, mock(MatchService.class), recovery);
		String healthy = "22345678-1234-1234-1234-123456789abc";
		when(recovery.findAll(any(), any())).thenReturn(Map.of(
			MATCH, new RecoveryRepository.Record(MATCH, 1, new JsonObject().add("payload", new JsonObject().add("matchId", MATCH)).toString()),
			healthy, new RecoveryRepository.Record(healthy, 1, new JsonObject().add("payload", new JsonObject().add("matchId", healthy)
				.add("homeView", new JsonObject().add("matchId", healthy).add("callerRole", "home").add("phase", "PLAY"))).toString())));
		Map<String, JsonObject> states = setup.browseStates(List.of(MATCH, healthy), new LobbyReadBudget());
		assertNull(states.get(MATCH)); assertEquals("PLAY", states.get(healthy).getString("phase", null));
	}

	@Test void mismatchedOrCorruptCheckpointHasNoBrowseState() throws Exception {
		RecoveryRepository recovery = mock(RecoveryRepository.class);
		SetupApplication setup = new SetupApplication(null, mock(MatchService.class), recovery);
		when(recovery.findAll(any(), any())).thenReturn(Map.of(MATCH, new RecoveryRepository.Record(MATCH, 1,
			new JsonObject().add("payload", new JsonObject().add("matchId", "other")
				.add("homeView", new JsonObject().add("matchId", MATCH))).toString())));
		assertNull(setup.browseStates(List.of(MATCH), new LobbyReadBudget()).get(MATCH));
		when(recovery.findAll(any(), any())).thenReturn(Map.of(MATCH, new RecoveryRepository.Record(MATCH, 1, "bad-json")));
		assertNull(setup.browseStates(List.of(MATCH), new LobbyReadBudget()).get(MATCH));
	}
}
