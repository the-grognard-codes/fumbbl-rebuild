package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.KickoffActions;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepApplyKickoffResult;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KickoffSelectionMovementTest {
    @Test void quickSnapLocksOpenPlayersAndAllowsOneMoveAcrossHalfwayForEitherCoach() throws Exception {
        for (boolean home : new boolean[] { true, false }) {
            GameState state = start(home, KickoffResult.QUICK_SNAP);
            Game game = state.getGame();
            DialogPlayerChoiceParameter dialog = (DialogPlayerChoiceParameter) game.getDialogParameter();
            assertEquals(PlayerChoiceMode.QUICK_SNAP, dialog.getPlayerChoiceMode());
            assertEquals(2, dialog.getPlayerIds().length, "Marked players are not Open");
            assertFalse(new KickoffActions(state).actions().stream().anyMatch(action -> "kickoffMove".equals(action.kind)));
            StepEngine.respond(state, new ClientCommandPlayerChoice(PlayerChoiceMode.QUICK_SNAP,
                new Player<?>[] { game.getPlayerById("one"), game.getPlayerById("two") }), home);
            FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one"));
            FieldCoordinate to = new FieldCoordinate(home ? 13 : 12, 5);
            ClientCommandSetupPlayer move = new ClientCommandSetupPlayer("one", home ? to : to.transform());
            StepEngine.respond(state, move, !home);
            assertEquals(from, game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one")));
            StepEngine.respond(state, move, home);
            assertEquals(to, game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one")));
            assertFalse(game.getFieldModel().getPlayerState(game.getPlayerById("one")).isActive());
            FieldCoordinate another = new FieldCoordinate(home ? 14 : 11, 5);
            StepEngine.respond(state, new ClientCommandSetupPlayer("one", home ? another : another.transform()), home);
            assertEquals(to, game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one")));
            assertTrue(new KickoffActions(state).actions().stream().anyMatch(action -> action.id.startsWith("event-two-")));
        }
    }

    @Test void highKickOnlyAcceptsAnEligiblePlayerAtTheLandingSquareThenFinishes() throws Exception {
        for (boolean home : new boolean[] { true, false }) {
            GameState state = start(home, KickoffResult.HIGH_KICK);
            Game game = state.getGame();
            FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one"));
            FieldCoordinate wrong = new FieldCoordinate(home ? 8 : 17, 5);
            StepEngine.respond(state, new ClientCommandSetupPlayer("one", home ? wrong : wrong.transform()), home);
            assertEquals(from, game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one")));
            FieldCoordinate landing = game.getFieldModel().getBallCoordinate();
            StepEngine.respond(state, new ClientCommandSetupPlayer("one", home ? landing : landing.transform()), home);
            assertEquals(landing, game.getFieldModel().getPlayerCoordinate(game.getPlayerById("one")));
            assertEquals(TurnMode.KICKOFF, game.getTurnMode());
        }
    }

    private GameState start(boolean home, KickoffResult event) throws Exception {
        int line = home ? 12 : 13;
        GameState state = new GameStateBuilder(new TestServer().getGameState()).withRule("BB2025").withWeather(Weather.NICE)
            .withTeam(home, team -> {
                team.player("one", player -> player.at(line, 5).stats(6, 3, 3, 4, 9));
                team.player("two", player -> player.at(line, 9).stats(6, 3, 3, 4, 9));
                team.player("marked", player -> player.at(line, 12).stats(6, 3, 3, 4, 9));
            })
            .withTeam(!home, team -> team.player("opponent", player -> player.at(home ? 13 : 12, 12).stats(6, 3, 3, 4, 9)))
            .build();
        Game game = state.getGame();
        game.setHomePlaying(!home);
        game.setTurnMode(TurnMode.KICKOFF);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(home ? 6 : 19, 7));
        StepApplyKickoffResult step = new StepApplyKickoffResult(state);
        StepParameterSet parameters = new StepParameterSet();
        parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_END, "end"));
        parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_BLITZ, "blitz"));
        step.init(parameters);
        step.setParameter(StepParameter.from(StepParameterKey.KICKOFF_RESULT, event));
        state.getStepStack().push(step);
        TestRolls.on(state).general(1);
        StepEngine.start(state);
        return state;
    }
}
