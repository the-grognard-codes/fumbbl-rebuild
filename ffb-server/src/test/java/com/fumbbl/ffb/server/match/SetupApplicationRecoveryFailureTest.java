package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.FantasyFootballServer;

import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;

import java.lang.reflect.Field;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

class SetupApplicationRecoveryFailureTest {
	private static final String ID = "12345678-1234-1234-1234-123456789abc";
	private static final String INVALID = "{\"payload\":{},\"sha256\":\"invalid\"}";

	@Test void unchangedCorruptionIsNotReconstructedOrFetchedByOtherAuthorizedCallers() throws Exception {
		Fixture fixture = new Fixture();
		try (MockedConstruction<JsonDigest> digests = digests()) {
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class,
				() -> fixture.application.spectatorView(ID)).code);
			assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class,
				() -> fixture.application.chatPage(ID, 0, 8)).code);
			assertEquals(1, digests.constructed().size(), "One validation per unchanged invalid generation");
			assertEquals(1, fixture.recovery.finds, "Retries must not fetch or decode the complete artifact");
		}
	}

	@Test void replacementGenerationIsRetriedAndCanRestoreARealNativeCheckpoint() throws Exception {
		SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
		engine.advanceToTurn();
		engine.session.startSaveResumeRetention(System.currentTimeMillis());
		String id = engine.document.matchId;
		MemoryRecovery recovery = new MemoryRecovery();
		recovery.records.put(id, new RecoveryRepository.Record(id, 1, INVALID));
		MatchService matches = mock(MatchService.class);
		when(matches.load("home", id)).thenReturn(new MatchService.Result(engine.document, false));
		SetupApplication application = new SetupApplication(engine.server, matches, recovery);
		assertEquals("RECOVERY_CORRUPT", application.handle("home", loadRequest(id)).getString("code", null));
		recovery.records.put(id, new RecoveryRepository.Record(id, 2, engine.session.recoveryArtifact()));
		assertEquals("ACCEPTED", application.handle("home", loadRequest(id)).getString("code", null));
		assertEquals("ACCEPTED", application.handle("home", loadRequest(id)).getString("code", null));
		assertEquals(2, recovery.finds);
	}

	@Test void aNewInvalidGenerationIsValidatedOnceAndMissingRecordsDiscardTheFailure() throws Exception {
		Fixture fixture = new Fixture();
		try (MockedConstruction<JsonDigest> digests = digests()) {
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			fixture.recovery.records.put(ID, new RecoveryRepository.Record(ID, 2,
				"{\"payload\":{\"revision\":42},\"sha256\":\"different-invalid-checksum\"}"));
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals(2, digests.constructed().size());
			assertEquals(2, fixture.recovery.finds);
			fixture.recovery.records.remove(ID);
			assertEquals("SESSION_UNAVAILABLE", fixture.load(ID));
			fixture.recovery.records.put(ID, new RecoveryRepository.Record(ID, 2, INVALID));
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals(3, digests.constructed().size());
		}
	}

	@Test void transientRecordAndMetadataSqlFailuresNeverBecomeCorruptionCacheEntries() throws Exception {
		Fixture fixture = new Fixture();
		try (MockedConstruction<JsonDigest> digests = digests()) {
			fixture.recovery.findFailure = new SQLException("temporary");
			assertEquals("PERSISTENCE_FAILED", fixture.load(ID));
			fixture.recovery.findFailure = null;
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			fixture.recovery.generationFailure = new SQLException("temporary metadata failure");
			assertEquals("PERSISTENCE_FAILED", fixture.load(ID));
			fixture.recovery.generationFailure = null;
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals(1, digests.constructed().size());
			assertEquals(2, fixture.recovery.finds);
		}
	}

	@Test void rejectedJournalAssemblyCachesOnlyTheGenerationActuallyReadAndRetriesReplacement() throws Exception {
		Fixture fixture = new Fixture();
		fixture.recovery.corruptJournal = true;
		assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
		assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
		assertEquals(1, fixture.recovery.finds);
		fixture.recovery.records.put(ID, new RecoveryRepository.Record(ID, 2, INVALID));
		assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
		assertEquals(2, fixture.recovery.finds);
	}

	@Test void administrativeReadsTranslateJournalCorruptionWithoutBlockingTheRetainedConcessionPath() throws Exception {
		Fixture fixture = new Fixture(); fixture.recovery.corruptJournal = true;
		JsonObject status = loadRequest(ID).set("operation", "concessionStatus");
		assertEquals("RECOVERY_CORRUPT", fixture.application.handle("home", status).getString("code", null));
		assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
		assertEquals(1, fixture.recovery.finds, "The administrative failure also remembers the exact rejected generation");
	}

	@Test void oneRejectedJournalDoesNotAbortBrowseSummariesAndRepeatedReadsUseTheGenerationCache() throws Exception {
		Fixture fixture = new Fixture(); fixture.recovery.corruptJournal = true;
		assertEquals(null, fixture.application.browseState(ID));
		assertEquals(null, fixture.application.browseState(ID));
		assertEquals(1, fixture.recovery.finds);
		fixture.recovery.corruptJournal = false;
		String healthy = "00000000-0000-0000-0000-000000000222";
		JsonObject view = new JsonObject().add("matchId", healthy).add("callerRole", "home").add("phase", "PLAY")
			.add("half", 1).add("turn", 2).add("homeScore", 0).add("awayScore", 0);
		fixture.recovery.records.put(healthy, new RecoveryRepository.Record(healthy, 1,
			new JsonObject().add("payload", new JsonObject().add("matchId", healthy).add("homeView", view)).toString()));
		assertEquals("PLAY", fixture.application.browseState(healthy).getString("phase", null));
		assertEquals(2, fixture.recovery.finds);
	}

	@Test void cachedFailuresStillReauthorizeEveryCaller() throws Exception {
		Fixture fixture = new Fixture();
		assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
		when(fixture.matches.load("home", ID)).thenThrow(new MatchService.Failure("NOT_FOUND"));
		assertEquals("NOT_FOUND", fixture.load(ID));
		assertEquals(0, fixture.recovery.metadataReads);
		verify(fixture.matches, times(2)).load("home", ID);
	}

	@Test void capacityRejectionsAreRetriedAfterCapacityReturnsAndKeepTheirPrecedence() throws Exception {
		Fixture fixture = new Fixture();
		Field field = SetupApplication.class.getDeclaredField("sessions"); field.setAccessible(true);
		@SuppressWarnings("unchecked") Map<String, SetupSession> sessions = (Map<String, SetupSession>) field.get(fixture.application);
		for (int index = 0; index < 32; index++) sessions.put("resident-" + index, mock(SetupSession.class));
		try (MockedConstruction<JsonDigest> digests = digests()) {
			assertEquals("ACTIVATION_LIMIT", fixture.load(ID));
			assertEquals(0, digests.constructed().size());
			sessions.clear();
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			for (int index = 0; index < 32; index++) sessions.put("resident-" + index, mock(SetupSession.class));
			assertEquals("ACTIVATION_LIMIT", fixture.load(ID));
			sessions.clear();
			assertEquals("RECOVERY_CORRUPT", fixture.load(ID));
			assertEquals(1, digests.constructed().size());
		}
	}

	@Test void failureCacheEvictsBeyondItsBoundAndEvictedCheckpointsCanBeRetried() throws Exception {
		Fixture fixture = new Fixture();
		try (MockedConstruction<JsonDigest> digests = digests()) {
			for (int index = 0; index < 129; index++) {
				String id = String.format("00000000-0000-0000-0000-%012d", index);
				fixture.recovery.records.put(id, new RecoveryRepository.Record(id, 1, INVALID));
				assertEquals("RECOVERY_CORRUPT", fixture.load(id));
			}
			assertEquals(129, digests.constructed().size());
			assertEquals("RECOVERY_CORRUPT", fixture.load("00000000-0000-0000-0000-000000000128"));
			assertEquals(129, digests.constructed().size());
			assertEquals("RECOVERY_CORRUPT", fixture.load("00000000-0000-0000-0000-000000000000"));
			assertEquals(130, digests.constructed().size());
		}
	}

	private MockedConstruction<JsonDigest> digests() {
		return mockConstruction(JsonDigest.class, withSettings().defaultAnswer(CALLS_REAL_METHODS));
	}
	private static JsonObject loadRequest(String id) { return new JsonObject().add("version", 1).add("type", "setup")
		.add("operation", "load").add("requestId", "load").add("matchId", id); }
	private static final class Fixture {
		final FantasyFootballServer server = mock(FantasyFootballServer.class);
		final MatchService matches = mock(MatchService.class);
		final MemoryRecovery recovery = new MemoryRecovery();
		final SetupApplication application = new SetupApplication(server, matches, recovery);
		Fixture() throws Exception {
			when(matches.load(anyString(), anyString())).thenAnswer(call -> new MatchService.Result(
				new MatchDocument(call.getArgument(1), 3, "away", MatchDocument.Lifecycle.ACTIVATED,
					new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null)), false));
			recovery.records.put(ID, new RecoveryRepository.Record(ID, 1, INVALID));
		}
		String load(String id) {
			return application.handle("home", loadRequest(id)).getString("code", null);
		}
	}
	private static final class MemoryRecovery implements RecoveryRepository {
		final Map<String, Record> records = new LinkedHashMap<>();
		int finds, metadataReads;
		SQLException findFailure, generationFailure;
		boolean corruptJournal;
		@Override public Record find(String id) throws SQLException {
			finds++; if (findFailure != null) throw findFailure;
			if (corruptJournal) throw new CorruptRecord(id, records.get(id).generation);
			return records.get(id);
		}
		@Override public Long generation(String id) throws SQLException {
			metadataReads++; if (generationFailure != null) throw generationFailure;
			Record record = records.get(id); return record == null ? null : record.generation;
		}
		@Override public boolean save(Record record, long expectedGeneration) { throw new AssertionError("Invalid checkpoints are never written"); }
	}
}
