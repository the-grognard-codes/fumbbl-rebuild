package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.ReRollProperty;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.BlockRollProperties;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.net.commands.ClientCommandBlock;
import com.fumbbl.ffb.net.commands.ClientCommandBlockOrReRollChoiceForTarget;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.Mode;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.util.BlockAssistService;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BlockVisibilityTest {
    @Test void committedOrdinaryAndBlitzBlocksSurviveRecoveryAndClearWhenPushed() throws Exception {
        JsonArray journeys = new JsonArray();
        for (boolean blitz : new boolean[] {false, true}) for (boolean uphill : new boolean[] {false, true}) {
            Scenario scenario = new Scenario();
            if (blitz) scenario.place(scenario.attacker, 6, 7);
            if (uphill) {
                scenario.game.getFieldModel().setPlayerCoordinate(scenario.own[1], new FieldCoordinate(20, 7));
                scenario.place(scenario.other[1], 6, 6);
                scenario.place(scenario.other[2], 6, 8);
            }
            JsonObject ready = scenario.view();
            assertFalse(ready.names().contains("blockContext"));
            assertFalse(scenario.fixture.session.spectatorView().names().contains("blockPreview"));
            String before = scenario.fixture.session.recoveryArtifact();
            JsonObject plan = blitz ? scenario.fixture.session.movementPreview(scenario.role, ready.getInt("revision", -1),
                scenario.attacker.getId(), "blitz", scenario.defender.getId(), new JsonArray().add(new JsonObject().add("x", 7).add("y", 7))) : null;
            assertEquals(before, scenario.fixture.session.recoveryArtifact(), "Preview cannot mutate state");
            if (plan != null) assertEquals(7, plan.get("blockHighlight").asObject().get("from").asObject().getInt("x", -1));
            scenario.forcePushes();
            JsonObject rolled;
            if (blitz) rolled = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "blitz", ready)
                .add("playerId", scenario.attacker.getId()).add("kind", "blitz").add("targetPlayerId", scenario.defender.getId())
                .add("waypoints", plan.get("waypoints"))).get("state").asObject();
            else {
                JsonObject declared = scenario.act(ready, "selectBlock", scenario.attacker.getId());
                rolled = scenario.act(declared, "block", scenario.attacker.getId());
            }
            JsonObject context = rolled.get("blockContext").asObject();
            assertEquals(scenario.defender.getId(), context.getString("activeTargetPlayerId", null));
            JsonObject block = context.get("blocks").asArray().get(0).asObject();
            assertEquals(scenario.attacker.getId(), block.getString("playerId", null));
            assertEquals(7, block.get("from").asObject().getInt("x", -1));
            assertEquals(uphill ? 0 : 1, block.get("offensiveAssists").asArray().size());
            assertEquals(uphill ? 2 : 0, block.get("defensiveAssists").asArray().size());
            assertEquals(context, scenario.fixture.session.spectatorView().get("blockContext"));
            SetupSession recovered = new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact());
            assertEquals(context, recovered.reply("load", "ACCEPTED", false, scenario.role).get("state").asObject().get("blockContext"));
            JsonObject resolved = rolled;
            for (int index = 0; index < 12 && resolved.names().contains("blockContext"); index++) {
                JsonObject choice = null;
                for (JsonValue value : resolved.get("actions").asArray()) {
                    JsonObject action = value.asObject(); String kind = action.getString("kind", "");
                    if ("blockDie".equals(kind) || "push".equals(kind) || "followUp".equals(kind)
                        || "reroll".equals(kind) && action.getString("id", "").endsWith(":none")) { choice = action; break; }
                }
                assertNotNull(choice, resolved.toString());
                resolved = recovered.apply(choice.getString("actor", null), scenario.fixture.request("action", "resolve-"+index, resolved)
                    .add("actionId", choice.get("id"))).get("state").asObject();
            }
            assertFalse(resolved.names().contains("blockContext"), resolved.toString());
            JsonArray records = new JsonArray();
            int cursor = 0;
            do {
                JsonObject page = recovered.transcriptPage(cursor, 8);
                page.get("records").asArray().forEach(records::add);
                cursor = page.getInt("next", -1);
                if (cursor == page.getInt("total", -1)) break;
            } while (true);
            boolean captured = false;
            for (JsonValue value : records) {
                JsonObject record = value.asObject();
                assertFalse(record.get("state").asObject().names().contains("blockPreview"));
                for (JsonValue sync : record.get("native").asArray())
                    if (sync.asObject().get("blockContext") != null && !sync.asObject().get("blockContext").isNull()) captured = true;
            }
            assertTrue(captured, "Committed native replay must preserve block context");
            journeys.add(new JsonObject().add("blitz", blitz).add("uphill", uphill).add("ready", ready)
                .add("rolled", rolled).add("resolved", resolved).add("records", records));
        }
        String output = System.getProperty("block.visibility.fixture", System.getenv("BLOCK_VISIBILITY_FIXTURE"));
        if (output != null) Files.write(Paths.get(output), journeys.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Test void nativeContributorsExcludeMarkedProneAndEyeGougedPlayersAndIncludeGuard() throws Exception {
        Scenario scenario = new Scenario();
        BlockAssistService assists = new BlockAssistService();
        assertEquals(1, assists.contributors(scenario.game, scenario.attacker, scenario.defender, false).size());
        scenario.place(scenario.other[1], 10, 8);
        assertTrue(assists.contributors(scenario.game, scenario.attacker, scenario.defender, false).isEmpty());
        SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
        ((RosterPlayer) scenario.own[1]).addSkill(skills.forName("Guard"));
        assertEquals(1, assists.contributors(scenario.game, scenario.attacker, scenario.defender, false).size());
        ((RosterPlayer) scenario.other[1]).addSkill(skills.forName("Defensive"));
        assertTrue(assists.contributors(scenario.game, scenario.attacker, scenario.defender, false).isEmpty());
        scenario.game.getFieldModel().setPlayerCoordinate(scenario.other[1], new FieldCoordinate(20, 7));
        scenario.game.getFieldModel().setPlayerState(scenario.own[1], new PlayerState(PlayerState.PRONE));
        assertTrue(assists.contributors(scenario.game, scenario.attacker, scenario.defender, false).isEmpty());
        scenario.game.getFieldModel().setPlayerState(scenario.own[1], new PlayerState(PlayerState.STANDING).changeEyeGouged(true));
        assertTrue(assists.contributors(scenario.game, scenario.attacker, scenario.defender, false).isEmpty());
    }

    @Test void rolledContributorsFreezeButUnrolledOnesRefreshAndTargetMovementClears() throws Exception {
        Scenario scenario = new Scenario();
        JsonObject declared = scenario.act(scenario.view(), "selectBlock", scenario.attacker.getId());
        CommittedBlockPresentation presentation = new CommittedBlockPresentation();
        presentation.prepare(scenario.state, new ClientCommandBlock(scenario.attacker.getId(), scenario.defender.getId(), false, false, false, false, false));
        ReportList reports = new ReportList();
        ServerCommandModelSync sync = new ServerCommandModelSync(new ModelChangeList(), reports, null, null, 0, 0);
        scenario.place(scenario.own[1], 20, 8);
        presentation.observe(scenario.state, sync);
        assertEquals(0, presentation.json().asObject().get("blocks").asArray().get(0).asObject().get("offensiveAssists").asArray().size());
        scenario.place(scenario.own[1], 9, 8);
        scenario.forcePushes();
        JsonObject rolled = scenario.act(declared, "block", scenario.attacker.getId());
        JsonObject frozen = rolled.get("blockContext").asObject();
        Field field = SetupSession.class.getDeclaredField("blockPresentation"); field.setAccessible(true);
        CommittedBlockPresentation committed = (CommittedBlockPresentation) field.get(scenario.fixture.session);
        scenario.place(scenario.own[1], 20, 8);
        committed.observe(scenario.state, sync);
        assertEquals(frozen, committed.json());
        scenario.place(scenario.defender, 9, 7);
        committed.observe(scenario.state, sync);
        assertTrue(committed.json().isNull());
    }

    @Test void multipleBlockKeepsDirectionsButUsesSeparateFrozenAssistSets() throws Exception {
        Scenario scenario = new Scenario();
        SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
        ((RosterPlayer) scenario.attacker).addSkill(skills.forName("Multiple Block"));
        scenario.attacker.setStrength(6);
        scenario.place(scenario.other[1], 7, 6);
        scenario.place(scenario.own[2], 6, 5);
        JsonObject declared = scenario.act(scenario.view(), "declareMultipleBlock", scenario.attacker.getId());
        JsonObject option = declared.get("blockPreview").asObject().get("multiple").asArray().get(0).asObject();
        JsonObject preview = option.get("context").asObject();
        assertEquals(2, preview.get("blocks").asArray().size());
        assertFalse(preview.get("blocks").asArray().get(0).asObject().get("offensiveAssists")
            .equals(preview.get("blocks").asArray().get(1).asObject().get("offensiveAssists")));
        scenario.forcePushes();
        JsonObject rolled = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("action", "multi", declared)
            .add("actionId", option.get("actionId"))).get("state").asObject();
        JsonObject context = rolled.get("blockContext").asObject();
        assertEquals(2, context.get("blocks").asArray().size(), rolled.toString());
        JsonObject checkpoint = JsonObject.readFrom(scenario.fixture.session.recoveryArtifact()).get("payload").asObject().get("blockPresentation").asObject();
        assertEquals(2, checkpoint.get("rolled").asArray().size(), "Both initial native rolls freeze before a response");
        JsonObject initialRoll = JsonObject.readFrom(rolled.toString());
        SetupSession restored = new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact());
        assertEquals(context, restored.reply("load", "ACCEPTED", false, scenario.role).get("state").asObject().get("blockContext"));
        for (int index = 0; index < 14 && rolled.names().contains("blockContext"); index++) {
            JsonObject choice = resolutionChoice(rolled);
            assertNotNull(choice, rolled.toString());
            rolled = restored.apply(choice.getString("actor", null), scenario.fixture.request("action", "multi-resolve-"+index, rolled)
                .add("actionId", choice.get("id"))).get("state").asObject();
        }
        assertFalse(rolled.names().contains("blockContext"), rolled.toString());
        String output = System.getProperty("block.visibility.fixture", System.getenv("BLOCK_VISIBILITY_FIXTURE"));
        if (output != null) {
            JsonArray records = new JsonArray(); int cursor = 0;
            do {
                JsonObject page = restored.transcriptPage(cursor, 8); page.get("records").asArray().forEach(records::add);
                cursor = page.getInt("next", -1); if (cursor == page.getInt("total", -1)) break;
            } while (true);
            Files.write(Paths.get(output.replace(".json", "-multiple.json")), new JsonObject().add("ready", declared)
                .add("rolled", initialRoll).add("resolved", rolled).add("records", records).toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test void frenzyStartsAFreshContextForTheSecondBlock() throws Exception {
        Scenario scenario = new Scenario();
        SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
        ((RosterPlayer) scenario.attacker).addSkill(skills.forName("Frenzy"));
        scenario.forcePushes();
        JsonObject rolled = scenario.act(scenario.act(scenario.view(), "selectBlock", scenario.attacker.getId()), "block", scenario.attacker.getId());
        JsonObject first = rolled.get("blockContext").asObject().get("blocks").asArray().get(0).asObject();
        boolean fresh = false;
        for (int index = 0; index < 16; index++) {
            JsonObject choice = resolutionChoice(rolled);
            if (choice == null) break;
            rolled = scenario.fixture.session.apply(choice.getString("actor", null), scenario.fixture.request("action", "frenzy-resolve-"+index, rolled)
                .add("actionId", choice.get("id"))).get("state").asObject();
            if (rolled.get("blockContext") != null) {
                JsonObject next = rolled.get("blockContext").asObject().get("blocks").asArray().get(0).asObject();
                if (!first.get("from").equals(next.get("from"))) {
                    assertFalse(first.get("to").equals(next.get("to")));
                    fresh = true;
                }
            }
        }
        assertTrue(fresh, "Frenzy second block must identify its new square and target position");
        assertFalse(rolled.names().contains("blockContext"));
    }

    @Test void mixedMultipleBlockHandsTheRemainingTargetToTheOpponentAndFreezesBothRolls() throws Exception {
        Scenario scenario = new Scenario();
        SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
        ((RosterPlayer) scenario.attacker).addSkill(skills.forName("Multiple Block"));
        scenario.attacker.setStrength(6); scenario.other[1].setStrength(7);
        scenario.place(scenario.other[1], 7, 6);
        scenario.forcePushes();
        JsonObject declared = scenario.act(scenario.view(), "declareMultipleBlock", scenario.attacker.getId());
        JsonObject action = declared.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(item -> "multiBlock".equals(item.getString("kind", ""))).findFirst().get();
        JsonObject rolled = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("action", "mixed", declared)
            .add("actionId", action.get("id"))).get("state").asObject();
        JsonObject frozen = JsonObject.readFrom(rolled.get("blockContext").toString());
        Field presentationField = SetupSession.class.getDeclaredField("blockPresentation"); presentationField.setAccessible(true);
        CommittedBlockPresentation presentation = (CommittedBlockPresentation) presentationField.get(scenario.fixture.session);
        assertEquals(2, presentation.checkpoint().get("rolled").asArray().size());
        scenario.place(scenario.own[1], 20, 8);
        presentation.observe(scenario.state, new ServerCommandModelSync(new ModelChangeList(), new ReportList(), null, null, 0, 0));
        assertEquals(frozen, presentation.json(), "Moving a contributor cannot recalculate either rolled block");
        JsonObject firstChoice = rolled.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(item -> "blockDie".equals(item.getString("kind", ""))).findFirst().get();
        JsonObject afterFirst = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("action", "mixed-first", rolled)
            .add("actionId", firstChoice.get("id"))).get("state").asObject();
        JsonObject keep = afterFirst.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(item -> "reroll".equals(item.getString("kind", "")) && item.getString("id", "").endsWith(":none")).findFirst().get();
        JsonObject opponent = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("action", "mixed-keep", afterFirst)
            .add("actionId", keep.get("id"))).get("state").asObject();
        assertFalse(scenario.role.equals(opponent.getString("actor", "")));
        assertEquals(scenario.other[1].getId(), opponent.get("blockContext").asObject().getString("activeTargetPlayerId", ""));
        JsonObject die = opponent.get("actions").asArray().get(0).asObject();
        assertEquals("blockDie", die.getString("kind", ""));
        assertThrows(MatchService.Failure.class, () -> scenario.fixture.session.apply(scenario.role,
            scenario.fixture.request("action", "wrong-mixed-owner", opponent).add("actionId", die.get("id"))));
        scenario.place(scenario.other[1], 8, 6); // Still adjacent: remove the frozen target rather than reprojecting it.
        presentation.observe(scenario.state, new ServerCommandModelSync(new ModelChangeList(), new ReportList(), null, null, 0, 0));
        assertEquals(1, presentation.json().asObject().get("blocks").asArray().size());
        presentation.observe(scenario.state, new ServerCommandModelSync(new ModelChangeList(), new ReportList(), null, null, 0, 0));
        assertEquals(1, presentation.json().asObject().get("blocks").asArray().size(), "A later sync cannot recreate a moved target");
    }

    private JsonObject resolutionChoice(JsonObject view) {
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject(); String kind = action.getString("kind", "");
            if ("blockDie".equals(kind) || "push".equals(kind) || "followUp".equals(kind)
                || "reroll".equals(kind) && action.getString("id", "").endsWith(":none")) return action;
        }
        return null;
    }

    @Test void multipleBlockPromptPreservesNativeSourcesAndDieIndexesWithoutOfferingAttackerUphillChoices() throws Exception {
        Scenario scenario = new Scenario();
        BlockRollProperties roll = new BlockRollProperties(scenario.defender.getId(), new PlayerState(PlayerState.STANDING), 0);
        roll.setOwnChoice(true); roll.setNrOfDice(2); roll.setBlockRoll(new int[] {3, 4}); roll.add(ReRollProperty.TRR);
        Map<String, String> sources = new HashMap<>();
        SkillFactory skills = scenario.game.getRules().getSkillFactory();
        sources.put(ReRolledActions.SINGLE_DIE_PER_ACTIVATION.getName(skills), ReRollSources.PRO.getName());
        sources.put(ReRolledActions.SINGLE_DIE.getName(skills), ReRollSources.CONSUMMATE_PROFESSIONAL.getName());
        sources.put(ReRolledActions.SINGLE_BLOCK_DIE.getName(skills), ReRollSources.WORKING_IN_TANDEM.getName());
        sources.put(ReRolledActions.MULTI_BLOCK_DICE.getName(skills), ReRollSources.SAVAGE_BLOW.getName());
        roll.setReRollSources(sources);
        List<CoreTurnActions.Action> actions = new MultipleBlockPromptActions().project(scenario.game, Arrays.asList(roll), scenario.role, false);
        for (CoreTurnActions.Action action : actions) {
            assertEquals(scenario.role, action.role); assertEquals(scenario.defender.getId(), action.targetPlayerId);
            ClientCommandBlockOrReRollChoiceForTarget command = (ClientCommandBlockOrReRollChoiceForTarget) action.command;
            assertEquals(scenario.defender.getId(), command.getTargetId());
            if (action.id.endsWith(":pro:1")) { assertEquals(ReRollSources.PRO, command.getReRollSource()); assertEquals(1, command.getProIndex()); }
            if (action.id.endsWith(":single:1")) { assertEquals(ReRollSources.CONSUMMATE_PROFESSIONAL, command.getReRollSource()); assertEquals(1, command.getProIndex()); }
            if (action.id.endsWith(":block-single:1")) { assertEquals(ReRollSources.WORKING_IN_TANDEM, command.getReRollSource()); assertEquals(1, command.getAnyDiceIndexes()[0]); }
            if (action.id.endsWith(":multi:3")) { assertEquals(ReRollSources.SAVAGE_BLOW, command.getReRollSource()); assertEquals(2, command.getAnyDiceIndexes().length); }
        }
        assertTrue(actions.stream().anyMatch(action -> action.id.endsWith(":pro:1")));
        assertTrue(actions.stream().anyMatch(action -> action.id.endsWith(":multi:3")));
        roll.setOwnChoice(false);
        actions = new MultipleBlockPromptActions().project(scenario.game, Arrays.asList(roll), scenario.role, false);
        assertTrue(actions.stream().noneMatch(action -> "blockDie".equals(action.kind)));
        String opponent = "home".equals(scenario.role) ? "away" : "home";
        actions = new MultipleBlockPromptActions().project(scenario.game, Arrays.asList(roll), opponent, true);
        assertEquals(2, actions.size());
        assertTrue(actions.stream().allMatch(action -> "blockDie".equals(action.kind) && opponent.equals(action.role)));
    }

    @Test void queuedBlitzKeepsItsCommittedEndpointThroughADodgePauseAndRecovery() throws Exception {
        Scenario scenario = new Scenario();
        scenario.place(scenario.attacker, 6, 7); scenario.place(scenario.own[2], 2, 2);
        scenario.place(scenario.other[1], 5, 6);
        JsonObject active = scenario.act(scenario.view(), "select", scenario.own[2].getId());
        JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", 7).add("y", 7));
        JsonObject plan = scenario.fixture.session.movementPreview(scenario.role, active.getInt("revision", -1),
            scenario.attacker.getId(), "blitz", scenario.defender.getId(), waypoints);
        List<DiceCategory> rolls = new ArrayList<>();
        for (int value : new int[] {1, 6, 6, 6}) {
            DiceCategory roll = new DiceCategory(); roll.parseCommand(Integer.toString(value), scenario.game, scenario.game.getTeamHome()); rolls.add(roll);
        }
        scenario.state.getDiceRoller().getTestRolls().put("General", rolls);
        JsonObject paused = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "queued-blitz", active)
            .add("playerId", scenario.attacker.getId()).add("kind", "blitz").add("targetPlayerId", scenario.defender.getId())
            .add("waypoints", plan.get("waypoints"))).get("state").asObject();
        assertTrue(paused.get("actions").asArray().values().stream().anyMatch(value -> "reroll".equals(value.asObject().getString("kind", ""))), paused.toString());
        JsonObject context = paused.get("blockContext").asObject();
        assertEquals(plan.get("blockHighlight"), context.get("blocks").asArray().get(0));
        SetupSession restored = new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact());
        assertEquals(context, restored.reply("load", "ACCEPTED", false, scenario.role).get("state").asObject().get("blockContext"));
    }

    @Test void optionalDodgePromptPreservesFrozenBlockThroughRecoveryUntilTargetMoves() throws Exception {
        for (boolean useDodge : new boolean[] {false, true}) {
            Scenario scenario = new Scenario();
            SkillFactory skills = scenario.game.getFactory(FactoryType.Factory.SKILL);
            ((RosterPlayer) scenario.defender).addSkill(skills.forName("Dodge"));
            SkillUsePreferences ask = SkillUsePreferences.defaults().with(UseCase.DODGE_BLOCK, Mode.ALWAYS_ASK);
            scenario.fixture.session.configureSkillUsePreferences(ask, ask);
            scenario.forceBlockFaces("stumble");
            JsonObject declared = scenario.act(scenario.view(), "selectBlock", scenario.attacker.getId());
            JsonObject rolled = scenario.act(declared, "block", scenario.attacker.getId());
            JsonObject context = rolled.get("blockContext").asObject();
            JsonObject die = rolled.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "blockDie".equals(action.getString("kind", null))).findFirst().get();
            JsonObject paused = scenario.fixture.session.apply(die.getString("actor", null),
                scenario.fixture.request("action", "choose-stumble", rolled).add("actionId", die.get("id")))
                .get("state").asObject();
            assertEquals(context, paused.get("blockContext"));
            assertEquals(context, scenario.fixture.session.spectatorView().get("blockContext"));
            assertTrue(paused.get("actions").asArray().values().stream().anyMatch(value ->
                "skill".equals(value.asObject().getString("kind", null))), paused.toString());

            // A paused decision and its rolled assists survive recovery even if account policy changes.
            scenario.place(scenario.own[1], 20, 8);
            SetupSession restored = new SetupSession(scenario.fixture.server, scenario.fixture.document,
                scenario.fixture.session.recoveryArtifact());
            restored.configureSkillUsePreferences(SkillUsePreferences.defaults(), SkillUsePreferences.defaults());
            JsonObject pending = restored.reply("load", "ACCEPTED", false, scenario.role).get("state").asObject();
            assertEquals(context, pending.get("blockContext"));
            JsonObject answer = pending.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> action.getString("id", "").endsWith(":skill:" + useDodge)).findFirst()
                .orElseThrow(() -> new AssertionError("Missing Dodge answer: " + pending.get("actions")));
            JsonObject push = restored.apply(answer.getString("actor", null),
                scenario.fixture.request("action", "answer-dodge", pending).add("actionId", answer.get("id")))
                .get("state").asObject();
            assertEquals(context, push.get("blockContext"));
            JsonObject square = push.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "push".equals(action.getString("kind", null))).findFirst().get();
            JsonObject moved = restored.apply(square.getString("actor", null),
                scenario.fixture.request("action", "push-after-dodge", push).add("actionId", square.get("id")))
                .get("state").asObject();
            assertFalse(moved.names().contains("blockContext"));
        }
    }

    private static final class Scenario {
        final SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(1, true);
        final String role;
        final GameState state;
        final Game game;
        final Player<?>[] own, other;
        final Player<?> attacker, defender;

        Scenario() throws Exception {
            role = fixture.advanceToTurn().getString("actor", null);
            Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
            state = (GameState) field.get(fixture.session); game = state.getGame();
            own = game.getActingTeam().getPlayers(); other = game.getOtherTeam(game.getActingTeam()).getPlayers();
            attacker = own[0]; defender = other[0];
            UtilBox.putAllPlayersIntoBox(game);
            place(attacker, 7, 7); place(defender, 8, 7); place(own[1], 9, 8);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14)); game.getFieldModel().setBallMoving(true);
            state.removeAdditionalAssist(game.getTeamHome().getId()); state.removeAdditionalAssist(game.getTeamAway().getId());
            game.getTurnDataHome().setCheeringFansBlockAssist(0); game.getTurnDataAway().setCheeringFansBlockAssist(0);
        }
        void place(Player<?> player, int x, int y) {
            game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
            game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true));
        }
        JsonObject view() { return fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }
        JsonObject act(JsonObject view, String kind, String source) {
            JsonObject action = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(item -> kind.equals(item.getString("kind", null)) && source.equals(item.getString("sourcePlayerId", null)))
                .findFirst().orElseThrow(() -> new AssertionError("Missing " + kind + ": " + view.get("actions")));
            return fixture.session.apply(action.getString("actor", null), fixture.request("action", "act-"+view.getInt("revision", -1), view)
                .add("actionId", action.get("id"))).get("state").asObject();
        }
        void forcePushes() {
            forceBlockFaces("push");
        }
        void forceBlockFaces(String face) {
            List<DiceCategory> rolls = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                BlockDiceCategory roll = new BlockDiceCategory(); roll.parseCommand(face, game, game.getTeamHome()); rolls.add(roll);
            }
            state.getDiceRoller().getTestRolls().put("Block", rolls);
        }
    }
}
