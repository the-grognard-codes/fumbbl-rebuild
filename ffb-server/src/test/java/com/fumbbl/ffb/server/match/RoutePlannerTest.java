package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
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
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.PrayerState;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
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
		when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(5, 5));
		when(player.getMovementWithModifiers()).thenReturn(6);
		when(player.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.emptySet());
		when(player.getId()).thenReturn("runner");
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
		when(field.findAdjacentCoordinates(any(FieldCoordinate.class), eq(FieldCoordinateBounds.FIELD), eq(1), eq(false)))
			.thenAnswer(invocation -> {
				FieldCoordinate center = invocation.getArgument(0);
				return Arrays.stream(new int[][] { {-1,-1}, {-1,0}, {-1,1}, {0,-1}, {0,1}, {1,-1}, {1,0}, {1,1} })
					.map(offset -> center.add(offset[0], offset[1]))
					.filter(FieldCoordinateBounds.FIELD::isInBounds).toArray(FieldCoordinate[]::new);
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
}
