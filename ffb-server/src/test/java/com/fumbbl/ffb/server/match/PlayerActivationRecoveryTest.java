package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.option.GameOptionBoolean;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PlayerActivationRecoveryTest {
    @Test void queuedMovementResumesAfterEndActivationSkillAndSurvivesRecovery() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        GameState nativeState = nativeState(fixture.session);
        Game game = nativeState.getGame();
        Player<?> first = game.getActingTeam().getPlayers()[0];
        Player<?> next = game.getActingTeam().getPlayers()[1];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, first, 5, 5);
        place(game, next, 5, 8);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(5, 5));
        game.getFieldModel().setBallMoving(false);
        ((GameOptionBoolean) game.getOptions().getOptionWithDefault(GameOptionId.ENABLE_STALLING_CHECK)).setValue(true);
        SkillFactory skills = game.getFactory(FactoryType.Factory.SKILL);
        ((RosterPlayer) first).addSkill(skills.forName("Steady Footing"));

        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject select = action(ready, "select", first.getId());
        JsonObject active = fixture.session.apply(role, fixture.request("action", "start-first", ready)
            .add("actionId", select.get("id"))).get("state").asObject();
        assertEquals(first.getId(), active.getString("activePlayerId", null));
        JsonArray firstStep = new JsonArray().add(new JsonObject().add("x", 6).add("y", 5));
        JsonObject firstPlan = fixture.session.movementPreview(role, active.getInt("revision", -1),
            first.getId(), "move", null, firstStep);
        active = fixture.session.apply(role, fixture.request("movement", "move-first", active)
            .add("playerId", first.getId()).add("kind", "move")
            .add("targetPlayerId", JsonValue.NULL).add("waypoints", firstPlan.get("waypoints")))
            .get("state").asObject();
        assertEquals(6, fixture.player(active, first.getId()).getInt("x", -1));
        nativeState.stallingDetected();
        forceGeneralRolls(nativeState, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6);

        JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", 6).add("y", 8));
        String unchanged = fixture.session.recoveryArtifact();
        JsonObject plan = fixture.session.movementPreview(role, active.getInt("revision", -1),
            next.getId(), "move", null, waypoints);
        assertEquals(unchanged, fixture.session.recoveryArtifact(), "Preview must not finish the current activation");
        JsonObject request = fixture.request("movement", "switch-to-next", active)
            .add("playerId", next.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", plan.get("waypoints"));
        JsonObject paused = fixture.session.apply(role, request).get("state").asObject();
        assertTrue(hasAction(paused, "skill"), paused.toString());
        assertFalse(hasAction(paused, "select"), "The native skill choice holds the next declaration");
        assertFalse(next.getId().equals(paused.getString("activePlayerId", null)));
        JsonObject saved = JsonObject.readFrom(fixture.session.recoveryArtifact()).get("payload").asObject();
        assertEquals(next.getId(), saved.get("pendingActivation").asObject().getString("playerId", null));
        assertEquals(next.getId(), saved.get("pendingRoute").asObject().getString("playerId", null));
        assertTrue(fixture.session.apply(role, request).getBoolean("duplicate", false));

        String checkpoint = fixture.session.recoveryArtifact();
        for (Player<?> player : new Player<?>[] { first, next }) {
            MatchService.Failure blocked = assertThrows(MatchService.Failure.class, () ->
                fixture.session.movementPreview(role, paused.getInt("revision", -1), player.getId(),
                    "move", null, waypoints));
            assertEquals("ROUTE_UNAVAILABLE", blocked.code);
        }
        assertEquals(checkpoint, fixture.session.recoveryArtifact(), "The skill decision must keep the confirmed next move");
        SetupSession continued = new SetupSession(fixture.server, fixture.document, checkpoint);
        JsonObject afterSkill = chooseSkill(continued, role, paused, true);
        assertEquals(next.getId(), afterSkill.getString("activePlayerId", null));
        JsonObject moved = fixture.player(afterSkill, next.getId());
        assertEquals(6, moved.getInt("x", -1));
        assertEquals(8, moved.getInt("y", -1));
        JsonObject completed = JsonObject.readFrom(continued.recoveryArtifact()).get("payload").asObject();
        assertTrue(completed.get("pendingRoute").isNull());
        assertTrue(completed.get("pendingActivation") == null);
        assertTrue(continued.apply(role, request).getBoolean("duplicate", false));

        SetupSession stopped = new SetupSession(fixture.server, fixture.document, checkpoint);
        JsonObject afterDecline = chooseSkill(stopped, role, paused, false);
        JsonObject stoppedArtifact = JsonObject.readFrom(stopped.recoveryArtifact()).get("payload").asObject();
        assertTrue(stoppedArtifact.get("pendingRoute").isNull(), "Turnover must discard the queued movement");
        assertTrue(stoppedArtifact.get("pendingActivation") == null, "Turnover must discard the next activation");
        assertFalse(JsonValue.valueOf(next.getId()).equals(afterDecline.get("activePlayerId")));
        assertEquals(5, fixture.player(afterDecline, next.getId()).getInt("x", -1));
        assertTrue(stopped.apply(role, request).getBoolean("duplicate", false));
    }

    @Test void adjacentFoulPreviewKeepsCurrentActivationAndRejectsProtectedTarget() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> current = game.getActingTeam().getPlayers()[0];
        Player<?> fouler = game.getActingTeam().getPlayers()[1];
        Player<?> target = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, current, 2, 2);
        place(game, fouler, 5, 5);
        place(game, target, 6, 5);
        game.getFieldModel().setPlayerState(target, new PlayerState(PlayerState.PRONE).changeActive(true));
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
        game.getFieldModel().setBallMoving(true);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject select = action(ready, "select", current.getId());
        JsonObject active = fixture.session.apply(role, fixture.request("action", "select-current", ready)
            .add("actionId", select.get("id"))).get("state").asObject();
        int revision = active.getInt("revision", -1);
        String checkpoint = fixture.session.recoveryArtifact();
        JsonObject adjacent = fixture.session.movementPreview(role, revision, fouler.getId(),
            "foul", target.getId(), new JsonArray());
        assertEquals(0, adjacent.get("waypoints").asArray().size());
        assertEquals(0, adjacent.get("route").asObject().get("steps").asArray().size());
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertEquals(current.getId(), fixture.session.reply("load", "ACCEPTED", false, role)
            .get("state").asObject().getString("activePlayerId", null));

        MatchService.Failure foreign = assertThrows(MatchService.Failure.class, () ->
            fixture.session.movementPreview("home".equals(role) ? "away" : "home", revision,
                fouler.getId(), "foul", target.getId(), new JsonArray()));
        assertEquals("ROUTE_UNAVAILABLE", foreign.code);
        MatchService.Failure stale = assertThrows(MatchService.Failure.class, () ->
            fixture.session.movementPreview(role, revision - 1, fouler.getId(), "foul", target.getId(), new JsonArray()));
        assertEquals("STALE_REVISION", stale.code);
        assertEquals(checkpoint, fixture.session.recoveryArtifact());

        ((RosterPlayer) target).addTemporaryProperties("protected", Collections.singleton(NamedProperties.preventBeingFouled));
        String protectedCheckpoint = fixture.session.recoveryArtifact();
        MatchService.Failure invalid = assertThrows(MatchService.Failure.class, () ->
            fixture.session.movementPreview(role, revision, fouler.getId(), "foul", target.getId(), new JsonArray()));
        assertEquals("INVALID_TARGET", invalid.code);
        assertEquals(protectedCheckpoint, fixture.session.recoveryArtifact());
        ((RosterPlayer) target).removeTemporaryProperties("protected");
        String beforeInvalidRoute = fixture.session.recoveryArtifact();
        JsonArray invalidOrigin = new JsonArray().add(new JsonObject().add("x", 5).add("y", 5));
        MatchService.Failure invalidRoute = assertThrows(MatchService.Failure.class, () ->
            fixture.session.movementPreview(role, revision, fouler.getId(), "foul", target.getId(), invalidOrigin));
        assertEquals("INVALID_ROUTE", invalidRoute.code);
        assertEquals(beforeInvalidRoute, fixture.session.recoveryArtifact());
        assertEquals(current.getId(), fixture.session.reply("load", "ACCEPTED", false, role)
            .get("state").asObject().getString("activePlayerId", null));
        forceGeneralRolls(nativeState(fixture.session), 2, 3);
        fixture.session.apply(role, fixture.request("movement", "adjacent-foul", active)
            .add("playerId", fouler.getId()).add("kind", "foul").add("targetPlayerId", target.getId())
            .add("waypoints", adjacent.get("waypoints")));
        assertEquals(1, game.getGameResult().getPlayerResult(fouler).getFouls(),
            "A declared adjacent foul must resolve even without an approach move");
    }

    private JsonObject chooseSkill(SetupSession session, String role, JsonObject view, boolean use) {
        String id = null;
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if ("skill".equals(action.getString("kind", null))
                && action.getString("id", "").endsWith(":" + use)) {
                id = action.getString("id", null); break;
            }
        }
        assertNotNull(id, view.toString());
        return session.apply(role, new JsonObject().add("version", 1).add("type", "setup")
            .add("operation", "action").add("requestId", "steady-footing-" + use)
            .add("matchId", view.getString("matchId", null)).add("expectedRevision", view.getInt("revision", -1))
            .add("actionId", id)).get("state").asObject();
    }

    private JsonObject action(JsonObject view, String kind, String playerId) {
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (kind.equals(action.getString("kind", null))
                && playerId.equals(action.getString("sourcePlayerId", null))) return action;
        }
        throw new AssertionError("Missing " + kind + " for " + playerId + ": " + view.get("actions"));
    }

    private boolean hasAction(JsonObject view, String kind) {
        for (JsonValue value : view.get("actions").asArray())
            if (kind.equals(value.asObject().getString("kind", null))) return true;
        return false;
    }

    private void place(Game game, Player<?> player, int x, int y) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true));
    }

    private GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        return (GameState) field.get(session);
    }

    private void forceGeneralRolls(GameState state, int... values) {
        List<DiceCategory> rolls = new ArrayList<>();
        for (int value : values) {
            DiceCategory roll = new DiceCategory();
            roll.parseCommand(Integer.toString(value), state.getGame(), state.getGame().getTeamHome());
            rolls.add(roll);
        }
        state.getDiceRoller().getTestRolls().put("General", rolls);
    }
}
