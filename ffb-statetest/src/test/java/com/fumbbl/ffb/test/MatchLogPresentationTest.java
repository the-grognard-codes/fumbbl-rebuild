package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;

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

class MatchLogPresentationTest {
    @Test void onePlanAndFourSeparateCommitsRetainCanonicalOriginsForBothCoaches() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (boolean separate : new boolean[] {true, false}) {
            GameState state = fixture(home, false);
            SetupSession session = session(state);
            String role = home ? "home" : "away";
            submit(session, role, "select", null);
            if (separate) for (int x = 11; x <= 14; x++) submit(session, role, "move", point(x, 7));
            else route(session, role, new JsonArray().add(point(14, 7)));
            JsonArray records = records(session);
            int movements = 0;
            for (JsonValue value : records) {
                JsonValue decision = value.asObject().get("decision");
                if (!decision.isObject() || decision.asObject().get("logPresentation") == null) continue;
                JsonValue movement = decision.asObject().get("logPresentation").asObject().get("movement");
                if (!movement.isObject()) continue;
                assertTrue(movement.asObject().getBoolean("complete", false));
                assertEquals(point(separate ? 10 + movements : 10, 7), movement.asObject().get("from"));
                assertEquals(point(separate ? 11 + movements : 14, 7), movement.asObject().get("to"));
                movements++;
            }
            assertEquals(separate ? 4 : 1, movements);
            cases.add(new JsonObject().add("name", role + (separate ? "-separate" : "-plan")).add("records", records));
        }
        write("movement", cases);
    }

    @Test void interruptedPickupAndItsRerollKeepOneCommittedIdentityAndAllNativeAttempts() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean retry : new boolean[] {false, true}) for (boolean single : new boolean[] {false, true}) {
            GameState state = fixture(true, true);
            state.getGame().getTurnData().setReRolls(retry ? 2 : 0);
            SetupSession session = session(state);
            TestRolls.on(state).general(1, 6, 3, 3, 3);
            submit(session, "home", "select", null);
            JsonObject beforeMove = view(session, "home");
            JsonObject request;
            if (single) {
                JsonObject offered = beforeMove.get("actions").asArray().values().stream().map(JsonValue::asObject)
                    .filter(action -> "move".equals(action.getString("kind", null)) && point(11, 7).equals(action.get("target"))).findFirst().get();
                request = new JsonObject().add("operation", "action").add("requestId", "single-move")
                    .add("expectedRevision", beforeMove.get("revision")).add("actionId", offered.get("id"));
                assertEquals("ACCEPTED", session.apply("home", request).getString("code", null));
            } else request = route(session, "home", new JsonArray().add(point(11, 7)).add(point(12, 7)));
            JsonArray before = records(session);
            JsonObject first = before.get(before.size() - 1).asObject().get("decision").asObject().get("logPresentation").asObject().get("movement").asObject();
            assertEquals(point(10, 7), first.get("from"));
            assertEquals(point(11, 7), first.get("to"));
            assertEquals(!retry, first.getBoolean("complete", retry));
            assertTrue(session.apply("home", request).getBoolean("duplicate", false));
            assertEquals(before, records(session), "Exact retries do not append log records");
            if (retry) {
                submit(session, "home", "reroll:team", null);
                JsonArray after = records(session);
                JsonObject continued = after.get(after.size() - 1).asObject().get("decision").asObject().get("logPresentation").asObject().get("movement").asObject();
                assertEquals(first.get("commitRevision"), continued.get("commitRevision"));
                assertEquals(first.get("from"), continued.get("from"));
                assertEquals(point(single ? 11 : 12, 7), continued.get("to"));
                assertTrue(continued.getBoolean("complete", false));
            }
            JsonArray reports = reports(records(session));
            long attempts = reports.values().stream().filter(value -> "pickUpRoll".equals(value.asObject().getString("reportId", null))).count();
            assertEquals(retry ? 2L : 1L, attempts);
            for (JsonValue value : reports) if ("pickUpRoll".equals(value.asObject().getString("reportId", null))) {
                JsonObject facts = value.asObject().get("logRoll").asObject();
                assertEquals(3, facts.getInt("base", -1));
                assertEquals(point(11, 7), facts.get("square"));
            }
            cases.add(new JsonObject().add("name", (single ? "single" : "pickup") + (retry ? "-reroll" : "-failed")).add("records", records(session)));
        }
        write("interrupted", cases);
    }

    @Test void secureBallAndPassOutcomesUseNativeBasesAndAcceptedTargets() throws Exception {
        JsonArray cases = new JsonArray();
        GameState secure = fixture(true, true);
        secure.getGame().getPlayerById("actor").setAgility(5);
        SetupSession secureSession = session(secure);
        TestRolls.on(secure).general(6);
        submit(secureSession, "home", "secureBall", null);
        route(secureSession, "home", new JsonArray().add(point(11, 7)));
        JsonArray secureReports = reports(records(secureSession));
        JsonObject pickup = secureReports.values().stream().map(JsonValue::asObject)
            .filter(value -> "pickUpRoll".equals(value.getString("reportId", null))).findFirst().get();
        assertTrue(pickup.getBoolean("secureTheBallUsed", false));
        assertEquals(2, pickup.get("logRoll").asObject().getInt("base", -1));
        cases.add(new JsonObject().add("name", "secure-ball").add("records", records(secureSession)));
        for (int roll : new int[] {6, 3, 1}) {
            GameState state = fixture(true, false);
            state.getGame().getFieldModel().setBallInPlay(true);
            state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("mate"), new FieldCoordinate(14, 7));
            state.getGame().getFieldModel().setBallCoordinate(new FieldCoordinate(10, 7));
            state.getGame().getFieldModel().setBallMoving(false);
            state.getGame().getTurnData().setReRolls(0);
            SetupSession session = session(state);
            TestRolls.on(state).general(roll, 6, 6, 6, 6, 6, 6, 6);
            submit(session, "home", "declarePass", null);
            submit(session, "home", "pass", point(14, 7));
            JsonArray records = records(session);
            JsonObject pass = reports(records).values().stream().map(JsonValue::asObject)
                .filter(value -> "passRoll".equals(value.getString("reportId", null))).findFirst().get();
            assertEquals(3, pass.get("logRoll").asObject().getInt("base", -1));
            assertEquals(-1, pass.get("logRoll").asObject().getInt("modifier", 0), "Native Short Pass range penalty is retained");
            assertEquals(roll == 6 ? "ACCURATE" : roll == 3 ? "INACCURATE" : "FUMBLE", pass.getString("passResult", null));
            JsonObject last = records.get(records.size() - 1).asObject();
            assertEquals(point(14, 7), last.get("decision").asObject().get("logPresentation").asObject().get("action").asObject().get("target"));
            cases.add(new JsonObject().add("name", "pass-" + roll).add("records", records));
        }
        write("primary", cases);
    }

    @Test void activationTraitsUseTheirNativeBasesAndConditionalModifiers() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (String skill : new String[] {"Bone Head", "Really Stupid", "Take Root", "Unchannelled Fury", "Bloodlust"})
            for (boolean good : new boolean[] {false, true}) for (int die : new int[] {1, 6}) {
                if (good && !skill.equals("Really Stupid") && !skill.equals("Unchannelled Fury")) continue;
                GameState state = fixture(home, false);
                addSkill(state, "actor", skill); state.getGame().getPlayerById("actor").setAgility(5);
                state.getGame().getTurnData().setReRolls(0);
                if (skill.equals("Really Stupid") && good) state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("mate"), new FieldCoordinate(11, 8));
                if (skill.equals("Unchannelled Fury") && good) state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("opponent"), new FieldCoordinate(11, 7));
                SetupSession session = session(state); TestRolls.on(state).general(die, 6, 6, 6, 6);
                submit(session, home ? "home" : "away", skill.equals("Unchannelled Fury") && good ? "selectBlock" : "select", null);
                if (skill.equals("Unchannelled Fury") && good) submit(session, home ? "home" : "away", "block", null);
                else submit(session, home ? "home" : "away", "move", point(11, 7));
                JsonArray records = records(session);
                JsonObject roll = report(records, skill.equals("Bloodlust") ? "bloodLustRoll" : "confusionRoll");
                int base = skill.equals("Really Stupid") || skill.equals("Unchannelled Fury") ? 4 : 2;
                assertEquals(base, roll.get("logRoll").asObject().getInt("base", -1));
                assertEquals(good ? 2 : base, roll.getInt("minimumRoll", -1));
                assertEquals(base - roll.getInt("minimumRoll", -1), roll.get("logRoll").asObject().getInt("modifier", -9));
                assertEquals(die == 6, roll.getBoolean("successful", false));
                cases.add(new JsonObject().add("name", (home ? "home" : "away") + "-" + skill + "-" + good + "-" + die).add("records", records));
            }
        write("traits", cases);
    }

    @Test void traitRerollsPreserveBothAttemptsAndSourceOrder() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) {
            GameState state = fixture(home, false); addSkill(state, "actor", "Bone Head");
            state.getGame().getTurnData().setReRolls(1); SetupSession session = session(state);
            TestRolls.on(state).general(1, 6); submit(session, home ? "home" : "away", "select", null);
            submit(session, home ? "home" : "away", "move", point(11, 7));
            assertFalse(reportIds(records(session)).contains("turnEnd"), "Pending trait failure is not a finalized turn end");
            submit(session, home ? "home" : "away", "reroll:team", null);
            assertEquals(java.util.Arrays.asList("confusionRoll", "reRoll", "confusionRoll"), checks(records(session)));
            cases.add(new JsonObject().add("name", (home ? "home" : "away") + "-trait-team").add("records", records(session)));
        }
        write("trait-rerolls", cases);
    }

    @Test void automaticDodgePrecedesPickupAndKeepsItsFailedOriginal() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) {
            GameState state = fixture(home, true); addSkill(state, "actor", "Dodge");
            state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("opponent"), new FieldCoordinate(11, 7));
            state.getGame().getFieldModel().setBallCoordinate(new FieldCoordinate(9, 7));
            state.getGame().getFieldModel().setBallInPlay(true);
            SetupSession session = session(state); TestRolls.on(state).general(1, 6, 6);
            submit(session, home ? "home" : "away", "select", null);
            submit(session, home ? "home" : "away", "move", point(9, 7));
            assertEquals(java.util.Arrays.asList("dodgeRoll", "reRoll", "dodgeRoll", "pickUpRoll"), checks(records(session)));
            assertFalse(report(records(session), "dodgeRoll").getBoolean("successful", true));
            cases.add(new JsonObject().add("name", (home ? "home" : "away") + "-automatic-dodge-pickup").add("records", records(session)));
        }
        write("automatic", cases);
    }

    @Test void rerolledProTestRemainsSeparateFromTheOriginalPickupAndExactRetries() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) {
            GameState state = fixture(home, true); addSkill(state, "actor", "Pro"); addSkill(state, "actor", "Loner");
            state.getGame().getTurnData().setReRolls(1); SetupSession session = session(state); String role = home ? "home" : "away";
            TestRolls.on(state).general(1, 1, 6, 6, 6);
            submit(session, role, "select", null); submit(session, role, "move", point(11, 7));
            submit(session, role, "reroll:pro", null);
            JsonObject view = view(session, role);
            JsonObject action = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(value -> value.getString("id", "").endsWith("pro-test:team")).findFirst().get();
            JsonObject request = new JsonObject().add("operation", "action").add("requestId", "pro-test-retry")
                .add("expectedRevision", view.get("revision")).add("actionId", action.get("id"));
            assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
            JsonArray before = records(session); assertTrue(session.apply(role, request).getBoolean("duplicate", false));
            assertEquals(before, records(session));
            assertEquals(java.util.Arrays.asList("pickUpRoll", "reRoll", "reRoll", "reRoll", "reRoll", "pickUpRoll"), checks(before));
            int pro = 0;
            for (JsonValue value : reports(before)) {
                JsonObject report = value.asObject();
                if ("Pro".equals(report.getString("reRollSource", null))) {
                    assertEquals(3, report.get("logRoll").asObject().getInt("base", -1));
                    assertEquals(pro++ > 0, report.get("logTest").asObject().getBoolean("rerolled", false));
                }
                if ("Loner".equals(report.getString("reRollSource", null))) assertEquals(4, report.get("logRoll").asObject().getInt("base", -1));
            }
            assertEquals(2, pro);
            cases.add(new JsonObject().add("name", role + "-pro-test-team").add("records", before));
        }
        write("pro-test", cases);
    }

    @Test void passAndCatchFollowUpKeepEveryNativeAttempt() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) {
            GameState state = fixture(home, false); addSkill(state, "mate", "Catch");
            state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("mate"), new FieldCoordinate(14, 7));
            state.getGame().getFieldModel().setBallCoordinate(new FieldCoordinate(10, 7));
            state.getGame().getFieldModel().setBallInPlay(true); state.getGame().getFieldModel().setBallMoving(false);
            SetupSession session = session(state); String role = home ? "home" : "away";
            TestRolls.on(state).general(6, 1, 6, 6, 6); submit(session, role, "declarePass", null); submit(session, role, "pass", point(14, 7));
            JsonObject view = view(session, role);
            if (view.get("actions").asArray().values().stream().map(JsonValue::asObject).anyMatch(value -> value.getString("id", "").endsWith("reroll:catch"))) submit(session, role, "reroll:catch", null);
            assertEquals(java.util.Arrays.asList("passRoll", "catchRoll", "reRoll", "catchRoll"), checks(records(session)));
            cases.add(new JsonObject().add("name", role + "-pass-catch").add("records", records(session)));
        }
        write("follow-up", cases);
    }

    void addSkill(GameState state, String id, String name) {
        ((RosterPlayer) state.getGame().getPlayerById(id)).addSkill(state.getGame().getRules().getSkillFactory().forName(name));
    }
    private JsonObject report(JsonArray records, String id) {
        return reports(records).values().stream().map(JsonValue::asObject).filter(value -> id.equals(value.getString("reportId", null))).findFirst().get();
    }
    private java.util.List<String> reportIds(JsonArray records) {
        return reports(records).values().stream().map(value -> value.asObject().getString("reportId", "")).collect(java.util.stream.Collectors.toList());
    }
    private java.util.List<String> checks(JsonArray records) {
        return reportIds(records).stream().filter(id -> id.endsWith("Roll") || id.equals("reRoll")).collect(java.util.stream.Collectors.toList());
    }

    GameState fixture(boolean home, boolean looseBall) throws Exception {
        return fixture(home, looseBall, false);
    }
    GameState fixture(boolean home, boolean looseBall, boolean chain) throws Exception {
        GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
        new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(11, 7)
            .withTeam(home, team -> {
                team.player("actor", player -> player.at(10, 7).stats(6, 3, 3, 3, 9))
                    .player("mate", player -> player.at(chain ? 12 : 14, chain ? 7 : 8).stats(6, 3, 3, 3, 9));
                if (chain) team.player("wall1", player -> player.at(12, 6).stats(6, 3, 3, 3, 9))
                    .player("wall2", player -> player.at(12, 8).stats(6, 3, 3, 3, 9));
            })
            .withTeam(!home, team -> team.player("opponent", player -> player.at(20, 12).stats(6, 3, 3, 3, 9))).build();
        ((RosterPlayer) state.getGame().getPlayerById("actor")).setName("Runner");
        ((RosterPlayer) state.getGame().getPlayerById("mate")).setName("Catcher");
        ((RosterPlayer) state.getGame().getPlayerById("opponent")).setName("Opponent");
        state.getGame().setHomePlaying(home);
        state.getGame().getFieldModel().setBallMoving(looseBall);
        if (!looseBall) state.getGame().getFieldModel().setBallInPlay(false);
        StepEngine.start(state);
        return state;
    }
    SetupSession session(GameState state) throws Exception {
        SetupSession session = new SetupSessionTest().session(11, true);
        state.initCommandNrGenerator(JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject().get("transcript").asObject().getInt("nativeCursor", 0));
        Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state);
        return session;
    }
    JsonObject view(SetupSession session, String role) { return session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }
    void submit(SetupSession session, String role, String kind, JsonObject square) {
        JsonObject view = view(session, role), selected = null;
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if ((kind.equals(action.getString("kind", null)) || action.getString("id", "").endsWith(kind)) && (square == null || square.equals(action.get("target")))) { selected = action; break; }
        }
        assertTrue(selected != null, "Missing " + kind + " at " + view);
        assertEquals("ACCEPTED", session.apply(role, new JsonObject().add("operation", "action").add("requestId", "action-" + view.getInt("revision", 0))
            .add("expectedRevision", view.get("revision")).add("actionId", selected.get("id"))).getString("code", null));
    }
    private JsonObject route(SetupSession session, String role, JsonArray points) {
        JsonObject view = view(session, role), request = new JsonObject().add("operation", "route").add("requestId", "route-" + view.getInt("revision", 0))
            .add("expectedRevision", view.get("revision")).add("playerId", "actor").add("waypoints", points);
        assertEquals("ACCEPTED", session.apply(role, request).getString("code", null)); return request;
    }
    JsonArray records(SetupSession session) {
        JsonArray all = new JsonArray(); int next = 0;
        do { JsonObject page = session.transcriptPage(next, 8); for (JsonValue value : page.get("records").asArray()) all.add(value);
            next = page.getInt("next", 0); if (next == page.getInt("total", 0)) break; } while (true);
        return all;
    }
    JsonArray reports(JsonArray records) {
        JsonArray all = new JsonArray();
        for (JsonValue record : records) for (JsonValue sync : record.asObject().get("native").asArray())
            for (JsonValue report : sync.asObject().get("reportList").asObject().get("reports").asArray()) all.add(report);
        return all;
    }
    JsonObject point(int x, int y) { return new JsonObject().add("x", x).add("y", y); }
    void write(String name, JsonArray cases) throws Exception {
        Files.write(Paths.get("target", "match-log-" + name + ".json"), cases.toString().getBytes(StandardCharsets.UTF_8));
    }
}
