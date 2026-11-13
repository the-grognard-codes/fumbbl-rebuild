package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.local.BrowserRequestTiming;
import com.fumbbl.ffb.server.db.JdbcConnections;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Native cold/warm append/compaction workload. SQL and provider latency are measured separately. */
class CaptureCheckpointWorkloadTest {
	@Test void longMatchColdLoadAndBudgetRefusedWriteReconcileAtTheDurableRevision() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		JsonObject view = fixture.session.reply("opening", "ACCEPTED", false, "home").get("state").asObject();
		for (int index = 0; !"SETUP".equals(view.getString("phase", null)) && index < 12; index++)
			view = fixture.session.apply(view.getString("actor", null), next(fixture, view, index)).get("state").asObject();
		assertEquals("SETUP", view.getString("phase", null));
		String id = fixture.document.matchId;
		String role = view.getString("actor", null);
		view = fixture.session.reply("opening", "ACCEPTED", false, role).get("state").asObject();
		String playerId = null;
		JsonObject origin = null;
		for (JsonValue value : view.get("players").asArray()) {
			JsonObject player = value.asObject();
			if (role.equals(player.getString("role", null)) && player.get("x").isNumber() && player.get("y").isNumber()) {
				playerId = player.getString("id", null);
				origin = new JsonObject().add("x", player.get("x")).add("y", player.get("y"));
				break;
			}
		}
		assertTrue(playerId != null, () -> "Expected a placed player in the setup projection");
		JsonObject alternate = new JsonObject().add("x", "home".equals(role) ? 1 : 24).add("y", 0);
		fixture.session.startSaveResumeRetention(System.currentTimeMillis());
		for (int index = view.getInt("revision", 0); index < 268; index++) {
			JsonObject request = placement(fixture, view, index, playerId, index % 2 == 0 ? alternate : origin);
			view = fixture.session.apply(role, request).get("state").asObject();
		}
		String base = fixture.session.recoveryArtifact();
		assertTrue(base.getBytes(java.nio.charset.StandardCharsets.UTF_8).length >= 440 * 1024);
		AtomicLong nanos = new AtomicLong();
		BrowserRequestTiming timing = new BrowserRequestTiming();
		Memory recovery = new Memory(new RecoveryRepository.Record(id, 268, base));
		MatchService matches = mock(MatchService.class);
		when(matches.load(role, id)).thenReturn(new MatchService.Result(fixture.document, false));
		when(matches.loadForSetup(role, id)).thenReturn(new MatchService.Result(fixture.document, false));
		SetupApplication application = new SetupApplication(fixture.server, matches, recovery);
		for (int index = 268; index < 275; index++) {
			JsonObject request = placement(fixture, view, index, playerId, index % 2 == 0 ? alternate : origin);
			JsonObject accepted = application.handle(role, request);
			assertEquals("ACCEPTED", accepted.getString("code", null));
			view = accepted.get("state").asObject();
		}
		assertEquals(7, recovery.entries.size());
		assertEquals(275, view.getInt("revision", -1));
		long committed = recovery.generation;
		JsonObject action = placement(fixture, view, 275, playerId, origin);
		JsonObject load = fixture.request("load", "cold-load", view).remove("expectedRevision");
		CaptureRequestProbe probe = new CaptureRequestProbe();
		recovery.beforeWrite = () -> {
			nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			if (timing.budget().allowanceMillis(1, JdbcConnections.WORK_RESERVE_MILLIS) == 0) throw new JdbcConnections.NotStarted();
		};
		JsonObject failed = probe.measure(action, nanos::get, () -> application.handle(role, action)).response();
		assertEquals("PERSISTENCE_FAILED", failed.getString("code", null));
		assertEquals(committed, recovery.generation);
		assertEquals(0, application.lifecycleMetrics().getInt("residentSessions", -1));
		application.configureStorageAdmission(() -> {
			if (timing.budget().allowanceMillis(1, JdbcConnections.WORK_RESERVE_MILLIS) == 0) throw new JdbcConnections.NotStarted();
		});
		recovery.afterRead = () -> nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
		CaptureRequestProbe.Measurement loaded = probe.measure(load, nanos::get, () -> application.handle(role, load));
		assertEquals(2000.0, loaded.timing().getDouble("recoveryRestoreMs", -1));
		assertEquals("ACCEPTED", loaded.response().getString("code", null));
		assertEquals(275, loaded.response().get("state").asObject().getInt("revision", -1));
		assertEquals(committed, recovery.generation);
		recovery.beforeWrite = () -> { };
		JsonObject accepted = probe.measure(action, nanos::get, () -> application.handle(role, action)).response();
		assertEquals("ACCEPTED", accepted.getString("code", null));
		assertFalse(accepted.getBoolean("duplicate", true));
		assertEquals(276, accepted.get("state").asObject().getInt("revision", -1));
		assertTrue(probe.measure(action, nanos::get, () -> application.handle(role, action)).response().getBoolean("duplicate", false));
		assertEquals(committed + 1, recovery.generation);
	}

	private JsonObject placement(SetupSessionMovementTest.Fixture fixture, JsonObject view, int index, String playerId, JsonObject square) {
		return fixture.request("place", "long-" + index, view).add("playerId", playerId).add("to", square);
	}

	@Test void nativeActionsRemainRecoverableAcrossRepeatedJournalCompaction() throws Exception {
		JsonArray runs = new JsonArray();
		String initial = null;
		for (int repeat = 0; repeat < 3; repeat++) {
			SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
			long initialStarted = System.nanoTime();
			String fixtureArtifact = fixture.session.recoveryArtifact();
			double initialSerializationMs = (System.nanoTime() - initialStarted) / 1_000_000.0;
			if (initial == null) {
				String initialFile = System.getProperty("capture.initialCheckpoint", System.getenv("CAPTURE_CHECKPOINT_INITIAL"));
				if (initialFile != null && Files.exists(Path.of(initialFile))) initial = Files.readString(Path.of(initialFile));
				else {
					initial = fixtureArtifact;
					if (initialFile != null) Files.writeString(Path.of(initialFile), initial);
				}
			}
			SetupSession session = new SetupSession(fixture.server, fixture.document, initial);
			session.startSaveResumeRetention(System.currentTimeMillis());
			Memory recovery = new Memory(new RecoveryRepository.Record(fixture.document.matchId, 1, session.recoveryArtifact()));
			MatchService matches = mock(MatchService.class);
			for (String role : new String[] { "home", "away" }) {
				when(matches.load(role, fixture.document.matchId)).thenReturn(new MatchService.Result(fixture.document, false));
				when(matches.loadForSetup(role, fixture.document.matchId)).thenReturn(new MatchService.Result(fixture.document, false));
			}
			SetupApplication application = new SetupApplication(fixture.server, matches, recovery);
			CaptureRequestProbe probe = new CaptureRequestProbe();
			JsonObject view = application.handle("home", new JsonObject().add("version", 1).add("type", "setup")
				.add("operation", "load").add("requestId", "initial").add("matchId", fixture.document.matchId)).get("state").asObject();
			int compactions = 0;
			JsonArray samples = new JsonArray();
			for (int index = 0; index < 36; index++) {
				JsonObject request = next(fixture, view, index);
				String browserFixture = System.getProperty("capture.browserFixture", System.getenv("CAPTURE_BROWSER_FIXTURE"));
				if (browserFixture != null && repeat == 0 && "PLAY".equals(view.getString("phase", null))
					&& "REGULAR".equals(view.getString("turnMode", null)) && !Files.exists(Path.of(browserFixture)))
					Files.writeString(Path.of(browserFixture), view.toString());
				String actor = view.getString("actor", null);
				long beforeGeneration = recovery.generation;
				int beforeSaves = recovery.saves;
				CaptureRequestProbe.Measurement measured = probe.measure(request, () -> application.handle(actor, request));
				JsonObject response = measured.response();
				assertEquals("ACCEPTED", response.getString("code", null));
				assertTrue(recovery.generation > beforeGeneration, "Acceptance must follow a durable commit");
				boolean compact = recovery.saves > beforeSaves;
				if (compact) compactions++;
				JsonObject measuredTiming = measured.timing();
				double checkpointMs = measuredTiming.getDouble("checkpointMs", -1);
				assertTrue(checkpointMs >= 0, "Checkpoint timing must be present");
				RecoveryRepository.Record restored = recovery.find(fixture.document.matchId);
				samples.add(new JsonObject().add("index", index).add("path", compact ? "compaction" : "append")
					.add("firstUse", index == 0).add("artifactBytes", restored.json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length)
					.add("timing", measuredTiming).add("checkpointMs", checkpointMs));
				// An optional declared workload gate makes the same command red-capable for spikes.
				assertTrue(checkpointMs <= Double.parseDouble(System.getProperty("capture.checkpointCeilingMs",
					System.getenv().getOrDefault("CAPTURE_CHECKPOINT_CEILING_MS", "10000"))),
					"Checkpoint exceeded the declared workload ceiling: " + checkpointMs);
				assertEquals(restored.json, new SetupSession(fixture.server, fixture.document, restored.json).recoveryArtifact());
				view = response.get("state").asObject();
			}
			assertTrue(compactions > 0, "The workload must cross a real compaction boundary");
			runs.add(new JsonObject().add("repeat", repeat + 1).add("initialArtifactSerializationMs", initialSerializationMs).add("samples", samples));
		}
		String output = System.getProperty("capture.workloadOutput", System.getenv("CAPTURE_CHECKPOINT_OUTPUT"));
		if (output != null) Files.writeString(Path.of(output), new JsonObject().add("version", 1)
			.add("javaVersion", System.getProperty("java.version")).add("maxHeapBytes", Runtime.getRuntime().maxMemory())
			.add("processors", Runtime.getRuntime().availableProcessors())
			.add("initialSha256", new JsonDigest().sha256(initial.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
			.add("workload", "36 native setup/choice/end-turn actions from the same retained initial checkpoint; restore parity after every commit")
			.add("limitations", "Real SetupApplication action/checkpoint/reply with in-memory durable repository; excludes SQL, provider and socket latency; initial artifact timing is separate; action timing starts after fixture initialization and native restore")
			.add("runs", runs).toString());
	}

	private static final class Memory implements RecoveryRepository {
		private final RecoveryJournal journal = new RecoveryJournal();
		private final List<Record> entries = new ArrayList<>();
		private Record base;
		private long generation;
		private int saves;
		private SetupApplication.StorageAdmission beforeWrite = () -> { };
		private Runnable afterRead = () -> { };
		Memory(Record initial) { base = initial; generation = initial.generation; }
		@Override public boolean supportsJournal() { return true; }
		@Override public Long generation(String id) { return generation; }
		@Override public Record find(String id) {
			Record result = journal.restore(id, generation, base.generation, base.json, entries);
			afterRead.run();
			return result;
		}
		@Override public boolean append(Record next, long expected) throws SQLException {
			beforeWrite.requireAvailable();
			if (generation != expected) return false;
			entries.add(next); generation = next.generation; return true;
		}
		@Override public boolean save(Record next, long expected) throws SQLException {
			beforeWrite.requireAvailable();
			if (generation != expected) return false;
			base = next; generation = next.generation; entries.clear(); saves++; return true;
		}
	}

	private JsonObject next(SetupSessionMovementTest.Fixture fixture, JsonObject view, int index) {
		JsonObject request = fixture.request("action", "capture-" + index, view);
		if ("SETUP".equals(view.getString("phase", null))) return request.set("operation", "confirm");
		if (!view.get("prompt").isNull()) {
			JsonObject prompt = view.get("prompt").asObject();
			return request.set("operation", "choice").add("promptId", prompt.get("id"))
				.add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
		}
		JsonObject selected = null;
		for (JsonValue value : view.get("actions").asArray())
			if ("endTurn".equals(value.asObject().getString("kind", null))) selected = value.asObject();
		if (selected == null) selected = view.get("actions").asArray().get(0).asObject();
		return request.add("actionId", selected.get("id"));
	}
}
