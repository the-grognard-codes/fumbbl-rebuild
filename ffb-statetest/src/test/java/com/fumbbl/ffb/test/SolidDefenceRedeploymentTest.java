package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.dialog.DialogSetupErrorParameter;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.match.KickoffActions;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepApplyKickoffResult;

import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
class SolidDefenceRedeploymentTest {
    @Test void everySelectedReserveCanRedeployInAnyOrderForEitherCoach() throws Exception {
        for (boolean home : new boolean[] { true, false }) {
            TestServer server = new TestServer();
            int line = home ? 12 : 13;
            GameState state = new GameStateBuilder(server.getGameState()).withRule("BB2025").withWeather(Weather.NICE)
                .withTeam(home, team -> {
                    for (int index = 0; index < 3; index++) {
                        final int row = index + 5;
                        team.player("own" + index, player -> player.at(line, row).stats(6, 3, 3, 4, 9));
                    }
                })
                .withTeam(!home, team -> team.player("opponent", player -> player.at(home ? 20 : 5, 7).stats(6, 3, 3, 4, 9)))
                .build();
            Game game = state.getGame();
            game.setHomePlaying(home);
            game.setTurnMode(TurnMode.KICKOFF);
            StepApplyKickoffResult kickoff = new StepApplyKickoffResult(state);
            StepParameterSet parameters = new StepParameterSet();
            parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_END, "end"));
            parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_BLITZ, "blitz"));
            kickoff.init(parameters);
            kickoff.setParameter(StepParameter.from(StepParameterKey.KICKOFF_RESULT, KickoffResult.SOLID_DEFENCE));
            state.getStepStack().push(kickoff);
            TestRolls.on(state).general(1);
            StepEngine.start(state);
            StepEngine.respond(state, new ClientCommandPlayerChoice(PlayerChoiceMode.SOLID_DEFENCE,
                new Player<?>[] { game.getPlayerById("own0"), game.getPlayerById("own1"), game.getPlayerById("own2") }), home);
            List<Action> actions = new KickoffActions(state).actions();
            for (int index = 0; index < 3; index++) {
                String id = "solid-place:own" + index + ":" + line + ":8";
                assertTrue(actions.stream().anyMatch(action -> action.id.equals(id)), "Every reserve must have a placement: " + id);
            }
            for (int index : new int[] { 2, 0, 1 }) {
                perform(state, home, "solid-place:own" + index + ":" + line + ":" + (index + 8));
                assertEquals(new FieldCoordinate(line, index + 8), game.getFieldModel().getPlayerCoordinate(game.getPlayerById("own" + index)));
            }
            perform(state, home, "confirm-solid-defence");
            assertEquals(TurnMode.KICKOFF, game.getTurnMode());
        }
    }

    @Test void selectedReserveCanRedeployAndConfirmOnlyALegalFormationForEitherCoach() throws Exception {
        for (boolean home : new boolean[] { true, false }) {
            TestServer server = new TestServer();
            int line = home ? 12 : 13;
            GameState state = new GameStateBuilder(server.getGameState()).withRule("BB2025").withWeather(Weather.NICE)
                .withTeam(home, team -> {
                    for (int index = 0; index < 3; index++) {
                        final int row = index + 5;
                        team.player("own" + index, player -> player.at(line, row).stats(6, 3, 3, 4, 9));
                    }
                })
                .withTeam(!home, team -> team.player("opponent", player -> player.at(home ? 20 : 5, 7).stats(6, 3, 3, 4, 9)))
                .build();
            Game game = state.getGame();
            game.setHomePlaying(home);
            game.setTurnMode(TurnMode.KICKOFF);
            StepApplyKickoffResult kickoff = new StepApplyKickoffResult(state);
            StepParameterSet parameters = new StepParameterSet();
            parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_END, "end"));
            parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_BLITZ, "blitz"));
            kickoff.init(parameters);
            kickoff.setParameter(StepParameter.from(StepParameterKey.KICKOFF_RESULT, KickoffResult.SOLID_DEFENCE));
            state.getStepStack().push(kickoff);
            TestRolls.on(state).general(1);
            StepEngine.start(state);
            Player<?> selected = game.getPlayerById("own0");
            StepEngine.respond(state, new ClientCommandPlayerChoice(PlayerChoiceMode.SOLID_DEFENCE, new Player<?>[] { selected }), home);
            assertEquals(PlayerState.RESERVE, game.getFieldModel().getPlayerState(selected).getBase());
            assertTrue(game.getFieldModel().getPlayerCoordinate(selected).isBoxCoordinate());
            perform(state, home, "confirm-solid-defence");
            assertEquals(TurnMode.SOLID_DEFENCE, game.getTurnMode());
            assertTrue(game.getDialogParameter() instanceof DialogSetupErrorParameter);
            int behindLine = home ? 8 : 17;
            perform(state, home, "solid-place:own0:" + behindLine + ":8");
            assertEquals(new FieldCoordinate(behindLine, 8), game.getFieldModel().getPlayerCoordinate(selected));
            assertEquals(PlayerState.STANDING, game.getFieldModel().getPlayerState(selected).getBase());
            perform(state, home, "confirm-solid-defence");
            assertEquals(TurnMode.SOLID_DEFENCE, game.getTurnMode(), "Two players on the line remains illegal");
            perform(state, home, "solid-place:own0:" + line + ":8");
            perform(state, home, "confirm-solid-defence");
            assertEquals(TurnMode.KICKOFF, game.getTurnMode());
            assertEquals(new FieldCoordinate(line, 8), game.getFieldModel().getPlayerCoordinate(selected));
        }
    }

    private void perform(GameState state, boolean home, String id) {
        List<Action> actions = new KickoffActions(state, Collections.singleton("own0")).actions();
        Action action = actions.stream().filter(item -> item.id.equals(id)).findFirst()
            .orElseThrow(() -> new AssertionError("Missing " + id));
        StepEngine.respond(state, action.command, home);
    }
}
