package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.management.ManagementFactory;
import java.util.List;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.clearInvocations;

/** Opt-in deployment-heap probe using real eleven-player native/replay/transcript histories. */
@EnabledIfEnvironmentVariable(named = "MATCH_MEMORY_WORKLOAD", matches = ".+")
class MatchMemoryWorkloadTest {
	@Test void longHistoryRestoresAndSerializesWithinTheDeploymentHeap() throws Exception {
		assertTrue(Runtime.getRuntime().maxMemory() <= 800L * 1024 * 1024, "Run with -Xmx768m");
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 554, "Unicode “Home” 🦔 ");
		JsonObject view = fixture.reply("home").get("state").asObject();
		int target = Integer.parseInt(System.getenv().getOrDefault("MATCH_MEMORY_WORKLOAD_MIB", "45"));
		int decisions = 0;
		while (!"SETUP".equals(view.getString("phase", null))) {
			JsonObject prompt = view.get("prompt").asObject();
			view = accepted(fixture.session.apply(view.getString("actor", null), request(fixture, view, "choice", decisions++)
				.add("promptId", prompt.get("id")).add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive")));
		}
		String role = view.getString("actor", null), player = null;
		for (JsonValue item : view.get("players").asArray())
			if (role.equals(item.asObject().getString("role", null))) { player = item.asObject().getString("id", null); break; }
		String artifact = null;
		for (; decisions < 2400; decisions++) {
			view = accepted(fixture.session.apply(role, request(fixture, view, "place", decisions)
				.add("playerId", player).add("to", new JsonObject().add("x", "home".equals(role) ? 3 : 20).add("y", decisions % 2 + 5))));
			if (decisions % 50 == 0) {
				clearInvocations(fixture.server, fixture.server.getCommunication(), fixture.server.getDebugLog());
				artifact = fixture.session.recoveryArtifact();
				System.out.println("MATCH_MEMORY_GROW decisions=" + decisions + " bytes=" + artifact.length());
				if (artifact.length() >= target * 1024 * 1024) break;
			}
		}
		assertTrue(artifact != null && artifact.length() >= target * 1024 * 1024);
		assertTrue(new Utf8Size().bytes(artifact) < new MatchMemoryBudget().decodedLimit(), "History must fit below the decoded limit");
		RecoveryJournal journal = new RecoveryJournal();
		RecoveryJournal.Cursor cursor = journal.cursor(new RecoveryRepository.Record(fixture.document.matchId, 1, artifact), fixture.session);
		view = accepted(fixture.session.apply(role, request(fixture, view, "place", decisions + 1)
			.add("playerId", player).add("to", JsonValue.NULL)));
		RecoveryJournal.Change change = journal.change(fixture.session, cursor, 1);
		assertTrue(!change.compact, "Probe must exercise checkpoint-plus-journal reassembly");
		String expected = new JsonDigest().sha256(fixture.session.recoveryArtifact());
		BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(32 * 1024 * 1024, 128 * 1024 * 1024);
		String stored = codec.encode(artifact);
		artifact = null;
		int revision = view.getInt("revision", -1);
		fixture.session = null;
		clearInvocations(fixture.server, fixture.server.getCommunication(), fixture.server.getDebugLog());
		SetupSession resident = target <= 45 ? warmResident() : null;
		long residentBytes = resident == null ? 0 : resident.recoveryBytes();
		MatchMemoryBudget budget = new MatchMemoryBudget();
		long incoming = codec.decodedBytes(stored) + new Utf8Size().bytes(change.json);
		budget.requireDecodedBytes(incoming);
		boolean evicted = resident != null && !budget.admitsResidents(budget.residentBytes(residentBytes) + budget.residentBytes(incoming), Math.max(residentBytes, incoming));
		if (evicted) resident = null;
		assertTrue(budget.admitsResidents((resident == null ? 0 : budget.residentBytes(residentBytes)) + budget.residentBytes(incoming), resident == null ? incoming : Math.max(residentBytes, incoming)));
		System.gc();
		long before = usedHeap(), started = System.nanoTime();
		RecoveryRepository.Record record = journal.restore(fixture.document.matchId, 2, 1, codec.decode(stored),
			List.of(new RecoveryRepository.Record(fixture.document.matchId, 2, change.json)));
		artifact = record.json;
		assertEquals(expected, new JsonDigest().sha256(artifact));
		SetupSession restored = new SetupSession(fixture.server, fixture.document, artifact);
		assertEquals(revision, restored.revision());
		assertEquals(artifact, restored.recoveryArtifact());
		assertEquals(32, new RecoveryArtifactFingerprint().of(artifact).length);
		assertEquals(1, journal.cursor(record, restored).entries);
		restored.endForSizeLimit(System.currentTimeMillis());
		assertTrue(restored.endedForSizeLimit());
		assertTrue(restored.completedMatch().json().length() < CompletedMatch.MAX_BYTES);
		if (resident != null) assertTrue(resident.revision() >= 400, "The warm engine stays live throughout the incoming recovery");
		long elapsedMillis = (System.nanoTime() - started) / 1_000_000;
		System.gc();
		JsonObject report = new JsonObject().add("maxHeapBytes", Runtime.getRuntime().maxMemory())
			.add("decisions", decisions).add("revision", revision).add("artifactBytes", new Utf8Size().bytes(artifact)).add("unicodeJournal", true)
			.add("otherResidentDecodedBytes", residentBytes)
			.add("evictedBeforeDecode", evicted)
			.add("retainedBeforeBytes", before).add("retainedAfterBytes", usedHeap()).add("restoreAndSerializeMillis", elapsedMillis)
			.add("gcCollections", ManagementFactory.getGarbageCollectorMXBeans().stream().mapToLong(bean -> bean.getCollectionCount()).sum());
		Files.writeString(Path.of(System.getenv("MATCH_MEMORY_WORKLOAD")), report.toString());
		System.out.println("MATCH_MEMORY_RESULT " + report);
	}

	private SetupSession warmResident() throws Exception {
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 555);
		JsonObject view = fixture.reply("home").get("state").asObject();
		int sequence = 0;
		while (!"SETUP".equals(view.getString("phase", null))) {
			JsonObject prompt = view.get("prompt").asObject();
			view = accepted(fixture.session.apply(view.getString("actor", null), request(fixture, view, "choice", sequence++)
				.add("promptId", prompt.get("id")).add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive")));
		}
		String role = view.getString("actor", null), player = null;
		for (JsonValue value : view.get("players").asArray())
			if (role.equals(value.asObject().getString("role", null))) { player = value.asObject().getString("id", null); break; }
		int residentDecisions = Integer.parseInt(System.getenv().getOrDefault("MATCH_MEMORY_RESIDENT_DECISIONS", "760"));
		while (sequence < residentDecisions) {
			view = accepted(fixture.session.apply(role, request(fixture, view, "place", sequence++)
				.add("playerId", player).add("to", JsonValue.NULL)));
		}
		clearInvocations(fixture.server, fixture.server.getCommunication(), fixture.server.getDebugLog());
		return fixture.session;
	}
	private JsonObject request(BogrukEngineFixture fixture, JsonObject view, String operation, int sequence) {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", operation).add("requestId", "memory-" + sequence)
			.add("matchId", fixture.document.matchId).add("expectedRevision", view.getInt("revision", -1));
	}
	private JsonObject accepted(JsonObject response) { assertEquals("ACCEPTED", response.getString("code", null)); return response.get("state").asObject(); }
	private long usedHeap() { return Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory(); }
}
