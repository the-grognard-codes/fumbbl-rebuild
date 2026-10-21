package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.Roster;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.util.UtilSkillBehaviours;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HailMaryWorkflowTest {
    private final MatchLogPresentationTest log = new MatchLogPresentationTest();

    @Test void modesTargetsMovementRecoveryAndRollFactsAgreeForBothCoachesAndThrows() throws Exception {
        JsonArray journeys = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (boolean bomb : new boolean[] {false, true})
            for (Weather weather : new Weather[] {Weather.NICE, Weather.BLIZZARD}) {
                GameState state = fixture(home, bomb, weather);
                SetupSession session = log.session(state);
                String role = home ? "home" : "away";
                JsonArray frames = new JsonArray();
                capture(session, frames, role, "ready");
                submit(session, role, bomb ? "declareHailMaryBomb" : "declareHailMaryPass");
                String hailMaryAction = bomb ? "hailMaryBomb" : "hailMaryPass";
                assertEquals(hailMaryAction, view(session, role).getString("activePlayerAction", null));
                assertEquals(bomb, state.getGame().getTurnData().isBombUsed());
                assertEquals(!bomb, state.getGame().getTurnData().isPassUsed());
                verifyRange(session, role, bomb, weather);
                capture(session, frames, role, "declared");
                if (!bomb) {
                    submit(session, role, "move-11-7");
                    assertEquals(new FieldCoordinate(11, 7), state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("actor")));
                    assertEquals(PlayerAction.PASS_MOVE, state.getGame().getActingPlayer().getPlayerAction());
                    assertTrue(state.getGame().getActingPlayer().isHailMaryPassMode());
                }
                capture(session, frames, role, "moved");
                JsonObject beforeRecovery = view(session, role);
                GameState restored = new GameState(state.getServer()) {
                    @Override public boolean usesLegacyPersistence() { return false; }
                    @Override public boolean consumesDeclaredActions() { return true; }
                };
                restored.initFrom(state.getGame().getRules(), state.toJsonValue());
                restored.initCommandNrGenerator(state.getLastCommandNr());
                UtilSkillBehaviours.registerBehaviours(restored.getGame(), restored.getServer().getDebugLog());
                Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, restored);
                state = restored;
                assertEquals(beforeRecovery, view(session, role), "Recovered mode and targets must match the live state");
                assertEquals(view(session, role).get("passing"), session.spectatorView().get("passing"));
                submit(session, role, bomb ? "hailMaryBombMode" : "hailMaryPassMode");
                assertEquals(bomb ? "throwBomb" : "passMove", view(session, role).getString("activePlayerAction", null));
                assertFalse(has(view(session, role), (bomb ? "bomb" : "pass") + "-25-7"));
                capture(session, frames, role, "normal");
                submit(session, role, bomb ? "hailMaryBombMode" : "hailMaryPassMode");
                assertEquals(hailMaryAction, view(session, role).getString("activePlayerAction", null));
                capture(session, frames, role, "hail-mary");
                TestRolls.on(state).general(6, 1, 1, 1, 6, 6, 6, 6, 6, 6);
                String target = (bomb ? "bomb" : "pass") + (weather == Weather.BLIZZARD ? "-14-7" : "-25-7");
                submit(session, role, target);
                JsonArray records = log.records(session);
                JsonObject pass = null;
                for (JsonValue value : log.reports(records)) {
                    JsonObject report = value.asObject();
                    assertFalse("interceptionRoll".equals(report.getString("reportId", null)));
                    if ("passRoll".equals(report.getString("reportId", null))) pass = report;
                }
                assertNotNull(pass, "Committed HMP must produce a public PA roll");
                assertTrue(pass.getBoolean("hailMaryPass", false));
                assertEquals(bomb, pass.getBoolean("bomb", false));
                assertEquals("INACCURATE", pass.getString("passResult", null));
                assertEquals(3, pass.get("logRoll").asObject().getInt("base", -1));
                assertEquals(6, pass.get("logRoll").asObject().getInt("target", -1));
                assertFalse(has(view(session, role), bomb ? "hailMaryBombMode" : "hailMaryPassMode"));
                capture(session, frames, role, "thrown");
                journeys.add(new JsonObject().add("role", role).add("bomb", bomb).add("weather", weather.name())
                    .add("frames", frames).add("records", records));
            }
        Files.createDirectories(Paths.get("target"));
        Files.write(Paths.get("target", "hail-mary-workflow.json"), journeys.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Test void hmpDeclarationsRequireSkillsAndCannotReuseAnotherPlayersReservedAction() throws Exception {
        GameState state = fixture(true, false, Weather.NICE);
        SetupSession session = log.session(state);
        JsonObject initial = view(session, "home");
        assertFalse(hasFor(initial, "declareHailMaryPass", "mate"));
        assertFalse(hasFor(initial, "declareHailMaryBomb", "actor"));
        ((RosterPlayer) state.getGame().getPlayerById("mate"))
            .addSkill(state.getGame().getRules().getSkillFactory().forName("Hail Mary Pass"));
        assertTrue(hasFor(view(session, "home"), "declareHailMaryPass", "mate"));
        submit(session, "home", "declarePass");
        assertFalse(hasFor(view(session, "home"), "declareHailMaryPass", "mate"));
        submit(session, "home", "hailMaryPassMode");
        submit(session, "home", "normalPassMode");
        assertTrue(state.getGame().getTurnData().isPassUsed());
        assertEquals(0, state.getGame().getActingPlayer().getCurrentMove());
    }

    @Test void jumpModeDoesNotClearThePassModeOrConsumeAnotherAction() throws Exception {
        GameState state = fixture(true, false, Weather.NICE, true);
        SetupSession session = log.session(state);
        submit(session, "home", "declareHailMaryPass");
        submit(session, "home", "jumpMode");
        assertTrue(state.getGame().getActingPlayer().isJumping());
        assertTrue(state.getGame().getActingPlayer().isHailMaryPassMode());
        submit(session, "home", "jumpMode");
        assertFalse(state.getGame().getActingPlayer().isJumping());
        assertTrue(state.getGame().getActingPlayer().isHailMaryPassMode());
        assertTrue(state.getGame().getTurnData().isPassUsed());
    }

    @Test void fullCheckpointRestoresSelectedHmpModeAndAllowsContinuation() throws Exception {
        GameState state = fixture(true, false, Weather.NICE);
        // The lightweight engine builder omits rosters; durable sessions include them.
        for (Team team : new Team[] {state.getGame().getTeamHome(), state.getGame().getTeamAway()}) {
            JsonArray positions = new JsonArray().add(team.getPlayers()[0].getPosition().toJsonValue());
            JsonObject roster = new Roster().toJsonValue();
            roster.set("positionArray", positions);
            team.updateRoster(new Roster().initFrom(state.getGame().getRules(), roster), false, state.getGame().getRules());
        }
        SetupSession original = log.session(state);
        submit(original, "home", "declareHailMaryPass");
        submit(original, "home", "move-11-7");
        Field document = SetupSession.class.getDeclaredField("document"); document.setAccessible(true);
        SetupSession restored = new SetupSession(new TestServer().getServer(), (MatchDocument) document.get(original), original.recoveryArtifact());
        assertEquals(view(original, "home"), view(restored, "home"));
        assertEquals(original.spectatorView(), restored.spectatorView());
        submit(restored, "home", "normalPassMode");
        assertEquals("passMove", view(restored, "home").getString("activePlayerAction", null));
        submit(restored, "home", "hailMaryPassMode");
        assertEquals("hailMaryPass", view(restored, "home").getString("activePlayerAction", null));
    }

    private GameState fixture(boolean home, boolean bomb, Weather weather) throws Exception {
        return fixture(home, bomb, weather, false);
    }

    private GameState fixture(boolean home, boolean bomb, Weather weather, boolean leap) throws Exception {
        GameState state = new GameState(new TestServer().getServer()) {
            @Override public boolean usesLegacyPersistence() { return false; }
            @Override public boolean consumesDeclaredActions() { return true; }
        };
        new GameStateBuilder(state).withRule("BB2025").withWeather(weather).withBallAt(10, 7)
            .withTeam(home, team -> team.player("actor", player -> {
                player.at(10, 7).stats(6, 3, 3, 3, 9).skill("Hail Mary Pass");
                if (bomb) player.skill("Bombardier");
                if (leap) player.skill("Leap");
            }).player("mate", player -> player.at(14, 10)))
            .withTeam(!home, team -> team.player("opponent", player -> player.at(20, 7))).build();
        state.getGame().setHomePlaying(home);
        StepEngine.start(state);
        return state;
    }

    private void verifyRange(SetupSession session, String role, boolean bomb, Weather weather) {
        JsonObject current = view(session, role), passing = current.get("passing").asObject();
        assertEquals(3, passing.getInt("version", -1));
        assertEquals('B', passing.get("ranges").asArray().get(14).asString().charAt(7));
        assertEquals(weather == Weather.BLIZZARD ? '-' : 'B', passing.get("ranges").asArray().get(25).asString().charAt(7));
        if (weather == Weather.BLIZZARD) {
            JsonObject forged = new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString())
                .add("expectedRevision", current.get("revision"))
                .add("actionId", current.getInt("revision", -1) + ":" + (bomb ? "bomb" : "pass") + "-25-7");
            assertEquals("INVALID_OPTION", assertThrows(MatchService.Failure.class, () -> session.apply(role, forged)).code);
            assertEquals(current, view(session, role));
        }
    }

    private JsonObject view(SetupSession session, String role) { return log.view(session, role); }
    private void submit(SetupSession session, String role, String kind) { log.submit(session, role, kind, null); }
    private boolean has(JsonObject view, String key) {
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (key.equals(action.getString("kind", null)) || action.getString("id", "").endsWith(":" + key)) return true;
        }
        return false;
    }
    private boolean hasFor(JsonObject view, String kind, String playerId) {
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (kind.equals(action.getString("kind", null)) && playerId.equals(action.getString("sourcePlayerId", null))) return true;
        }
        return false;
    }
    private void capture(SetupSession session, JsonArray frames, String role, String checkpoint) {
        frames.add(new JsonObject().add("checkpoint", checkpoint).add("actor", view(session, role)));
    }
}
