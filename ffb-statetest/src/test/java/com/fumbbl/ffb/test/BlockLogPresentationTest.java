package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.net.commands.ServerCommand;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BlockLogPresentationTest {
    private final MatchLogPresentationTest log = new MatchLogPresentationTest();

    @Test void allNativeFacesKeepParticipantsChooserAndActualPlayerOutcomes() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (String face : new String[] {"skull", "bothdown", "pushback", "push-four", "stumble", "pow"}) {
            GameState state = fixture(home); SetupSession session = log.session(state);
            if ("push-four".equals(face)) TestRolls.on(state).general(4);
            else TestRolls.on(state).block(face, face, face);
            TestRolls.on(state).general(2, 2, 2, 2, 2, 2);
            start(session); choose(session, "block-die:0"); resolve(session, false);
            JsonArray records = log.records(session); JsonObject choice = report(records, "blockChoice");
            assertContext(choice, home, false);
            assertEquals(1, reports(records, "blockChoice"));
            assertEquals("skull".equals(face) || "bothdown".equals(face), hasOutcome(records, "actor", "knockdown"));
            assertEquals("bothdown".equals(face) || "stumble".equals(face) || "pow".equals(face), hasOutcome(records, "opponent", "knockdown"));
            if (face.startsWith("push") || "stumble".equals(face) || "pow".equals(face)) assertTrue(hasOutcome(records, "opponent", "push"));
            unchangedNativeSources(state);
            cases.add(testCase(home, face, records));
        }
        log.write("block-faces", cases);
    }

    @Test void blockDodgeTackleWrestleGrabAndChainPushUseNativePlayerSpecificEffects() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (String kind : new String[] {"both-block", "attacker-block", "defender-block", "dodge", "tackle", "wrestle-attacker", "wrestle-defender", "wrestle-decline", "grab", "chain"}) {
            GameState state = fixture(home, kind.equals("chain"));
            if (kind.contains("block")) {
                if (!kind.equals("defender-block")) log.addSkill(state, "actor", "Block");
                if (!kind.equals("attacker-block")) log.addSkill(state, "opponent", "Block");
            }
            if (kind.equals("dodge") || kind.equals("tackle")) log.addSkill(state, "opponent", "Dodge");
            if (kind.equals("tackle")) log.addSkill(state, "actor", "Tackle");
            if (kind.startsWith("wrestle")) log.addSkill(state, kind.endsWith("attacker") ? "actor" : "opponent", "Wrestle");
            if (kind.equals("wrestle-decline")) { log.addSkill(state, "actor", "Block"); log.addSkill(state, "opponent", "Block"); }
            if (kind.equals("grab")) log.addSkill(state, "actor", "Grab");
            if (kind.equals("chain")) state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("mate"), new FieldCoordinate(12, 7));
            String face = kind.contains("block") || kind.startsWith("wrestle") ? "bothdown" : kind.equals("dodge") || kind.equals("tackle") ? "stumble" : "pushback";
            TestRolls.on(state).block(face, face, face).general(2, 2, 2, 2, 2, 2);
            SetupSession session = log.session(state); start(session); choose(session, "block-die:0"); resolve(session, kind.equals("chain"), !kind.equals("wrestle-decline"));
            JsonArray records = log.records(session);
            if (kind.equals("both-block")) {
                assertTrue(hasOutcome(records, "actor", "standing")); assertTrue(hasOutcome(records, "opponent", "standing"));
                assertFalse(hasOutcome(records, "actor", "knockdown")); assertFalse(hasOutcome(records, "opponent", "knockdown"));
            }
            if (kind.equals("attacker-block")) { assertTrue(hasOutcome(records, "actor", "standing")); assertTrue(hasOutcome(records, "opponent", "knockdown")); }
            if (kind.equals("defender-block")) { assertTrue(hasOutcome(records, "opponent", "standing")); assertTrue(hasOutcome(records, "actor", "knockdown")); }
            if (kind.equals("dodge")) { assertFalse(hasOutcome(records, "opponent", "knockdown")); assertTrue(skill(records, "opponent", "Dodge")); }
            if (kind.equals("tackle")) { assertTrue(hasOutcome(records, "opponent", "knockdown")); assertTrue(skill(records, "actor", "Tackle")); }
            if (kind.startsWith("wrestle") && !kind.equals("wrestle-decline")) {
                assertTrue(hasOutcome(records, "actor", "prone")); assertTrue(hasOutcome(records, "opponent", "prone"));
                assertFalse(hasOutcome(records, "actor", "knockdown")); assertFalse(hasOutcome(records, "opponent", "knockdown"));
                assertEquals(PlayerState.PRONE, state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("actor")).getBase());
                assertTrue(skill(records, kind.endsWith("attacker") ? "actor" : "opponent", "Wrestle"));
                assertEquals(0, reports(records, "injury"));
            }
            if (kind.equals("wrestle-decline")) { assertTrue(hasOutcome(records, "actor", "standing")); assertTrue(hasOutcome(records, "opponent", "standing")); }
            if (kind.equals("chain")) {
                assertTrue(hasOutcome(records, "mate", "push")); assertTrue(hasOutcome(records, "opponent", "push")); assertTrue(hasOutcome(records, "actor", "followUp"));
            }
            unchangedNativeSources(state); cases.add(testCase(home, kind, records));
        }
        log.write("block-skills", cases);
    }

    @Test void proAndBrawlerKeepOriginalFacesAndTheFinalUphillChooser() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (boolean uphill : new boolean[] {true, false}) for (String skill : new String[] {"Pro", "Brawler"}) {
            GameState state = fixture(home); state.getGame().getPlayerById("actor").setStrength(uphill ? 2 : 4); log.addSkill(state, "actor", skill);
            TestRolls.on(state).block("bothdown", "skull", "pushback").general(6, 2, 2, 2, 2);
            SetupSession session = log.session(state); start(session);
            JsonObject initial = report(log.records(session), "blockRoll"); assertEquals(new JsonArray().add(2).add(1), initial.get("blockRoll"));
            choose(session, "block-reroll:" + skill.toLowerCase());
            if (actions(session).values().stream().anyMatch(value -> "rerollDie".equals(value.asObject().getString("kind", "")))) choose(session, "block-reroll-die:1");
            choose(session, "block-die:" + (skill.equals("Pro") ? 1 : 0)); resolve(session, false);
            JsonArray records = log.records(session); assertContext(report(records, "blockChoice"), home, uphill);
            assertEquals(new JsonArray().add(3), report(records, "blockReRoll").get("blockRoll"));
            assertEquals(new JsonArray().add(2).add(1), report(records, "blockRoll").get("blockRoll"));
            cases.add(testCase(home, skill.toLowerCase() + (uphill ? "-uphill" : "-downhill"), records));
        }
        log.write("block-rerolls", cases);
    }

    @Test void uphillProTestRetryAndExactAcceptedRetriesDoNotChangeFinalChooserOrAppendAttempts() throws Exception {
        JsonArray cases = new JsonArray();
        for (boolean home : new boolean[] {true, false}) {
            GameState state = fixture(home); state.getGame().getPlayerById("actor").setStrength(2); log.addSkill(state, "actor", "Pro");
            state.getGame().getTurnData().setReRolls(1); TestRolls.on(state).block("bothdown", "skull", "pushback").general(1, 6, 2, 2, 2, 2);
            SetupSession session = log.session(state); start(session); choose(session, "block-reroll:pro"); choose(session, "block-pro-test:team"); choose(session, "block-reroll-die:1");
            JsonObject die = action(session, "block-die:1"), before = log.view(session, "home");
            JsonObject request = new JsonObject().add("operation", "action").add("requestId", "choose-exact")
                .add("expectedRevision", before.get("revision")).add("actionId", die.get("id"));
            String role = die.getString("actor", null); assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
            JsonArray records = log.records(session); assertTrue(session.apply(role, request).getBoolean("duplicate", false)); assertEquals(records, log.records(session));
            resolve(session, false); records = log.records(session); assertContext(report(records, "blockChoice"), home, true);
            cases.add(testCase(home, "pro-test-uphill", records));
        }
        log.write("block-pro-test", cases);
    }

    private GameState fixture(boolean home) throws Exception {
        return fixture(home, false);
    }
    private GameState fixture(boolean home, boolean chain) throws Exception {
        GameState state = log.fixture(home, false, chain);
        state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("opponent"), new FieldCoordinate(11, 7));
        state.getGame().getTurnData().setReRolls(0); return state;
    }
    private void start(SetupSession session) { choose(session, "selectBlock", true); choose(session, "block", true); }
    private JsonArray actions(SetupSession session) { return log.view(session, "home").get("actions").asArray(); }
    private JsonObject action(SetupSession session, String id) { return actions(session).values().stream().map(JsonValue::asObject)
        .filter(value -> value.getString("id", "").endsWith(id)).findFirst().orElseThrow(() -> new AssertionError("Missing " + id + " actions " + actions(session))); }
    private void choose(SetupSession session, String id) { choose(session, id, false); }
    private void choose(SetupSession session, String id, boolean kind) {
        JsonObject action = kind ? actions(session).values().stream().map(JsonValue::asObject).filter(value -> id.equals(value.getString("kind", null))).findFirst().get() : action(session, id);
        JsonObject view = log.view(session, "home");
        assertEquals("ACCEPTED", session.apply(action.getString("actor", null), new JsonObject().add("operation", "action")
            .add("requestId", "block-" + view.getInt("revision", 0)).add("expectedRevision", view.get("revision")).add("actionId", action.get("id"))).getString("code", null));
    }
    private void resolve(SetupSession session, boolean follow) { resolve(session, follow, true); }
    private void resolve(SetupSession session, boolean follow, boolean useSkill) {
        for (int count = 0; count < 12; count++) {
            JsonArray actions = actions(session);
            if (actions.values().stream().anyMatch(value -> "skill".equals(value.asObject().getString("kind", null)))) choose(session, "skill:" + useSkill);
            else if (actions.values().stream().anyMatch(value -> "push".equals(value.asObject().getString("kind", null)))) {
                JsonObject chosen = actions.values().stream().map(JsonValue::asObject).filter(value -> "push".equals(value.getString("kind", null)))
                    .filter(value -> log.point(12, 7).equals(value.get("target")) || log.point(13, 7).equals(value.get("target"))).findFirst()
                    .orElseGet(() -> actions.values().stream().map(JsonValue::asObject).filter(value -> "push".equals(value.getString("kind", null))).findFirst().get());
                choose(session, chosen.getString("id", ""));
            } else if (actions.values().stream().anyMatch(value -> "followUp".equals(value.asObject().getString("kind", null)))) choose(session, "follow-up:" + (follow ? "yes" : "no"));
            else return;
        }
        throw new AssertionError("Unresolved block sequence");
    }
    private void assertContext(JsonObject report, boolean home, boolean uphill) {
        JsonObject block = report.get("logBlock").asObject(); assertEquals("actor", block.getString("attackerId", null));
        assertEquals("opponent", block.getString("defenderId", null)); assertEquals(home != uphill ? "home" : "away", block.getString("chooser", null));
    }
    private JsonObject report(JsonArray records, String id) { return log.reports(records).values().stream().map(JsonValue::asObject).filter(value -> id.equals(value.getString("reportId", null))).findFirst().get(); }
    private long reports(JsonArray records, String id) { return log.reports(records).values().stream().filter(value -> id.equals(value.asObject().getString("reportId", null))).count(); }
    private boolean skill(JsonArray records, String player, String skill) { return log.reports(records).values().stream().map(JsonValue::asObject)
        .anyMatch(report -> "skillUse".equals(report.getString("reportId", null)) && report.get("playerId") != null && report.get("playerId").isString() && player.equals(report.get("playerId").asString()) && skill.equals(report.getString("skill", null)) && report.getBoolean("used", false)); }
    private boolean hasOutcome(JsonArray records, String player, String kind) {
        for (JsonValue record : records) for (JsonValue value : record.asObject().get("native").asArray()) {
            JsonValue outcomes = value.asObject().get("logOutcomes"); if (outcomes == null) continue;
            for (JsonValue event : outcomes.asObject().get("events").asArray())
                if (player.equals(event.asObject().getString("playerId", null)) && kind.equals(event.asObject().getString("kind", null))) return true;
        }
        return false;
    }
    private JsonObject testCase(boolean home, String name, JsonArray records) { return new JsonObject().add("name", (home ? "home-" : "away-") + name).add("records", records); }
    private void unchangedNativeSources(GameState state) {
        for (ServerCommand command : state.getGameLog().getServerCommands()) if (command instanceof ServerCommandModelSync) {
            JsonObject nativeCommand = command.toJsonValue().asObject(); assertNull(nativeCommand.get("logOutcomes"));
            for (JsonValue report : nativeCommand.get("reportList").asObject().get("reports").asArray()) assertNull(report.asObject().get("logBlock"));
        }
    }
}
