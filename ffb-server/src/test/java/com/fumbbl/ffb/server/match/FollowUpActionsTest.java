package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.dialog.DialogFollowupChoiceParameter;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ClientCommandFollowupChoice;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.step.IStep;

import com.eclipsesource.json.JsonObject;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FollowUpActionsTest {
    @Test void yesPreviewsTheNativeVacatedSquareForEitherCoachWithoutChangingCommands() {
        for (boolean homeActs : new boolean[] {true, false}) {
            GameState state = mock(GameState.class);
            Game game = mock(Game.class);
            ActingPlayer acting = mock(ActingPlayer.class);
            Player<?> player = mock(Player.class);
            Team home = mock(Team.class), away = mock(Team.class);
            IStep step = mock(IStep.class);
            when(state.getGame()).thenReturn(game);
            when(state.getCurrentStep()).thenReturn(step);
            when(game.getActingPlayer()).thenReturn(acting);
            doReturn(player).when(acting).getPlayer();
            when(game.getTeamHome()).thenReturn(home);
            when(game.getTeamAway()).thenReturn(away);
            when(home.hasPlayer(player)).thenReturn(homeActs);
            when(away.hasPlayer(player)).thenReturn(!homeActs);
            when(game.getDialogParameter()).thenReturn(new DialogFollowupChoiceParameter());
            FieldCoordinate destination = new FieldCoordinate(11, 7);
            JsonObject nativeStep = new JsonObject();
            IServerJsonOption.DEFENDER_POSITION.addTo(nativeStep, destination);
            when(step.toJsonValue()).thenReturn(nativeStep);
            List<Action> actions = new CorePromptActions(state).actions();
            assertEquals(2, actions.size());
            assertEquals(destination, actions.get(0).targetSquare);
            assertNull(actions.get(1).targetSquare);
            for (int index = 0; index < actions.size(); index++) {
                assertEquals(homeActs ? "home" : "away", actions.get(index).role);
                assertEquals(index == 0, ((ClientCommandFollowupChoice) actions.get(index).command).isChoiceFollowup());
            }
            // Missing presentation data preserves the native Yes/No choice.
            when(state.getCurrentStep()).thenReturn(null);
            assertNull(new CorePromptActions(state).actions().get(0).targetSquare);
        }
    }
}
