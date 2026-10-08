package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.util.UtilServerPlayerMove;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MovementChecksTest {

    @Test void pickupUsesTheEnteredSquaresNativeModifiersAndDoesNotChangeTheGame() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean rain : new boolean[] {false, true}) for (int zones = 0; zones <= 2; zones++)
            for (String skill : new String[] {"", "Extra Arms", "Big Hand"}) {
                GameState state = fixture(false, zones, skill);
                state.getGame().getFieldModel().setWeather(rain ? Weather.POURING_RAIN : Weather.NICE);
                SetupSession session = session(state);
                String unchanged = state.toJsonValue().toString();
                JsonObject route = route(session, point(9, 7));
                JsonObject check = check(route.get("steps").asArray().get(0).asObject(), "Pickup");
                assertEquals(skill.equals("Big Hand") ? 3 : 3 + zones + (rain ? 1 : 0) - (skill.equals("Extra Arms") ? 1 : 0), check.getInt("target", -1));
                assertEquals("entry", check.getString("condition", null));
                assertEquals(unchanged, state.toJsonValue().toString());
                assertPublicViews(session);
                cases.add(evidence("pickup-" + rain + "-" + zones + "-" + skill, session, route));
            }
        write("pickup", cases);
    }

    @Test void ballContactIsNotInventedForCarriedOrOutOfPlayBallsAndOnlyOccursOncePerPlan() throws Exception {
        JsonArray cases = new JsonArray();
        GameState state = fixture(false, 0);
        SetupSession session = session(state);
        JsonObject route = route(session, point(9, 7), point(8, 7), point(9, 7));
        long pickups = route.get("steps").asArray().values().stream().filter(step -> has(step.asObject(), "Pickup")).count();
        assertEquals(1, pickups, "Successful pickup is carried through subsequent waypoints");
        cases.add(evidence("repeated-ball-square", session, route));
        state.getGame().getFieldModel().setBallMoving(false);
        assertFalse(has(route(session, point(9, 7)).get("steps").asArray().get(0).asObject(), "Pickup"));
        state.getGame().getFieldModel().setBallMoving(true);
        state.getGame().getFieldModel().setBallInPlay(false);
        assertFalse(has(route(session, point(9, 7)).get("steps").asArray().get(0).asObject(), "Pickup"));
        GameState noHands = fixture(false, 0, "No Ball");
        SetupSession unable = session(noHands);
        JsonObject contact = route(unable, point(9, 7));
        assertTrue(check(contact.get("steps").asArray().get(0).asObject(), "Ball scatter").get("target").isNull());
        assertFalse(has(contact.get("steps").asArray().get(0).asObject(), "Pickup"));
        cases.add(evidence("no-hands-ball-contact", unable, contact));
        write("ball-contact", cases);
    }

    @Test void secureTheBallUsesItsNativeFixedBaseInsteadOfAgility() throws Exception {
        for (boolean rain : new boolean[] {false, true}) {
            GameState state = fixture(false, 1);
            SetupSession session = session(state);
            state.getGame().getActingPlayer().setPlayerAction(PlayerAction.SECURE_THE_BALL);
            state.getGame().getFieldModel().setWeather(rain ? Weather.POURING_RAIN : Weather.NICE);
            UtilServerPlayerMove.updateMoveSquares(state, false);
            assertEquals(rain ? 4 : 3, check(route(session, point(9, 7)).get("steps").asArray().get(0).asObject(), "Pickup").getInt("target", -1));
            assertPublicViews(session);
        }
    }

    @Test void conditionalReactionsOverlapWithDodgeRushAndPickupAndRefreshFromNativeState() throws Exception {
        GameState state = fixture(true, 1, "Steady Footing");
        SetupSession session = session(state);
        state.getGame().getActingPlayer().setCurrentMove(6);
        state.getGame().getActingPlayer().setGoingForIt(true);
        UtilServerPlayerMove.updateMoveSquares(state, false);
        JsonObject route = route(session, point(9, 7)), step = route.get("steps").asArray().get(0).asObject();
        assertEquals(4, step.getInt("dodge", 0));
        assertEquals(2, step.getInt("rush", 0));
        assertEquals(4, check(step, "Pickup").getInt("target", 0));
        for (String name : new String[] {"Diving Tackle", "Tentacles", "Shadowing"}) {
            assertEquals("possible", check(step, name).getString("condition", null));
            assertTrue(check(step, name).get("target").isNull());
        }
        assertEquals(6, check(step, "Steady Footing").getInt("target", 0));
        assertEquals("fall", check(step, "Steady Footing").getString("condition", null));
        assertPublicViews(session);
        JsonArray cases = new JsonArray().add(evidence("overlapping-checks", session, route));
        for (int index = 0; index < 6; index++) state.addShadower("start-marker");
        JsonObject exhausted = route(session, point(9, 7));
        assertFalse(has(exhausted.get("steps").asArray().get(0).asObject(), "Shadowing"));
        cases.add(evidence("exhausted-shadowing", session, exhausted));
        state.getGame().getFieldModel().setPlayerState(state.getGame().getPlayerById("start-marker"), new PlayerState(PlayerState.PRONE));
        JsonObject changed = route(session, point(9, 7));
        for (String name : new String[] {"Diving Tackle", "Tentacles", "Shadowing"}) assertFalse(has(changed.get("steps").asArray().get(0).asObject(), name));
        cases.add(evidence("reactor-prone", session, changed));
        write("reactions", cases);
    }

    @Test void nativeJumpChoicesShowTheirOwnTargetAndConditionalReactions() throws Exception {
        GameState state = fixture(true, 0, "Leap", "Steady Footing");
        SetupSession session = session(state);
        submit(session, action(session, "jumpMode"), "jump-mode");
        JsonObject forecast = view(session).get("movementForecast").asObject();
        assertEquals(2, forecast.getInt("version", 0));
        JsonObject destination = null;
        for (JsonValue value : forecast.get("steps").asArray()) if (value.asObject().getInt("x", -1) == 8 && value.asObject().getInt("y", -1) == 7) destination = value.asObject();
        assertTrue(destination != null);
        assertTrue(check(destination, "Jump").getInt("target", -1) >= 2);
        assertEquals(0, destination.getInt("dodge", -1));
        assertFalse(has(destination, "Shadowing"));
        assertPublicViews(session);
        write("jump", new JsonArray().add(evidence("native-jump", session, null)));
    }

    @Test void failedNativePickupInterruptsTheCommittedRouteAndKeepsItsFailedReport() throws Exception {
        GameState state = fixture(false, 0);
        state.getGame().getTurnData().setReRolls(0);
        SetupSession session = session(state);
        TestRolls.on(state).general(1, 3, 3, 3);
        JsonObject before = view(session);
        JsonObject request = new JsonObject().add("operation", "route").add("requestId", "failed-pickup")
            .add("expectedRevision", before.get("revision")).add("playerId", "actor")
            .add("waypoints", new JsonArray().add(point(9, 7)).add(point(8, 7)));
        assertEquals("ACCEPTED", session.apply("home", request).getString("code", null));
        assertTrue(session.apply("home", request).getBoolean("duplicate", false));
        assertEquals(new FieldCoordinate(9, 7), state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("actor")));
        assertTrue(session.transcriptPage(0, 8).toString().contains("pickUpRoll"));
    }

    private JsonObject evidence(String name, SetupSession session, JsonObject route) {
        return new JsonObject().add("name", name).add("state", view(session)).add("route", route == null ? JsonValue.NULL : route);
    }
    private JsonObject check(JsonObject step, String name) {
        for (JsonValue value : step.get("checks").asArray()) if (name.equals(value.asObject().getString("name", null))) return value.asObject();
        throw new AssertionError("Missing " + name + " in " + step);
    }
    private boolean has(JsonObject step, String name) {
        return step.get("checks").asArray().values().stream().anyMatch(value -> name.equals(value.asObject().getString("name", null)));
    }
    private JsonObject point(int x, int y) { return new JsonObject().add("x", x).add("y", y); }
    private JsonObject route(SetupSession session, JsonObject... points) {
        JsonArray waypoints = new JsonArray(); for (JsonObject point : points) waypoints.add(point);
        return session.routePreview("home", view(session).getInt("revision", -1), waypoints);
    }
    private JsonObject action(SetupSession session, String kind) {
        for (JsonValue value : view(session).get("actions").asArray()) if (kind.equals(value.asObject().getString("kind", null))) return value.asObject();
        throw new AssertionError("Missing " + kind);
    }
    private void submit(SetupSession session, JsonObject action, String requestId) {
        assertEquals("ACCEPTED", session.apply("home", new JsonObject().add("operation", "action").add("requestId", requestId)
            .add("expectedRevision", view(session).get("revision")).add("actionId", action.get("id"))).getString("code", null));
    }
    private void assertPublicViews(SetupSession session) {
        JsonValue forecast = view(session).get("movementForecast");
        assertEquals(forecast, session.reply("inspect", "ACCEPTED", false, "away").get("state").asObject().get("movementForecast"));
        assertEquals(forecast, session.spectatorView().get("movementForecast"));
    }
    private JsonObject view(SetupSession session) {
        return session.reply("inspect", "ACCEPTED", false, "home").get("state").asObject().set("matchId", "00000000-0000-0000-0000-000000000193");
    }
    private SetupSession session(GameState state) throws Exception {
        SetupSession session = new SetupSessionTest().session(11, true);
        state.initCommandNrGenerator(JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject().get("transcript").asObject().getInt("nativeCursor", 0));
        Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state);
        submit(session, action(session, "select"), "select");
        return session;
    }
    private GameState fixture(boolean reactions, int zones, String... skills) throws Exception {
        GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
        new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(9, 7)
            .withTeam(true, team -> team.player("actor", player -> { player.at(10, 7).stats(6, 3, 3, 3, 9); for (String skill : skills) if (!skill.isEmpty()) player.skill(skill); }))
            .withTeam(false, team -> {
                team.player("start-marker", player -> { player.at(reactions ? 11 : 20, 7).stats(6, 3, 3, 3, 9); if (reactions) player.skill("Diving Tackle").skill("Tentacles").skill("Shadowing"); });
                for (int index = 0; index < zones; index++) { int y = 6 + index; team.player("destination-" + index, player -> player.at(8, y).stats(6, 3, 3, 3, 9)); }
            }).build();
        state.getGame().setHomePlaying(true); state.getGame().getFieldModel().setBallMoving(true); StepEngine.start(state); return state;
    }
    private void write(String name, JsonArray cases) throws Exception {
        Files.write(Paths.get("target", "movement-checks-" + name + ".json"), cases.toString().getBytes(StandardCharsets.UTF_8));
    }
}
