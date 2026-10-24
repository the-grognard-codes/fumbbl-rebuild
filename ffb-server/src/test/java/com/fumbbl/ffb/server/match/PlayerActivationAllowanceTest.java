package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandBloodlustAction;
import com.fumbbl.ffb.server.GameState;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlayerActivationAllowanceTest {
    @Test void recordsDeclaredOwnerEvenWhenNativeTraitClearsActingPlayerForAllAllowanceFamilies() {
        PlayerAction[] declarations = { PlayerAction.BLITZ, PlayerAction.STAND_UP_BLITZ, PlayerAction.PASS_MOVE,
            PlayerAction.HAIL_MARY_PASS, PlayerAction.HAND_OVER_MOVE, PlayerAction.FOUL_MOVE,
            PlayerAction.THROW_BOMB, PlayerAction.HAIL_MARY_BOMB, PlayerAction.THROW_TEAM_MATE_MOVE,
            PlayerAction.KICK_TEAM_MATE_MOVE, PlayerAction.PUNT_MOVE, PlayerAction.SECURE_THE_BALL };
        String[] expected = { "blitz", "blitz", "pass", "pass", "handOff", "foul", "bomb", "bomb",
            "throwMate", "kickMate", "punt", "secure" };
        for (int index = 0; index < declarations.length; index++) {
            GameState state = mock(GameState.class);
            Game game = mock(Game.class);
            ActingPlayer acting = mock(ActingPlayer.class);
            TurnData turn = new TurnData(game, true);
            when(state.getGame()).thenReturn(game);
            when(game.getActingPlayer()).thenReturn(acting);
            when(game.getTurnData()).thenReturn(turn);
            when(game.getTurnMode()).thenReturn(TurnMode.REGULAR);
            PlayerActivation activation = new PlayerActivation(state);
            activation.handle(new ClientCommandActingPlayer("declarer", declarations[index], false), "home");
            assertEquals(expected[index], new LimitedActionProjection().kind(turn.getLimitedAction("declarer")));
            if (declarations[index] == PlayerAction.FOUL_MOVE) {
                activation.handle(new ClientCommandActingPlayer("additional-fouler", PlayerAction.FOUL_MOVE, false), "home");
                assertEquals("foul", new LimitedActionProjection().kind(turn.getLimitedAction("additional-fouler")));
                assertEquals("foul", new LimitedActionProjection().kind(turn.getLimitedAction("declarer")));
            }
            // A Bloodlust continuation and free/reactive actions never replace the committed declaration.
            activation.handle(new ClientCommandBloodlustAction(true), "home");
            assertEquals(expected[index], new LimitedActionProjection().kind(turn.getLimitedAction("declarer")));
        }
    }

    @Test void unchangedTurnNumberDoesNotReapplyTagAfterNativeWindowEnds() {
        GameState state = mock(GameState.class);
        Game game = mock(Game.class);
        ActingPlayer acting = mock(ActingPlayer.class);
        TurnData turn = new TurnData(game, true);
        when(state.getGame()).thenReturn(game);
        when(game.getActingPlayer()).thenReturn(acting);
        when(game.getTurnData()).thenReturn(turn);
        doAnswer(invocation -> { turn.clearLimitedActions(); return null; }).when(state).handleCommand(any());
        new PlayerActivation(state).handle(new ClientCommandActingPlayer("declarer", PlayerAction.SECURE_THE_BALL, false), "home");
        assertNull(turn.getLimitedAction("declarer"));
    }

    @Test void moveAndDumpOffDoNotSpendTeamAllowances() {
        GameState state = mock(GameState.class);
        Game game = mock(Game.class);
        TurnData turn = new TurnData(game, true);
        when(state.getGame()).thenReturn(game);
        when(game.getActingPlayer()).thenReturn(mock(ActingPlayer.class));
        when(game.getTurnData()).thenReturn(turn);
        new PlayerActivation(state).handle(new ClientCommandActingPlayer("mover", PlayerAction.MOVE, false), "home");
        new PlayerActivation(state).handle(new ClientCommandActingPlayer("reactor", PlayerAction.DUMP_OFF, false), "home");
        assertNull(turn.getLimitedAction("mover"));
        assertNull(turn.getLimitedAction("reactor"));
    }
}
