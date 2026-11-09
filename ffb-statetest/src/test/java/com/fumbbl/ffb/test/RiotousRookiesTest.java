package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.PlayerGender;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.PlayerType;
import com.fumbbl.ffb.factory.InducementTypeFactory;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.inducement.Inducement;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.PlayerStatus;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ServerCommandAddPlayer;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.ReportRiotousRookies;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.phase.inducement.StepRiotousRookies;

import com.eclipsesource.json.JsonObject;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntUnaryOperator;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RiotousRookiesTest {

	@Test void repeatedInducementsPreserveBothTeamsNativeRollsPlayersAndReports() throws Exception {
		Fixture fixture = new Fixture();
		GameState state = fixture.state();
		inducements(state, 2);
		// Each pair of d3 is followed by exactly one d4 per rookie, home before away.
		FixedRolls rolls = new FixedRolls();
		rolls.batch(1, 2, 1, 2, 3, 4);
		rolls.batch(2, 3, 4, 3, 2, 1, 4, 2);
		rolls.batch(3, 3, 2, 1, 4, 3, 2, 1, 4);
		rolls.batch(1, 1, 3, 4, 1);
		state.getDiceRoller().setRecoveryRoll(rolls);
		int logStart = state.getGameLog().size();
		StepRiotousRookies step = new StepRiotousRookies(state);
		step.start();
		assertEquals(rolls.values.size(), rolls.cursor);
		assertEquals(StepAction.NEXT_STEP, step.getResult().getNextAction());
		assertPlayers(state, state.getGame().getTeamHome(), 1, 2, 3, 4, 4, 3, 2, 1, 4, 2);
		assertPlayers(state, state.getGame().getTeamAway(), 2, 1, 4, 3, 2, 1, 4, 3, 4, 1);
		IReport[] reports = step.getResult().getReportList().getReports();
		assertEquals(4, reports.length);
		int[][] expectedRolls = {{1, 2}, {2, 3}, {3, 3}, {1, 1}};
		int[] expectedCounts = {4, 6, 7, 3};
		for (int index = 0; index < reports.length; index++) {
			ReportRiotousRookies report = (ReportRiotousRookies) reports[index];
			assertArrayEquals(expectedRolls[index], report.getRoll());
			assertEquals(expectedCounts[index], report.getAmount());
			assertEquals(index < 2 ? state.getGame().getTeamHome().getId() : state.getGame().getTeamAway().getId(), report.getTeamId());
		}
		List<ServerCommandAddPlayer> added = Arrays.stream(state.getGameLog().getServerCommands()).skip(logStart)
			.filter(ServerCommandAddPlayer.class::isInstance).map(ServerCommandAddPlayer.class::cast).toList();
		assertEquals(20, added.size());
		for (int index = 0; index < added.size(); index++) {
			Team team = index < 10 ? state.getGame().getTeamHome() : state.getGame().getTeamAway();
			assertEquals(team.getId(), added.get(index).getTeamId());
			assertEquals(team.getId() + "Riotous" + (index % 10), added.get(index).getPlayer().getId());
			if (index > 0) assertTrue(added.get(index).getCommandNr() > added.get(index - 1).getCommandNr());
		}
	}

	@Test void removedNameGeneratorConfigurationDoesNotCauseRequests() throws Exception {
		try (StalledEndpoint endpoint = new StalledEndpoint()) {
			Fixture fixture = new Fixture();
			endpoint.configure(fixture.server);
			GameState state = fixture.state();
			inducements(state, 1);
			FixedRolls rolls = new FixedRolls();
			rolls.batch(1, 1, 1, 2, 3);
			rolls.batch(1, 1, 4, 3, 2);
			state.getDiceRoller().setRecoveryRoll(rolls);
			assertTimeout(Duration.ofSeconds(2), () -> new StepRiotousRookies(state).start());
			assertEquals(0, endpoint.requests.get());
			assertEquals(rolls.values.size(), rolls.cursor);
			assertPlayers(state, state.getGame().getTeamHome(), 1, 2, 3);
			assertPlayers(state, state.getGame().getTeamAway(), 4, 3, 2);
		}
	}

	@Test void acceptedNativeCreationRestoresAndRetriesWithoutRenamingDuplicatingOrRolling() throws Exception {
		try (StalledEndpoint endpoint = new StalledEndpoint()) {
			Fixture fixture = new Fixture();
			endpoint.configure(fixture.server);
			GameState state = fixture.state();
			inducements(state, 2);
			// Insert the real native Step after the pending coin choice, inside that accepted action.
			state.getStepStack().push(new StepRiotousRookies(state));
			JsonObject before = view(fixture.session);
			JsonObject request = new JsonObject().add("operation", "choice").add("requestId", "rookies")
				.add("expectedRevision", before.get("revision")).add("promptId", before.get("prompt").asObject().get("id"))
				.add("optionId", "heads");
			String actor = before.getString("actor", null);
			assertTimeout(Duration.ofSeconds(2), () ->
				assertEquals("ACCEPTED", fixture.session.apply(actor, request).getString("code", null)));
			assertEquals(StepId.RECEIVE_CHOICE, state.getCurrentStep().getId());
			assertTrue(Arrays.stream(state.getGame().getTeamHome().getPlayers())
				.filter(player -> player.getPlayerType() == PlayerType.RIOTOUS_ROOKIE).count() >= 6);
			String checkpoint = fixture.session.recoveryArtifact();
			assertTrue(fixture.session.apply(actor, request).getBoolean("duplicate", false));
			assertEquals(checkpoint, fixture.session.recoveryArtifact());
			SetupSession restored = new SetupSession(fixture.server.getServer(), fixture.document, checkpoint);
			assertEquals(checkpoint, restored.recoveryArtifact());
			assertEquals(view(fixture.session), view(restored));
			assertTrue(restored.apply(actor, request).getBoolean("duplicate", false));
			assertEquals(checkpoint, restored.recoveryArtifact(), "Includes native players, dice cursor, reports and transcript");
			JsonObject transcript = restored.transcriptPage(0, 8);
			assertEquals(2, transcript.getInt("total", -1));
			assertTrue(transcript.toString().contains("\"reportId\":\"riotousRookies\""));
			assertTrue(view(restored).toString().contains("RiotousRookie #0"));
			exportSmokeFixtureIfRequested(new JsonObject().add("state", view(restored)).add("transcript", transcript));
			assertEquals(0, endpoint.requests.get());
		}
	}

	/** Explicit opt-in export; ordinary unit/shard runs do not write smoke artifacts. */
	private void exportSmokeFixtureIfRequested(JsonObject fixture) throws Exception {
		String destination = System.getenv("FFB_ROOKIES_SMOKE_FILE");
		if (destination == null) return;
		Path output = Path.of(destination);
		if (!output.isAbsolute()) throw new IllegalArgumentException("FFB_ROOKIES_SMOKE_FILE must be an absolute file path");
		Files.writeString(output, fixture.toString());
	}

	@Test void restorePreservesAnExistingRookiesStoredName() throws Exception {
		Fixture fixture = new Fixture();
		GameState state = fixture.state();
		inducements(state, 1);
		new StepRiotousRookies(state).start();
		RosterPlayer player = (RosterPlayer) state.getGame().getTeamHome().getPlayerById(state.getGame().getTeamHome().getId() + "Riotous0");
		player.setName("Previously accepted rookie name");
		String checkpoint = fixture.session.recoveryArtifact();
		SetupSession restored = new SetupSession(fixture.server.getServer(), fixture.document, checkpoint);
		assertEquals(checkpoint, restored.recoveryArtifact());
		assertEquals("Previously accepted rookie name", engine(restored).getGame().getPlayerById(player.getId()).getName());
	}

	private void inducements(GameState state, int applications) {
		InducementTypeFactory factory = state.getGame().getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
		state.getGame().getTurnDataHome().getInducementSet().addInducement(new Inducement(factory.forName("riotousRookies"), applications));
		state.getGame().getTurnDataAway().getInducementSet().addInducement(new Inducement(factory.forName("riotousRookies"), applications));
	}

	private void assertPlayers(GameState state, Team team, int... genders) {
		Game game = state.getGame();
		SkillFactory skills = game.getFactory(FactoryType.Factory.SKILL);
		assertEquals(11 + genders.length, team.getPlayers().length);
		for (int index = 0; index < genders.length; index++) {
			RosterPlayer player = (RosterPlayer) team.getPlayerById(team.getId() + "Riotous" + index);
			assertNotNull(player);
			assertEquals("RiotousRookie #" + index, player.getName());
			assertEquals(12 + index, player.getNr());
			assertEquals(PlayerGender.fromOrdinal(genders[index]), player.getPlayerGender());
			assertEquals(PlayerType.RIOTOUS_ROOKIE, player.getPlayerType());
			assertEquals(PlayerStatus.JOURNEYMAN, player.getPlayerStatus());
			assertEquals("lineman", player.getPositionId());
			assertArrayEquals(new int[] {6, 3, 3, 4, 9}, new int[] {player.getMovement(), player.getStrength(), player.getAgility(), player.getPassing(), player.getArmour()});
			assertArrayEquals(new Object[] {skills.forName("Loner")}, player.getSkills());
			assertEquals(PlayerState.RESERVE, game.getFieldModel().getPlayerState(player).getBase());
			assertNotNull(game.getFieldModel().getPlayerCoordinate(player));
		}
	}

	private static JsonObject view(SetupSession session) {
		return session.reply("inspect", "ACCEPTED", false, "home").get("state").asObject();
	}

	private static GameState engine(SetupSession session) throws Exception {
		Field field = SetupSession.class.getDeclaredField("state");
		field.setAccessible(true);
		return (GameState) field.get(session);
	}

	private static class Fixture {
		final TestServer server = new TestServer();
		final MatchDocument document;
		final SetupSession session;

		Fixture() throws Exception {
			SetupSession seed = new SetupSessionTest().session(11);
			Field field = SetupSession.class.getDeclaredField("document");
			field.setAccessible(true);
			document = (MatchDocument) field.get(seed);
			session = new SetupSession(server.getServer(), document, -514, true, false, false, true, true, true);
		}

		GameState state() throws Exception { return engine(session); }
	}

	private static class FixedRolls implements IntUnaryOperator {
		final List<Integer> sides = new ArrayList<>();
		final List<Integer> values = new ArrayList<>();
		int cursor;

		void batch(int first, int second, int... genders) {
			assertEquals(first + second + 1, genders.length);
			sides.add(3); values.add(first);
			sides.add(3); values.add(second);
			for (int gender : genders) { sides.add(4); values.add(gender); }
		}

		@Override public int applyAsInt(int die) {
			assertTrue(cursor < sides.size(), "Unexpected extra native roll");
			assertEquals(sides.get(cursor).intValue(), die, "Native die order at " + cursor);
			return values.get(cursor++);
		}
	}

	private static class StalledEndpoint implements AutoCloseable {
		final AtomicInteger requests = new AtomicInteger();
		final CountDownLatch release = new CountDownLatch(1);
		final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
		final HttpServer http;

		StalledEndpoint() throws Exception {
			http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			http.setExecutor(executor);
			http.createContext("/", exchange -> {
				requests.incrementAndGet();
				try { release.await(3, TimeUnit.SECONDS); }
				catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
				finally { exchange.close(); }
			});
			http.start();
		}

		void configure(TestServer server) {
			// Proves the removed lookup path stays inert, not a sandbox for arbitrary future networking.
			// The source/caller gate separately checks that production has no naming service path.
			server.getServer().getProperties().setProperty("fumbbl.base", "http://127.0.0.1");
			server.getServer().getProperties().setProperty("fumbbl.port", Integer.toString(http.getAddress().getPort()));
			server.getServer().getProperties().setProperty("fumbbl.namegenerator.base", "/names");
		}

		@Override public void close() {
			release.countDown();
			http.stop(0);
			executor.close();
		}
	}
}
