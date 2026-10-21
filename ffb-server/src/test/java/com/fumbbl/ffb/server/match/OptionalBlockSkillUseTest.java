package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockResult;
import com.fumbbl.ffb.Direction;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Pushback;
import com.fumbbl.ffb.PushbackMode;
import com.fumbbl.ffb.PushbackSquare;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandPushback;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSessionMovementTest.Fixture;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.skillbehaviour.bb2025.DodgeBehaviour;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.Mode;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.bb2025.block.StepBlockChoice;
import com.fumbbl.ffb.server.step.bb2025.block.StepBlockDodge;
import com.fumbbl.ffb.server.step.bb2025.block.StepPushback;
import com.fumbbl.ffb.server.util.UtilServerPushback;
import com.fumbbl.ffb.util.UtilBox;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OptionalBlockSkillUseTest {
	@Test
	void oldNativeDodgePromptKeepsItsManualAnswerAfterPreferencesAreEnabled() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0], defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7); place(game, defender, 8, 7);
		((RosterPlayer) defender).addSkill(skill(game, "Dodge"));
		game.setDefenderId(defender.getId()); game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		com.eclipsesource.json.JsonObject oldCheckpoint = blockDodge(state).toJsonValue();
		com.fumbbl.ffb.server.IServerJsonOption.USING_DODGE.addTo(oldCheckpoint, true);
		com.fumbbl.ffb.server.IServerJsonOption.ASK_FOR_SKILL.addTo(oldCheckpoint, true);
		oldCheckpoint.remove("skillHooksComplete");
		StepBlockDodge restored = new StepBlockDodge(state).initFrom(game.getRules(), oldCheckpoint);
		game.setDialogParameter(new DialogSkillUseParameter(defender.getId(), skill(game, "Dodge"), 0));
		configure(state, UseCase.DODGE_BLOCK, Mode.ALWAYS_USE);
		restored.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(skill(game, "Dodge"), false,
			defender.getId(), null, false), false));
		assertEquals(PlayerState.FALLING, game.getFieldModel().getPlayerState(defender).getBase());
		assertFalse(restored.getOptionalSkillChoices().pending());
	}

	@Test
	void stripBallAskWaitsBeforeReportingOrDroppingBallAndDeclineKeepsBallInPlace() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0];
		Player<?> defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7);
		place(game, defender, 8, 7);
		((RosterPlayer) attacker).addSkill(skill(game, "Strip Ball"));
		game.setDefenderId(defender.getId());
		game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		game.getFieldModel().setBallCoordinate(new FieldCoordinate(8, 7));
		game.getFieldModel().setBallMoving(true);
		configure(state, UseCase.STRIP_BALL, Mode.ALWAYS_ASK);

		StepBlockChoice step = blockChoice(state, BlockResult.POW);
		start(state, step);
		assertTrue(step.getOptionalSkillChoices().pending());
		assertEquals(StepAction.CONTINUE, step.getResult().getNextAction());
		assertEquals(0, step.getResult().getReportList().size());
		assertEquals(new FieldCoordinate(8, 7), game.getFieldModel().getBallCoordinate());
		assertEquals("Strip Ball", ((DialogSkillUseParameter) game.getDialogParameter()).getSkill().getName());
		step = new StepBlockChoice(state).initFrom(game.getRules(), step.toJsonValue());
		assertTrue(step.getOptionalSkillChoices().pending());

		step.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(skill(game, "Strip Ball"), false,
			attacker.getId(), null, false), true));
		assertFalse(step.getOptionalSkillChoices().pending());
		assertEquals(1, step.getResult().getReportList().size());
		assertEquals(new FieldCoordinate(8, 7), game.getFieldModel().getBallCoordinate());
		assertNull(game.getDialogParameter());
	}

	@Test
	void tackleBlockAskIsOwnedByAttackerAndADeclineLeavesDodgeAvailable() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0];
		Player<?> defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7);
		place(game, defender, 8, 7);
		((RosterPlayer) attacker).addSkill(skill(game, "Tackle"));
		((RosterPlayer) defender).addSkill(skill(game, "Dodge"));
		assertEquals(DodgeBehaviour.class, skill(game, "Dodge").getSkillBehaviour().getClass());
		game.setDefenderId(defender.getId());
		game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		configure(state, UseCase.TACKLE_BLOCK, Mode.ALWAYS_ASK);

		StepBlockChoice step = blockChoice(state, BlockResult.POW_PUSHBACK);
		start(state, step);
		assertTrue(game.getDialogParameter() instanceof DialogSkillUseParameter);
		DialogSkillUseParameter dialog = (DialogSkillUseParameter) game.getDialogParameter();
		assertEquals(attacker.getId(), dialog.getPlayerId());
		assertEquals("Tackle", dialog.getSkill().getName());

		step.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(skill(game, "Tackle"), false,
			attacker.getId(), null, false), true));
		assertEquals(StepAction.GOTO_LABEL, step.getResult().getNextAction());
		assertEquals("dodge", step.getResult().getNextActionParameter());
		assertEquals(1, step.getResult().getReportList().size());
	}

	@Test
	void dodgeBlockAskIsOwnedByDefenderAndDecliningCausesTheBlockFall() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0];
		Player<?> defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7);
		place(game, defender, 8, 7);
		((RosterPlayer) defender).addSkill(skill(game, "Dodge"));
		game.setDefenderId(defender.getId());
		game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		configure(state, UseCase.DODGE_BLOCK, Mode.ALWAYS_ASK);

		StepBlockDodge step = blockDodge(state);
		step.start();
		assertTrue(step.getOptionalSkillChoices().pending());
		DialogSkillUseParameter dialog = (DialogSkillUseParameter) game.getDialogParameter();
		assertEquals(defender.getId(), dialog.getPlayerId());
		assertEquals("Dodge", dialog.getSkill().getName());

		step.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(skill(game, "Dodge"), false,
			defender.getId(), null, false), false));
		assertEquals(PlayerState.FALLING, game.getFieldModel().getPlayerState(defender).getBase());
		assertEquals(1, step.getResult().getReportList().size());
	}

	@Test
	void dodgeBlockAlwaysUseSkipsThePromptAndKeepsDefenderStanding() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0];
		Player<?> defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7);
		place(game, defender, 8, 7);
		((RosterPlayer) defender).addSkill(skill(game, "Dodge"));
		game.setDefenderId(defender.getId());
		game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		configure(state, UseCase.DODGE_BLOCK, Mode.ALWAYS_USE);

		StepBlockDodge step = blockDodge(state);
		step.start();
		assertNull(game.getDialogParameter());
		assertEquals(PlayerState.STANDING, game.getFieldModel().getPlayerState(defender).getBase());
		assertEquals(1, step.getResult().getReportList().size());
	}

	@Test
	void grabAskIsOwnedByAttackerAndDeclineLeavesRegularPushbackAvailable() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0];
		Player<?> defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7);
		place(game, defender, 8, 7);
		((RosterPlayer) attacker).addSkill(skill(game, "Grab"));
		game.setDefenderId(defender.getId());
		game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		configure(state, UseCase.GRAB, Mode.ALWAYS_ASK);

		StepPushback step = new StepPushback(state);
		step.setParameter(StepParameter.from(StepParameterKey.STARTING_PUSHBACK_SQUARE,
			new PushbackSquare(new FieldCoordinate(8, 7), Direction.EAST, true)));
		step.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
		step.start();
		assertTrue(step.getOptionalSkillChoices().pending());
		DialogSkillUseParameter dialog = (DialogSkillUseParameter) game.getDialogParameter();
		assertEquals(attacker.getId(), dialog.getPlayerId());
		assertEquals("Grab", dialog.getSkill().getName());

		step.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(skill(game, "Grab"), false,
			attacker.getId(), null, false), true));
		assertFalse(step.getOptionalSkillChoices().pending());
		assertNull(game.getDialogParameter());
	}

	@Test
	void grabAlwaysUseKeepsManualPushbackSquareSelection() throws Exception {
		Fixture fixture = turnFixture();
		GameState state = state(fixture.session);
		Game game = state.getGame();
		game.setHomePlaying(true);
		UtilBox.putAllPlayersIntoBox(game);
		Player<?> attacker = game.getTeamHome().getPlayers()[0];
		Player<?> defender = game.getTeamAway().getPlayers()[0];
		place(game, attacker, 7, 7);
		place(game, defender, 8, 7);
		((RosterPlayer) attacker).addSkill(skill(game, "Grab"));
		game.setDefenderId(defender.getId());
		game.getActingPlayer().setPlayerId(attacker.getId());
		game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
		configure(state, UseCase.GRAB, Mode.ALWAYS_USE);

		PushbackSquare startingSquare = new PushbackSquare(new FieldCoordinate(8, 7), Direction.EAST, true);
		PushbackSquare[] regularSquares = UtilServerPushback.findPushbackSquares(game, startingSquare, PushbackMode.REGULAR);
		PushbackSquare[] grabSquares = UtilServerPushback.findPushbackSquares(game, startingSquare, PushbackMode.GRAB);
		FieldCoordinate grabOnlyCoordinate = null;
		for (PushbackSquare grabSquare : grabSquares) {
			boolean regular = false;
			for (PushbackSquare regularSquare : regularSquares) {
				if (regularSquare.getCoordinate().equals(grabSquare.getCoordinate())) regular = true;
			}
			if (!regular) {
				grabOnlyCoordinate = grabSquare.getCoordinate();
				break;
			}
		}
		assertTrue(grabOnlyCoordinate != null, "fixture must have a Grab-only pushback square");

		StepPushback step = new StepPushback(state);
		step.setParameter(StepParameter.from(StepParameterKey.STARTING_PUSHBACK_SQUARE, startingSquare));
		step.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
		step.start();
		assertFalse(step.getOptionalSkillChoices().pending());
		assertNull(game.getDialogParameter());
		assertTrue(hasPushbackSquare(game, grabOnlyCoordinate), "Always Use applies Grab but still awaits a square choice");

		step.handleCommand(new ReceivedCommand(new ClientCommandPushback(new Pushback(defender.getId(), grabOnlyCoordinate)), true));
		assertEquals(grabOnlyCoordinate, game.getFieldModel().getPlayerCoordinate(defender));
	}

	private Fixture turnFixture() throws Exception {
		Fixture fixture = new Fixture();
		state(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
		fixture.advanceToTurn();
		return fixture;
	}

	private StepBlockChoice blockChoice(GameState state, BlockResult result) {
		StepBlockChoice step = new StepBlockChoice(state);
		StepParameterSet parameters = new StepParameterSet();
		parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_DODGE, "dodge"));
		parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_JUGGERNAUT, "juggernaut"));
		parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_PUSHBACK, "pushback"));
		step.init(parameters);
		step.setParameter(StepParameter.from(StepParameterKey.BLOCK_RESULT, result));
		step.setParameter(StepParameter.from(StepParameterKey.NR_OF_DICE, 1));
		step.setParameter(StepParameter.from(StepParameterKey.BLOCK_ROLL, new int[] {6}));
		step.setParameter(StepParameter.from(StepParameterKey.DICE_INDEX, 0));
		step.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
		return step;
	}

	private StepBlockDodge blockDodge(GameState state) {
		StepBlockDodge step = new StepBlockDodge(state);
		step.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE,
			new PlayerState(PlayerState.STANDING)));
		return step;
	}

	private void start(GameState state, StepBlockChoice step) {
		state.pushCurrentStepOnStack();
		state.getStepStack().push(step);
		state.startNextStep();
	}

	private void configure(GameState state, UseCase useCase, Mode mode) {
		SkillUsePreferences preferences = SkillUsePreferences.defaults().with(useCase, mode);
		state.getOptionalSkillUse().configure(preferences, preferences);
	}

	private com.fumbbl.ffb.model.skill.Skill skill(Game game, String name) {
		return ((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName(name);
	}

	private void place(Game game, Player<?> player, int x, int y) {
		game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
		game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING));
	}

	private boolean hasPushbackSquare(Game game, FieldCoordinate coordinate) {
		for (PushbackSquare square : game.getFieldModel().getPushbackSquares()) {
			if (square.getCoordinate().equals(coordinate)) return true;
		}
		return false;
	}

	private GameState state(SetupSession session) throws Exception {
		Field field = SetupSession.class.getDeclaredField("state");
		field.setAccessible(true);
		return (GameState) field.get(session);
	}
}
