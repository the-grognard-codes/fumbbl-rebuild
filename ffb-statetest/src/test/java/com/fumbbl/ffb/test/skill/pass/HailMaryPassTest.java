package com.fumbbl.ffb.test.skill.pass;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PassingDistance;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.mechanics.PassResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.NetCommand;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.mixed.ReportModifiedPassResult;
import com.fumbbl.ffb.report.mixed.ReportPassRoll;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.bb2025.pass.StepHailMaryPass;
import com.fumbbl.ffb.server.step.bb2025.pass.StepIntercept;
import com.fumbbl.ffb.test.GameStateBuilder;
import com.fumbbl.ffb.test.TestRolls;
import com.fumbbl.ffb.test.TestServer;
import com.fumbbl.ffb.util.UtilActingPlayer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HailMaryPassTest {

	private TestServer server;
	private GameState state;
	private StepHailMaryPass step;

	@BeforeEach void setUp() throws Exception {
		server = new TestServer();
	}

	@Test void failedPaTestUsesPlayerPaAndOffersTeamReroll() {
		prepare(5, Weather.NICE, PlayerAction.HAIL_MARY_PASS);
		TestRolls.on(state).general(5);
		step.start();
		ReportPassRoll report = lastRoll();
		assertEquals(8, report.getMinimumRoll());
		assertFalse(report.isSuccessful());
		assertEquals(PassResult.INACCURATE, report.getResult());
		assertNotNull(state.getGame().getDialogParameter());
		assertEquals(StepAction.CONTINUE, step.getResult().getNextAction());
	}

	@Test void convertedSuccessDoesNotOfferRerollAndStillScatters() {
		prepare(2, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Pass");
		TestRolls.on(state).general(5);
		step.start();
		assertEquals(5, lastRoll().getMinimumRoll());
		assertTrue(lastRoll().isSuccessful());
		assertEquals(PassResult.INACCURATE, lastRoll().getResult());
		assertEquals(PassResult.INACCURATE, state.getPassState().getResult());
		assertNull(state.getGame().getDialogParameter());
		assertEquals(StepAction.NEXT_STEP, step.getResult().getNextAction());
	}

	@Test void failedInaccurateTestOffersPassSkill() {
		prepare(5, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Pass");
		TestRolls.on(state).general(5, 6);
		step.start();
		DialogSkillUseParameter dialog = (DialogSkillUseParameter) state.getGame().getDialogParameter();
		assertEquals("Pass", dialog.getSkill().getName());
		assertEquals(8, dialog.getMinimumRoll());
		respond(new ClientCommandUseSkill(dialog.getSkill(), true, "thrower", null, false));
		assertEquals(6, lastRoll().getRoll());
		assertTrue(lastRoll().isReRolled());
		assertTrue(lastRoll().isSuccessful());
		assertEquals(PassResult.INACCURATE, state.getPassState().getResult());
		assertNull(state.getGame().getDialogParameter());
	}

	@Test void teamRerollUsesFreshDieAndCannotRerollAgain() {
		prepare(5, Weather.NICE, PlayerAction.HAIL_MARY_PASS);
		TestRolls.on(state).general(5, 5);
		step.start();
		respond(new ClientCommandUseReRoll(ReRolledActions.PASS, ReRollSources.TEAM_RE_ROLL));
		assertTrue(lastRoll().isReRolled());
		assertFalse(lastRoll().isSuccessful());
		assertEquals(1, state.getGame().getTurnDataHome().getReRolls());
		assertNull(state.getGame().getDialogParameter());
		assertEquals(StepAction.NEXT_STEP, step.getResult().getNextAction());
	}

	@Test void decliningRerollKeepsOriginalDieAndReport() {
		prepare(5, Weather.NICE, PlayerAction.HAIL_MARY_PASS);
		TestRolls.on(state).general(5, 6);
		step.start();
		respond(new ClientCommandUseReRoll(ReRolledActions.PASS, null));
		assertEquals(5, lastRoll().getRoll());
		assertEquals(1, rollCount());
		assertFalse(lastRoll().isReRolled());
		assertEquals(StepAction.NEXT_STEP, step.getResult().getNextAction());
	}

	@Test void weatherAndMarkingApplyToLongBombEvenForNearbyTarget() {
		prepare(3, Weather.VERY_SUNNY, PlayerAction.HAIL_MARY_PASS);
		Game game = state.getGame();
		game.getFieldModel().setPlayerCoordinate(game.getPlayerById("opponent"), new FieldCoordinate(4, 7));
		game.setPassCoordinate(new FieldCoordinate(5, 7));
		TestRolls.on(state).general(5);
		step.start();
		assertEquals(8, lastRoll().getMinimumRoll());
		assertEquals(2, lastRoll().getRollModifiers().length);
		assertEquals(PassingDistance.LONG_BOMB, lastRoll().getPassingDistance());
		assertEquals(PassResult.FUMBLE, lastRoll().getResult());
		assertFalse(lastRoll().isSuccessful());
	}

	@Test void cannoneerAppliesItsNormalLongBombBonus() {
		prepare(3, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Cannoneer");
		TestRolls.on(state).general(5);
		step.start();
		assertEquals(5, lastRoll().getMinimumRoll());
		assertTrue(lastRoll().isSuccessful());
		assertEquals(PassResult.INACCURATE, lastRoll().getResult());
	}

	@Test void modifyingSkillSuccessIsAlsoConvertedAndUsesOriginalDie() {
		prepare(3, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Strong Passing Game");
		TestRolls.on(state).general(5, 1);
		step.start();
		Skill modifying = state.getGame().getThrower().getSkillWithProperty(NamedProperties.canAddStrengthToPass);
		assertNotNull(modifying);
		for (IReport report : step.getResult().getReportList().getReports()) {
			if (report instanceof ReportModifiedPassResult) {
				assertEquals(PassResult.INACCURATE, ((ReportModifiedPassResult) report).getPassResult());
			}
		}
		respond(new ClientCommandUseSkill(modifying, true, "thrower", null, false));
		assertEquals(5, lastRoll().getRoll());
		assertEquals(3, lastRoll().getMinimumRoll());
		assertTrue(lastRoll().isSuccessful());
		assertFalse(lastRoll().isReRolled());
		assertNotNull(lastRoll().getStatBasedRollModifier());
		assertEquals(PassResult.INACCURATE, state.getPassState().getResult());
		assertTrue(state.getGame().getActingPlayer().isSkillUsed(modifying));
	}

	@Test void safePassDecisionAfterRerollDoesNotRollOrUseModifierAgain() {
		prepare(3, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Safe Pass", "Strong Passing Game");
		TestRolls.on(state).general(5, 1, 6);
		step.start();
		respond(new ClientCommandUseReRoll(ReRolledActions.PASS, ReRollSources.TEAM_RE_ROLL));
		assertEquals(PassResult.SAVED_FUMBLE, state.getPassState().getResult());
		int reports = rollCount();
		Skill safePass = state.getGame().getThrower().getSkillWithProperty(NamedProperties.dontDropFumbles);
		respond(new ClientCommandUseSkill(safePass, true, "thrower", null, false));
		assertEquals(reports, rollCount());
		assertEquals(1, lastRoll().getRoll());
		assertTrue(lastRoll().isReRolled());
		assertEquals(PassResult.SAVED_FUMBLE, state.getPassState().getResult());
		assertFalse(state.getGame().getFieldModel().isBallMoving());
		assertEquals(new FieldCoordinate(3, 7), state.getGame().getFieldModel().getBallCoordinate());
	}

	@Test void decliningSafePassRetainsNaturalOneAsFumble() {
		prepare(3, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Safe Pass");
		TestRolls.on(state).general(1, 6);
		step.start();
		respond(new ClientCommandUseReRoll(ReRolledActions.PASS, null));
		Skill safePass = state.getGame().getThrower().getSkillWithProperty(NamedProperties.dontDropFumbles);
		respond(new ClientCommandUseSkill(safePass, false, "thrower", null, false));
		assertEquals(1, rollCount());
		assertEquals(PassResult.FUMBLE, state.getPassState().getResult());
		assertEquals(StepAction.GOTO_LABEL, step.getResult().getNextAction());
	}

	@Test void noPassingAbilityFumblesWithoutRollingOrOfferingReroll() {
		prepare(0, Weather.NICE, PlayerAction.HAIL_MARY_PASS, "Pass");
		TestRolls.on(state).general(6);
		step.start();
		assertEquals(0, lastRoll().getRoll());
		assertEquals(0, lastRoll().getMinimumRoll());
		assertEquals(PassResult.FUMBLE, lastRoll().getResult());
		assertNull(state.getGame().getDialogParameter());
	}

	@Test void bombUsesPaTestAndRetainsBombIdentity() {
		prepare(4, Weather.NICE, PlayerAction.HAIL_MARY_BOMB, "Bombardier");
		TestRolls.on(state).general(6);
		step.start();
		assertEquals(7, lastRoll().getMinimumRoll());
		assertTrue(lastRoll().isBomb());
		assertTrue(lastRoll().isHailMaryPass());
		assertTrue(lastRoll().isSuccessful());
		assertEquals(PassResult.INACCURATE, state.getPassState().getResult());
		assertEquals("thrower", state.getPassState().getOriginalBombardier());
	}

	@Test void reportFactsAndRerollStateSurviveSerializationAndTransformation() {
		prepare(5, Weather.NICE, PlayerAction.HAIL_MARY_PASS);
		TestRolls.on(state).general(5, 5);
		step.start();
		step = new StepHailMaryPass(state).initFrom(state.getGame().getRules(), step.toJsonValue());
		respond(new ClientCommandUseReRoll(ReRolledActions.PASS, ReRollSources.TEAM_RE_ROLL));
		ReportPassRoll report = lastRoll();
		ReportPassRoll restored = new ReportPassRoll().initFrom(state.getGame().getRules(), report.toJsonValue());
		assertFalse(restored.isSuccessful());
		assertTrue(restored.isReRolled());
		assertEquals(8, restored.getMinimumRoll());
		assertFalse(((ReportPassRoll) restored.transform(state.getGame().getRules())).isSuccessful());
		assertTrue(step.toJsonValue().getBoolean("hailMaryReRolled", false));
	}

	@Test void ballAndBombHailMarySkipInterception() {
		for (PlayerAction action : new PlayerAction[] {PlayerAction.HAIL_MARY_PASS, PlayerAction.HAIL_MARY_BOMB}) {
			prepare(3, Weather.NICE, action);
			StepIntercept intercept = new StepIntercept(state);
			intercept.init(parameters());
			intercept.start();
			assertEquals(StepAction.GOTO_LABEL, intercept.getResult().getNextAction());
			assertNull(state.getGame().getDialogParameter());
		}
	}

	private void prepare(int passing, Weather weather, PlayerAction action, String... skills) {
		state = new GameStateBuilder(server.getGameState()).withRule("BB2025").withWeather(weather).withBallAt(3, 7)
			.withTeam(true, team -> team.player("thrower", player -> {
				player.at(3, 7).stats(6, 3, 3, passing, 9).skill("Hail Mary Pass");
				for (String skill : skills) player.skill(skill);
			}))
			.withTeam(false, team -> team.player("opponent", player -> player.at(15, 7).stats(6, 3, 3, 3, 9)))
			.build();
		Game game = state.getGame();
		game.getTurnDataHome().setReRolls(2);
		UtilActingPlayer.changeActingPlayer(game, "thrower", action, false);
		game.setThrowerId("thrower");
		game.setThrowerAction(action);
		game.setPassCoordinate(new FieldCoordinate(24, 7));
		step = new StepHailMaryPass(state);
		step.init(parameters());
	}

	private StepParameterSet parameters() {
		StepParameterSet parameters = new StepParameterSet();
		parameters.add(new StepParameter(StepParameterKey.GOTO_LABEL_ON_FAILURE, "failure"));
		return parameters;
	}

	private void respond(NetCommand command) {
		step.handleCommand(new ReceivedCommand(command, null));
	}

	private ReportPassRoll lastRoll() {
		ReportPassRoll last = null;
		for (IReport report : step.getResult().getReportList().getReports()) {
			if (report instanceof ReportPassRoll) last = (ReportPassRoll) report;
		}
		assertNotNull(last);
		return last;
	}

	private int rollCount() {
		int count = 0;
		for (IReport report : step.getResult().getReportList().getReports()) {
			if (report instanceof ReportPassRoll) count++;
		}
		return count;
	}
}
