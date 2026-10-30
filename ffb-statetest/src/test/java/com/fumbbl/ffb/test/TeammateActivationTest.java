package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PassingDistance;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.factory.PassModifierFactory;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.mechanics.TtmMechanic;
import com.fumbbl.ffb.modifiers.PassContext;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.match.PassingProjection;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
class TeammateActivationTest {

	private final BrowserActionEvidence evidence = new BrowserActionEvidence();

	@Test void occupiedTeammateLandingTargetsRemainNativeLegalForEitherCoachAndAction() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
			GameState state = fixture(home, kicked, "", true);
			state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("opponent"), new FieldCoordinate(11, 7));
			TestRolls.on(state).general(6, 3, 3, 3, 6, 6, 6);
			perform(state, declaration(kicked));
			perform(state, selection(kicked));
			performId(state, (kicked ? "kick-mate-to-" : "throw-mate-") + "11-7");
			assertTrue(kicked ? state.getGame().getTurnData().isKtmUsed() : state.getGame().getTurnData().isTtmUsed());
			assertFalse(state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("mate")).getBase() == PlayerState.PICKED_UP);
		}
	}

	@Test void teammateFlightProjectsNativeReducedRangesAndDifficultyForBothActionsAndCoaches() throws Exception {
		for (Weather weather : new Weather[] { Weather.NICE, Weather.VERY_SUNNY, Weather.BLIZZARD }) {
			for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
				GameState state = fixture(home, kicked, "Strong Arm", true);
				state.getGame().getFieldModel().setWeather(weather);
				perform(state, declaration(kicked));
				assertNull(new PassingProjection().project(state.getGame()), "No flight guidance before a teammate is selected");
				perform(state, selection(kicked));
				JsonObject guidance = new PassingProjection().project(state.getGame());
				assertNotNull(guidance, "Selecting a teammate must expose its native targeting guidance");
				assertEquals(2, guidance.getInt("version", -1));
				assertEquals(landing(kicked), guidance.getString("action", null));
				PassMechanic pass = state.getGame().getMechanic(Mechanic.Type.PASS);
				TtmMechanic ttm = state.getGame().getMechanic(Mechanic.Type.TTM);
				PassModifierFactory modifiers = state.getGame().getFactory(FactoryType.Factory.PASS_MODIFIER);
				FieldCoordinate from = new FieldCoordinate(7, 7);
				for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
					PassingDistance distance = pass.findPassingDistance(state.getGame(), from, new FieldCoordinate(x, y), true);
					boolean available = distance != null && (x != 7 || y != 7);
					assertEquals(available ? distance.getShortcut() : '-', guidance.get("ranges").asArray().get(x).asString().charAt(y));
					if (!available) assertTrue(guidance.get("targets").asArray().get(x).asArray().get(y).isNull());
					else {
						assertTrue(distance == PassingDistance.QUICK_PASS || distance == PassingDistance.SHORT_PASS);
						PassContext context = new PassContext(state.getGame(), state.getGame().getActingPlayer().getPlayer(), distance, true);
						assertEquals(Math.max(2, ttm.minimumRoll(distance, modifiers.findModifiers(context))),
							guidance.get("targets").asArray().get(x).asArray().get(y).asInt());
					}
				}
			}
		}
	}

	@Test void applicableTraitsResolveOnDeclarationBeforeMovementForEitherCoachAndAction() throws Exception {
		for (String trait : new String[] { "Bone Head", "Really Stupid", "Take Root", "Unchannelled Fury", "Animal Savagery", "Bloodlust" }) {
			for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
				GameState state = fixture(home, kicked, trait, false);
				TestRolls.on(state).general(6, 6, 6);
				perform(state, declaration(kicked));
				assertEquals(2, queuedDice(state), trait + " must roll on declaration");
				assertTrue(actions(state).stream().anyMatch(action -> "move".equals(action.kind)), trait);
				assertFalse(actions(state).stream().anyMatch(action -> selection(kicked).equals(action.kind)));
				performId(state, "move-8-7");
				assertEquals(2, queuedDice(state), trait + " must not repeat while moving");
				perform(state, selection(kicked));
				assertEquals(2, queuedDice(state), trait + " must not repeat on teammate confirmation");
				assertEquals(PlayerState.PICKED_UP, state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("mate")).getBase());
				assertFalse(actions(state).stream().anyMatch(action -> "move".equals(action.kind)));
				assertTrue(actions(state).stream().anyMatch(action -> landing(kicked).equals(action.kind)));
			}
		}
	}

	@Test void failedBoneHeadInterruptsDeclarationAndRerollResumesBeforeMovement() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
			GameState state = fixture(home, kicked, "Bone Head", false);
			state.getGame().getTurnData().setReRolls(1);
			TestRolls.on(state).general(1, 6, 6);
			perform(state, declaration(kicked));
			assertTrue(actions(state).stream().anyMatch(action -> "reroll:team".equals(action.id)));
			assertFalse(actions(state).stream().anyMatch(action -> "move".equals(action.kind) || selection(kicked).equals(action.kind)));
			performId(state, "reroll:team");
			assertEquals(0, state.getGame().getTurnData().getReRolls());
			performId(state, "move-8-7");
			perform(state, selection(kicked));
			assertEquals(1, queuedDice(state));
		}
	}

	@Test void takeRootFailureRetainsLegalStationaryTeammateAction() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
			GameState state = fixture(home, kicked, "Take Root", true);
			state.getGame().getTurnData().setReRolls(0);
			TestRolls.on(state).general(1, 6, 3, 3, 3, 6, 6, 6);
			perform(state, declaration(kicked));
			assertTrue(state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("actor")).isRooted());
			assertFalse(actions(state).stream().anyMatch(action -> "move".equals(action.kind)));
			assertTrue(actions(state).stream().anyMatch(action -> "endAction".equals(action.kind)));
			perform(state, selection(kicked));
			assertEquals(PlayerState.PICKED_UP, state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("mate")).getBase());
			performId(state, (kicked ? "kick-mate-to-" : "throw-mate-") + "11-7");
			assertFalse(state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("mate")).getBase() == PlayerState.PICKED_UP);
			assertEquals(new FieldCoordinate(7, 7), state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("actor")));
		}
	}

	@Test void stationarySelectionEndsMovementAndOnlyOffersNativeLandingRange() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
			GameState state = fixture(home, kicked, "", true);
			TestRolls.on(state).general(6, 3, 3, 3, 6, 6, 6);
			perform(state, declaration(kicked));
			perform(state, selection(kicked));
			assertFalse(actions(state).stream().anyMatch(action -> "move".equals(action.kind)));
			assertFalse(actions(state).stream().anyMatch(action -> ((kicked ? "kick-mate-to-" : "throw-mate-") + "25-14").equals(action.id)));
			performId(state, (kicked ? "kick-mate-to-" : "throw-mate-") + "11-7");
			assertTrue(kicked ? state.getGame().getTurnData().isKtmUsed() : state.getGame().getTurnData().isTtmUsed());
			assertFalse(state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("mate")).getBase() == PlayerState.PICKED_UP);
		}
	}

	@Test void pendingTraitCheckpointResumesWithoutRepeatingTheOriginalCheck() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
			GameState original = fixture(home, kicked, "Bone Head", false);
			original.getGame().getTurnData().setReRolls(1);
			TestRolls.on(original).general(1);
			perform(original, declaration(kicked));
			GameState restored = new GameState(original.getServer());
			restored.initFrom(original.getGame().getRules(), original.toJsonValue());
			UtilSkillBehaviours.registerBehaviours(restored.getGame(), restored.getServer().getDebugLog());
			assertEquals(original.toJsonValue(), restored.toJsonValue());
			assertTrue(actions(restored).stream().anyMatch(action -> "reroll:team".equals(action.id)));
			TestRolls.on(restored).general(6, 6);
			performId(restored, "reroll:team");
			performId(restored, "move-8-7"); perform(restored, selection(kicked));
			assertEquals(1, queuedDice(restored));
		}
	}

	@Test void alwaysHungryRemainsALaterNativeCheck() throws Exception {
		for (boolean home : new boolean[] { true, false }) for (boolean kicked : new boolean[] { false, true }) {
			GameState state = fixture(home, kicked, "Always Hungry", true);
			TestRolls.on(state).general(6, 6, 6, 6, 6, 6, 6, 6, 6, 6);
			perform(state, declaration(kicked));
			assertEquals(10, queuedDice(state));
			perform(state, selection(kicked));
			assertEquals(10, queuedDice(state));
			performId(state, (kicked ? "kick-mate-to-" : "throw-mate-") + "11-7");
			assertTrue(state.getGameLog().toJsonValue().toString().contains("alwaysHungryRoll"));
		}
	}

	private GameState fixture(boolean home, boolean kicked, String trait, boolean adjacent) throws Exception {
		GameState state = new GameState(new TestServer().getServer());
		new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(0, 0)
			.withTeam(home, team -> {
				team.player("actor", player -> {
					player.at(7, 7).stats(6, 5, 3, 4, 9).skill(kicked ? "Kick Team-Mate" : "Throw Team-mate");
					if (!trait.isEmpty()) player.skill(trait);
				});
				team.player("mate", player -> player.at(adjacent ? 8 : 9, 7).stats(6, 2, 3, 4, 8).skill("Right Stuff"));
			})
			.withTeam(!home, team -> team.player("opponent", player -> player.at(20, 12).stats(6, 3, 3, 4, 9))).build();
		state.getGame().setHomePlaying(home);
		StepEngine.start(state);
		return state;
	}

	private String declaration(boolean kicked) { return kicked ? "declareKickTeamMate" : "declareThrowTeamMate"; }
	private String selection(boolean kicked) { return kicked ? "kickMate" : "liftTeamMate"; }
	private String landing(boolean kicked) { return kicked ? "kickMateTo" : "throwTeamMate"; }
	private int queuedDice(GameState state) { return state.getDiceRoller().getTestRolls().values().stream().mapToInt(List::size).sum(); }
	private List<Action> actions(GameState state) {
		List<Action> choices = new CorePromptActions(state).actions();
		return choices.isEmpty() ? new CoreTurnActions(state).actions() : choices;
	}
	private void perform(GameState state, String kind) {
		evidence.perform(state, actions(state).stream().filter(action -> kind.equals(action.kind)).findFirst()
			.orElseThrow(() -> new AssertionError("Missing " + kind + " at " + state.getCurrentStep().getId())));
	}
	private void performId(GameState state, String id) {
		evidence.perform(state, actions(state).stream().filter(action -> id.equals(action.id)).findFirst()
			.orElseThrow(() -> new AssertionError("Missing " + id + " at " + state.getCurrentStep().getId()
				+ " action=" + state.getGame().getActingPlayer().getPlayerAction() + " state="
				+ state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("actor"))
				+ " remaining=" + queuedDice(state) + " choices=" + actions(state).stream().map(action -> action.id).collect(java.util.stream.Collectors.joining(",")))));
	}
}
