package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;

import com.eclipsesource.json.JsonObject;

import java.lang.management.ManagementFactory;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

/** Isolated JVM: real legal retained setup history, native concession/result materialization and application release. */
public final class SessionRetentionMemoryProbe {
	public static void main(String[] arguments) throws Exception {
		if ("sequence".equals(arguments[0])) { sequence(); return; }
		long baseline = used();
		Resident resident = lateResident();
		long retained = used() - baseline;
		if (retained > 64L * 1024 * 1024) throw new AssertionError("Late-session retained heap exceeds 64 MiB: " + retained);
		List<WeakReference<Object>> parts = retainedParts(resident.session);
		SetupApplication application = resident.application;
		WeakReference<SetupSession> released = release(resident, arguments[0]);
		resident = null;
		org.mockito.Mockito.framework().clearInlineMocks();
		for (int attempt = 0; attempt < 10 && (released.get() != null || parts.stream().anyMatch(part -> part.get() != null)); attempt++) { used(); Thread.sleep(20); }
		if (released.get() != null || parts.stream().anyMatch(part -> part.get() != null) || application.lifecycleMetrics().getInt("residentSessions", -1) != 0)
			throw new AssertionError("Application retained its released late session");
		System.out.println("retention-passed mode=" + arguments[0] + " revisions=450 retainedBytes=" + retained);
	}

	private static void sequence() throws Exception {
		long baseline = used();
		List<Resident> residents = new ArrayList<>();
		for (int index = 0; index < 8; index++) residents.add(lateResident());
		long retained = used() - baseline;
		if (retained > 256L * 1024 * 1024) throw new AssertionError("Eight-session retained heap exceeds 256 MiB: " + retained);
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
		org.mockito.Mockito.framework().clearInlineMocks();
		for (int attempt = 0; attempt < 10; attempt++) {
			used(); Thread.sleep(20);
			if (references.stream().allMatch(reference -> reference.get() == null)
				&& parts.stream().allMatch(part -> part.get() == null)) break;
		}
		if (references.stream().anyMatch(reference -> reference.get() != null)
			|| parts.stream().anyMatch(part -> part.get() != null)
			|| applications.stream().anyMatch(application -> application.lifecycleMetrics().getInt("residentSessions", -1) != 0))
			throw new AssertionError("Sequential applications retained released late sessions");
		System.out.println("retention-passed mode=sequence sessions=8 revisionsEach=450 retainedBytes=" + retained
			+ " afterReleaseBytes=" + (used() - baseline));
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
		com.fumbbl.ffb.server.FantasyFootballServer server, AtomicLong now, String id) { }

	private static Resident lateResident() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		SetupSession session = fixture.session;
		JsonObject view = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		for (int index = 0; !"SETUP".equals(view.getString("phase", null)) && index < 20; index++) {
			JsonObject prompt = view.get("prompt").asObject();
			JsonObject request = fixture.request("choice", "opening-" + index, view).add("promptId", prompt.get("id"))
				.add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
			view = accepted(session.apply(view.getString("actor", null), request));
		}
		if (!"SETUP".equals(view.getString("phase", null))) throw new AssertionError("Setup not reached");
		Field stateField = SetupSession.class.getDeclaredField("state"); stateField.setAccessible(true);
		GameState state = (GameState) stateField.get(session); Game game = state.getGame();
		String role = view.getString("actor", null);
		Player<?> player = Arrays.stream(("home".equals(role) ? game.getTeamHome() : game.getTeamAway()).getPlayers())
			.filter(candidate -> FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(candidate))).findFirst().orElseThrow();
		FieldCoordinate origin = game.getFieldModel().getPlayerCoordinate(player), alternate = null;
		for (int x = "home".equals(role) ? 0 : 13; x < ("home".equals(role) ? 13 : 26) && alternate == null; x++)
			for (int y = 0; y < 15; y++) if (game.getFieldModel().getPlayer(new FieldCoordinate(x, y)) == null) { alternate = new FieldCoordinate(x, y); break; }
		for (int index = 0; index < 450; index++) {
			FieldCoordinate to = index % 2 == 0 ? alternate : origin;
			view = accepted(session.apply(role, fixture.request("place", "retained-" + index, view).add("playerId", player.getId())
				.add("to", new JsonObject().add("x", to.getX()).add("y", to.getY()))));
			state.getGameLog().recoveryJsonFrom(state.getGameLog().size());
			clearInvocations(fixture.server);
		}
		SetupSession resident = session;
		MatchService matches = mock(MatchService.class);
		when(matches.loadForSetup(anyString(), anyString())).thenReturn(new MatchService.Result(fixture.document, false));
		AtomicLong now = new AtomicLong(System.currentTimeMillis());
		Clock clock = new Clock() {
			@Override public ZoneId getZone() { return ZoneOffset.UTC; }
			@Override public Clock withZone(ZoneId zone) { return this; }
			@Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
		};
		SetupApplication application = new SetupApplication(fixture.server, matches, mock(RecoveryRepository.class), false, clock);
		map(application, "sessions").put(fixture.document.matchId, resident);
		map(application, "lastAccess").put(fixture.document.matchId, now.get());
		clearInvocations(fixture.server);
		return new Resident(application, resident, matches, fixture.server, now, fixture.document.matchId);
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
			resident.application.handle("home", load("00000000-0000-0000-0000-000000000099"));
			if (resident.application.lifecycleMetrics().getLong("idleReleases", -1) != 1) throw new AssertionError("Idle eviction did not run");
		}
		clearInvocations(resident.matches, resident.server);
		return reference;
	}

	private static JsonObject load(String id) { return new JsonObject().add("version", 1).add("type", "setup")
		.add("operation", "load").add("requestId", "release").add("matchId", id); }
	private static JsonObject accepted(JsonObject response) {
		if (!"ACCEPTED".equals(response.getString("code", null))) throw new AssertionError("Native setup rejected");
		return response.get("state").asObject();
	}
	@SuppressWarnings("unchecked") private static Map<String, Object> map(SetupApplication application, String name) throws Exception {
		Field field = SetupApplication.class.getDeclaredField(name); field.setAccessible(true);
		return (Map<String, Object>) field.get(application);
	}
}
