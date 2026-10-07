package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepStack;

import com.eclipsesource.json.JsonObject;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class KickoffPresentationTest {
    private final GameState state = mock(GameState.class);
    private final Game game = mock(Game.class);
    private final KickoffPresentation presentation = new KickoffPresentation();
    KickoffPresentationTest() { when(state.getGame()).thenReturn(game); }

    @Test void quickSnapUsesNativeCountsForReceivingActorIncludingAnInterruptedStep() {
        when(game.getTurnMode()).thenReturn(TurnMode.QUICK_SNAP);
        when(game.isHomePlaying()).thenReturn(false);
        IStep kickoff = mock(IStep.class), interruption = mock(IStep.class);
        when(kickoff.getId()).thenReturn(StepId.APPLY_KICKOFF_RESULT);
        when(interruption.getId()).thenReturn(StepId.APOTHECARY);
        JsonObject nativeState = new JsonObject();
        IServerJsonOption.NR_OF_PLAYERS_ALLOWED.addTo(nativeState, 5);
        IServerJsonOption.NR_OF_PLAYERS.addTo(nativeState, 2);
        IServerJsonOption.PLAYER_IDS_SELECTED.addTo(nativeState, new String[0]);
        when(kickoff.toJsonValue()).thenReturn(nativeState);
        when(state.getCurrentStep()).thenReturn(interruption);
        StepStack stack = new StepStack(state);
        stack.push(kickoff);
        when(state.getStepStack()).thenReturn(stack);
        JsonObject before = JsonObject.readFrom(nativeState.toString());
        JsonObject result = presentation.project(state, Collections.emptySet());
        assertEquals("QUICK_SNAP", result.getString("event", null));
        assertEquals("away", result.getString("actor", null));
        assertEquals(5, result.getInt("allowed", -1));
        assertEquals(2, result.getInt("completed", -1));
        assertEquals(before, nativeState);
        assertEquals(kickoff, stack.peek());
    }

    @Test void chargeSelectionUsesTheNativeDialogOwnerAndAllowance() {
        Team home = mock(Team.class);
        when(home.getId()).thenReturn("kicking");
        when(game.getTeamHome()).thenReturn(home);
        when(game.getDialogParameter()).thenReturn(new DialogPlayerChoiceParameter("kicking", PlayerChoiceMode.CHARGE,
            new String[] { "p1", "p2", "p3" }, null, 3, 0));
        JsonObject result = presentation.project(state, new HashSet<>(Arrays.asList("p1", "p2")));
        assertEquals("CHARGE", result.getString("event", null));
        assertEquals("home", result.getString("actor", null));
        assertEquals("selection", result.getString("stage", null));
        assertEquals(3, result.getInt("allowed", -1));
        assertEquals(2, result.getInt("selected", -1));
        assertEquals(7, result.size());
    }

    @Test void normalPlayHasNoKickoffProgressAndHighKickAllowsOnePlayer() {
        when(game.getTurnMode()).thenReturn(TurnMode.REGULAR);
        assertNull(presentation.project(state, Collections.emptySet()));
        when(game.getTurnMode()).thenReturn(TurnMode.HIGH_KICK);
        assertEquals(1, presentation.project(state, Collections.emptySet()).getInt("allowed", -1));
    }
}
