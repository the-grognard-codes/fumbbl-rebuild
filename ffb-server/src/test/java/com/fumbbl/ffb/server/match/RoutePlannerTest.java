package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.MechanicsFactory;
import com.fumbbl.ffb.factory.common.GoForItModifierFactory;
import com.fumbbl.ffb.mechanics.AgilityMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.GameRules;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.PrayerState;
import com.fumbbl.ffb.util.ArrayTool;
import com.fumbbl.ffb.util.pathfinding.PathFinderWithPassBlockSupport;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RoutePlannerTest {
	private final GameState state = mock(GameState.class);
	private final Game game = mock(Game.class);
	private final FieldModel field = mock(FieldModel.class);
	private final ActingPlayer acting = mock(ActingPlayer.class);
	private final Player<?> player = mock(Player.class);

	private RoutePlanner planner() {
		Team home = mock(Team.class), away = mock(Team.class);
		GameRules rules = mock(GameRules.class);
		MechanicsFactory mechanics = mock(MechanicsFactory.class);
		GoForItModifierFactory rushModifiers = mock(GoForItModifierFactory.class);
		PrayerState prayers = mock(PrayerState.class);
		when(state.getGame()).thenReturn(game);
		when(game.getActingPlayer()).thenReturn(acting);
		doReturn(player).when(acting).getPlayer();
		when(game.getFieldModel()).thenReturn(field);
		when(field.getPlayerState(player)).thenReturn(new PlayerState(PlayerState.STANDING));
		when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(5, 5));
		when(player.getMovementWithModifiers()).thenReturn(6);
		when(player.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.emptySet());
		when(player.getId()).thenReturn("runner");
		doReturn(player).when(game).getPlayerById("runner");
		doReturn(home).when(player).getTeam();
		when(game.getTeamHome()).thenReturn(home);
		when(game.getTeamAway()).thenReturn(away);
		when(game.getRules()).thenReturn(rules);
		when(state.getPrayerState()).thenReturn(prayers);
		when(prayers.getMolesUnderThePitch()).thenReturn(Collections.emptySet());
		when(game.getFactory(FactoryType.Factory.GO_FOR_IT_MODIFIER)).thenReturn(rushModifiers);
		when(rushModifiers.findModifiers(any())).thenReturn(Collections.emptySet());
		when(rules.getFactory(FactoryType.Factory.MECHANIC)).thenReturn(mechanics);
		when(mechanics.forName(Mechanic.Type.AGILITY.name())).thenReturn(mock(AgilityMechanic.class));
		when(field.findAdjacentCoordinates(any(FieldCoordinate.class), eq(FieldCoordinateBounds.FIELD), anyInt(), eq(false)))
			.thenAnswer(invocation -> {
				FieldCoordinate center = invocation.getArgument(0);
				int radius = invocation.getArgument(2);
				List<FieldCoordinate> adjacent = new ArrayList<>();
				for (int y = -radius; y <= radius; y++) for (int x = -radius; x <= radius; x++) {
					FieldCoordinate square = center.add(x, y);
					if ((x != 0 || y != 0) && FieldCoordinateBounds.FIELD.isInBounds(square)) adjacent.add(square);
				}
				return adjacent.toArray(new FieldCoordinate[0]);
			});
		return new RoutePlanner(state);
	}

	@Test void threeWaypointsProduceSixConfirmedSquaresWithoutSpendingAnyMovement() {
		RoutePlanner planner = planner();
		JsonObject route = planner.preview(Arrays.asList(new FieldCoordinate(6, 6),
			new FieldCoordinate(6, 7), new FieldCoordinate(10, 7)));
		JsonArray steps = route.get("steps").asArray();
		assertEquals(6, steps.size());
		assertEquals(6, steps.get(0).asObject().getInt("x", -1));
		assertEquals(6, steps.get(0).asObject().getInt("y", -1));
		assertEquals(6, steps.get(1).asObject().getInt("x", -1));
		assertEquals(7, steps.get(1).asObject().getInt("y", -1));
		assertEquals(10, steps.get(5).asObject().getInt("x", -1));
		assertEquals(7, steps.get(5).asObject().getInt("y", -1));
		assertEquals(8, route.getInt("remaining", -1));
	}

	@Test void occupiedWaypointAndExhaustedAllowanceAreRejected() {
		RoutePlanner planner = planner();
		Player<?> blocker = mock(Player.class);
		doReturn(blocker).when(field).getPlayer(new FieldCoordinate(6, 5));
		assertEquals("INVALID_ROUTE", assertThrows(MatchService.Failure.class,
			() -> planner.preview(Collections.singletonList(new FieldCoordinate(6, 5)))).code);
		assertEquals("NO_ROUTE", assertThrows(MatchService.Failure.class,
			() -> planner.preview(Collections.singletonList(new FieldCoordinate(25, 14)))).code);
	}

	@Test void selectedPlayerRangeUsesFullAllowanceWithoutChangingTheNativeActor() {
		planner();
		Player<?> inspected = mock(Player.class);
		when(inspected.getId()).thenReturn("inspected");
		doReturn(inspected).when(game).getPlayerById("inspected");
		when(inspected.getMovementWithModifiers()).thenReturn(2);
		when(inspected.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.emptySet());
		doReturn(player.getTeam()).when(inspected).getTeam();
		when(field.getPlayerCoordinate(inspected)).thenReturn(new FieldCoordinate(10, 5));
		when(field.getPlayerState(inspected)).thenReturn(new PlayerState(PlayerState.STANDING));
		JsonObject range = new RoutePlanner(state, inspected, true).range();
		assertEquals("inspected", range.getString("playerId", ""));
		assertEquals(4, range.getInt("remaining", -1));
		assertEquals(2, range.getInt("normalRemaining", -1));
		assertTrue(range.get("full").asArray().size() > range.get("normal").asArray().size());
		assertFalse(range.get("full").asArray().toString().contains("\"x\":10,\"y\":5"));
		assertEquals(player, game.getActingPlayer().getPlayer());
	}

	@Test void proneRangeDeductsStandingCostUnlessJumpUpIsPresent() {
		planner();
		when(field.getPlayerState(player)).thenReturn(new PlayerState(PlayerState.PRONE));
		assertEquals(5, new RoutePlanner(state, player, true).range().getInt("remaining", -1));
		when(player.hasSkillProperty(com.fumbbl.ffb.model.property.NamedProperties.canStandUpForFree)).thenReturn(true);
		assertEquals(8, new RoutePlanner(state, player, true).range().getInt("remaining", -1));
		assertEquals(8, new RoutePlanner(state, player, false).range().getInt("remaining", -1));
		when(player.hasSkillProperty(com.fumbbl.ffb.model.property.NamedProperties.canStandUpForFree)).thenReturn(false);
		assertEquals(5, new RoutePlanner(state, player, false).range().getInt("remaining", -1));
	}

	@Test void kickoffReturnHasThreePointsAndStaysInActingTeamsHalf() {
		planner();
		when(game.getTurnMode()).thenReturn(TurnMode.KICKOFF_RETURN);
		when(game.isHomePlaying()).thenReturn(true);
		when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(12, 5));
		JsonObject range = RoutePlanner.forRange(state, player, false).range();
		assertEquals(3, range.getInt("remaining", -1));
		assertEquals(3, range.getInt("normalRemaining", -1));
		assertEquals(range.get("normal").toString(), range.get("full").toString());
		assertTrue(contains(range.get("full").asArray(), 9, 5));
		assertFalse(contains(range.get("full").asArray(), 13, 5));
		when(game.isHomePlaying()).thenReturn(false);
		when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(13, 5));
		JsonObject away = RoutePlanner.forRange(state, player, false).range();
		assertTrue(contains(away.get("full").asArray(), 16, 5));
		assertFalse(contains(away.get("full").asArray(), 12, 5));
	}

	@Test void passBlockHasThreePointsAndLegacyRulesRequireAValidEnd() {
		planner();
		when(game.getTurnMode()).thenReturn(TurnMode.PASS_BLOCK);
		when(acting.getCurrentMove()).thenReturn(1);
		when(player.hasSkillProperty(NamedProperties.canMoveWhenOpponentPasses)).thenReturn(true);
		when(field.getOnPitchEnhancements()).thenReturn(Collections.emptySet());
		when(field.getPlayerCoordinates()).thenReturn(new FieldCoordinate[0]);
		when(game.getMechanic(Mechanic.Type.ON_THE_BALL))
			.thenReturn(new com.fumbbl.ffb.mechanics.mixed.OnTheBallMechanic());
		JsonObject mixed = RoutePlanner.forRange(state, player, false).range();
		assertEquals(2, mixed.getInt("remaining", -1));
		assertEquals(mixed.get("normal").toString(), mixed.get("full").toString());
		assertTrue(contains(mixed.get("full").asArray(), 7, 5));
		assertFalse(contains(mixed.get("full").asArray(), 8, 5));
		when(game.getMechanic(Mechanic.Type.ON_THE_BALL))
			.thenReturn(new com.fumbbl.ffb.mechanics.bb2016.OnTheBallMechanic());
		JsonObject legacy = RoutePlanner.forRange(state, player, false).range();
		assertEquals(0, legacy.get("full").asArray().size());
		Player<?> thrower = mock(Player.class);
		doReturn(thrower).when(game).getThrower();
		when(game.getPassCoordinate()).thenReturn(new FieldCoordinate(20, 5));
		when(game.getThrowerAction()).thenReturn(PlayerAction.HAIL_MARY_PASS);
		when(field.getPlayerCoordinate(thrower)).thenReturn(new FieldCoordinate(8, 5));
		JsonObject reachable = RoutePlanner.forRange(state, player, false).range();
		assertTrue(contains(reachable.get("full").asArray(), 6, 5));
		assertTrue(contains(reachable.get("full").asArray(), 7, 5));
		assertFalse(contains(reachable.get("full").asArray(), 4, 5));
		assertEquals(8, RoutePlanner.forRange(state, player, true).range().getInt("remaining", -1));
	}

	@Test void lowMovementPronePlayerCanUseNativeRushAllowanceAfterStanding() {
		planner();
		when(player.getMovementWithModifiers()).thenReturn(2);
		when(field.getPlayerState(player)).thenReturn(new PlayerState(PlayerState.PRONE));
		JsonObject range = new RoutePlanner(state, player, true).range();
		assertEquals(2, range.getInt("remaining", -1));
		assertEquals(0, range.getInt("normalRemaining", -1));
		assertEquals(0, range.get("normal").asArray().size());
		assertTrue(range.get("full").asArray().size() > 8);
	}

	@Test void rangeSeparatesNormalAndRushDestinationsAroundOccupiedSquares() {
		planner();
		when(player.getMovementWithModifiers()).thenReturn(2);
		Player<?> blocker = mock(Player.class);
		for (int y = 4; y <= 6; y++) doReturn(blocker).when(field).getPlayer(new FieldCoordinate(6, y));
		JsonObject range = new RoutePlanner(state, player, true).range();
		assertEquals(2, range.getInt("rangeVersion", -1));
		assertFalse(contains(range.get("normal").asArray(), 7, 5));
		assertTrue(contains(range.get("full").asArray(), 7, 5));
		assertFalse(contains(range.get("full").asArray(), 6, 5));
		assertFalse(range.names().contains("steps"));
	}

	@Test void rangeUsesWalkingDetourEvenWhenJumpOverPronePlayerIsLegal() {
		planner();
		when(player.getMovementWithModifiers()).thenReturn(2);
		Player<?> blocker = mock(Player.class);
		for (int y = 4; y <= 6; y++) doReturn(blocker).when(field).getPlayer(new FieldCoordinate(6, y));
		when(field.getPlayerState(blocker)).thenReturn(new PlayerState(PlayerState.PRONE));
		com.fumbbl.ffb.mechanics.bb2025.JumpMechanic jump = new com.fumbbl.ffb.mechanics.bb2025.JumpMechanic();
		when(game.getMechanic(Mechanic.Type.JUMP)).thenReturn(jump);
		assertTrue(jump.isValidJump(game, player, new FieldCoordinate(5, 5), new FieldCoordinate(7, 5)));
		when(acting.isJumping()).thenReturn(true);
		for (boolean nextTurn : new boolean[] { false, true }) {
			JsonObject range = RoutePlanner.forRange(state, player, nextTurn).range();
			assertFalse(contains(range.get("normal").asArray(), 7, 5));
			assertTrue(contains(range.get("full").asArray(), 7, 5));
			assertFalse(contains(range.get("full").asArray(), 6, 5));
		}
	}

	@Test void leapAndPogoDoNotExtendRangeBeyondAnOccupiedSurroundingRing() {
		planner();
		Player<?> blocker = mock(Player.class);
		for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++)
			if (x != 0 || y != 0) doReturn(blocker).when(field).getPlayer(new FieldCoordinate(5 + x, 5 + y));
		when(field.getPlayerState(blocker)).thenReturn(new PlayerState(PlayerState.STANDING));
		com.fumbbl.ffb.mechanics.bb2025.JumpMechanic jump = new com.fumbbl.ffb.mechanics.bb2025.JumpMechanic();
		when(game.getMechanic(Mechanic.Type.JUMP)).thenReturn(jump);
		for (Skill skill : Arrays.asList(new com.fumbbl.ffb.skill.bb2025.Leap(), new com.fumbbl.ffb.skill.bb2025.Pogo())) {
			skill.postConstruct();
			when(player.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.singleton(skill));
			when(player.hasSkillProperty(NamedProperties.canLeap)).thenReturn(skill.hasSkillProperty(NamedProperties.canLeap));
			when(player.hasSkillProperty(NamedProperties.ignoreTacklezonesWhenJumping))
				.thenReturn(skill.hasSkillProperty(NamedProperties.ignoreTacklezonesWhenJumping));
			assertTrue(jump.isValidJump(game, player, new FieldCoordinate(5, 5), new FieldCoordinate(7, 5)));
			for (boolean nextTurn : new boolean[] { false, true }) {
				JsonObject range = RoutePlanner.forRange(state, player, nextTurn).range();
				assertEquals(0, range.get("normal").asArray().size(), skill.getName());
				assertEquals(0, range.get("full").asArray().size(), skill.getName());
			}
		}
	}

	@Test void legacyPassBlockDoesNotIncludeStepsWhoseContinuationRequiresLeap() {
		planner();
		when(game.getTurnMode()).thenReturn(TurnMode.PASS_BLOCK);
		when(player.hasSkillProperty(NamedProperties.canMoveWhenOpponentPasses)).thenReturn(true);
		Skill leap = new com.fumbbl.ffb.skill.bb2016.Leap();
		leap.postConstruct();
		when(player.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.singleton(leap));
		when(player.hasSkillProperty(NamedProperties.canLeap)).thenReturn(true);
		when(game.getMechanic(Mechanic.Type.JUMP)).thenReturn(new com.fumbbl.ffb.mechanics.bb2016.JumpMechanic());
		when(game.getMechanic(Mechanic.Type.ON_THE_BALL)).thenReturn(new com.fumbbl.ffb.mechanics.bb2016.OnTheBallMechanic());
		when(field.getOnPitchEnhancements()).thenReturn(Collections.emptySet());
		Player<?> blocker = mock(Player.class), thrower = mock(Player.class);
		List<FieldCoordinate> occupied = new ArrayList<>();
		for (int y = 3; y <= 7; y++) {
			FieldCoordinate square = new FieldCoordinate(6, y);
			occupied.add(square);
			doReturn(blocker).when(field).getPlayer(square);
		}
		when(field.getPlayerCoordinates()).thenReturn(occupied.toArray(new FieldCoordinate[0]));
		doReturn(thrower).when(game).getThrower();
		when(field.getPlayerCoordinate(thrower)).thenReturn(new FieldCoordinate(8, 5));
		when(game.getPassCoordinate()).thenReturn(new FieldCoordinate(20, 5));
		when(game.getThrowerAction()).thenReturn(PlayerAction.HAIL_MARY_PASS);
		Set<FieldCoordinate> ends = Collections.singleton(new FieldCoordinate(7, 5));
		assertTrue(ArrayTool.isProvided(PathFinderWithPassBlockSupport.INSTANCE
			.allowPassBlockMove(game, player, new FieldCoordinate(5, 4), 2, true, ends)));
		JsonObject range = RoutePlanner.forRange(state, player, false).range();
		assertEquals(0, range.get("normal").asArray().size());
		assertEquals(0, range.get("full").asArray().size());
	}

	@Test void spentMovementLeavesOnlyRushDestinationsAndNextTurnResetsIt() {
		planner();
		when(acting.getCurrentMove()).thenReturn(6);
		JsonObject current = new RoutePlanner(state, player, false).range();
		assertEquals(0, current.getInt("normalRemaining", -1));
		assertEquals(2, current.getInt("remaining", -1));
		assertEquals(0, current.get("normal").asArray().size());
		assertTrue(current.get("full").asArray().size() > 0);
		JsonObject nextTurn = new RoutePlanner(state, player, true).range();
		assertEquals(6, nextTurn.getInt("normalRemaining", -1));
		assertEquals(8, nextTurn.getInt("remaining", -1));
		assertEquals(6, acting.getCurrentMove());
	}

	@Test void sprintAndUnusedExtraRushSkillExtendNativeFullAllowance() {
		planner();
		Skill extraRush = mock(Skill.class);
		when(extraRush.hasSkillProperty(NamedProperties.canMakeAnExtraGfiOnce)).thenReturn(true);
		when(player.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.singleton(extraRush));
		when(player.hasSkillProperty(NamedProperties.canMakeAnExtraGfi)).thenReturn(true);
		assertEquals(10, new RoutePlanner(state, player, false).range().getInt("remaining", -1));
		when(acting.isSkillUsed(extraRush)).thenReturn(true);
		assertEquals(9, new RoutePlanner(state, player, false).range().getInt("remaining", -1));
	}

	private boolean contains(JsonArray squares, int x, int y) {
		for (com.eclipsesource.json.JsonValue value : squares)
			if (value.asObject().getInt("x", -1) == x && value.asObject().getInt("y", -1) == y) return true;
		return false;
	}

	@Test void blitzApproachReservesOneNativeMovementForTheBlock() {
		planner();
		when(player.getMovementWithModifiers()).thenReturn(2);
		RoutePlanner selected = new RoutePlanner(state, player, true);
		assertEquals(3, selected.blitzApproachSteps());
		assertTrue(selected.approach(new FieldCoordinate(9, 5)).isAdjacent(new FieldCoordinate(9, 5)));
		assertEquals("NO_ROUTE", assertThrows(MatchService.Failure.class,
			() -> selected.approach(new FieldCoordinate(10, 5))).code);
	}
}
