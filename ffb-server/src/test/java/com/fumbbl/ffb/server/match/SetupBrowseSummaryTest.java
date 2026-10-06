package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.util.Collections;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
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
		when(recovery.find(MATCH)).thenReturn(new RecoveryRepository.Record(MATCH, 1, codec.decode(stored)));

		JsonObject summary = setup.browseState(MATCH);
		assertEquals(5, summary.size());
		assertEquals("PLAY", summary.getString("phase", null));
		assertEquals(7, summary.getInt("turn", -1));
		assertEquals(3, summary.getInt("homeScore", -1));
	}

	@Test void mismatchedOrCorruptCheckpointHasNoBrowseState() throws Exception {
		RecoveryRepository recovery = mock(RecoveryRepository.class);
		SetupApplication setup = new SetupApplication(null, mock(MatchService.class), recovery);
		when(recovery.find(MATCH)).thenReturn(new RecoveryRepository.Record(MATCH, 1,
			new JsonObject().add("payload", new JsonObject().add("matchId", "other")
				.add("homeView", new JsonObject().add("matchId", MATCH))).toString()));
		assertNull(setup.browseState(MATCH));
		when(recovery.find(MATCH)).thenReturn(new RecoveryRepository.Record(MATCH, 1, "bad-json"));
		assertNull(setup.browseState(MATCH));
	}
}
