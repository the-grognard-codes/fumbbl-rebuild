package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchMemoryIsolationTest {
	private static final long MIB = 1024 * 1024;
	private static final String ID = "12345678-1234-1234-1234-123456789abc";
	private static final String OTHER = "00000000-0000-0000-0000-000000000222";

	@Test void deploymentHeapPreservesTheDocumentedActivationCeiling() {
		MatchMemoryBudget budget = new MatchMemoryBudget(768 * MIB);
		assertEquals(32, budget.residentLimit());
		assertEquals(44 * MIB, budget.decodedLimit());
		assertEquals(40 * MIB, budget.appendLimit());
		assertEquals(160 * MIB / 11, new MatchMemoryBudget(256 * MIB).decodedLimit());
		assertEquals(budget.decodedLimit() - 4 * MIB, budget.appendLimit());
		assertTrue(budget.admitsResidents(budget.residentBytes(budget.decodedLimit()), budget.decodedLimit()));
		assertFalse(budget.admitsResidents(480 * MIB, 45 * MIB));
		assertFalse(budget.admitsResidents(budget.residentBytes(22 * MIB) + budget.residentBytes(45 * MIB), 45 * MIB));
		assertThrows(IllegalArgumentException.class, () -> new MatchMemoryBudget(63 * MIB));
	}

	@Test void storedDeclaredOversizeIsRejectedBeforeEvenAnInvalidPayloadCanBeDecoded() {
		MatchMemoryBudget budget = new MatchMemoryBudget(768 * MIB);
		String stored = new JsonObject().add("$codec", "ffb-match-gzip-json").add("version", 1)
			.add("decodedBytes", budget.decodedLimit() + 1).add("payload", "invalid-base64!").toString();
		BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(32 * 1024 * 1024, 128 * 1024 * 1024);
		assertEquals("MATCH_SIZE_LIMIT", assertThrows(MatchService.Failure.class, () -> codec.decodeForActivation(stored, budget)).code);
		assertEquals("{}", codec.decodeForActivation("{}", budget));
	}

	@Test void cachedRecoverySizeIncludesEscapedEventsTranscriptNativeCommandsAndChat() throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 123);
		assertSize(fixture.session);
		fixture.session.sendChat(ID, "home", "chat", "A quoted \"message\" with café and a mole 🦔", System.currentTimeMillis());
		assertSize(fixture.session);
		fixture.restore();
		assertSize(fixture.session);
	}

	@Test void appendLimitEndsAndRecordsTheMatchInsteadOfPermanentlyQuarantiningIt() throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 124);
		MemoryRecovery recovery = new MemoryRecovery(fixture.document.matchId, fixture.session.recoveryArtifact());
		MemoryMatches repository = new MemoryMatches(fixture.document);
		MatchService matches = new MatchService(repository, null, new RosterCatalog());
		MatchMemoryBudget budget = new MatchMemoryBudget(64 * MIB);
		SetupApplication application = new SetupApplication(fixture.server, matches, recovery, true, Clock.systemUTC(), true, budget,
			new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
		JsonObject response = application.handle("home", load(fixture.document.matchId));
		JsonObject view = response.get("state").asObject();
		int sequence = 0;
		for (; sequence < 160 && !"FULL_TIME".equals(view.getString("phase", null)); sequence++) {
			JsonObject request = fixture.recordedDecision(view, "growth-" + sequence, sequence);
			response = application.handle(view.getString("actor", null), request);
			assertEquals("ACCEPTED", response.getString("code", null), request::toString);
			view = response.get("state").asObject();
		}
		assertTrue(sequence > 10);
		assertEquals("FULL_TIME", view.getString("phase", null));
		assertEquals(MatchDocument.Lifecycle.COMPLETED, matches.loadForSetup("home", fixture.document.matchId).document.lifecycle);
		assertTrue(new Utf8Size().bytes(recovery.record.json) <= budget.decodedLimit());
		assertEquals("MATCH_SIZE_LIMIT", application.drainStoppedMatches().get(fixture.document.matchId));
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		SetupSession restored = new SetupSession(fixture.server, fixture.document, recovery.record.json);
		assertTrue(restored.isComplete()); assertTrue(restored.endedForSizeLimit());
		JsonObject completedLoad = application.handle("home", load(fixture.document.matchId));
		assertEquals("ACCEPTED", completedLoad.getString("code", null));
		assertEquals("FULL_TIME", completedLoad.get("state").asObject().getString("phase", null));
		assertEquals("MATCH_SIZE_LIMIT", completedLoad.get("state").asObject().getString("stopReason", null));
		recovery.record = null; // Completed recovery is eventually pruned; the result still records the decision.
		assertEquals("MATCH_SIZE_LIMIT", application.handle("away", load(fixture.document.matchId)).get("state").asObject().getString("stopReason", null));
	}

	@Test void ordinaryCrashDoesNotQuarantineButConfirmedOomOnlyDelaysAutomaticReload(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("run.hprof");
		Clock now = Clock.fixed(Instant.ofEpochMilli(1_000), ZoneOffset.UTC);
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file, dump, now)) { safety.beginTask(ID); }
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), now)) {
			restart.requireAutomaticAvailable(ID); // An unmatched operation without OOM evidence is not quarantine.
		}
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file, dump, now)) { safety.beginTask(ID); }
		Files.writeString(dump, "test OOM evidence");
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), now)) {
			assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID)).code);
			restart.requireAutomaticAvailable(OTHER);
		}
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("later.hprof"), Clock.offset(now, Duration.ofMinutes(31)))) {
			restart.requireAutomaticAvailable(ID);
		}
	}

	@Test void automaticQuarantineExpiresInTheSameRunningProcess(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("oom.hprof");
		Clock clock = mock(Clock.class); when(clock.millis()).thenReturn(1_000L);
		try (MatchSafetyJournal prior = new MatchSafetyJournal(file, dump, clock)) { prior.beginTask(ID); }
		Files.writeString(dump, "test OOM evidence");
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), clock)) {
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID));
			when(clock.millis()).thenReturn(1_000L + Duration.ofMinutes(30).toMillis());
			restart.requireAutomaticAvailable(ID);
		}
	}

	@Test void quarantineSurvivesOrdinaryRestartsAndAdminClearIsSelective(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("oom.hprof");
		Clock now = Clock.fixed(Instant.ofEpochMilli(1_000), ZoneOffset.UTC);
		try (MatchSafetyJournal prior = new MatchSafetyJournal(file, dump, now)) {
			prior.configureResidentMatches(() -> Set.of(ID, OTHER)); prior.beginTask(null);
		}
		Files.writeString(dump, "test OOM evidence");
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), now)) {
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID));
			restart.beginTask("00000000-0000-0000-0000-000000000333"); restart.finishWork();
		}
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("third.hprof"), now)) {
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID));
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(OTHER));
		}
		new MatchSafetyAdmin().clear(file, ID);
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("fourth.hprof"), now)) {
			restart.requireAutomaticAvailable(ID);
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(OTHER));
		}
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("fifth.hprof"), Clock.offset(now, Duration.ofMinutes(31)))) {
			restart.requireAutomaticAvailable(OTHER);
		}
	}

	@Test void quarantineMergeRoundTripsAndOversizedTrackingPreservesTheLastValidState(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("oom.hprof");
		Clock now = Clock.fixed(Instant.ofEpochMilli(1_000), ZoneOffset.UTC);
		Map<String, Long> blocks = new LinkedHashMap<>();
		for (int index = 0; index < 512; index++) blocks.put("00000000-0000-0000-0000-%012d".formatted(index), 1_801_000L);
		try (MatchSafetyJournal.FileStore store = new MatchSafetyJournal.FileStore(file)) {
			store.write(new MatchSafetyJournal.State("prior", 1_000, dump.toString(), 1, Set.of(ID), blocks));
		}
		Files.writeString(dump, "test OOM evidence");
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), now)) {
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID));
		}
		try (MatchSafetyJournal.FileStore store = new MatchSafetyJournal.FileStore(file)) {
			MatchSafetyJournal.State saved = store.read();
			assertEquals(513, saved.quarantines().size());
			for (int index = 512; index < 1400; index++) blocks.put("00000000-0000-0000-0000-%012d".formatted(index), 1_801_000L);
			assertThrows(IOException.class, () -> store.write(new MatchSafetyJournal.State("overflow", 1_000, "", 2, Set.of(), blocks)));
			assertEquals(saved, store.read());
		}
	}

	@Test void earlierVersionOneBreadcrumbsStillEstablishOomQuarantine(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("oom.hprof");
		Files.writeString(file, new JsonObject().add("version", 1).add("run", "old").add("startedAt", 1_000)
			.add("dump", dump.toString()).add("sequence", 1).add("matches", new com.eclipsesource.json.JsonArray().add(ID)).toString());
		Files.writeString(dump, "test OOM evidence");
		try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), Clock.systemUTC())) {
			assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID));
		}
	}

	@Test void stalledOrFailedStoreNeverRejectsGameplayAndHasOnlyOnePendingUpdate() throws Exception {
		CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
		AtomicInteger writes = new AtomicInteger();
		MatchSafetyJournal.StateStore store = new MatchSafetyJournal.StateStore() {
			@Override public MatchSafetyJournal.State read() { return null; }
			@Override public void write(MatchSafetyJournal.State state) throws IOException {
				writes.incrementAndGet(); entered.countDown();
				try { release.await(); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
				throw new IOException("injected stalled store failure");
			}
		};
		try (MatchSafetyJournal safety = new MatchSafetyJournal(store, null, Clock.systemUTC())) {
			assertTrue(entered.await(5, TimeUnit.SECONDS));
			long started = System.nanoTime();
			for (int i = 0; i < 100; i++) safety.beginTask(ID);
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 500, "Advisory handoffs must never wait for the stalled writer");
			assertTrue(entered.await(5, TimeUnit.SECONDS));
			for (int i = 0; i < 100; i++) safety.finishWork(); // Coalesced, not 100 queued writes.
			safety.requireAutomaticAvailable(ID);
			assertEquals(1, writes.get()); release.countDown();
		} finally { release.countDown(); }
	}

	@Test void operatorClearRequiresStoppedWriterAndRemovesOnlyTheNamedMatch(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("oom.hprof");
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file, dump, Clock.systemUTC())) {
			safety.configureResidentMatches(() -> Set.of(ID, OTHER)); safety.beginTask(null);
			assertThrows(IOException.class, () -> new MatchSafetyAdmin().clear(file, ID));
		}
		new MatchSafetyAdmin().clear(file, ID);
		try (MatchSafetyJournal.FileStore store = new MatchSafetyJournal.FileStore(file)) { assertEquals(Set.of(OTHER), store.read().matches()); }
	}

	@Test void realJvmOomExitIsDistinguishedFromAnOrdinaryProcessExit(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.json"), dump = directory.resolve("oom.hprof"), log = directory.resolve("process.log");
		Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
			"-Xmx32m", "-XX:+HeapDumpOnOutOfMemoryError", "-XX:HeapDumpPath=" + dump,
			"-XX:+ExitOnOutOfMemoryError", "-cp", System.getProperty("java.class.path"), OutOfMemoryChild.class.getName(), file.toString())
			.redirectErrorStream(true).redirectOutput(log.toFile()).start();
		try {
			assertTrue(process.waitFor(20, TimeUnit.SECONDS)); assertEquals(3, process.exitValue(), Files.readString(log));
			try (MatchSafetyJournal restart = new MatchSafetyJournal(file, directory.resolve("next.hprof"), Clock.systemUTC())) {
				assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> restart.requireAutomaticAvailable(ID)).code);
				restart.requireAutomaticAvailable(OTHER);
			}
		} finally { if (process.isAlive()) process.destroyForcibly(); }
	}

	private void assertSize(SetupSession session) { assertEquals(new Utf8Size().bytes(session.recoveryArtifact()), session.recoveryBytes()); }
	private JsonObject load(String id) { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load").add("requestId", "load").add("matchId", id); }

	public static class OutOfMemoryChild {
		public static void main(String[] args) throws Exception {
			CountDownLatch persisted = new CountDownLatch(1);
			AtomicReference<Throwable> problem = new AtomicReference<>();
			MatchSafetyJournal.FileStore files = new MatchSafetyJournal.FileStore(Path.of(args[0]));
			MatchSafetyJournal.StateStore observed = new MatchSafetyJournal.StateStore() {
				@Override public MatchSafetyJournal.State read() throws IOException { return files.read(); }
				@Override public void write(MatchSafetyJournal.State snapshot) throws IOException {
					try { files.write(snapshot); }
					catch (IOException | RuntimeException failure) { problem.set(failure); persisted.countDown(); throw failure; }
					if (snapshot.matches().contains(ID)) persisted.countDown();
				}
				@Override public void close() throws IOException { files.close(); }
			};
			Path dump = Path.of(java.lang.management.ManagementFactory.getPlatformMXBean(com.sun.management.HotSpotDiagnosticMXBean.class)
				.getVMOption("HeapDumpPath").getValue());
			try (MatchSafetyJournal safety = new MatchSafetyJournal(observed, dump, Clock.systemUTC())) {
				safety.beginTask(ID);
				// Test-only acknowledgement: avoid racing a file reader against atomic replacement.
				// Production never waits, and deliberately permits missing attribution on a late write.
				if (!persisted.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Tracking handoff not persisted");
				if (problem.get() != null) throw new IllegalStateException("Tracking store failed", problem.get());
				System.out.println(new byte[64 * 1024 * 1024].length);
			}
		}
	}

	private static final class MemoryRecovery implements RecoveryRepository {
		private Record record;
		MemoryRecovery(String id, String json) { record = new Record(id, 1, json); }
		@Override public Record find(String id) { return record != null && record.matchId.equals(id) ? record : null; }
		@Override public boolean save(Record record, long expected) { this.record = record; return true; }
	}
	private static final class MemoryMatches implements MatchRepository {
		private Record record;
		MemoryMatches(MatchDocument document) { record = new Record(document.matchId, document.documentVersion, new MatchJson().storageText(document)); }
		@Override public Record find(String id) { return record.matchId.equals(id) ? record : null; }
		@Override public void insert(Record record) { this.record = record; }
		@Override public boolean replace(Record record, int expected) { if (this.record.documentVersion != expected) return false; this.record = record; return true; }
	}
}
