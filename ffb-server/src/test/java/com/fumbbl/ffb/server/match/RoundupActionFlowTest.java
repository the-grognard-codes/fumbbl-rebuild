package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.report.logcontrol.SkipInjuryParts;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RoundupActionFlowTest {
    @Test void adjacentBlitzWorksWithoutDisplacementAndAllowsRemainingMovement() throws Exception {
        String exportPath = System.getProperty("roundup.proneBlitzFixture");
        JsonObject exported = exportPath == null ? null : new JsonObject();
        for (int base : new int[] {PlayerState.STANDING, PlayerState.PRONE}) {
            Scenario scenario = new Scenario(base);
            JsonObject ready = scenario.view();
            JsonObject journey = exported == null ? null : new JsonObject()
                .add("playerId", scenario.attacker.getId()).add("targetPlayerId", scenario.first.getId())
                .add("ready", stage(scenario, ready));
            JsonObject plan = scenario.fixture.session.movementPreview(scenario.role, ready.getInt("revision", -1),
                scenario.attacker.getId(), "blitz", scenario.first.getId(), new JsonArray());
            assertTrue(plan.get("route").asObject().get("steps").asArray().isEmpty());
            JsonObject rolled = scenario.fixture.session.apply(scenario.role,
                scenario.fixture.request("movement", "adjacent-blitz", ready).add("playerId", scenario.attacker.getId())
                    .add("kind", "blitz").add("targetPlayerId", scenario.first.getId()).add("waypoints", new JsonArray()))
                .get("state").asObject();
            assertEquals(new FieldCoordinate(7, 7), scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker));
            assertTrue(scenario.game.getTurnData().isBlitzUsed());
            assertEquals(base == PlayerState.PRONE ? 4 : 1, scenario.game.getActingPlayer().getCurrentMove());
            if (journey != null) journey.add("preview", plan).add("accepted", stage(scenario, rolled));
            for (int index = 0; index < 12 && !hasAction(rolled, "move"); index++) rolled = scenario.resolve(rolled, index);
            assertTrue(hasAction(rolled, "move"), rolled.get("actions").toString());
            if (journey != null) journey.add("afterBlock", stage(scenario, rolled));
            JsonObject move = rolled.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "move".equals(action.getString("kind", null))).findFirst().get();
            JsonArray points = new JsonArray().add(move.get("target"));
            JsonObject moved = scenario.fixture.session.apply(scenario.role,
                scenario.fixture.request("movement", "post-blitz-move", rolled).add("playerId", scenario.attacker.getId())
                    .add("kind", "move").add("targetPlayerId", JsonValue.NULL).add("waypoints", points)).get("state").asObject();
            assertEquals(rolled.getInt("revision", -1) + 1, moved.getInt("revision", -1));
            if (journey != null) exported.add(base == PlayerState.PRONE ? "proneDirect" : "standingDirect", journey);
        }
        if (exported != null) exportProneBlitzFixture(exported, exportPath);
    }

    private void exportProneBlitzFixture(JsonObject exported, String exportPath) throws Exception {
        for (String declarationKind : new String[] { "blitz", "stand" }) {
            Scenario scenario = new Scenario(PlayerState.PRONE);
            JsonObject ready = scenario.view();
            JsonObject journey = new JsonObject().add("playerId", scenario.attacker.getId())
                .add("targetPlayerId", scenario.first.getId()).add("ready", stage(scenario, ready));
            JsonObject declaration = ready.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> declarationKind.equals(action.getString("kind", null))
                    && scenario.attacker.getId().equals(action.getString("sourcePlayerId", null))).findFirst().orElse(null);
            if (declaration == null) {
                journey.add("declarationUnavailable", true);
            } else {
                JsonObject declared = scenario.fixture.session.apply(scenario.role,
                    scenario.fixture.request("action", "export-" + declarationKind, ready).add("actionId", declaration.get("id")))
                    .get("state").asObject();
                journey.add("declaration", declaration).add("declared", stage(scenario, declared));
                try {
                    JsonObject plan = scenario.fixture.session.movementPreview(scenario.role, declared.getInt("revision", -1),
                        scenario.attacker.getId(), "blitz", scenario.first.getId(), new JsonArray());
                    journey.add("preview", plan);
                    JsonObject accepted = scenario.fixture.session.apply(scenario.role,
                        scenario.fixture.request("movement", "export-blitz-movement-" + declarationKind, declared).add("playerId", scenario.attacker.getId())
                            .add("kind", "blitz").add("targetPlayerId", scenario.first.getId()).add("waypoints", new JsonArray()))
                        .get("state").asObject();
                    journey.add("accepted", stage(scenario, accepted));
                } catch (MatchService.Failure failure) {
                    journey.add("blitzFailure", failure.code);
                }
            }
            exported.add("blitz".equals(declarationKind) ? "proneDeclaredBlitz" : "proneStandFirst", journey);
        }
        Path output = Paths.get(exportPath);
        if (output.getParent() != null) Files.createDirectories(output.getParent());
        Files.write(output, exported.toString().getBytes(StandardCharsets.UTF_8));
    }

    private JsonObject stage(Scenario scenario, JsonObject view) {
        return new JsonObject().add("state", view)
            .add("currentMove", scenario.game.getActingPlayer().getCurrentMove())
            .add("blitzUsed", scenario.game.getTurnData().isBlitzUsed());
    }

    @Test void multipleBlockResolvesBothTargetsInEitherSelectedOrderAndSurvivesRecovery() throws Exception {
        for (boolean reverse : new boolean[] {false, true}) for (boolean turnover : new boolean[] {false, true}) {
            Scenario scenario = new Scenario(PlayerState.STANDING);
            SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
            ((RosterPlayer) scenario.attacker).addSkill(skills.forName("Multiple Block"));
            scenario.attacker.setStrength(6);
            scenario.place(scenario.second, 7, 6, PlayerState.STANDING);
            JsonObject ready = scenario.view();
            JsonObject declaration = ready.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "declareMultipleBlock".equals(action.getString("kind", null))).findFirst().get();
            JsonObject declared = scenario.fixture.session.apply(scenario.role,
                scenario.fixture.request("action", "declare-multiple", ready).add("actionId", declaration.get("id")))
                .get("state").asObject();
            String first = (reverse ? scenario.second : scenario.first).getId();
            JsonObject option = declared.get("blockPreview").asObject().get("multiple").asArray().values().stream()
                .map(JsonValue::asObject).filter(value -> first.equals(value.get("context").asObject().get("blocks")
                    .asArray().get(0).asObject().getString("targetPlayerId", null))).findFirst().get();
            if (turnover) scenario.forceFirstSkulls(Math.abs(option.get("context").asObject().get("blocks")
                .asArray().get(0).asObject().getInt("dice", 1)));
            JsonObject rolled = scenario.fixture.session.apply(scenario.role,
                scenario.fixture.request("action", "ordered-pair", declared).add("actionId", option.get("actionId")))
                .get("state").asObject();
            assertEquals(first, rolled.get("blockContext").asObject().get("blocks").asArray().get(0).asObject().getString("targetPlayerId", null));
            SetupSession restored = new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact());
            List<String> pushed = new ArrayList<>();
            for (int index = 0; index < 16 && rolled.get("blockContext") != null; index++) {
                JsonObject choice = resolution(rolled);
                if ("push".equals(choice.getString("kind", null))) pushed.add(rolled.get("blockContext").asObject()
                    .getString("activeTargetPlayerId", null));
                rolled = restored.apply(choice.getString("actor", null), scenario.fixture.request("action", "resolve-" + index, rolled)
                    .add("actionId", choice.get("id"))).get("state").asObject();
            }
            assertFalse(rolled.names().contains("blockContext"), rolled.toString());
            assertFalse(hasAction(rolled, "multiBlock"));
            String second = (reverse ? scenario.first : scenario.second).getId();
            assertEquals(turnover ? Collections.singletonList(second) : Arrays.asList(first, second), pushed,
                "Both Blocks resolve in selected order; a simultaneous first-block turnover does not discard the second Block");
            JsonObject defender = rolled.get("players").asArray().values().stream().map(JsonValue::asObject)
                .filter(player -> second.equals(player.getString("id", null))).findFirst().get();
            FieldCoordinate oldPosition = reverse ? new FieldCoordinate(8, 7) : new FieldCoordinate(7, 6);
            assertFalse(defender.getInt("x", -1) == oldPosition.getX() && defender.getInt("y", -1) == oldPosition.getY(),
                "The second defender must actually be pushed, not merely disappear from the context");
            if (turnover) assertFalse(scenario.role.equals(rolled.getString("actor", null)), "Turnover completes after both Blocks");
        }
    }

    @Test void multipleBlockBothDownKnocksDownBothUnskilledPlayersThenResolvesSecondBlock() throws Exception {
        verifyBothDown("PUSHBACK", "none");
    }

    @Test void multipleBlockBothDownThenStumbleKnocksDownBothDefenders() throws Exception {
        verifyBothDown("POW/PUSH", "none");
    }

    @Test void multipleBlockBothDownOnBothTargetsPreservesBothKnockdowns() throws Exception {
        verifyBothDown("BOTH DOWN", "none");
    }

    @Test void multipleBlockBothDownRespectsBlockOnAttacker() throws Exception {
        verifyBothDown("PUSHBACK", "attacker");
    }

    @Test void multipleBlockBothDownRespectsBlockOnFirstDefender() throws Exception {
        verifyBothDown("PUSHBACK", "defender");
    }

    private void verifyBothDown(String secondFace, String blockControl) throws Exception {
        for (boolean recover : new boolean[] { false, true }) for (boolean reverse : new boolean[] { false, true }) {
            Scenario scenario = new Scenario(PlayerState.STANDING);
            SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
            ((RosterPlayer) scenario.attacker).addSkill(skills.forName("Multiple Block"));
            // Keep both faces selectable in both native dice pools, including mutual defending assists.
            scenario.attacker.setStrength(8);
            scenario.place(scenario.second, 7, 6, PlayerState.STANDING);
            String first = (reverse ? scenario.second : scenario.first).getId();
            String second = (reverse ? scenario.first : scenario.second).getId();
            if ("attacker".equals(blockControl)) ((RosterPlayer) scenario.attacker).addSkill(skills.forName("Block"));
            if ("defender".equals(blockControl)) ((RosterPlayer) scenario.game.getPlayerById(first)).addSkill(skills.forName("Block"));
            JsonObject ready = scenario.view();
            for (String id : Arrays.asList(scenario.attacker.getId(), first)) {
                boolean expectedBlock = id.equals(scenario.attacker.getId()) ? "attacker".equals(blockControl) : "defender".equals(blockControl);
                assertEquals(expectedBlock, player(ready, id).get("skills").asArray().values().stream()
                    .anyMatch(value -> "Block".equals(value.asString())), "Both Down control must use the intended Block skills");
            }
            JsonObject declaration = ready.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "declareMultipleBlock".equals(action.getString("kind", null))).findFirst().get();
            JsonObject declared = scenario.fixture.session.apply(scenario.role,
                scenario.fixture.request("action", "both-down-declaration", ready).add("actionId", declaration.get("id")))
                .get("state").asObject();
            JsonObject option = declared.get("blockPreview").asObject().get("multiple").asArray().values().stream()
                .map(JsonValue::asObject).filter(value -> first.equals(value.get("context").asObject().get("blocks")
                    .asArray().get(0).asObject().getString("targetPlayerId", null))).findFirst().get();
            scenario.forceBothDownAlternatives(secondFace);
            JsonObject rolled = scenario.fixture.session.apply(scenario.role,
                scenario.fixture.request("action", "both-down-targets", declared).add("actionId", option.get("actionId")))
                .get("state").asObject();
            SetupSession session = recover
                ? new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact())
                : scenario.fixture.session;
            List<String> resolved = new ArrayList<>();
            List<String> pushed = new ArrayList<>();
            for (int index = 0; index < 16 && rolled.get("blockContext") != null; index++) {
                String expectedFace = resolved.isEmpty() ? "BOTH DOWN" : secondFace;
                JsonObject choice = bothDownResolution(rolled, expectedFace, resolved.isEmpty() ? first : second);
                String target = rolled.get("blockContext").asObject().getString("activeTargetPlayerId", null);
                if ("blockDie".equals(choice.getString("kind", null))) {
                    assertEquals(scenario.role, rolled.getString("actor", null), "Turnover waits for both Blocks");
                    assertTrue(choice.getString("label", "").contains(expectedFace),
                        "Unexpected choice " + choice + "; resolved=" + resolved + ", reverse=" + reverse + ", recover=" + recover);
                    resolved.add(choice.get("target").asObject().getString("playerId", null));
                }
                if ("push".equals(choice.getString("kind", null))) pushed.add(target);
                rolled = session.apply(choice.getString("actor", null), scenario.fixture.request("action", "both-down-resolve-" + index, rolled)
                    .add("actionId", choice.get("id"))).get("state").asObject();
                if (recover) {
                    try {
                        session = new SetupSession(scenario.fixture.server, scenario.fixture.document, session.recoveryArtifact());
                    } catch (MatchService.Failure failure) {
                        String evidencePath = System.getProperty("roundup.bothDownRecovery");
                        if (evidencePath != null) Files.write(Paths.get(evidencePath), session.recoveryArtifact().getBytes(StandardCharsets.UTF_8));
                        throw new AssertionError("Recovery after " + choice + "; reverse=" + reverse
                            + ", second=" + secondFace + ", Block=" + blockControl
                            + ", revision=" + rolled.getInt("revision", -1), failure);
                    }
                }
            }
            assertEquals(Arrays.asList(first, second), resolved, "Both Blocks must resolve in selected order");
            assertFalse(rolled.names().contains("blockContext"), "Both Block resolutions must finish");
            assertEquals("BOTH DOWN".equals(secondFace) ? Collections.emptyList() : Collections.singletonList(second), pushed,
                "Second Block must complete its own push/knockdown after first Both Down");
            assertEquals("defender".equals(blockControl) ? "is standing" : "is prone", player(rolled, first).getString("state", null),
                "First defender's Both Down outcome; reverse=" + reverse + ", recover=" + recover + ", second=" + secondFace);
            assertEquals("attacker".equals(blockControl) ? "is standing" : "is prone", player(rolled, scenario.attacker.getId()).getString("state", null),
                "Attacker's Both Down outcome");
            assertEquals("PUSHBACK".equals(secondFace) ? "is standing" : "is prone", player(rolled, second).getString("state", null),
                "Second defender must resolve its selected result independently");
            assertEquals("attacker".equals(blockControl), scenario.role.equals(rolled.getString("actor", null)),
                "Only an attacker protected by Block avoids turnover after both Blocks");
            assertEquals(!"defender".equals(blockControl), hasArmorReport(session, first, declared.getInt("revision", -1)),
                "First defender must receive a visible resolved armor roll exactly when Both Down knocks them down");
        }
    }

    private boolean hasArmorReport(SetupSession session, String defenderId, int afterRevision) {
        int cursor = 0;
        do {
            JsonObject page = session.transcriptPage(cursor, 8);
            for (JsonValue record : page.get("records").asArray()) {
                if (record.asObject().get("state").asObject().getInt("revision", -1) <= afterRevision) continue;
                for (JsonValue sync : record.asObject().get("native").asArray()) {
                    JsonValue reportList = sync.asObject().get("reportList");
                    if (reportList == null || reportList.isNull()) continue;
                    for (JsonValue value : reportList.asObject().get("reports").asArray()) {
                        JsonObject report = value.asObject();
                        if ("injury".equals(report.getString("reportId", null))
                            && defenderId.equals(report.getString("defenderId", null))
                            && new JsonArray().add(1).add(1).equals(report.get("armorRoll"))
                            && !report.getBoolean("armorBroken", true)
                            && !SkipInjuryParts.valueOf(report.getString("skipInjuryParts", "NONE")).isArmour()) return true;
                    }
                }
            }
            cursor = page.getInt("next", -1);
            if (cursor == page.getInt("total", -1)) return false;
        } while (true);
    }

    private JsonObject bothDownResolution(JsonObject view, String expectedFace, String targetId) {
        if (hasAction(view, "blockDie")) {
            return view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "blockDie".equals(action.getString("kind", null))
                    && targetId.equals(action.get("target").asObject().getString("playerId", null))
                    && action.getString("label", "").contains("Choose " + expectedFace + " ("))
                .findFirst().orElseThrow(() -> new AssertionError("Missing " + expectedFace + " in " + view.get("actions")));
        }
        return resolution(view);
    }

    private JsonObject player(JsonObject view, String id) {
        return view.get("players").asArray().values().stream().map(JsonValue::asObject)
            .filter(value -> id.equals(value.getString("id", null))).findFirst().get();
    }

    private static boolean hasAction(JsonObject view, String kind) {
        return view.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .anyMatch(action -> kind.equals(action.getString("kind", null)));
    }

    private static JsonObject resolution(JsonObject view) {
        for (String kind : new String[] {"blockDie", "push", "followUp", "reroll"}) {
            for (JsonValue value : view.get("actions").asArray()) {
                JsonObject action = value.asObject();
                if (kind.equals(action.getString("kind", null)) && (!"reroll".equals(kind)
                    || action.getString("id", "").endsWith(":none"))) return action;
            }
        }
        throw new AssertionError("No resolution choice: " + view.get("actions"));
    }

    private final class Scenario {
        final SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
        final GameState state;
        final Game game;
        final String role;
        final Player<?> attacker, first, second;

        Scenario(int base) throws Exception {
            role = fixture.advanceToTurn().getString("actor", null);
            Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
            state = (GameState) field.get(fixture.session); game = state.getGame();
            attacker = game.getActingTeam().getPlayers()[0];
            first = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            second = game.getOtherTeam(game.getActingTeam()).getPlayers()[1];
            UtilBox.putAllPlayersIntoBox(game);
            game.getFieldModel().removeSkillEnhancements(attacker, KickoffResult.DODGY_SNACK.getName());
            place(attacker, 7, 7, base); place(first, 8, 7, PlayerState.STANDING);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14)); game.getFieldModel().setBallMoving(true);
            List<DiceCategory> rolls = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                BlockDiceCategory roll = new BlockDiceCategory(); roll.parseCommand("push", game, game.getTeamHome()); rolls.add(roll);
            }
            state.getDiceRoller().getTestRolls().put("Block", rolls);
        }
        void place(Player<?> player, int x, int y, int base) {
            game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
            game.getFieldModel().setPlayerState(player, new PlayerState(base).changeActive(true));
        }
        void forceFirstSkulls(int dice) {
            List<DiceCategory> rolls = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                BlockDiceCategory roll = new BlockDiceCategory(); roll.parseCommand(index < dice ? "skull" : "push", game, game.getTeamHome()); rolls.add(roll);
            }
            state.getDiceRoller().getTestRolls().put("Block", rolls);
            List<DiceCategory> armor = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                DiceCategory roll = new DiceCategory(); roll.parseCommand("1", game, game.getTeamHome()); armor.add(roll);
            }
            state.getDiceRoller().getTestRolls().put("General", armor);
        }
        void forceBothDownAlternatives(String secondFace) {
            forceFirstSkulls(0);
            List<DiceCategory> rolls = new ArrayList<>();
            // Native pool allocation is independent of the coach's chosen target resolution order.
            for (int index = 0; index < 12; index++) {
                BlockDiceCategory roll = new BlockDiceCategory();
                String result = "BOTH DOWN".equals(secondFace) || index % 2 == 0 ? "bothdown"
                    : "POW/PUSH".equals(secondFace) ? "stumble" : "push";
                roll.parseCommand(result, game, game.getTeamHome());
                rolls.add(roll);
            }
            state.getDiceRoller().getTestRolls().put("Block", rolls);
        }
        JsonObject view() { return fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }
        JsonObject resolve(JsonObject view, int index) {
            JsonObject choice = resolution(view);
            return fixture.session.apply(choice.getString("actor", null), fixture.request("action", "choice-" + index, view)
                .add("actionId", choice.get("id"))).get("state").asObject();
        }
    }
}
