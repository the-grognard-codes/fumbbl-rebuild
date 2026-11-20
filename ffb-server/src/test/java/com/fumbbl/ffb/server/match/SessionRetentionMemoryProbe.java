package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.LockSupport;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.framework;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Isolated JVM: real legal retained setup history, native concession/result materialization and application release. */
public final class SessionRetentionMemoryProbe {
	private static final int PLACEMENTS = 450;
	private static final String HUMAN = "home";
	private static final String COMPUTER = "away";

	public static void main(String[] arguments) throws Exception {
		Path checkpoints = Path.of(arguments[1]);
		if ("sequence".equals(arguments[0])) { sequence(checkpoints); return; }
		if ("materialization".equals(arguments[0])) { materialization(checkpoints); return; }
		long baseline = used();
		Resident resident = lateResident(checkpoints.resolve("resident.json"));
		int revision = resident.session.revision();
		long retained = used() - baseline;
		if (retained > 64L * 1024 * 1024) throw new AssertionError("Late-session retained heap exceeds 64 MiB: " + retained);
		List<WeakReference<Object>> parts = retainedParts(resident.session);
		SetupApplication application = resident.application;
		WeakReference<SetupSession> released = release(resident, arguments[0]);
		resident = null;
		framework().clearInlineMocks();
		for (int attempt = 0; attempt < 10 && (released.get() != null || parts.stream().anyMatch(part -> part.get() != null)); attempt++) { used(); Thread.sleep(20); }
		if (released.get() != null || parts.stream().anyMatch(part -> part.get() != null) || application.lifecycleMetrics().getInt("residentSessions", -1) != 0)
			throw new AssertionError("Application retained its released late session");
		System.out.println("retention-passed mode=" + arguments[0] + " placements=" + PLACEMENTS + " revision=" + revision + " retainedBytes=" + retained
			+ " afterReleaseBytes=" + (used() - baseline));
	}

	private static void sequence(Path checkpoints) throws Exception {
		long baseline = used();
		List<Resident> residents = new ArrayList<>();
		for (int index = 0; index < 8; index++) residents.add(lateResident(checkpoints.resolve("resident-" + index + ".json")));
		long retained = used() - baseline;
		if (retained > 256L * 1024 * 1024) throw new AssertionError("Eight-session retained heap exceeds 256 MiB: " + retained);
		long workspace = residents.stream().mapToLong(resident ->
			resident.application.lifecycleMetrics().getLong("workingReserveBytes", 0)).max().orElseThrow();
		List<WeakReference<Object>> parts = new ArrayList<>();
		List<SetupApplication> applications = new ArrayList<>();
		List<WeakReference<SetupSession>> references = new ArrayList<>();
		for (int index = 0; index < residents.size(); index++) {
			Resident resident = residents.get(index);
			applications.add(resident.application);
			parts.addAll(retainedParts(resident.session));
			references.add(release(resident, index % 2 == 0 ? "completion" : "idle"));
			residents.set(index, null);
		}
		framework().clearInlineMocks();
		for (int attempt = 0; attempt < 10; attempt++) {
			used(); Thread.sleep(20);
			if (references.stream().allMatch(reference -> reference.get() == null)
				&& parts.stream().allMatch(part -> part.get() == null)) break;
		}
		if (references.stream().anyMatch(reference -> reference.get() != null)
			|| parts.stream().anyMatch(part -> part.get() != null)
			|| applications.stream().anyMatch(application -> application.lifecycleMetrics().getInt("residentSessions", -1) != 0))
			throw new AssertionError("Sequential applications retained released late sessions");
		System.out.println("retention-passed mode=sequence sessions=8 placementsEach=" + PLACEMENTS + " retainedBytes=" + retained
			+ " workingReserveBytes=" + workspace + " afterReleaseBytes=" + (used() - baseline));
	}

	private static void materialization(Path checkpoints) throws Exception {
		long startup = used();
		MatchMemoryBudget budget = new MatchMemoryBudget();
		long target = budget.appendLimit() * 95L / 100;
		Map<String, ProbeRecovery> stored = new LinkedHashMap<>();
		Map<String, MatchService.Result> documents = new LinkedHashMap<>();
		BogrukEngineFixture large = materializationFixture(0);
		String largestId = large.document.matchId;
		register(checkpoints, stored, documents, large, expandedCheckpoint(large.session, target));
		for (int index = 1; index < 8; index++)
			register(checkpoints, stored, documents, materializationFixture(index), null);

		MatchService matches = mock(MatchService.class);
		when(matches.loadForSetup(anyString(), anyString())).thenAnswer(call -> documents.get(call.getArgument(1)));
		when(matches.load(anyString(), anyString())).thenAnswer(call -> documents.get(call.getArgument(1)));
		RecoveryRepository recovery = new RecoveryRepository() {
			@Override public Record find(String id) throws SQLException { return stored.get(id).find(id); }
			@Override public boolean save(Record record, long expected) throws SQLException {
				return stored.get(record.matchId).save(record, expected);
			}
		};
		SetupApplication application = new SetupApplication(large.server, matches, recovery, true, Clock.systemUTC(), true);
		for (String id : stored.keySet()) accepted(application.handle(HUMAN, load(id)));
		SetupSession session = (SetupSession) map(application, "sessions").get(largestId);
		long decodedBytes = session.recoveryBytes();
		long frozenDecodedBytes = session.frozenHistoryDecodedBytes();
		if (decodedBytes < target || decodedBytes >= budget.appendLimit() || frozenDecodedBytes * 4 < decodedBytes * 3)
			throw new AssertionError("Expected a near-limit frozen history, decoded=" + decodedBytes + " frozen=" + frozenDecodedBytes);
		if (application.lifecycleMetrics().getInt("residentSessions", -1) != 8)
			throw new AssertionError("Expected eight residents before materializing the history");

		int revision = session.revision();
		HeapPeak checkpoint = observeHeap(() ->
			application.sendChat(largestId, "00000000-0000-0000-0000-000000000777", HUMAN,
				"materialization-chat", "Exercise the full checkpoint"));
		if (stored.get(largestId).generation != 2 || application.lifecycleMetrics().getInt("residentSessions", -1) != 8)
			throw new AssertionError("Full checkpoint did not commit with all eight residents");
		JsonObject metrics = application.lifecycleMetrics();
		long retained = metrics.getLong("retainedBudgetBytes", -1);
		long workspace = metrics.getLong("workingReserveBytes", -1);

		JsonObject concession = load(largestId).set("operation", "concede")
			.set("requestId", "materialization-concession").add("expectedRevision", revision);
		accepted(session.apply(HUMAN, concession));
		if (!session.isComplete()) throw new AssertionError("Native concession did not complete");
		HeapPeak completion = observeHeap(() -> accepted(application.handle(HUMAN, load(largestId))));
		if (application.lifecycleMetrics().getInt("residentSessions", -1) != 7)
			throw new AssertionError("Completion did not release exactly the terminal resident");

		long totalBudget = retained + workspace;
		System.out.println("retention-passed mode=materialization residents=8 revision=" + revision
			+ " decodedBytes=" + decodedBytes + " frozenDecodedBytes=" + frozenDecodedBytes
			+ " startupHeapBytes=" + startup + " retainedBudgetBytes=" + retained + " workingReserveBytes=" + workspace
			+ " checkpointBeforeBytes=" + checkpoint.beforeBytes() + " checkpointPeakBytes=" + checkpoint.peakBytes()
			+ " checkpointWithinBudget=" + (checkpoint.peakBytes() - startup <= totalBudget)
			+ " completionBeforeBytes=" + completion.beforeBytes() + " completionPeakBytes=" + completion.peakBytes()
			+ " completionWithinBudget=" + (completion.peakBytes() - startup <= totalBudget));
	}

	private static BogrukEngineFixture materializationFixture(int index) throws Exception {
		String id = "00000000-0000-0000-0000-%012d".formatted(index + 100);
		BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 554, id);
		JsonObject view = accepted(fixture.reply(HUMAN));
		for (int decision = 0; decision < 96; decision++) {
			JsonObject request = fixture.recordedDecision(view, "materialization-" + decision, decision);
			view = accepted(fixture.session.apply(view.getString("actor", null), request));
			clearInvocations(fixture.server, fixture.server.getCommunication(), fixture.server.getDebugLog());
		}
		return fixture;
	}

	/** Extend a native checkpoint with repeated board snapshots to isolate history expansion. */
	private static String expandedCheckpoint(SetupSession session, long target) throws Exception {
		long estimatedBytes = session.recoveryBytes();
		JsonObject payload = session.recoveryCheckpointPayload();
		JsonArray events = JsonArray.readFrom(payload.get("eventsJson").asString());
		JsonArray records = payload.get("transcript").asObject().get("records").asArray();
		int revision = session.revision();
		JsonObject board = events.get(revision).asObject().get("state").asObject();
		JsonObject recordTemplate = new JsonObject(records.get(revision).asObject()).set("kind", "SELECTION").set("native", new JsonArray());
		Utf8Size size = new Utf8Size();
		while (estimatedBytes < target) {
			JsonObject snapshot = new JsonObject(board).set("revision", ++revision);
			JsonObject event = new JsonObject().add("revision", revision).add("kind", "SELECTION").add("state", snapshot);
			JsonObject record = new JsonObject(recordTemplate).set("index", revision).set("revision", revision).set("state", snapshot);
			events.add(event);
			records.add(record);
			// Two array separators offset the two quotes around the standalone event string.
			estimatedBytes += size.bytes(JsonValue.valueOf(event.toString()).toString()) + size.bytes(record.toString());
		}
		Field revisionField = SetupSession.class.getDeclaredField("revision");
		revisionField.setAccessible(true);
		revisionField.setInt(session, revision);
		payload.set("revision", revision).set("eventsJson", events.toString())
			.set("homeView", accepted(session.reply("load", "ACCEPTED", false, HUMAN)))
			.set("awayView", accepted(session.reply("load", "ACCEPTED", false, COMPUTER)));
		return new RecoveryArtifactJson().encodeCanonicalCheckpoint(payload).envelope();
	}

	private static void register(Path checkpoints, Map<String, ProbeRecovery> stored,
		Map<String, MatchService.Result> documents, BogrukEngineFixture fixture, String artifact) throws IOException {
		String id = fixture.document.matchId;
		stored.put(id, new ProbeRecovery(checkpoints.resolve(id + ".json"), id, fixture.session.computerWorkUntil(),
			artifact == null ? fixture.session.recoveryArtifact() : artifact));
		documents.put(id, new MatchService.Result(fixture.document, false));
		fixture.session = null;
	}

	private record HeapPeak(long beforeBytes, long peakBytes) { }

	private static HeapPeak observeHeap(Callable<?> materialize) throws Exception {
		long before = used();
		MemoryMXBean memory = ManagementFactory.getMemoryMXBean();
		AtomicLong peak = new AtomicLong(before);
		AtomicBoolean measuring = new AtomicBoolean(true);
		Thread sampler = Thread.ofPlatform().daemon().start(() -> {
			while (measuring.get()) {
				peak.accumulateAndGet(memory.getHeapMemoryUsage().getUsed(), Math::max);
				LockSupport.parkNanos(1_000_000);
			}
		});
		try {
			materialize.call();
			peak.accumulateAndGet(memory.getHeapMemoryUsage().getUsed(), Math::max);
		} finally {
			measuring.set(false);
			sampler.join();
		}
		return new HeapPeak(before, peak.get());
	}

	private static List<WeakReference<Object>> retainedParts(SetupSession session) throws Exception {
		List<WeakReference<Object>> parts = new ArrayList<>();
		for (String name : new String[] { "state", "events", "transcript", "history" }) {
			Field field = SetupSession.class.getDeclaredField(name); field.setAccessible(true);
			parts.add(new WeakReference<>(field.get(session)));
		}
		return parts;
	}

	private static long used() throws Exception {
		System.gc(); Thread.sleep(40); System.gc();
		return ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
	}

	private record Resident(SetupApplication application, SetupSession session, MatchService matches,
		FantasyFootballServer server, AtomicLong now, String id) { }

	private static Resident lateResident(Path checkpoint) throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true, COMPUTER);
		SetupSession session = fixture.session;
		buildPlacementHistory(fixture);
		AtomicLong now = new AtomicLong(System.currentTimeMillis());
		session.startSaveResumeRetention(now.get());
		ProbeRecovery recovery = new ProbeRecovery(checkpoint, session);
		String id = fixture.document.matchId;
		MatchService matches = mock(MatchService.class);
		MatchService.Result match = new MatchService.Result(fixture.document, false);
		when(matches.loadForSetup(anyString(), anyString())).thenReturn(match);
		when(matches.load(anyString(), anyString())).thenReturn(match);
		Clock clock = new Clock() {
			@Override public ZoneId getZone() { return ZoneOffset.UTC; }
			@Override public Clock withZone(ZoneId zone) { return this; }
			@Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
		};
		SetupApplication application = new SetupApplication(fixture.server, matches, recovery, true, clock, true);
		JsonObject restored = accepted(application.handle(HUMAN, load(id)));
		SetupSession resident = (SetupSession) map(application, "sessions").get(id);
		if (!HUMAN.equals(restored.getString("actor", null)) || resident.revision() != session.revision())
			throw new AssertionError("Checkpoint did not restore the human turn at revision " + session.revision());
		if (resident.frozenHistoryRetainedBytes() != session.frozenHistoryRetainedBytes())
			throw new AssertionError("Frozen history size changed across restore: " + session.frozenHistoryRetainedBytes()
				+ " -> " + resident.frozenHistoryRetainedBytes());
		CanonicalJson canonical = new CanonicalJson();
		if (!canonical.encode(resident.transcriptPage(resident.revision(), 1), 512 * 1024)
			.equals(canonical.encode(session.transcriptPage(session.revision(), 1), 512 * 1024)))
			throw new AssertionError("Checkpoint did not preserve the last transcript record");
		long decodedBytes = new Utf8Size().bytes(recovery.find(id).json);
		long charged = application.lifecycleMetrics().getLong("retainedBudgetBytes", -1);
		long expected = new MatchMemoryBudget().residentSize(decodedBytes, session.frozenHistoryDecodedBytes(),
			session.frozenHistoryRetainedBytes()).retainedBytes();
		if (charged != expected || charged >= new MatchMemoryBudget().residentSize(decodedBytes, 0, 0).retainedBytes())
			throw new AssertionError("Resident budget did not account for frozen history: " + charged + " expected=" + expected);
		clearInvocations(fixture.server);
		return new Resident(application, resident, matches, fixture.server, now, id);
	}

	private static void buildPlacementHistory(SetupSessionMovementTest.Fixture fixture) throws Exception {
		SetupSession session = fixture.session;
		Field stateField = SetupSession.class.getDeclaredField("state");
		stateField.setAccessible(true);
		GameState state = (GameState) stateField.get(session);
		Random dice = new Random(543);
		state.getDiceRoller().setRecoveryRoll(sides -> dice.nextInt(sides) + 1);
		JsonObject view = accepted(session.reply("load", "ACCEPTED", false, HUMAN));
		int placed = 0;
		for (int step = 0; step < 150; step++) {
			String role = view.getString("actor", null);
			JsonObject next = fixture.request("action", "retention-step-" + step, view);
			if ("SETUP".equals(view.getString("phase", null))) {
				int count = Math.min(100, PLACEMENTS - placed);
				place(fixture, state.getGame(), view, placed, count);
				placed += count;
				next.set("operation", "confirm");
			} else if (!view.get("prompt").isNull()) {
				JsonObject prompt = view.get("prompt").asObject();
				next.set("operation", "choice").add("promptId", prompt.get("id"))
					.add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
			} else {
				JsonObject action = preferredAction(view);
				if ("REGULAR".equals(view.getString("turnMode", null)) && "endTurn".equals(action.getString("kind", null))) {
					if (placed == PLACEMENTS && HUMAN.equals(role)) return;
					if (placed < PLACEMENTS) positionScorer(state.getGame());
				}
				next.add("actionId", action.get("id"));
			}
			view = accepted(session.apply(role, next));
			clearInvocations(fixture.server);
		}
		throw new AssertionError("Did not park after " + placed + " placements");
	}

	private static void place(SetupSessionMovementTest.Fixture fixture, Game game, JsonObject view, int placed, int count) {
		if (count == 0) return;
		String role = view.getString("actor", null);
		boolean home = HUMAN.equals(role);
		Player<?> player = Arrays.stream((home ? game.getTeamHome() : game.getTeamAway()).getPlayers())
			.filter(candidate -> FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(candidate)))
			.findFirst().orElseThrow();
		FieldCoordinate origin = game.getFieldModel().getPlayerCoordinate(player);
		FieldCoordinate alternate = emptySquare(game, home);
		for (int index = 0; index < count; index++) {
			FieldCoordinate to = index % 2 == 0 ? alternate : origin;
			JsonObject result = accepted(fixture.session.apply(role, fixture.request("place", "retained-" + (placed + index), view)
				.add("playerId", player.getId()).add("to", new JsonObject().add("x", to.getX()).add("y", to.getY()))));
			if (result.getInt("stageSeq", -1) != index + 1 || result.getInt("revision", -1) != view.getInt("revision", -2))
				throw new AssertionError("A staged placement changed the durable revision or missed the overlay");
			clearInvocations(fixture.server);
		}
	}

	private static FieldCoordinate emptySquare(Game game, boolean home) {
		for (int x = home ? 1 : 14; x < (home ? 12 : 25); x++) {
			for (int y = 0; y < 15; y++) {
				FieldCoordinate square = new FieldCoordinate(x, y);
				if (game.getFieldModel().getPlayer(square) == null) return square;
			}
		}
		throw new AssertionError("No empty setup square");
	}

	private static JsonObject preferredAction(JsonObject view) {
		for (JsonValue value : view.get("actions").asArray()) {
			JsonObject action = value.asObject();
			String kind = action.getString("kind", null);
			if ("endTurn".equals(kind) || "confirm".equals(kind)) return action;
		}
		return view.get("actions").asArray().get(0).asObject();
	}

	private static void positionScorer(Game game) {
		boolean home = game.isHomePlaying();
		Player<?> scorer = game.getActingTeam().getPlayers()[0];
		UtilBox.putAllPlayersIntoBox(game);
		FieldCoordinate endzone = new FieldCoordinate(home ? 25 : 0, 7);
		game.getFieldModel().setPlayerCoordinate(scorer, endzone);
		game.getFieldModel().setPlayerState(scorer, new PlayerState(PlayerState.STANDING));
		game.getFieldModel().setBallCoordinate(endzone);
		game.getFieldModel().setBallInPlay(true);
		game.getFieldModel().setBallMoving(false);
	}

	private static WeakReference<SetupSession> release(Resident resident, String mode) throws Exception {
		WeakReference<SetupSession> reference = new WeakReference<>(resident.session);
		if ("completion".equals(mode)) {
			JsonObject before = resident.session.spectatorView();
			JsonObject concession = load(resident.id).set("operation", "concede")
				.set("requestId", "retention-concession").add("expectedRevision", before.getInt("revision", -1));
			accepted(resident.session.apply("home", concession));
			if (!resident.session.isComplete()) throw new AssertionError("Native concession did not complete");
			JsonObject response = resident.application.handle("home", load(resident.id));
			if (!"ACCEPTED".equals(response.getString("code", null))) throw new AssertionError("Completion release failed");
		} else {
			resident.now.addAndGet(31 * 60 * 1000L);
			resident.application.expireDecisions();
			if (resident.application.lifecycleMetrics().getLong("idleReleases", -1) != 1) throw new AssertionError("Idle eviction did not run");
			JsonObject waiting = accepted(resident.application.handleComputerWithOutcome(COMPUTER, load(resident.id)).response());
			JsonObject metrics = resident.application.lifecycleMetrics();
			if (!HUMAN.equals(waiting.getString("actor", null)) || waiting.getInt("revision", -1) != resident.session.revision()
				|| metrics.getInt("restoredSessions", -1) != 1 || metrics.getLong("retainedBudgetBytes", -1) != 0)
				throw new AssertionError("A cold computer load restored the parked engine or retained its budget");
		}
		clearInvocations(resident.matches, resident.server);
		return reference;
	}

	private static JsonObject load(String id) { return new JsonObject().add("version", 1).add("type", "setup")
		.add("operation", "load").add("requestId", "release").add("matchId", id); }
	private static JsonObject accepted(JsonObject response) {
		if (!"ACCEPTED".equals(response.getString("code", null)))
			throw new AssertionError("Native setup rejected: " + response.getString("code", null));
		return response.get("state").asObject();
	}
	@SuppressWarnings("unchecked") private static Map<String, Object> map(SetupApplication application, String name) throws Exception {
		Field field = SetupApplication.class.getDeclaredField(name); field.setAccessible(true);
		return (Map<String, Object>) field.get(application);
	}

	/** Keep the checkpoint on disk so the heap measurement excludes the persistence fixture's copy. */
	private static final class ProbeRecovery implements RecoveryRepository {
		private final Path path;
		private final String id;
		private long generation = 1;
		private long computerWorkUntil;

		ProbeRecovery(Path path, SetupSession session) throws IOException {
			this(path, session.spectatorView().getString("matchId", null), session.computerWorkUntil(), session.recoveryArtifact());
		}

		ProbeRecovery(Path path, String id, long computerWorkUntil, String artifact) throws IOException {
			this.path = path;
			this.id = id;
			this.computerWorkUntil = computerWorkUntil;
			Files.writeString(path, artifact);
		}

		@Override public Record find(String matchId) throws SQLException {
			if (!id.equals(matchId)) return null;
			try {
				return new Record(id, generation, Files.readString(path), computerWorkUntil);
			} catch (IOException failure) {
				throw new SQLException(failure);
			}
		}

		@Override public boolean save(Record record, long expectedGeneration) throws SQLException {
			if (!id.equals(record.matchId) || generation != expectedGeneration) return false;
			try {
				Files.writeString(path, record.json);
			} catch (IOException failure) {
				throw new SQLException(failure);
			}
			generation = record.generation;
			computerWorkUntil = record.computerWorkUntil;
			return true;
		}
	}
}
