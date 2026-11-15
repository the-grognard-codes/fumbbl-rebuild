package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.concurrent.TimeUnit;
import java.util.logging.Handler;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MatchMemoryIsolationTest {
	private static final long MIB = 1024 * 1024;
	private static final String ID = "12345678-1234-1234-1234-123456789abc";
	private static final String OTHER = "00000000-0000-0000-0000-000000000222";

	@Test void heapBudgetAccountsForEveryAdmittedSessionAndTransientExpansion() {
		for (long heap : new long[] {64 * MIB, 256 * MIB, 768 * MIB, 3_072 * MIB, 32_768 * MIB}) {
			MatchMemoryBudget budget = new MatchMemoryBudget(heap);
			assertTrue(budget.residentLimit() >= 1 && budget.residentLimit() <= 32);
			assertTrue(budget.decodedLimit() <= 32 * MIB);
			assertTrue(budget.residentLimit() * (long) budget.decodedLimit() * 12 <= heap - Math.max(32 * MIB, heap / 3));
		}
		MatchMemoryBudget local = new MatchMemoryBudget(768 * MIB);
		assertEquals(1, local.residentLimit());
		assertEquals(32 * MIB, local.decodedLimit());
	}

	@Test void storedDeclaredOversizeIsRejectedBeforeEvenAnInvalidPayloadCanBeDecoded() {
		String stored = new JsonObject().add("$codec", "ffb-match-gzip-json").add("version", 1)
			.add("decodedBytes", 45 * MIB).add("payload", "invalid-base64!").toString();
		BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(32 * 1024 * 1024, 128 * 1024 * 1024);
		assertEquals("MATCH_SIZE_LIMIT", assertThrows(MatchService.Failure.class,
			() -> codec.decodeForActivation(stored, new MatchMemoryBudget(768 * MIB))).code);
		assertEquals("{}", codec.decodeForActivation("{}", new MatchMemoryBudget(768 * MIB)));
	}

	@Test void cachedRecoverySizeIncludesEscapedEventsTranscriptNativeCommandsAndChat() throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 123);
		assertSize(fixture.session);
		fixture.session.sendChat(ID, "home", "chat", "A quoted \"message\" with café and a mole 🦔", System.currentTimeMillis());
		assertSize(fixture.session);
		fixture.restore();
		assertSize(fixture.session);
	}

	@Test void appendAdmissionStopsTheMatchBeforeWritingAndPersistsTheReason(@TempDir Path directory) throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 124);
		MemoryRecovery recovery = new MemoryRecovery(fixture.document.matchId, fixture.session.recoveryArtifact());
		MatchService matches = mock(MatchService.class);
		when(matches.loadForSetup(anyString(), anyString())).thenReturn(new MatchService.Result(fixture.document, false));
		when(matches.load(anyString(), anyString())).thenReturn(new MatchService.Result(fixture.document, false));
		MatchMemoryBudget budget = new MatchMemoryBudget(64 * MIB);
		SetupApplication application = new SetupApplication(fixture.server, matches, recovery, true, Clock.systemUTC(), true, budget);
		Path file = directory.resolve("safety.log");
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file)) {
			application.configureMatchSafety(safety);
			JsonObject load = load(fixture.document.matchId);
			JsonObject response = application.handle("home", load);
			assertEquals("ACCEPTED", response.getString("code", null));
			StringBuilder logs = new StringBuilder();
			Logger logger = Logger.getLogger("com.fumbbl.ffb.server.match.safety");
			Handler capture = new Handler() {
				@Override public void publish(LogRecord record) { logs.append(record.getMessage()); }
				@Override public void flush() { }
				@Override public void close() { }
			};
			logger.addHandler(capture);
			try {
				JsonObject view = response.get("state").asObject();
				int sequence = 0;
				while (!"SETUP".equals(view.getString("phase", null))) {
					JsonObject prompt = view.get("prompt").asObject();
					JsonObject request = load(fixture.document.matchId).set("operation", "choice")
						.set("requestId", "choice-" + sequence++).add("expectedRevision", view.getInt("revision", -1))
						.add("promptId", prompt.get("id")).add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
					response = application.handle(view.getString("actor", null), request);
					assertEquals("ACCEPTED", response.getString("code", null));
					view = response.get("state").asObject();
				}
				int writesBeforeRefusal = 0;
				for (; sequence < 200; sequence++) {
					String actor = view.getString("actor", null);
					String player = null;
					for (com.eclipsesource.json.JsonValue item : view.get("players").asArray())
						if (actor.equals(item.asObject().getString("role", null))) { player = item.asObject().getString("id", null); break; }
					JsonObject request = load(fixture.document.matchId).set("operation", "place").set("requestId", "growth-" + sequence)
						.add("expectedRevision", view.getInt("revision", -1)).add("playerId", player).add("to", com.eclipsesource.json.JsonValue.NULL);
					writesBeforeRefusal = recovery.writes;
					response = application.handle(actor, request);
					if ("MATCH_SIZE_LIMIT".equals(response.getString("code", null))) break;
					assertEquals("ACCEPTED", response.getString("code", null));
					view = response.get("state").asObject();
				}
				assertEquals("MATCH_SIZE_LIMIT", response.getString("code", null));
				assertTrue(sequence > 10, "Grow real native placement/event/transcript history to the bound");
				assertEquals(writesBeforeRefusal, recovery.writes);
				assertTrue(new Utf8Size().bytes(recovery.record.json) <= budget.decodedLimit());
				assertTrue(logs.toString().contains("MATCH_SIZE_LIMIT matchId="));
				assertEquals("MATCH_SIZE_LIMIT", application.handle("home", load).getString("code", null));
				assertEquals("MATCH_SIZE_LIMIT", application.drainStoppedMatches().get(fixture.document.matchId));
				assertTrue(application.drainStoppedMatches().isEmpty(), "Timer drains each queued stop once");
				assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
			} finally { logger.removeHandler(capture); }
			safety.finishWork();
		}
		try (MatchSafetyJournal restarted = new MatchSafetyJournal(file)) {
			assertEquals("MATCH_SIZE_LIMIT", assertThrows(MatchService.Failure.class,
				() -> restarted.requireAvailable(fixture.document.matchId)).code);
			restarted.requireAvailable(OTHER);
		}
	}

	@Test void realJvmOutOfMemoryExitLeavesOnlyTheSuspectMatchQuarantined(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.log"), log = directory.resolve("process.log");
		Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
			"-Xmx32m", "-XX:+ExitOnOutOfMemoryError", "-cp", System.getProperty("java.class.path"),
			OutOfMemoryChild.class.getName(), file.toString()).redirectErrorStream(true).redirectOutput(log.toFile()).start();
		try {
			assertTrue(process.waitFor(20, TimeUnit.SECONDS));
			assertEquals(3, process.exitValue(), Files.readString(log));
			try (MatchSafetyJournal restarted = new MatchSafetyJournal(file)) {
				assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> restarted.enter(ID)).code);
				restarted.enter(OTHER);
				restarted.finishWork();
			}
			try (MatchSafetyJournal restartedAgain = new MatchSafetyJournal(file)) {
				assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> restartedAgain.enter(ID)).code);
				restartedAgain.requireAvailable(OTHER);
			}
		} finally { if (process.isAlive()) process.destroyForcibly(); }
	}

	@Test void successfulWorkDoesNotQuarantineOnRestart(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.log");
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file)) { safety.enter(ID); safety.finishWork(); }
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file)) { safety.requireAvailable(ID); }
		assertFalse(Files.readString(file).contains(ID));
	}

	@Test void runningLogCompactionPreservesQuarantinesAndUnfinishedWork(@TempDir Path directory) throws Exception {
		Path file = directory.resolve("safety.log");
		try (MatchSafetyJournal safety = new MatchSafetyJournal(file)) {
			assertThrows(MatchService.Failure.class, () -> safety.sizeLimit(ID, 45 * MIB, 32 * 1024 * 1024));
			safety.enter(OTHER);
			// Use the real maintenance implementation deterministically, retaining an unmatched B record.
			java.lang.reflect.Method compact = MatchSafetyJournal.class.getDeclaredMethod("compact");
			compact.setAccessible(true); compact.invoke(safety);
			assertTrue(Files.size(file) < 128);
		}
		try (MatchSafetyJournal restarted = new MatchSafetyJournal(file)) {
			assertEquals("MATCH_SIZE_LIMIT", assertThrows(MatchService.Failure.class, () -> restarted.enter(ID)).code);
			assertEquals("MATCH_QUARANTINED", assertThrows(MatchService.Failure.class, () -> restarted.enter(OTHER)).code);
		}
	}

	@Test void stalledLogMaintenanceCannotBlockTheEngineWorkerIndefinitely() throws Exception {
		MatchSafetyJournal safety = new MatchSafetyJournal();
		java.lang.reflect.Field field = MatchSafetyJournal.class.getDeclaredField("logLock"); field.setAccessible(true);
		java.util.concurrent.locks.ReentrantLock lock = (java.util.concurrent.locks.ReentrantLock) field.get(safety);
		java.util.concurrent.CountDownLatch locked = new java.util.concurrent.CountDownLatch(1);
		java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
		Thread stalled = new Thread(() -> {
			lock.lock(); locked.countDown();
			try { release.await(); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
			finally { lock.unlock(); }
		});
		stalled.start();
		try {
			assertTrue(locked.await(5, TimeUnit.SECONDS));
			long started = System.nanoTime();
			assertEquals("MATCH_SAFETY_UNAVAILABLE", assertThrows(MatchService.Failure.class, () -> safety.enter(ID)).code);
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 500, "Worker returns while maintenance remains stalled");
		} finally { release.countDown(); stalled.join(5000); safety.close(); }
	}

	@Test void refusesFortyFiveMibArtifactUnderTheRealDeploymentHeap(@TempDir Path directory) throws Exception {
		Path log = directory.resolve("memory-probe.log");
		Process process = new ProcessBuilder(Path.of(System.getProperty("java.home"), "bin", "java").toString(),
			"-Xmx768m", "-cp", System.getProperty("java.class.path"), OversizeProbe.class.getName())
			.redirectErrorStream(true).redirectOutput(log.toFile()).start();
		try {
			assertTrue(process.waitFor(45, TimeUnit.SECONDS));
			assertEquals(0, process.exitValue(), Files.readString(log));
			assertTrue(Files.readString(log).contains("oversize-refused healthy-match-restored heap=805306368"));
		} finally { if (process.isAlive()) process.destroyForcibly(); }
	}

	private void assertSize(SetupSession session) {
		assertEquals(new Utf8Size().bytes(session.recoveryArtifact()), session.recoveryBytes());
	}

	private JsonObject load(String id) { return new JsonObject().add("version", 1).add("type", "setup")
		.add("operation", "load").add("requestId", "load").add("matchId", id); }

	public static class OutOfMemoryChild {
		public static void main(String[] args) throws Exception {
			try (MatchSafetyJournal safety = new MatchSafetyJournal(Path.of(args[0]))) {
				safety.enter(ID);
				byte[] impossible = new byte[64 * 1024 * 1024];
				System.out.println(impossible.length);
			}
		}
	}

	public static class OversizeProbe {
		public static void main(String[] args) throws Exception {
			BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(32 * 1024 * 1024, 128 * 1024 * 1024);
			String stored = codec.encode("{\"snapshot\":\"" + "x".repeat(45 * 1024 * 1024) + "\"}");
			try { codec.decodeForActivation(stored, new MatchMemoryBudget()); throw new AssertionError("Oversize admitted"); }
			catch (MatchService.Failure failure) { if (!"MATCH_SIZE_LIMIT".equals(failure.code)) throw failure; }
			BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 125);
			fixture.restore();
			System.out.println("oversize-refused healthy-match-restored heap=" + Runtime.getRuntime().maxMemory());
		}
	}

	private static final class MemoryRecovery implements RecoveryRepository {
		private Record record;
		int writes;
		MemoryRecovery(String id, String json) { record = new Record(id, 1, json); }
		@Override public Record find(String id) { return record.matchId.equals(id) ? record : null; }
		@Override public boolean save(Record record, long expected) { writes++; this.record = record; return true; }
	}
}
