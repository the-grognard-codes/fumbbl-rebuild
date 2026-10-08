package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.modifiers.RollModifier;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.report.ReportStandUpRoll;
import com.fumbbl.ffb.report.mixed.ReportHypnoticGazeRoll;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.test.Commands;
import com.fumbbl.ffb.test.GameStateBuilder;
import com.fumbbl.ffb.test.StepEngine;
import com.fumbbl.ffb.test.TestRolls;
import com.fumbbl.ffb.test.TestServer;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NativeRollPresentationTest {
    @Test void reactionsFreezeTheNativeOwnerAndMovingPlayerWithoutChangingSourceReports() throws Exception {
        for (String skill : new String[] {"Shadowing", "Tentacles"}) for (int die : new int[] {1, 6}) {
            GameState state = fixture(skill);
            StepEngine.start(state);
            StepEngine.respond(state, Commands.selectPlayer("runner", PlayerAction.MOVE));
            if ("Shadowing".equals(skill)) TestRolls.on(state).general(6);
            StepEngine.respond(state, Commands.move("runner", new FieldCoordinate(12, 7), new FieldCoordinate(11, 7)));
            NativeRollPresentation presentation = new NativeRollPresentation(state);
            int cursor = (int) state.getLastCommandNr();
            TestRolls.on(state).general(die, 6, 6, 6);
            StepEngine.respond(state, Commands.playerChoice("Shadowing".equals(skill)
                ? PlayerChoiceMode.SHADOWING : PlayerChoiceMode.TENTACLES, state.getGame().getPlayerById("owner")));
            NativeOutcomeCapture.Capture capture = new NativeOutcomeCapture().since(state.getGameLog(), cursor, presentation);
            JsonObject reaction = null;
            for (JsonObject sync : capture.modelSyncs) for (JsonValue report : sync.get("reportList").asObject().get("reports").asArray())
                if ("tentaclesShadowingRoll".equals(report.asObject().getString("reportId", null))) reaction = report.asObject();
            assertTrue(reaction != null, skill + " native reaction report");
            assertEquals(die, reaction.getInt("roll", 0));
            assertEquals(die == 6, reaction.getBoolean("successful", false));
            JsonObject facts = reaction.get("logRoll").asObject();
            assertEquals("Shadowing".equals(skill) ? 4 : 6, facts.getInt("base", 0));
            assertEquals(4, facts.getInt("target", 0));
            assertEquals("Shadowing".equals(skill) ? 0 : 2, facts.getInt("modifier", -1));
            assertEquals("owner", reaction.get("logActors").asObject().getString("actorId", null));
            assertEquals("runner", reaction.get("logActors").asObject().getString("targetId", null));
            for (com.fumbbl.ffb.net.commands.ServerCommand command : state.getGameLog().getServerCommands())
                if (command instanceof ServerCommandModelSync) for (JsonValue report : command.toJsonValue().asObject().get("reportList").asObject().get("reports").asArray()) {
                    assertNull(report.asObject().get("logRoll"));
                    assertNull(report.asObject().get("logActors"));
                }
        }
    }

    @Test void fixedStandUpAndGazeChecksDoNotUseThePlayersAgility() throws Exception {
        GameState state = fixture("Shadowing");
        ReportList reports = new ReportList();
        reports.add(new ReportStandUpRoll("runner", true, 6, 1, false));
        reports.add(new ReportHypnoticGazeRoll("runner", true, 6, 3, false, new RollModifier<?>[0], "owner"));
        ServerCommandModelSync command = new ServerCommandModelSync(new ModelChangeList(), reports, null, null, 0, 0);
        JsonObject original = command.toJsonValue();
        JsonObject projected = command.toJsonValue();
        new NativeRollPresentation(state).decorate(command, projected);
        JsonObject stand = projected.get("reportList").asObject().get("reports").asArray().get(0).asObject().get("logRoll").asObject();
        JsonObject gaze = projected.get("reportList").asObject().get("reports").asArray().get(1).asObject().get("logRoll").asObject();
        assertEquals(4, stand.getInt("base", 0));
        assertEquals(3, stand.getInt("target", 0));
        assertEquals(1, stand.getInt("modifier", 0));
        assertEquals(3, gaze.getInt("base", 0));
        assertEquals(3, gaze.getInt("target", 0));
        assertEquals(original, command.toJsonValue());
    }

    private GameState fixture(String skill) throws Exception {
        return new GameStateBuilder(new TestServer().getGameState()).withRule("BB2025").withWeather(Weather.NICE)
            .withTeam(true, team -> team.player("runner", player -> player.at(12, 7).stats(6, 3, 5, 5, 8)))
            .withTeam(false, team -> team.player("owner", player -> player.at(13, 7).stats(6, 5, 5, 5, 8).skill(skill))).build();
    }
}
