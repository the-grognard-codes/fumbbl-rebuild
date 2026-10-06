package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.LeaderState;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.factory.InducementTypeFactory;
import com.fumbbl.ffb.inducement.Inducement;
import com.fumbbl.ffb.inducement.Usage;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.mechanic.bb2025.StateMechanic;
import com.fumbbl.ffb.server.mechanic.bb2025.RollMechanic;
import com.fumbbl.ffb.server.step.bb2025.StepEndTurn;
import com.fumbbl.ffb.server.step.bb2025.move.StepPickUp;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RerollAccountingTest {
	@Test void nativePriorityCountsReportsAndRetriesAgreeForBothCoaches() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] {true, false}) for (String mode : new String[] {
			"all", "pump", "show", "mascot-success", "mascot-fallback", "mascot-failure-only", "leader", "leader-off", "team", "decline", "pro"}) {
			GameState state = state(home);
			Game game = state.getGame();
			TurnData turn = home ? game.getTurnDataHome() : game.getTurnDataAway();
			boolean brilliant = mode.equals("all") || mode.equals("decline") || mode.equals("pro");
			boolean pump = mode.equals("pump"), show = mode.equals("show");
			boolean mascot = brilliant || pump || show || mode.startsWith("mascot");
			boolean leader = !mode.equals("team") && !mode.equals("mascot-failure-only");
			game.setHomePlaying(home); game.getFieldModel().setBallMoving(true);
			if (leader) state.addLeader(game.getPlayerById("leader"));
			StepEngine.start(state);
			turn.setLeaderState(leader ? LeaderState.AVAILABLE : LeaderState.NONE);
			turn.setReRolls(mode.equals("mascot-failure-only") ? 0 : 1 + (leader ? 1 : 0) + (brilliant || pump || show ? 1 : 0));
			turn.setReRollsBrilliantCoachingOneDrive(brilliant ? 1 : 0);
			turn.setReRollsPumpUpTheCrowdOneDrive(pump ? 1 : 0);
			turn.setReRollShowStarOneDrive(show ? 1 : 0);
			InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
			if (mascot) turn.getInducementSet().addInducement(new Inducement(factory.forName("teamMascot"), 1));
			if (mode.equals("leader-off")) {
				game.getFieldModel().setPlayerState(game.getPlayerById("leader"), new PlayerState(PlayerState.RESERVE));
				UtilBox.putPlayerIntoBox(game, game.getPlayerById("leader"));
				new StateMechanic().updateLeaderReRollsForTeam(turn, home ? game.getTeamHome() : game.getTeamAway(), game.getFieldModel(), new StepPickUp(state));
				assertEquals(LeaderState.NONE, turn.getLeaderState());
			}
			TestRolls.on(state).general(1, mode.equals("mascot-fallback") || mode.equals("mascot-failure-only") ? 1 : 6, 6, 6, 6, 6);
			SetupSession session = new SetupSessionTest().session(11, true);
			Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state);
			String role = home ? "home" : "away", other = home ? "away" : "home";
			submit(session, role, "declarePass"); submit(session, role, "move-9-7");
			JsonObject offered = view(session, role);
			if (brilliant || pump || show) {
				assertFalse(new RollMechanic().isMascotAvailable(state, game.getPlayerById("actor")), mode);
				assertFalse(offered.get("actions").toString().contains("reroll:mascot"), "A drive source must not be offered as a Mascot choice: " + mode);
			}
			JsonArray offeredReports = reports(session, offered.getInt("revision", -1));
			int before = turn.getReRolls();
			String selected = mode.equals("decline") ? "reroll:none" : mode.equals("pro") ? "reroll:pro" : mode.equals("mascot-failure-only") ? "reroll:mascot" : "reroll:team";
			JsonObject request = new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString()).add("expectedRevision", offered.get("revision")).add("actionId", find(offered, selected).get("id"));
			assertEquals("WRONG_ACTOR", assertThrows(MatchService.Failure.class, () -> session.apply(other, request)).code);
			assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
			assertTrue(session.apply(role, request).getBoolean("duplicate", false));
			assertEquals("STALE_REVISION", assertThrows(MatchService.Failure.class, () -> session.apply(role, JsonObject.readFrom(request.toString()).set("requestId", UUID.randomUUID().toString()))).code);
			JsonObject accepted = view(session, role), passive = view(session, other), spectator = normalize(session.spectatorView());
			JsonArray reports = reports(session, accepted.getInt("revision", -1));
			boolean spent = !mode.equals("mascot-success") && !mode.equals("mascot-failure-only") && !mode.equals("decline") && !mode.equals("pro");
			assertEquals(before - (spent ? 1 : 0), turn.getReRolls(), mode);
			assertEquals(brilliant && !mode.equals("all") ? 1 : 0, turn.getReRollsBrilliantCoachingOneDrive(), mode);
			assertEquals(0, turn.getReRollsPumpUpTheCrowdOneDrive(), mode);
			assertEquals(0, turn.getReRollShowStarOneDrive(), mode);
			assertEquals(mode.equals("leader") || mode.equals("mascot-fallback") ? LeaderState.USED : mode.equals("leader-off") || !leader ? LeaderState.NONE : LeaderState.AVAILABLE, turn.getLeaderState(), mode);
			assertEquals(mascot && !mode.startsWith("mascot"), turn.getInducementSet().hasUsesLeft(turn.getInducementSet().forUsage(Usage.CONDITIONAL_REROLL)), mode);
			String source = mode.equals("all") ? ReRollSources.BRILLIANT_COACHING.getName() : pump ? ReRollSources.PUMP_UP_THE_CROWD.getName() : show ? ReRollSources.SHOW_STAR.getName() : mode.equals("leader") || mode.equals("mascot-fallback") ? ReRollSources.LEADER.getName() : mode.equals("team") || mode.equals("leader-off") ? ReRollSources.TEAM_RE_ROLL.getName() : mode.equals("pro") ? ReRollSources.PRO.getName() : null;
			if (source != null) assertTrue(reports.toString().contains("\"reRollSource\":\"" + source + "\""), mode);
			if (mode.startsWith("mascot")) assertTrue(reports.toString().contains("mascotUsed"), mode);
			for (JsonObject projection : new JsonObject[] {accepted, passive, spectator}) assertEquals(turn.getReRolls(), projection.getInt(home ? "homeRerolls" : "awayRerolls", -1));
			journeys.add(new JsonObject().add("role", role).add("mode", mode).add("selectedId", request.get("actionId")).add("offered", offered)
				.add("accepted", accepted).add("otherCoach", passive).add("spectator", spectator).add("offeredReports", offeredReports).add("acceptedReports", reports).add("reports", reports).add("before", before).add("after", turn.getReRolls()));
		}
		String json = journeys.toString(); Files.write(Paths.get("target", "adr0003-reroll-accounting.json"), json.getBytes(StandardCharsets.UTF_8));
		assertTrue(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures", "adr0003-reroll-accounting.json")), StandardCharsets.UTF_8).equals(json), "Native accounting fixture differs; inspect target/adr0003-reroll-accounting.json");
	}
	@Test void namedTeamSourcesCannotBypassBrilliantCoaching() throws Exception {
		for (boolean home : new boolean[] {true, false}) for (ReRollSource source : new ReRollSource[] {
			ReRollSources.TEAM_RE_ROLL, ReRollSources.BRILLIANT_COACHING, ReRollSources.PUMP_UP_THE_CROWD, ReRollSources.SHOW_STAR, ReRollSources.LEADER, ReRollSources.MASCOT, ReRollSources.MASCOT_TRR}) {
			GameState state = state(home); Game game = state.getGame(); game.setHomePlaying(home);
			TurnData turn = game.getTurnData(); turn.setReRolls(3); turn.setReRollsBrilliantCoachingOneDrive(1); turn.setLeaderState(LeaderState.AVAILABLE);
			InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
			turn.getInducementSet().addInducement(new Inducement(factory.forName("teamMascot"), 1));
			assertTrue(new RollMechanic().useReRoll(new StepPickUp(state), source, game.getPlayerById("actor")), source.getName());
			assertEquals(2, turn.getReRolls()); assertEquals(0, turn.getReRollsBrilliantCoachingOneDrive()); assertEquals(LeaderState.AVAILABLE, turn.getLeaderState());
			assertTrue(turn.getInducementSet().hasUsesLeft(factory.forName("teamMascot")));
		}
	}
	@Test void nativeTurnDriveHalfAndOvertimeBoundariesKeepTheirResourceLimits() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			GameState state = state(home); Game game = state.getGame(); game.setHomePlaying(home); game.setHalf(1);
			TurnData turn = game.getTurnData(); state.addLeader(game.getPlayerById("leader"));
			(home ? game.getTeamHome() : game.getTeamAway()).setReRolls(2);
			turn.setReRolls(6); turn.setReRollsBrilliantCoachingOneDrive(1); turn.setReRollsPumpUpTheCrowdOneDrive(1); turn.setReRollShowStarOneDrive(1); turn.setLeaderState(LeaderState.AVAILABLE);
			InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
			Inducement mascot = new Inducement(factory.forName("teamMascot"), 1); mascot.setUses(1); turn.getInducementSet().addInducement(mascot);
			new StepEndTurn(state).start();
			assertEquals(6, turn.getReRolls(), "An ordinary turn boundary keeps unspent resources");
			assertEquals(1, turn.getReRollsBrilliantCoachingOneDrive());
			assertEquals(1, turn.getReRollsPumpUpTheCrowdOneDrive());
			assertEquals(1, turn.getReRollShowStarOneDrive());
			game.setHomePlaying(home);
			FieldCoordinate endzone = new FieldCoordinate(home ? 25 : 0, 7);
			game.getFieldModel().setPlayerCoordinate(game.getPlayerById("actor"), endzone);
			game.getFieldModel().setBallCoordinate(endzone); game.getFieldModel().setBallMoving(false); game.getFieldModel().setBallInPlay(true);
			new StepEndTurn(state).start();
			assertEquals(0, turn.getReRollsBrilliantCoachingOneDrive(), "Native touchdown expires drive-only Brilliant Coaching");
			assertEquals(0, turn.getReRollsPumpUpTheCrowdOneDrive());
			assertEquals(0, turn.getReRollShowStarOneDrive());
			assertEquals(3, turn.getReRolls());
			new StateMechanic().startHalf(new StepPickUp(state), 2);
			assertEquals(2, turn.getReRolls()); assertEquals(LeaderState.NONE, turn.getLeaderState());
			assertTrue(turn.getInducementSet().hasUsesLeft(factory.forName("teamMascot")));
			turn.setReRolls(1); turn.setLeaderState(LeaderState.USED); mascot.setUses(1); turn.getInducementSet().addInducement(mascot);
			new StateMechanic().startHalf(new StepPickUp(state), 3);
			assertEquals(1, turn.getReRolls()); assertEquals(LeaderState.USED, turn.getLeaderState());
			assertFalse(turn.getInducementSet().hasUsesLeft(factory.forName("teamMascot")), "Overtime does not reset a half-limited Mascot");
		}
	}
	@Test void lonerCaptainAndIneligibleModesRetainNativeConditions() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			GameState state = state(home, "Loner"); Game game = state.getGame(); game.setHomePlaying(home);
			TurnData turn = game.getTurnData(); turn.setReRolls(1);
			TestRolls.on(state).general(1);
			assertFalse(new RollMechanic().useReRoll(new StepPickUp(state), ReRollSources.TEAM_RE_ROLL, game.getPlayerById("actor")));
			assertEquals(0, turn.getReRolls(), "Failed Loner check still spends the resource");
			assertFalse(new RollMechanic().useReRoll(new StepPickUp(state), ReRollSources.TEAM_RE_ROLL, game.getPlayerById("actor")));
			assertEquals(0, turn.getReRolls(), "Exhaustion cannot create a negative pool");
			state = state(home, "Team Captain"); game = state.getGame(); game.setHomePlaying(home); turn = game.getTurnData(); turn.setReRolls(1);
			TestRolls.on(state).general(6);
			assertTrue(new RollMechanic().useReRoll(new StepPickUp(state), ReRollSources.TEAM_RE_ROLL, game.getPlayerById("actor")));
			assertEquals(1, turn.getReRolls(), "Native Captain preserves a guaranteed source");
			InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
			turn.getInducementSet().addInducement(new Inducement(factory.forName("teamMascot"), 1));
			TestRolls.on(state).general(6, 6);
			assertTrue(new RollMechanic().useReRoll(new StepPickUp(state), ReRollSources.TEAM_RE_ROLL, game.getPlayerById("actor")));
			assertEquals(1, turn.getReRolls()); assertTrue(turn.getInducementSet().hasUsesLeft(factory.forName("teamMascot")), "Native Captain preserves successful Mascot use");
			game.setTurnMode(TurnMode.KICKOFF);
			assertFalse(new RollMechanic().useReRoll(new StepPickUp(state), ReRollSources.TEAM_RE_ROLL, game.getPlayerById("actor")));
			assertEquals(1, turn.getReRolls()); assertTrue(turn.getInducementSet().hasUsesLeft(factory.forName("teamMascot")));
		}
	}
	private GameState state(boolean home) throws IOException {
		return state(home, "");
	}
	private GameState state(boolean home, String extra) throws IOException {
		GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(9, 7)
			.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 4, 3, 3, 9).skill("Pro").skill(extra)).player("leader", player -> player.at(18, 7).stats(6, 3, 3, 3, 9).skill("Leader")))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(20, 7).stats(6, 3, 3, 4, 9))).build();
		return state;
	}
	private JsonArray reports(SetupSession session, int revision) {
		JsonArray reports = new JsonArray();
		for (JsonValue sync : session.transcriptPage(revision, 1).get("records").asArray().get(0).asObject().get("native").asArray())
			for (JsonValue report : sync.asObject().get("reportList").asObject().get("reports").asArray())
				if (report.asObject().getString("reportId", "").equals("reRoll") || report.asObject().getString("reportId", "").equals("mascotUsed") || report.asObject().getString("reportId", "").equals("pickUpRoll")) reports.add(report);
		return reports;
	}
	private JsonObject normalize(JsonObject view) { return view.set("matchId", "00000000-0000-0000-0000-000000000118"); }
	private JsonObject view(SetupSession session, String role) { return normalize(session.reply("load", "ACCEPTED", false, role).get("state").asObject()); }
	private JsonObject find(JsonObject view, String suffix) { for (JsonValue item : view.get("actions").asArray()) if (item.asObject().getString("kind", "").equals(suffix) || item.asObject().getString("id", "").endsWith(":" + suffix)) return item.asObject(); throw new AssertionError("Missing " + suffix); }
	private void submit(SetupSession session, String role, String action) { JsonObject view = view(session, role); assertEquals("ACCEPTED", session.apply(role, new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString()).add("expectedRevision", view.get("revision")).add("actionId", find(view, action).get("id"))).getString("code", null)); }
}
