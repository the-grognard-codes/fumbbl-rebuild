package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.server.DiceRoller;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;

class JumpPlanningTest {

	@Test void firstSquareAndMixedJumpPlansAreReadOnlyAndChargeTwoMovement() throws Exception {
		Fixture fixture = new Fixture();
		fixture.place(fixture.opponent, 8, 7, PlayerState.PRONE);
		String before = fixture.session.recoveryArtifact();
		JsonObject initial = fixture.plan(new JsonArray());
		assertTrue(initial.get("jumpOptions").asArray().values().stream().anyMatch(value -> value.asObject().getInt("x", 0) == 9));
		JsonObject plan = fixture.plan(new JsonArray().add(point(9, 7).add("jump", true)).add(point(10, 7)));
		JsonObject route = plan.get("route").asObject();
		assertEquals(4, route.getInt("routeVersion", 0));
		assertEquals(2, route.get("steps").asArray().size());
		assertTrue(route.get("steps").asArray().get(0).asObject().get("checks").toString().contains("Jump"));
		assertEquals(fixture.player.getMovementWithModifiers() - 1, plan.get("range").asObject().getInt("remaining", -1));
		assertEquals(before, fixture.session.recoveryArtifact());
		assertEquals(3, fixture.plan(new JsonArray().add(point(7, 8))).get("route").asObject().getInt("routeVersion", 0));
	}

	@Test void leapReducesNativePenaltyAndPogoCancelsTailAndDivingTackleButNotTentacles() throws Exception {
		for (String skill : new String[] {"Leap", "Pogo"}) {
			Fixture fixture = new Fixture();
			fixture.skill(fixture.player, skill);
			fixture.place(fixture.opponent, 6, 7, PlayerState.STANDING);
			fixture.skill(fixture.opponent, "Diving Tackle");
			fixture.skill(fixture.opponent, "Prehensile Tail");
			fixture.skill(fixture.opponent, "Tentacles");
			fixture.skill(fixture.opponent, "Shadowing");
			JsonObject jump = fixture.plan(new JsonArray().add(point(9, 7).add("jump", true)))
				.get("route").asObject().get("steps").asArray().get(0).asObject();
			assertFalse(jump.get("reactions").toString().contains("Shadowing"));
			assertTrue(jump.get("reactions").toString().contains("Tentacles"));
			assertEquals(!"Pogo".equals(skill), jump.get("reactions").toString().contains("Diving Tackle"));
			assertEquals(!"Pogo".equals(skill), jump.get("reactions").toString().contains("Prehensile Tail"));
			assertEquals("Pogo".equals(skill) ? 0 : -1, jump.getInt("dodgeModifier", 99));
		}
	}

	@Test void invalidJumpAndExhaustedMovementAreRejectedWithoutMutation() throws Exception {
		Fixture fixture = new Fixture();
		String before = fixture.session.recoveryArtifact();
		assertThrows(MatchService.Failure.class, () -> fixture.plan(new JsonArray().add(point(9, 7).add("jump", true))));
		assertEquals(before, fixture.session.recoveryArtifact());
		fixture.skill(fixture.player, "Leap");
		assertThrows(MatchService.Failure.class, () -> fixture.plan(new JsonArray().add(point(8, 7).add("jump", true))));
		fixture.place(fixture.opponent, 9, 7, PlayerState.STANDING);
		assertThrows(MatchService.Failure.class, () -> fixture.plan(new JsonArray().add(point(9, 7).add("jump", true))));
		assertThrows(IllegalArgumentException.class, () -> new MovementWaypoint(point(9, 7).add("jump", false)));
		assertThrows(IllegalArgumentException.class, () -> new MovementWaypoint(point(9, 7).add("surprise", true)));
	}

	@Test void explicitFirstJumpExecutesThroughTheNativeSequenceAndWalkingCanContinue() throws Exception {
		Fixture fixture = new Fixture();
		fixture.skill(fixture.player, "Pogo");
		fixture.dice(6);
		JsonObject plan = fixture.plan(new JsonArray().add(point(9, 7).add("jump", true)).add(point(10, 7)));
		JsonObject response = fixture.session.apply(fixture.role, fixture.base.request("movement", "jump-route", fixture.view())
			.add("playerId", fixture.player.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
			.add("waypoints", plan.get("waypoints")));
		assertEquals("ACCEPTED", response.getString("code", null));
		// The native position and movement cost prove this was not flattened into an adjacent walk.
		assertEquals(new FieldCoordinate(10, 7), fixture.game.getFieldModel().getPlayerCoordinate(fixture.player));
		assertEquals(3, fixture.game.getActingPlayer().getCurrentMove());
		assertFalse(fixture.session.spectatorView().names().contains("pendingRoute"));
		SetupSession restored = new SetupSession(fixture.base.server, fixture.base.document, fixture.session.recoveryArtifact());
		assertEquals(fixture.view().get("activePlayerId"), restored.reply("load", "ACCEPTED", false, fixture.role).get("state").asObject().get("activePlayerId"));
	}

	@Test void pendingJumpRetainsItsIdentityAcrossRerollAndCheckpointRecovery() throws Exception {
		Fixture fixture = new Fixture();
		fixture.skill(fixture.player, "Pogo");
		fixture.dice(1);
		JsonObject plan = fixture.plan(new JsonArray().add(point(9, 7).add("jump", true)).add(point(10, 7)));
		fixture.session.apply(fixture.role, fixture.base.request("movement", "interrupted-jump", fixture.view())
			.add("playerId", fixture.player.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL).add("waypoints", plan.get("waypoints")));
		String checkpoint = fixture.session.recoveryArtifact();
		assertTrue(checkpoint.contains("\"jump\":true"));
		SetupSession restored = new SetupSession(fixture.base.server, fixture.base.document, checkpoint);
		fixture.dice(restored, 6);
		JsonObject ready = restored.reply("load", "ACCEPTED", false, fixture.role).get("state").asObject();
		JsonObject reroll = ready.get("actions").asArray().values().stream().map(JsonValue::asObject)
			.filter(action -> action.getString("id", "").endsWith("reroll:team")).findFirst().orElseThrow(() -> new AssertionError(ready.get("actions").toString()));
		JsonObject request = fixture.base.request("action", "resume-jump", ready).add("actionId", reroll.get("id"));
		assertEquals("ACCEPTED", restored.apply(fixture.role, request).getString("code", null));
		assertTrue(restored.apply(fixture.role, request).getBoolean("duplicate", false));
		JsonObject player = fixture.base.player(restored.reply("load", "ACCEPTED", false, fixture.role).get("state").asObject(), fixture.player.getId());
		assertEquals(10, player.getInt("x", -1));
		assertEquals(7, player.getInt("y", -1));
	}

	@Test void separateExplicitJumpsCanExecuteDuringOneActivation() throws Exception {
		Fixture fixture = new Fixture();
		fixture.skill(fixture.player, "Pogo");
		fixture.dice(6);
		JsonObject plan = fixture.plan(new JsonArray().add(point(9, 7).add("jump", true))
			.add(point(11, 7).add("jump", true)));
		assertEquals("ACCEPTED", fixture.session.apply(fixture.role,
			fixture.base.request("movement", "two-jumps", fixture.view())
				.add("playerId", fixture.player.getId()).add("kind", "move")
				.add("targetPlayerId", JsonValue.NULL).add("waypoints", plan.get("waypoints")))
			.getString("code", null));
		assertEquals(new FieldCoordinate(11, 7), fixture.game.getFieldModel().getPlayerCoordinate(fixture.player));
		assertEquals(4, fixture.game.getActingPlayer().getCurrentMove());
		verify(fixture.state().getDiceRoller(), times(2)).rollSkill();
	}

	@Test void walkingToAnObstacleEnablesAJumpAtThePlannedEndpoint() throws Exception {
		Fixture fixture = new Fixture(); fixture.dice(6);
		fixture.place(fixture.opponent, 9, 7, PlayerState.PRONE);
		assertEquals(0, fixture.plan(new JsonArray()).get("jumpOptions").asArray().size());
		JsonObject approach = fixture.plan(new JsonArray().add(point(8,7)));
		assertTrue(approach.get("jumpOptions").asArray().values().stream().anyMatch(value -> value.asObject().getInt("x",0)==10 && value.asObject().getInt("y",0)==7));
		JsonObject plan = fixture.plan(new JsonArray().add(point(8,7)).add(point(10,7).add("jump",true)));
		assertEquals("ACCEPTED", fixture.session.apply(fixture.role, fixture.base.request("movement","walk-jump",fixture.view())
			.add("playerId",fixture.player.getId()).add("kind","move").add("targetPlayerId",JsonValue.NULL).add("waypoints",plan.get("waypoints"))).getString("code",null));
		assertEquals(new FieldCoordinate(10,7),fixture.game.getFieldModel().getPlayerCoordinate(fixture.player));
		assertEquals(3,fixture.game.getActingPlayer().getCurrentMove());
	}

	@Test void jumpCanPrecedeAnImplicitBlitzOrFoul() throws Exception {
		for (String kind : new String[] {"blitz","foul"}) {
			Fixture fixture = new Fixture(); fixture.skill(fixture.player,"Pogo");fixture.dice(6);
			fixture.place(fixture.opponent,11,7,"blitz".equals(kind) ? PlayerState.STANDING : PlayerState.PRONE);
			JsonObject plan = fixture.session.movementPreview(fixture.role,fixture.view().getInt("revision",-1),fixture.player.getId(),kind,fixture.opponent.getId(),new JsonArray().add(point(9,7).add("jump",true)));
			assertEquals("ACCEPTED",fixture.session.apply(fixture.role,fixture.base.request("movement",kind+"-jump",fixture.view()).add("playerId",fixture.player.getId()).add("kind",kind).add("targetPlayerId",fixture.opponent.getId()).add("waypoints",plan.get("waypoints"))).getString("code",null));
			assertTrue("blitz".equals(kind) ? fixture.game.getTurnData().isBlitzUsed() : fixture.game.getTurnData().isFoulUsed());
		}
	}

	@Test void jumpBeyondNormalAllowancePerformsTwoNativeRushRolls() throws Exception {
		Fixture fixture = new Fixture();fixture.skill(fixture.player,"Pogo");fixture.dice(6);
		JsonObject select = fixture.view().get("actions").asArray().values().stream().map(JsonValue::asObject)
			.filter(action -> "select".equals(action.getString("kind",null)) && fixture.player.getId().equals(action.getString("sourcePlayerId",null))).findFirst().get();
		fixture.session.apply(fixture.role,fixture.base.request("action","activate-rusher",fixture.view()).add("actionId",select.get("id")));
		fixture.game.getActingPlayer().setCurrentMove(fixture.player.getMovementWithModifiers());
		fixture.game.getActingPlayer().setGoingForIt(true);
		com.fumbbl.ffb.server.util.UtilServerPlayerMove.updateMoveSquares(fixture.state(),false);
		JsonObject plan = fixture.plan(new JsonArray().add(point(9,7).add("jump",true)));
		assertTrue(plan.get("route").asObject().get("steps").asArray().get(0).asObject().getInt("rush",0)>0);
		fixture.session.apply(fixture.role,fixture.base.request("movement","double-rush-jump",fixture.view()).add("playerId",fixture.player.getId()).add("kind","move").add("targetPlayerId",JsonValue.NULL).add("waypoints",plan.get("waypoints")));
		verify(fixture.state().getDiceRoller(),times(2)).rollGoingForIt();
		verify(fixture.state().getDiceRoller()).rollSkill();
		assertEquals(new FieldCoordinate(9,7),fixture.game.getFieldModel().getPlayerCoordinate(fixture.player));
		assertThrows(MatchService.Failure.class,
			() -> fixture.plan(new JsonArray().add(point(11, 7).add("jump", true))));
	}

	private JsonObject point(int x, int y) { return new JsonObject().add("x", x).add("y", y); }

	private final class Fixture {
		final SetupSessionMovementTest.Fixture base = new SetupSessionMovementTest.Fixture(1);
		final SetupSession session = base.session;
		final Game game;
		final String role;
		final Player<?> player, opponent;
		Fixture() throws Exception {
			JsonObject ready = base.advanceToTurn();
			role = ready.getString("actor", null);
			Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
			game = ((GameState) field.get(session)).getGame();
			player = game.getActingTeam().getPlayers()[0];
			opponent = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
			UtilBox.putAllPlayersIntoBox(game);
			place(player, 7, 7, PlayerState.STANDING);
			game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
			game.getFieldModel().setBallMoving(true);
		}
		void place(Player<?> player, int x, int y, int status) {
			game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
			game.getFieldModel().setPlayerState(player, new PlayerState(status).changeActive(true));
		}
		void skill(Player<?> player, String name) {
			SkillFactory factory = game.getFactory(FactoryType.Factory.SKILL);
			((RosterPlayer) player).addSkill(factory.forName(name));
		}
		void dice(int roll) throws Exception { dice(session, roll); }
		void dice(SetupSession session, int roll) throws Exception {
			Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true);
			GameState state = (GameState) engine.get(session);
			DiceRoller dice = spy(state.getDiceRoller()); doReturn(roll).when(dice).rollSkill(); doReturn(roll).when(dice).rollGoingForIt();
			Field roller = GameState.class.getDeclaredField("fDiceRoller"); roller.setAccessible(true); roller.set(state, dice);
		}
		GameState state() throws Exception { Field engine=SetupSession.class.getDeclaredField("state");engine.setAccessible(true);return (GameState)engine.get(session); }
		JsonObject view() { return session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }
		JsonObject plan(JsonArray points) { return session.movementPreview(role, view().getInt("revision", -1), player.getId(), "move", null, points); }
	}
}
