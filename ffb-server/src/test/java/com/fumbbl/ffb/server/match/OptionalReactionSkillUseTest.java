package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.ApothecaryMode;
import com.fumbbl.ffb.Direction;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.PushbackSquare;
import com.fumbbl.ffb.dialog.DialogFollowupChoiceParameter;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.injury.Block;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.InjuryResult;
import com.fumbbl.ffb.server.model.DropPlayerContext;
import com.fumbbl.ffb.server.model.SteadyFootingContext;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.Mode;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.step.AbstractStep;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.action.block.StepWrestle;
import com.fumbbl.ffb.server.step.bb2025.block.StepFollowup;
import com.fumbbl.ffb.server.step.bb2025.block.StepPushback;
import com.fumbbl.ffb.server.step.bb2025.pass.StepPass;
import com.fumbbl.ffb.server.step.bb2025.shared.StepSteadyFooting;
import com.fumbbl.ffb.server.step.mixed.shared.StepPickMeUp;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OptionalReactionSkillUseTest {
	private final UseCase[] binaryCases = {UseCase.FEND, UseCase.TAUNT, UseCase.WRESTLE_ATTACKER,
		UseCase.WRESTLE_DEFENDER, UseCase.STAND_FIRM, UseCase.STEADY_FOOTING};

	@Test void nativeAutomaticReactionsResolveBeforeProjectionAndDeadlineCreation() throws Exception {
		for (UseCase useCase : binaryCases) {
			Fixture fixture = new Fixture(useCase, Mode.ALWAYS_USE); fixture.start();
			assertFalse(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter, useCase.name());
			fixture.session.expireReactiveDecision(System.currentTimeMillis());
			assertNull(fixture.live(fixture.role).get("reaction"), useCase.name());
			if (useCase == UseCase.FEND) assertEquals(new FieldCoordinate(7, 7), fixture.coordinate(fixture.attacker));
			if (useCase == UseCase.TAUNT) assertEquals(new FieldCoordinate(8, 7), fixture.coordinate(fixture.attacker));
			if (useCase == UseCase.STAND_FIRM) assertEquals(new FieldCoordinate(8, 7), fixture.coordinate(fixture.defender));
			if (useCase == UseCase.STEADY_FOOTING) { assertEquals(1, fixture.rolls.get()); assertEquals(PlayerState.STANDING, fixture.playerState(fixture.defender)); }
			if (useCase == UseCase.WRESTLE_ATTACKER || useCase == UseCase.WRESTLE_DEFENDER) {
				assertEquals(PlayerState.PRONE, fixture.playerState(fixture.attacker));
				assertEquals(PlayerState.PRONE, fixture.playerState(fixture.defender));
			}
		}
	}

	@Test void askPromptsBelongToTheSkillOwnerAndSurvivePolicyChangesAndRecoveryWithoutRestarting() throws Exception {
		for (UseCase useCase : binaryCases) {
			Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK); fixture.start();
			assertTrue(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter, useCase.name());
			assertEquals(fixture.owner.getId(), ((DialogSkillUseParameter) fixture.game.getDialogParameter()).getPlayerId());
			fixture.session.expireReactiveDecision(System.currentTimeMillis());
			JsonObject before = fixture.live(fixture.role); JsonObject reaction = before.get("reaction").asObject();
			assertEquals(fixture.role, reaction.getString("actor", null));
			long deadline = reaction.getLong("expiresAt", -1); assertTrue(deadline > System.currentTimeMillis());
			assertEquals("WRONG_ACTOR", assertThrows(MatchService.Failure.class, () -> fixture.session.apply(
				"home".equals(fixture.role) ? "away" : "home", fixture.base.request("action", "wrong-owner", before)
					.add("actionId", before.getInt("revision", -1) + ":skill:true"))).code);
			fixture.configure(Mode.ALWAYS_USE);
			JsonObject unchanged = fixture.live(fixture.role).get("reaction").asObject();
			assertEquals(reaction.getString("id", null), unchanged.getString("id", null));
			assertEquals(deadline, unchanged.getLong("expiresAt", -1));
			SetupSession restored = new SetupSession(fixture.base.server, fixture.base.document, fixture.session.recoveryArtifact());
			restored.configureSkillUsePreferences(fixture.homePreferences, fixture.awayPreferences);
			assertFalse(restored.expireReactiveDecision(deadline - 1));
			JsonObject recovered = restored.decorateSaveResume(restored.reply("load", "ACCEPTED", false, fixture.role)).get("state").asObject();
			assertEquals(reaction.getString("id", null), recovered.get("reaction").asObject().getString("id", null));
			assertEquals(deadline, recovered.get("reaction").asObject().getLong("expiresAt", -1));
			assertTrue(state(restored).getGame().getDialogParameter() instanceof DialogSkillUseParameter);
			assertTrue(restored.expireReactiveDecision(deadline), useCase.name());
			assertFalse(restored.isFailed());
		}
	}

	@Test void decliningFollowupSkillsKeepsTheAttackersManualFollowupChoice() throws Exception {
		for (UseCase useCase : new UseCase[] {UseCase.FEND, UseCase.TAUNT}) {
			Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK); fixture.start();
			fixture.state.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(fixture.skill, false, fixture.owner.getId(), null, false), false));
			assertTrue(fixture.game.getDialogParameter() instanceof DialogFollowupChoiceParameter);
			assertEquals(new FieldCoordinate(7, 7), fixture.coordinate(fixture.attacker));
		}
	}

	@Test void wrestleKeepsAttackerBeforeDefenderAndUsesEachCoachsOwnPolicy() throws Exception {
		Fixture fixture = new Fixture(UseCase.WRESTLE_ATTACKER, Mode.ALWAYS_ASK);
		((RosterPlayer) fixture.defender).addSkill(fixture.skill);
		fixture.awayPreferences = fixture.awayPreferences.with(UseCase.WRESTLE_DEFENDER, Mode.ALWAYS_USE);
		fixture.session.configureSkillUsePreferences(fixture.homePreferences, fixture.awayPreferences);
		fixture.start();
		assertEquals(fixture.attacker.getId(), ((DialogSkillUseParameter) fixture.game.getDialogParameter()).getPlayerId());
		assertEquals(PlayerState.STANDING, fixture.playerState(fixture.defender));
		fixture.state.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(fixture.skill, false, fixture.attacker.getId(), null, false), true));
		assertEquals(PlayerState.PRONE, fixture.playerState(fixture.attacker));
		assertEquals(PlayerState.PRONE, fixture.playerState(fixture.defender));
		assertFalse(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter);
	}

	@Test void pickMeUpAutomaticModeAttemptsEveryEligibleRecipientAndStandsOnlySuccessfulPlayers() throws Exception {
		Fixture fixture = new Fixture(UseCase.PICK_ME_UP, Mode.ALWAYS_USE);
		fixture.state.getDiceRoller().setRecoveryRoll(sides -> fixture.rolls.incrementAndGet() == 1 ? 1 : 6);
		fixture.start();
		assertEquals(2, fixture.rolls.get());
		int standing = (fixture.playerState(fixture.firstRecipient) == PlayerState.STANDING ? 1 : 0)
			+ (fixture.playerState(fixture.secondRecipient) == PlayerState.STANDING ? 1 : 0);
		assertEquals(1, standing); assertEquals(PlayerState.PRONE, fixture.playerState(fixture.ineligibleRecipient));
		assertFalse(fixture.game.getDialogParameter() instanceof DialogPlayerChoiceParameter);
		fixture.session.expireReactiveDecision(System.currentTimeMillis());
		assertNull(fixture.live("away").get("reaction"));
	}

	@Test void pickMeUpAskModeRetainsManualRecipientsAndTimeoutDeclinesRemainingAttempts() throws Exception {
		Fixture fixture = new Fixture(UseCase.PICK_ME_UP, Mode.ALWAYS_ASK); fixture.start();
		DialogPlayerChoiceParameter dialog = (DialogPlayerChoiceParameter) fixture.game.getDialogParameter();
		assertEquals(PlayerChoiceMode.PICK_ME_UP, dialog.getPlayerChoiceMode()); assertEquals(2, dialog.getPlayerIds().length);
		assertEquals(0, fixture.rolls.get()); fixture.session.expireReactiveDecision(System.currentTimeMillis());
		JsonObject reaction = fixture.live("away").get("reaction").asObject(); assertEquals("away", reaction.getString("actor", null));
		ClientCommandPlayerChoice one = new ClientCommandPlayerChoice(PlayerChoiceMode.PICK_ME_UP, null); one.addPlayerId(fixture.firstRecipient.getId());
		fixture.state.handleCommand(new ReceivedCommand(one, false));
		assertEquals(1, fixture.rolls.get()); assertEquals(PlayerState.STANDING, fixture.playerState(fixture.firstRecipient));
		assertEquals(PlayerState.PRONE, fixture.playerState(fixture.secondRecipient));
		assertTrue(fixture.session.expireReactiveDecision(reaction.getLong("expiresAt", -1)));
		assertEquals(1, fixture.rolls.get()); assertEquals(PlayerState.PRONE, fixture.playerState(fixture.secondRecipient));
	}

	@Test void passBallAndBombPoliciesAreSeparateAndAutomaticRerollsUseOneFreshDie() throws Exception {
		for (UseCase useCase : new UseCase[] {UseCase.PASS_BALL, UseCase.PASS_BOMB}) for (Mode mode : Mode.values()) {
			Fixture fixture = new Fixture(useCase, mode);
			fixture.state.getDiceRoller().setRecoveryRoll(sides -> fixture.rolls.incrementAndGet() == 1 ? 1 : 6);
			fixture.start();
			assertEquals(mode == Mode.ALWAYS_USE ? 2 : 1, fixture.rolls.get(), useCase + ":" + mode);
			if (mode == Mode.ALWAYS_ASK) {
				DialogSkillUseParameter dialog = (DialogSkillUseParameter) fixture.game.getDialogParameter();
				assertEquals("Pass", dialog.getSkill().getName()); assertEquals(fixture.attacker.getId(), dialog.getPlayerId());
				fixture.session.expireReactiveDecision(System.currentTimeMillis());
				assertEquals("home", fixture.live("home").get("reaction").asObject().getString("actor", null));
			} else assertFalse(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter);
		}
	}

	@Test void decliningPassSkillPreservesOtherRerollSourcesWithoutSpendingThem() throws Exception {
		for (UseCase useCase : new UseCase[] {UseCase.PASS_BALL, UseCase.PASS_BOMB}) {
			Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK);
			fixture.game.getTurnData().setReRolls(1);
			fixture.state.getDiceRoller().setRecoveryRoll(sides -> { fixture.rolls.incrementAndGet(); return 1; });
			fixture.start();
			fixture.state.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(fixture.skill, false, fixture.attacker.getId(), null, false), true));
			assertEquals(1, fixture.rolls.get()); assertEquals(1, fixture.game.getTurnData().getReRolls());
			assertTrue(fixture.game.getDialogParameter() instanceof DialogReRollPropertiesParameter, useCase.name());
			assertNull(((DialogReRollPropertiesParameter) fixture.game.getDialogParameter()).getReRollSkill());
		}
	}

	@Test void passTimeoutKeepsOtherResourcesAvailableWithAFreshDeadline() throws Exception {
		for (UseCase useCase : new UseCase[] {UseCase.PASS_BALL, UseCase.PASS_BOMB}) {
			Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK);
			fixture.game.getTurnData().setReRolls(1);
			fixture.state.getDiceRoller().setRecoveryRoll(sides -> { fixture.rolls.incrementAndGet(); return 1; });
			fixture.start(); fixture.session.expireReactiveDecision(System.currentTimeMillis());
			JsonObject before = fixture.live("home").get("reaction").asObject();
			long deadline = before.getLong("expiresAt", -1);
			assertTrue(fixture.session.expireReactiveDecision(deadline));
			assertEquals(1, fixture.rolls.get()); assertEquals(1, fixture.game.getTurnData().getReRolls());
			JsonObject remaining = fixture.live("home").get("reaction").asObject();
			assertTrue(remaining.getLong("expiresAt", -1) > deadline);
			assertFalse(before.getString("id", null).equals(remaining.getString("id", null)));
			assertFalse(fixture.session.isFailed());
		}
	}

	private static GameState state(SetupSession session) throws Exception {
		Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
	}

	private static final class Fixture {
		final SetupSessionMovementTest.Fixture base = new SetupSessionMovementTest.Fixture();
		final SetupSession session = base.session;
		final GameState state;
		final Game game;
		final Player<?> attacker, defender, owner;
		Player<?> firstRecipient, secondRecipient, ineligibleRecipient;
		final Skill skill;
		final UseCase useCase;
		final String role;
		final AbstractStep step;
		final AtomicInteger rolls = new AtomicInteger();
		SkillUsePreferences homePreferences, awayPreferences;

		Fixture(UseCase useCase, Mode mode) throws Exception {
			this.useCase = useCase; state = state(session); state.getDiceRoller().setRecoveryRoll(sides -> 1); base.advanceToTurn();
			game = state.getGame(); game.setHomePlaying(true); game.setThrowerId(null); game.setDialogParameter(null); UtilBox.putAllPlayersIntoBox(game);
			attacker = game.getTeamHome().getPlayers()[0]; defender = game.getTeamAway().getPlayers()[0];
			place(attacker, 7, 7, PlayerState.STANDING); place(defender, 8, 7, PlayerState.STANDING);
			game.getActingPlayer().setPlayerId(attacker.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK); game.setDefenderId(defender.getId());
			game.getFieldModel().setBallCoordinate(new FieldCoordinate(20, 7)); game.getFieldModel().setBallMoving(true);
			boolean ownedByHome = useCase == UseCase.WRESTLE_ATTACKER || useCase == UseCase.PASS_BALL || useCase == UseCase.PASS_BOMB;
			owner = ownedByHome ? attacker : defender; role = ownedByHome ? "home" : "away";
			String name = useCase == UseCase.WRESTLE_ATTACKER || useCase == UseCase.WRESTLE_DEFENDER ? "Wrestle"
				: useCase == UseCase.STAND_FIRM ? "Stand Firm" : useCase == UseCase.STEADY_FOOTING ? "Steady Footing"
				: useCase == UseCase.PICK_ME_UP ? "Pick-me-up" : useCase == UseCase.PASS_BALL || useCase == UseCase.PASS_BOMB ? "Pass"
				: useCase == UseCase.FEND ? "Fend" : "Taunt";
			skill = game.getRules().getSkillFactory().forName(name); assertNotNull(skill, name); ((RosterPlayer) owner).addSkill(skill); configure(mode);
			if (useCase == UseCase.FEND || useCase == UseCase.TAUNT) {
				place(defender, 9, 7, PlayerState.STANDING); StepFollowup followup = new StepFollowup(state);
				followup.setParameter(StepParameter.from(StepParameterKey.DEFENDER_POSITION, new FieldCoordinate(8, 7)));
				followup.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING))); step = followup;
			} else if (useCase == UseCase.WRESTLE_ATTACKER || useCase == UseCase.WRESTLE_DEFENDER) {
				StepWrestle wrestle = new StepWrestle(state); wrestle.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING))); step = wrestle;
			} else if (useCase == UseCase.STAND_FIRM) {
				StepPushback pushback = new StepPushback(state);
				pushback.setParameter(StepParameter.from(StepParameterKey.STARTING_PUSHBACK_SQUARE, new PushbackSquare(new FieldCoordinate(8, 7), Direction.EAST, true)));
				pushback.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING))); step = pushback;
			} else if (useCase == UseCase.STEADY_FOOTING) {
				StepSteadyFooting footing = new StepSteadyFooting(state); StepParameterSet parameters = new StepParameterSet();
				parameters.add(StepParameter.from(StepParameterKey.APOTHECARY_MODE, ApothecaryMode.DEFENDER)); footing.init(parameters);
				footing.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
				InjuryResult injury = new InjuryResult();
				injury.injuryContext().setInjuryType(new Block());
				injury.injuryContext().setAttackerId(attacker.getId());
				injury.injuryContext().setDefenderId(defender.getId());
				injury.injuryContext().setDefenderCoordinate(coordinate(defender));
				injury.injuryContext().setApothecaryMode(ApothecaryMode.DEFENDER);
				injury.injuryContext().setArmorRoll(new int[] {1, 1});
				injury.injuryContext().setArmorBroken(false);
				injury.injuryContext().setInjury(new PlayerState(PlayerState.PRONE));
				footing.setParameter(StepParameter.from(StepParameterKey.STEADY_FOOTING_CONTEXT,
					new SteadyFootingContext(new DropPlayerContext(injury, defender.getId(), ApothecaryMode.DEFENDER, false))));
				game.getFieldModel().setPlayerState(defender, new PlayerState(PlayerState.FALLING)); step = footing;
			} else if (useCase == UseCase.PICK_ME_UP) {
				firstRecipient = game.getTeamAway().getPlayers()[1]; secondRecipient = game.getTeamAway().getPlayers()[2]; ineligibleRecipient = game.getTeamAway().getPlayers()[3];
				place(firstRecipient, 9, 7, PlayerState.PRONE); place(secondRecipient, 9, 8, PlayerState.PRONE); place(ineligibleRecipient, 20, 7, PlayerState.PRONE);
				step = new StepPickMeUp(state);
			} else {
				game.setThrowerId(attacker.getId()); game.setThrowerAction(useCase == UseCase.PASS_BOMB ? PlayerAction.THROW_BOMB : PlayerAction.PASS);
				game.setPassCoordinate(new FieldCoordinate(11, 7)); game.getActingPlayer().setPlayerAction(game.getThrowerAction());
				place(defender, 20, 8, PlayerState.STANDING); game.getFieldModel().setBallCoordinate(new FieldCoordinate(7, 7)); game.getFieldModel().setBallMoving(false);
				if (useCase == UseCase.PASS_BOMB) { game.getFieldModel().setBombCoordinate(new FieldCoordinate(7, 7)); game.getFieldModel().setBombMoving(false); }
				StepPass pass = new StepPass(state); StepParameterSet parameters = new StepParameterSet();
				for (StepParameterKey key : new StepParameterKey[] {StepParameterKey.GOTO_LABEL_ON_END, StepParameterKey.GOTO_LABEL_ON_MISSED_PASS, StepParameterKey.GOTO_LABEL_ON_SAVED_FUMBLE})
					parameters.add(StepParameter.from(key, "reaction-return"));
				pass.init(parameters); state.getCurrentStep().setLabel("reaction-return"); step = pass;
			}
			state.getDiceRoller().setRecoveryRoll(sides -> { rolls.incrementAndGet(); return 6; });
		}
		void configure(Mode mode) {
			homePreferences = SkillUsePreferences.defaults(); awayPreferences = SkillUsePreferences.defaults();
			if ("home".equals(role)) homePreferences = homePreferences.with(useCase, mode); else awayPreferences = awayPreferences.with(useCase, mode);
			if (useCase == UseCase.PASS_BALL) homePreferences = homePreferences.with(UseCase.PASS_BOMB, mode == Mode.ALWAYS_ASK ? Mode.ALWAYS_USE : Mode.ALWAYS_ASK);
			if (useCase == UseCase.PASS_BOMB) homePreferences = homePreferences.with(UseCase.PASS_BALL, mode == Mode.ALWAYS_ASK ? Mode.ALWAYS_USE : Mode.ALWAYS_ASK);
			session.configureSkillUsePreferences(homePreferences, awayPreferences);
		}
		void start() { state.pushCurrentStepOnStack(); state.getStepStack().push(step); state.startNextStep(); }
		void place(Player<?> player, int x, int y, int baseState) { game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y)); game.getFieldModel().setPlayerState(player, new PlayerState(baseState)); }
		FieldCoordinate coordinate(Player<?> player) { return game.getFieldModel().getPlayerCoordinate(player); }
		int playerState(Player<?> player) { return game.getFieldModel().getPlayerState(player).getBase(); }
		JsonObject live(String recipient) { return session.decorateSaveResume(session.reply("load", "ACCEPTED", false, recipient)).get("state").asObject(); }
	}
}
