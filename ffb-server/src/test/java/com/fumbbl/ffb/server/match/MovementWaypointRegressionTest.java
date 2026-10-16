package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MovementWaypointRegressionTest {
    @Test void plannedDetourRecalculatesRangeWithoutChangingTheNativePlayer() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        Player<?> player = isolate(game, PlayerState.STANDING);
        String role = ready.getString("actor", null);
        String before = fixture.session.recoveryArtifact();
        JsonObject plan = fixture.session.movementPreview(role, ready.getInt("revision", -1), player.getId(),
            "move", null, points(8, 7, 8, 8, 7, 8));
        JsonObject range = plan.get("range") == null ? null : plan.get("range").asObject();
        assertNotNull(range, "The native preview must return remaining range from its planned endpoint");
        assertEquals(7, range.get("from").asObject().getInt("x", -1));
        assertEquals(8, range.get("from").asObject().getInt("y", -1));
        assertEquals(player.getMovementWithModifiers() - 3, range.getInt("normalRemaining", -1));
        assertEquals(player.getMovementWithModifiers() - 1, range.getInt("remaining", -1));
        assertEquals(before, fixture.session.recoveryArtifact());
    }

    @Test void blitzAppendsAnApproachAfterAllRequestedWaypoints() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        Player<?> player = isolate(game, PlayerState.STANDING);
        Player<?> target = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        place(game, target, 11, 7, PlayerState.STANDING);
        JsonArray manual = points(8, 8, 9, 8);
        JsonObject plan = fixture.session.movementPreview(ready.getString("actor", null), ready.getInt("revision", -1),
            player.getId(), "blitz", target.getId(), manual);
        JsonArray waypoints = plan.get("waypoints").asArray();
        assertTrue(waypoints.size() >= 3, "The selected target adds an approach after the manual route");
        assertEquals(manual.get(0), waypoints.get(0));
        assertEquals(manual.get(1), waypoints.get(1));
        JsonObject last = waypoints.get(waypoints.size() - 1).asObject();
        assertTrue(new FieldCoordinate(11, 7).isAdjacent(new FieldCoordinate(last.getInt("x", -1), last.getInt("y", -1))));
    }

    @Test void explicitBlitzAllowsReadOnlyWaypointsBeforeSelectingItsTarget() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        Player<?> player = isolate(game, PlayerState.STANDING);
        Player<?> target = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        place(game, target, 11, 7, PlayerState.STANDING);
        String role = ready.getString("actor", null);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject declared = fixture.session.apply(role, fixture.request("action", "declare-blitz", ready)
            .add("actionId", find(ready, "blitz", player.getId()).get("id"))).get("state").asObject();
        String before = fixture.session.recoveryArtifact();
        JsonObject draft = fixture.session.movementPreview(role, declared.getInt("revision", -1), player.getId(),
            "move", null, points(8, 8));
        assertEquals(1, draft.get("route").asObject().get("steps").asArray().size());
        assertEquals(before, fixture.session.recoveryArtifact());
        assertTrue(fixture.session.movementRange(role, declared.getInt("revision", -1), player.getId()).getInt("remaining", 0) > 0);
        assertThrows(MatchService.Failure.class, () -> fixture.session.apply(role,
            fixture.request("movement", "targetless-blitz", declared).add("playerId", player.getId())
                .add("kind", "move").add("targetPlayerId", JsonValue.NULL).add("waypoints", points(8, 8))));
        assertEquals(before, fixture.session.recoveryArtifact());
        JsonObject plan = fixture.session.movementPreview(role, declared.getInt("revision", -1), player.getId(),
            "blitz", target.getId(), points(8, 8));
        assertEquals(points(8, 8).get(0), plan.get("waypoints").asArray().get(0));
    }

    @Test void proneBlitzerDeclaresItsTargetBeforeStandingAndKeepsThePlannedApproach() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        Player<?> player = isolate(game, PlayerState.PRONE);
        Player<?> target = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        place(game, target, 9, 7, PlayerState.STANDING);
        String role = ready.getString("actor", null);
        JsonObject plan = fixture.session.movementPreview(role, ready.getInt("revision", -1), player.getId(),
            "blitz", target.getId(), points(8, 7));
        JsonObject response = fixture.session.apply(role, fixture.request("movement", "prone-blitz", ready)
            .add("playerId", player.getId()).add("kind", "blitz").add("targetPlayerId", target.getId())
            .add("waypoints", plan.get("waypoints")));
        assertEquals("ACCEPTED", response.getString("code", null));
        assertEquals(new FieldCoordinate(8, 7), game.getFieldModel().getPlayerCoordinate(player));
        assertEquals(player, game.getActingPlayer().getPlayer());
        assertFalse(game.getFieldModel().getPlayerState(player).isProneOrStunned());
        assertTrue(game.getTurnData().isBlitzUsed());
    }

    @Test void anotherPlayerCanMoveWhileThePreviousBlitzerWasAwaitingATarget() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        Player<?> player = isolate(game, PlayerState.STANDING);
        Player<?> teammate = game.getActingTeam().getPlayers()[1];
        Player<?> target = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        place(game, target, 11, 7, PlayerState.STANDING);
        place(game, teammate, 3, 3, PlayerState.STANDING);
        String role = ready.getString("actor", null);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject declared = fixture.session.apply(role, fixture.request("action", "switch-from-blitz", ready)
            .add("actionId", find(ready, "blitz", player.getId()).get("id"))).get("state").asObject();
        JsonObject response = fixture.session.apply(role, fixture.request("movement", "switch-to-move", declared)
            .add("playerId", teammate.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", points(4, 3)));
        assertEquals("ACCEPTED", response.getString("code", null));
        assertEquals(new FieldCoordinate(4, 3), game.getFieldModel().getPlayerCoordinate(teammate));
        assertEquals(teammate, game.getActingPlayer().getPlayer());
        assertTrue(game.getTurnData().isBlitzUsed());
    }

    @Test void pronePlayerCanStandInPlaceAndThenFollowARouteBackToTheirSquare() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        Player<?> player = isolate(game, PlayerState.PRONE);
        String role = ready.getString("actor", null);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject stood = fixture.session.apply(role, fixture.request("action", "stand-in-place", ready)
            .add("actionId", find(ready, "stand", player.getId()).get("id"))).get("state").asObject();
        assertEquals(new FieldCoordinate(7, 7), game.getFieldModel().getPlayerCoordinate(player));
        assertFalse(game.getFieldModel().getPlayerState(player).isProneOrStunned());
        assertEquals(player, game.getActingPlayer().getPlayer(), "Stand-up must preserve the activation: " + stood);
        assertTrue(stood.get("actions").asArray().values().stream().anyMatch(value -> "move".equals(value.asObject().getString("kind", null))),
            "Stand-up must offer remaining movement: " + stood);
        JsonObject plan = fixture.session.movementPreview(role, stood.getInt("revision", -1), player.getId(),
            "move", null, points(8, 7, 7, 7));
        assertEquals(2, plan.get("route").asObject().get("steps").asArray().size());
        JsonObject accepted = fixture.session.apply(role, fixture.request("movement", "out-and-back", stood)
            .add("playerId", player.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", plan.get("waypoints")));
        assertEquals("ACCEPTED", accepted.getString("code", null));
        assertEquals(new FieldCoordinate(7, 7), game.getFieldModel().getPlayerCoordinate(player));
        assertEquals(5, game.getActingPlayer().getCurrentMove());
    }

    private Player<?> isolate(Game game, int status) {
        Player<?> player = game.getActingTeam().getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, player, 7, 7, status);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
        game.getFieldModel().setBallMoving(true);
        return player;
    }

    private void place(Game game, Player<?> player, int x, int y, int status) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(status).changeActive(true));
    }

    private GameState state(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
        return (GameState) field.get(session);
    }

    private JsonArray points(int... coordinates) {
        JsonArray result = new JsonArray();
        for (int i = 0; i < coordinates.length; i += 2)
            result.add(new JsonObject().add("x", coordinates[i]).add("y", coordinates[i + 1]));
        return result;
    }

    private JsonObject find(JsonObject view, String kind, String playerId) {
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (kind.equals(action.getString("kind", null)) && playerId.equals(action.getString("sourcePlayerId", null))) return action;
        }
        throw new AssertionError("Missing " + kind + " for " + playerId);
    }
}
