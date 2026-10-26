package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.inducement.bb2025.Prayer;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NegativeConditionMarkersTest {
    @Test void activationClearsDistractedAndEyeGougedMarkersButRetainsActiveEnhancements() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> player = game.getActingTeam().getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(5, 5));
        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING)
            .changeActive(true).changeConfused(true).changeEyeGouged(true));
        game.getFieldModel().addEnhancements(player, KickoffResult.DODGY_SNACK.getName());
        game.getFieldModel().addPrayerEnhancements(player, Prayer.GREASY_CLEATS);
        ready = view(fixture.session, role);
        assertEquals(new JsonArray().add("distracted").add("dodgySnack").add("greasyCleats").add("eyeGouged"),
            fixture.player(ready, player.getId()).get("conditions"));
        JsonObject declaration = null;
        for (JsonValue value : ready.get("actions").asArray())
            if ("declarePass".equals(value.asObject().getString("kind", null))
                && player.getId().equals(value.asObject().getString("sourcePlayerId", null))) declaration = value.asObject();
        assertTrue(declaration != null);
        JsonObject after = fixture.session.apply(role, fixture.request("action", "clear-activation-conditions", ready)
            .add("actionId", declaration.get("id"))).get("state").asObject();
        // Declaring an action precedes activation; committing its first move starts it.
        assertEquals(fixture.player(ready, player.getId()).get("conditions"), fixture.player(after, player.getId()).get("conditions"));
        after = fixture.session.apply(role, fixture.request("movement", "activate-and-clear-conditions", after)
            .add("playerId", player.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", new JsonArray().add(new JsonObject().add("x", 6).add("y", 5))))
            .get("state").asObject();
        assertEquals(new JsonArray().add("dodgySnack").add("greasyCleats"),
            fixture.player(after, player.getId()).get("conditions"));
    }

    @Test void newDriveRemovesDodgySnackButRetainsGameLongGreasyCleats() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> player = game.getActingTeam().getPlayers()[0];
        game.getFieldModel().addEnhancements(player, KickoffResult.DODGY_SNACK.getName());
        game.getFieldModel().addPrayerEnhancements(player, Prayer.GREASY_CLEATS);
        game.getTurnDataHome().setTurnNr(8);
        game.getTurnDataAway().setTurnNr(8);
        ready = view(fixture.session, role);
        JsonObject end = null;
        for (JsonValue value : ready.get("actions").asArray())
            if ("endTurn".equals(value.asObject().getString("kind", null))) end = value.asObject();
        assertTrue(end != null);
        JsonObject after = fixture.session.apply(role, fixture.request("action", "condition-new-drive", ready)
            .add("actionId", end.get("id"))).get("state").asObject();
        assertEquals("SETUP", after.getString("phase", null));
        assertEquals(new JsonArray().add("greasyCleats"), fixture.player(after, player.getId()).get("conditions"));
    }

    @Test void allConditionsProjectTogetherForBothCoachesAndSpectatorsWithoutReplacingPosture() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        fixture.advanceToTurn();
        Game game = nativeState(fixture.session).getGame();
        Player<?> player = game.getActingTeam().getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(5, 5));
        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.PRONE)
            .changeConfused(true).changeChomped(true).changeRooted(true).changeEyeGouged(true));
        game.getFieldModel().addEnhancements(player, KickoffResult.DODGY_SNACK.getName());
        game.getFieldModel().addPrayerEnhancements(player, Prayer.GREASY_CLEATS);
        JsonArray expected = new JsonArray().add("distracted").add("chomped").add("rooted")
            .add("dodgySnack").add("greasyCleats").add("eyeGouged");
        for (String viewer : new String[] { "home", "away", "spectator" }) {
            JsonObject projected = fixture.player(view(fixture.session, viewer), player.getId());
            assertEquals(expected, projected.get("conditions"));
            assertEquals("is prone", projected.getString("state", null));
        }
        game.getTurnData().recordLimitedAction(player.getId(), PlayerAction.PASS);
        game.startTurn();
        JsonObject next = fixture.player(view(fixture.session, "spectator"), player.getId());
        assertEquals(expected, next.get("conditions"));
        assertNull(next.get("limitedAction"));
        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STUNNED));
        assertEquals(new JsonArray().add("dodgySnack").add("greasyCleats"),
            fixture.player(view(fixture.session, "home"), player.getId()).get("conditions"));
        game.getFieldModel().removeSkillEnhancements(player, KickoffResult.DODGY_SNACK.getName());
        assertEquals(new JsonArray().add("greasyCleats"),
            fixture.player(view(fixture.session, "home"), player.getId()).get("conditions"));
        game.getFieldModel().removePrayerEnhancements(player, Prayer.GREASY_CLEATS);
        assertEquals(new JsonArray(), fixture.player(view(fixture.session, "home"), player.getId()).get("conditions"));
    }

    @Test void chompProjectionRemainsUntilTheLastChomperReleasesThePlayer() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        fixture.advanceToTurn();
        Game game = nativeState(fixture.session).getGame();
        Player<?> victim = game.getActingTeam().getPlayers()[0];
        Player<?> first = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        Player<?> second = game.getOtherTeam(game.getActingTeam()).getPlayers()[1];
        game.getFieldModel().addChomp(first, victim);
        game.getFieldModel().addChomp(second, victim);
        assertEquals(new JsonArray().add("chomped"), new NegativeConditionProjection().project(game, victim));
        game.getFieldModel().removeChomp(first, victim);
        assertEquals(new JsonArray().add("chomped"), new NegativeConditionProjection().project(game, victim));
        game.getFieldModel().removeChomp(second, victim);
        assertEquals(new JsonArray(), new NegativeConditionProjection().project(game, victim));
    }

    @Test void activeEffectsSurviveAcceptedTurnChangesReplayAndRecoveryIncludingOffPitchPlayers() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> player = game.getActingTeam().getPlayers()[0];
        game.getFieldModel().setPlayerState(player, game.getFieldModel().getPlayerState(player).changeRooted(true).changeEyeGouged(true));
        game.getFieldModel().addEnhancements(player, KickoffResult.DODGY_SNACK.getName());
        game.getFieldModel().addPrayerEnhancements(player, Prayer.GREASY_CLEATS);
        ready = view(fixture.session, role);
        JsonObject end = null;
        for (JsonValue value : ready.get("actions").asArray())
            if ("endTurn".equals(value.asObject().getString("kind", null))) end = value.asObject();
        assertTrue(end != null);
        JsonObject after = fixture.session.apply(role, fixture.request("action", "condition-end-turn", ready)
            .add("actionId", end.get("id"))).get("state").asObject();
        JsonArray expected = new JsonArray().add("rooted").add("dodgySnack").add("greasyCleats").add("eyeGouged");
        assertEquals(expected, fixture.player(after, player.getId()).get("conditions"));
        String artifact = fixture.session.recoveryArtifact();
        SetupSession restored = new SetupSession(fixture.server, fixture.document, artifact);
        for (String viewer : new String[] { "home", "away", "spectator" })
            assertEquals(expected, fixture.player(view(restored, viewer), player.getId()).get("conditions"));
        JsonArray events = JsonArray.readFrom(JsonObject.readFrom(artifact).get("payload").asObject().getString("eventsJson", ""));
        assertEquals(expected, fixture.player(events.get(events.size() - 1).asObject().get("state").asObject(), player.getId()).get("conditions"));
        SetupSession completed = new SetupSession(fixture.server, fixture.document, artifact);
        completed.apply(role, fixture.request("concede", "condition-completed-replay", view(completed, role)));
        JsonObject replay = JsonObject.readFrom(completed.completedMatch().json());
        JsonArray completedEvents = replay.get("events").asArray();
        assertEquals(expected, fixture.player(completedEvents.get(completedEvents.size() - 2).asObject()
            .get("state").asObject(), player.getId()).get("conditions"));
        new MatchJson().validateCompletion(completed.completedMatch(), fixture.document);
        Game recoveredGame = nativeState(restored).getGame();
        Player<?> recoveredPlayer = recoveredGame.getPlayerById(player.getId());
        UtilBox.putAllPlayersIntoBox(recoveredGame);
        JsonObject offPitch = fixture.player(view(restored, "spectator"), player.getId());
        assertTrue(offPitch.get("x").isNull());
        assertTrue(offPitch.get("conditions").asArray().values().contains(JsonValue.valueOf("greasyCleats")));
        recoveredGame.getFieldModel().removePrayerEnhancements(recoveredPlayer, Prayer.GREASY_CLEATS);
        assertEquals(new JsonArray().add("dodgySnack"), fixture.player(view(restored, "spectator"), player.getId()).get("conditions"));
    }

    @Test void recoveryAcceptsLegacyPlayerProjectionsWithoutConditions() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        fixture.advanceToTurn();
        JsonObject envelope = JsonObject.readFrom(fixture.session.recoveryArtifact());
        JsonObject payload = envelope.get("payload").asObject();
        stripConditions(payload);
        // Historical event JSON is stored as a string, separate from the checkpoint view.
        JsonArray events = JsonArray.readFrom(payload.getString("eventsJson", ""));
        stripConditions(events);
        payload.set("eventsJson", events.toString());
        envelope.set("sha256", new JsonDigest().sha256(payload));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, envelope.toString());
        assertEquals("PLAY", view(restored, "home").getString("phase", null));
        for (JsonValue player : view(restored, "spectator").get("players").asArray())
            assertEquals(new JsonArray(), player.asObject().get("conditions"));
    }

    @Test void completedReplayAcceptsOptionalConditionsAndRejectsMalformedOrDuplicateConditions() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        fixture.session.apply(role, fixture.request("concede", "condition-validation", ready));
        JsonObject artifact = JsonObject.readFrom(fixture.session.completedMatch().json());
        JsonObject player = artifact.get("events").asArray().get(0).asObject().get("state").asObject()
            .get("players").asArray().get(0).asObject();
        artifact.get("transcript").asObject().get("records").asArray().get(0).asObject()
            .set("state", artifact.get("events").asArray().get(0).asObject().get("state"));
        MatchJson codec = new MatchJson();
        player.set("conditions", new JsonArray().add("rooted").add("greasyCleats"));
        codec.validateCompletion(new CompletedMatch(artifact.toString()), fixture.document);
        for (JsonValue invalid : new JsonValue[] { JsonValue.NULL, JsonValue.valueOf("rooted"),
            new JsonArray().add("rooted").add("rooted"), new JsonArray().add("unknown"), new JsonArray().add(1) }) {
            player.set("conditions", invalid);
            assertEquals("REPLAY_UNSUPPORTED", assertThrows(MatchService.Failure.class,
                () -> codec.validateCompletion(new CompletedMatch(artifact.toString()), fixture.document)).code);
        }
        player.remove("conditions");
        codec.validateCompletion(new CompletedMatch(artifact.toString()), fixture.document);
    }

    private void stripConditions(JsonValue value) {
        if (value.isObject()) {
            JsonObject object = value.asObject();
            object.remove("conditions");
            for (JsonObject.Member member : object) stripConditions(member.getValue());
        } else if (value.isArray()) for (JsonValue child : value.asArray()) stripConditions(child);
    }

    private JsonObject view(SetupSession session, String role) {
        return session.reply("load", "ACCEPTED", false, role).get("state").asObject();
    }
    private GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        return (GameState) field.get(session);
    }
}
