package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.dialog.DialogBlockRollPropertiesParameter;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandUseProReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.AbstractStepWithReRoll;
import com.fumbbl.ffb.server.step.bb2025.block.StepBlockRoll;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ManualSkillRerollTest {
	private final BrowserActionEvidence evidence = new BrowserActionEvidence(true);

	@Test void proTestsBeforeDieSelectionAndAutomaticallyHandlesTheSoleDie() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (int dice : new int[] { 1, 2, 3 }) {
			GameState state = fixture(home, dice, "Pro");
			TestRolls.on(state).general(6, 6).block(dice == 1 ? new String[] { "bothdown", "pushback" }
				: dice == 2 ? new String[] { "bothdown", "skull", "pushback" } : new String[] { "bothdown", "skull", "pow", "pushback" });
			perform(state, "selectBlock"); perform(state, "block");
			int[] original = roll(state).clone();
			assertEquals(1, actions(state).stream().filter(action -> action.id.equals("block-reroll:pro")).count());
			performId(state, "block-reroll:pro");
			assertEquals(1, queuedGeneral(state));
			if (dice > 1) {
				assertArrayEquals(original, roll(state));
				assertEquals(dice, actions(state).size());
				assertTrue(actions(state).stream().allMatch(action -> action.kind.equals("rerollDie")));
				performId(state, "block-reroll-die:1");
			}
			int index = dice == 1 ? 0 : 1;
			assertEquals(3, roll(state)[index]);
			for (int other = 0; other < dice; other++) if (other != index) assertEquals(original[other], roll(state)[other]);
			assertFalse(actions(state).stream().anyMatch(action -> action.kind.equals("reroll")));
		}
	}

	@Test void failedProOffersAnIndependentTestRerollOrKeepsTheOriginalDice() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean retry : new boolean[] { true, false }) {
			GameState state = fixture(home, 2, "Pro");
			state.getGame().getTurnData().setReRolls(1);
			TestRolls.on(state).general(1, 6).block("bothdown", "skull", "pushback");
			perform(state, "selectBlock"); perform(state, "block");
			int[] original = roll(state).clone();
			performId(state, "block-reroll:pro");
			assertEquals("pro-test", ((StepBlockRoll) state.getCurrentStep()).getBlockRerollPhase());
			assertTrue(actions(state).stream().allMatch(action -> action.kind.equals("proTestReroll")));
			performId(state, retry ? "block-pro-test:team" : "block-pro-test:none");
			assertArrayEquals(original, roll(state));
			assertEquals(retry ? 0 : 1, state.getGame().getTurnData().getReRolls());
			if (retry) performId(state, "block-reroll-die:1");
			else assertFalse(actions(state).stream().anyMatch(action -> action.kind.equals("reroll")));
		}
	}

	@Test void brawlerSelectsOnlyBothDownDiceAndAutomaticallyHandlesASoleCandidate() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean multiple : new boolean[] { true, false }) {
			GameState state = fixture(home, 2, "Brawler");
			TestRolls.on(state).block("bothdown", multiple ? "bothdown" : "skull", "pushback");
			perform(state, "selectBlock"); perform(state, "block");
			performId(state, "block-reroll:brawler");
			if (multiple) {
				assertArrayEquals(new int[] { 2, 2 }, roll(state));
				assertEquals(2, actions(state).size()); performId(state, "block-reroll-die:1");
			}
			assertArrayEquals(multiple ? new int[] { 2, 3 } : new int[] { 3, 1 }, roll(state));
			assertFalse(actions(state).stream().anyMatch(action -> action.id.equals("block-reroll:brawler")));
		}
	}

	@Test void pendingProTestAndDieChoiceRecoverWithoutRepeatingTheTest() throws Exception {
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home, 2, "Pro"); state.getGame().getTurnData().setReRolls(1);
			TestRolls.on(state).general(1).block("bothdown", "skull");
			perform(state, "selectBlock"); perform(state, "block"); performId(state, "block-reroll:pro");
			state = recover(state);
			TestRolls.on(state).general(6); performId(state, "block-pro-test:team");
			state = recover(state);
			TestRolls.on(state).general(6).block("pushback"); performId(state, "block-reroll-die:1");
			assertArrayEquals(new int[] { 2, 3 }, roll(state)); assertEquals(1, queuedGeneral(state));
		}
	}

	@Test void uphillProBelongsToTheAttackerUntilRerollCompletesAndLegacyCommandsStillWork() throws Exception {
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home, 2, "Pro");
			state.getGame().getPlayerById("actor").setStrength(2);
			state.getGame().getPlayerById("opponent").setStrength(3);
			TestRolls.on(state).general(6).block("bothdown", "skull", "pushback");
			perform(state, "selectBlock"); perform(state, "block"); performId(state, "block-reroll:pro");
			assertTrue(actions(state).stream().allMatch(action -> action.role.equals(home ? "home" : "away")));
			performId(state, "block-reroll-die:1");
			assertTrue(actions(state).stream().allMatch(action -> action.role.equals(home ? "away" : "home")));
			GameState legacy = fixture(home, 2, "Pro");
			TestRolls.on(legacy).general(6).block("bothdown", "skull", "pushback");
			perform(legacy, "selectBlock"); perform(legacy, "block");
			legacy.handleCommand(new ReceivedCommand(new ClientCommandUseProReRollForBlock(1), home));
			assertArrayEquals(new int[] { 2, 3 }, roll(legacy));
		}
	}

	@Test void brawlerDoesNotAppearWithoutBothDownOrDuringABlitz() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean blitz : new boolean[] { true, false }) {
			GameState state = fixture(home, 2, "Brawler");
			TestRolls.on(state).block(blitz ? "bothdown" : "pow", "skull");
			perform(state, blitz ? "blitz" : "selectBlock");
			if (blitz) perform(state, "blitzTarget");
			perform(state, "block");
			assertFalse(actions(state).stream().anyMatch(action -> action.id.equals("block-reroll:brawler")));
		}
	}

	@Test void movementDodgeStillRerollsAutomaticallyBeforeAnyManualDecision() throws Exception {
		for (boolean home : new boolean[] { true, false }) {
			GameState state = genericFixture(home);
			((RosterPlayer) state.getGame().getPlayerById("actor")).addSkill(state.getGame().getRules().getSkillFactory().forName("Dodge"));
			state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("opponent"), new FieldCoordinate(11, 7));
			state.getGame().getFieldModel().setBallCoordinate(new FieldCoordinate(0, 0));
			TestRolls.on(state).general(1, 6, 6);
			perform(state, "select"); performId(state, "move-9-7");
			assertEquals(new FieldCoordinate(9, 7), state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("actor")));
			assertEquals(1, queuedGeneral(state));
			assertFalse(actions(state).stream().anyMatch(action -> action.kind.equals("reroll") || action.kind.equals("proTestReroll")));
			assertFalse(state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("actor")).hasUsedPro());
		}
	}

	@Test void exportNativeProTestAndDieChoiceBrowserJourneys() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] { true, false }) {
			GameState state = fixture(home, 2, "Pro"); state.getGame().getTurnData().setReRolls(1);
			TestRolls.on(state).general(1, 6).block("bothdown", "skull", "pushback");
			perform(state, "selectBlock"); perform(state, "block");
			String role = home ? "home" : "away";
			JsonArray frames = new JsonArray().add(evidence.snapshot(state, role));
			performId(state, "block-reroll:pro"); frames.add(evidence.snapshot(state, role));
			performId(state, "block-pro-test:team"); frames.add(evidence.snapshot(state, role));
			performId(state, "block-reroll-die:1"); frames.add(evidence.snapshot(state, role));
			journeys.add(new JsonObject().add("role", role).add("mode", "block").add("frames", frames));
			state = genericFixture(home);
			TestRolls.on(state).general(1, 1, 6, 6, 6);
			perform(state, "declarePass"); performId(state, "move-9-7");
			frames = new JsonArray().add(evidence.snapshot(state, role));
			performId(state, "reroll:pro"); frames.add(evidence.snapshot(state, role));
			performId(state, "pro-test:team"); frames.add(evidence.snapshot(state, role));
			journeys.add(new JsonObject().add("role", role).add("mode", "single").add("frames", frames));
		}
		Files.write(Paths.get("target", "manual-skill-rerolls.json"), journeys.toString().getBytes(StandardCharsets.UTF_8));
	}

	@Test void singleDieProTestRecoversAndCannotSpendAnUnofferedSourceOrRepeatPro() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean retry : new boolean[] { true, false }) {
			GameState state = genericFixture(home);
			TestRolls.on(state).general(1, 1);
			perform(state, "declarePass"); performId(state, "move-9-7");
			assertEquals(1, actions(state).stream().filter(action -> action.id.equals("reroll:pro")).count());
			performId(state, "reroll:pro");
			assertTrue(actions(state).stream().allMatch(action -> action.kind.equals("proTestReroll")));
			assertEquals(1, state.getGame().getTurnData().getReRolls());
			assertEquals(ReRolledActions.PICK_UP, ((AbstractStepWithReRoll) state.getCurrentStep()).getReRolledAction());
			JsonObject before = state.toJsonValue();
			state.handleCommand(new ReceivedCommand(new ClientCommandUseReRoll(ReRolledActions.SINGLE_DIE, ReRollSources.PRO), home));
			assertEquals(before, state.toJsonValue());
			state = recover(state);
			TestRolls.on(state).general(6, 6, 6, 6);
			performId(state, retry ? "pro-test:team" : "pro-test:none");
			assertEquals(retry ? 0 : 1, home ? state.getGame().getTurnDataHome().getReRolls() : state.getGame().getTurnDataAway().getReRolls());
			if (retry) {
				assertFalse(state.getGame().getFieldModel().isBallMoving());
				assertEquals(1, queuedGeneral(state), "Loner, Pro and the pickup each roll once after restore");
			}
		}
	}

	private GameState genericFixture(boolean home) throws Exception {
		GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(9, 7)
			.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 4, 3, 3, 9).skill("Pro").skill("Loner")))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(20, 7).stats(6, 3, 3, 4, 9))).build();
		state.getGame().setHomePlaying(home); state.getGame().getFieldModel().setBallMoving(true);
		state.getGame().getTurnData().setReRolls(1); StepEngine.start(state); return state;
	}

	private GameState recover(GameState original) {
		GameState restored = new GameState(original.getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
		restored.initFrom(original.getGame().getRules(), original.toJsonValue());
		restored.initCommandNrGenerator(original.getLastCommandNr());
		UtilSkillBehaviours.registerBehaviours(restored.getGame(), restored.getServer().getDebugLog());
		assertEquals(original.toJsonValue(), restored.toJsonValue());
		return restored;
	}
	private GameState fixture(boolean home, int dice, String skill) throws Exception {
		GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(0, 0)
			.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, dice == 1 ? 3 : dice == 2 ? 4 : 7, 3, 4, 9).skill(skill)))
			.withTeam(!home, team -> team.player("opponent", player -> player.at(11, 7).stats(6, 3, 3, 4, 9))).build();
		state.getGame().setHomePlaying(home); StepEngine.start(state); return state;
	}
	private int[] roll(GameState state) { return ((DialogBlockRollPropertiesParameter) state.getGame().getDialogParameter()).getBlockRoll(); }
	private int queuedGeneral(GameState state) { return state.getDiceRoller().getTestRolls().get("General").size(); }
	private List<Action> actions(GameState state) { List<Action> actions = new CorePromptActions(state).actions(); return actions.isEmpty() ? new CoreTurnActions(state).actions() : actions; }
	private void perform(GameState state, String kind) { evidence.perform(state, actions(state).stream().filter(action -> action.kind.equals(kind)).findFirst().orElseThrow(() -> new AssertionError("Missing " + kind))); }
	private void performId(GameState state, String id) { evidence.perform(state, actions(state).stream().filter(action -> action.id.equals(id)).findFirst().orElseThrow(() -> new AssertionError("Missing " + id))); }
}
