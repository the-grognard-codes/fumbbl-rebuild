package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.mixed.ReportPassRoll;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.bb2025.pass.StepInitPassing;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HailMaryTargetValidationTest {

	@Test void initialNativeBlizzardTargetsAreRejectedBeforeMutationAndCanBeRetargeted() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			for (boolean bomb : new boolean[] {true, false}) {
				RecordingState state = fixture(home, true, bomb);
				AtomicInteger rolls = countRolls(state);
				respond(state, home, Commands.selectPlayer("actor", bomb ? PlayerAction.HAIL_MARY_BOMB : PlayerAction.HAIL_MARY_PASS));
				respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(24, 7), home)));
				assertTrue(state.getCurrentStep() instanceof StepInitPassing);
				assertRejected(state, rolls);
				// The next command reaches INIT_PASSING directly and must enforce the same cap.
				respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(24, 7), home)));
				assertRejected(state, rolls);
				respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(14, 7), home)));
				assertTrue(rolls.get() > 0);
				assertEquals(1, state.passes().size());
				ReportPassRoll report = state.passes().get(0);
				assertTrue(report.isHailMaryPass());
				assertEquals(bomb, report.isBomb());
				assertEquals(6, report.getRoll(), "Rejected commands must not consume the PA die");
				assertEquals(6, report.getMinimumRoll(), "Blizzard HMP still uses Long Bomb difficulty");
			}
		}
	}

	@Test void initialAndRepeatedNativeHailMaryCommandsRequireTheSkill() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			for (boolean bomb : new boolean[] {true, false}) {
				RecordingState state = fixture(home, false, bomb);
				AtomicInteger rolls = countRolls(state);
				respond(state, home, Commands.selectPlayer("actor", bomb ? PlayerAction.HAIL_MARY_BOMB : PlayerAction.HAIL_MARY_PASS));
				for (int attempt = 0; attempt < 2; attempt++) {
					respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(14, 7), home)));
					assertRejected(state, rolls);
				}
			}
		}
	}

	@Test void rejectedNativeTargetCanEndTheActionOrTurnWithoutThrowing() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			for (boolean bomb : new boolean[] {true, false}) {
				for (boolean endTurn : new boolean[] {true, false}) {
					RecordingState state = fixture(home, true, bomb);
					AtomicInteger rolls = countRolls(state);
					respond(state, home, Commands.selectPlayer("actor", bomb ? PlayerAction.HAIL_MARY_BOMB : PlayerAction.HAIL_MARY_PASS));
					respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(24, 7), home)));
					assertRejected(state, rolls);
					respond(state, home, endTurn ? Commands.endTurn(state.getGame().getTurnMode()) : Commands.selectPlayer(null, null));
					assertNull(state.getGame().getActingPlayer().getPlayer());
					assertNull(state.getGame().getPassCoordinate());
					assertEquals(0, rolls.get());
					assertTrue(state.passes().isEmpty());
					if (endTurn) assertEquals(!home, state.getGame().isHomePlaying());
				}
			}
		}
	}

	@Test void initialHailMaryBombRequiresBombEligibilityButCaughtBombCanBeThrownBack() throws Exception {
		for (boolean home : new boolean[] {true, false}) {
			RecordingState state = fixture(home, true, false);
			AtomicInteger rolls = countRolls(state);
			respond(state, home, Commands.selectPlayer("actor", PlayerAction.HAIL_MARY_BOMB));
			for (int attempt = 0; attempt < 2; attempt++) {
				respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(14, 7), home)));
				assertRejected(state, rolls);
			}
			state.getGame().setTurnMode(home ? TurnMode.BOMB_HOME : TurnMode.BOMB_AWAY);
			respond(state, home, Commands.pass("actor", oriented(new FieldCoordinate(14, 7), home)));
			assertEquals(1, state.passes().size());
			assertTrue(state.passes().get(0).isHailMaryPass());
			assertTrue(state.passes().get(0).isBomb());
		}
	}

	private RecordingState fixture(boolean home, boolean hailMary, boolean bomb) throws Exception {
		RecordingState state = new RecordingState(new TestServer().getServer());
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.BLIZZARD).withBallAt(10, 7)
			.withTeam(home, team -> team.player("actor", player -> {
				player.at(10, 7).stats(6, 3, 3, 3, 9);
				if (hailMary) player.skill("Hail Mary Pass");
				if (bomb) player.skill("Bombardier");
			}).player("mate", player -> player.at(10, 12).stats(6, 3, 3, 3, 9)))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(24, 12).stats(6, 3, 3, 3, 9)))
			.build();
		state.getGame().setHomePlaying(home);
		StepEngine.start(state);
		return state;
	}

	private AtomicInteger countRolls(GameState state) {
		AtomicInteger rolls = new AtomicInteger();
		state.getDiceRoller().setRecoveryRoll(type -> { rolls.incrementAndGet(); return type; });
		return rolls;
	}

	private void assertRejected(RecordingState state, AtomicInteger rolls) {
		assertEquals(StepId.INIT_PASSING, state.getCurrentStep().getId());
		assertNull(state.getGame().getPassCoordinate());
		assertNull(state.getGame().getThrowerId());
		assertNull(state.getGame().getThrowerAction());
		assertFalse(state.getGame().getActingPlayer().hasPassed());
		assertFalse(state.getGame().getTurnData().isPassUsed());
		assertFalse(state.getGame().getTurnData().isBombUsed());
		assertEquals(0, rolls.get());
		assertTrue(state.passes().isEmpty());
	}

	private void respond(GameState state, boolean home, ClientCommand command) {
		state.handleCommand(new ReceivedCommand(command, home));
	}
	private FieldCoordinate oriented(FieldCoordinate coordinate, boolean home) { return home ? coordinate : coordinate.transform(); }

	private static class RecordingState extends GameState {
		private final List<IReport> reports = new ArrayList<>();
		RecordingState(FantasyFootballServer server) { super(server); }
		@Override public boolean usesLegacyPersistence() { return false; }
		@Override public void observeModelSync(ServerCommandModelSync command) {
			reports.addAll(Arrays.asList(command.getReportList().getReports()));
		}
		List<ReportPassRoll> passes() {
			List<ReportPassRoll> passes = new ArrayList<>();
			for (IReport report : reports) if (report instanceof ReportPassRoll) passes.add((ReportPassRoll) report);
			return passes;
		}
	}
}
