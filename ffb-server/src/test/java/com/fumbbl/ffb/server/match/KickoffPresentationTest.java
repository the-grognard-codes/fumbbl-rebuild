package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.KickoffAdjustmentBudget;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepStack;

import com.eclipsesource.json.JsonObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

class KickoffPresentationTest {
    private final GameState state = mock(GameState.class);
    private final Game game = mock(Game.class);
    private final KickoffPresentation presentation = new KickoffPresentation();
    KickoffPresentationTest() {
        when(state.getGame()).thenReturn(game);
        Team acting = mock(Team.class);
        when(game.getActingTeam()).thenReturn(acting);
        when(acting.getPlayers()).thenReturn(new com.fumbbl.ffb.model.Player<?>[0]);
    }

    @Test void quickSnapUsesNativeCountsForReceivingActorIncludingAnInterruptedStep() {
        when(game.getTurnMode()).thenReturn(TurnMode.QUICK_SNAP);
        when(game.isHomePlaying()).thenReturn(false);
        IStep kickoff = mock(IStep.class, withSettings().extraInterfaces(KickoffAdjustmentBudget.class));
        IStep interruption = mock(IStep.class);
        when(((KickoffAdjustmentBudget) kickoff).completedParticipants()).thenReturn(2);
        when(kickoff.getId()).thenReturn(StepId.APPLY_KICKOFF_RESULT);
        when(interruption.getId()).thenReturn(StepId.APOTHECARY);
        when(((KickoffAdjustmentBudget) kickoff).allowedParticipants()).thenReturn(5);
        when(((KickoffAdjustmentBudget) kickoff).selectedParticipantIds()).thenReturn(Collections.emptyList());
        when(state.getCurrentStep()).thenReturn(interruption);
        StepStack stack = new StepStack(state);
        stack.push(kickoff);
        when(state.getStepStack()).thenReturn(stack);
        JsonObject result = presentation.project(state, Collections.emptySet());
        assertEquals("QUICK_SNAP", result.getString("event", null));
        assertEquals("away", result.getString("actor", null));
        assertEquals(5, result.getInt("allowed", -1));
        assertEquals(2, result.getInt("completed", -1));
        verify(kickoff, never()).toJsonValue();
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

    @Test void solidDefenceMovementUsesNativeSelectionDespiteRetainedChoiceDialog() {
        Team home = mock(Team.class);
        IStep step = mock(IStep.class, withSettings().extraInterfaces(KickoffAdjustmentBudget.class));
        when(((KickoffAdjustmentBudget) step).completedParticipants()).thenReturn(2);
        when(state.getCurrentStep()).thenReturn(step);
        when(game.getTeamHome()).thenReturn(home);
        when(home.getId()).thenReturn("home-team");
        when(game.isHomePlaying()).thenReturn(true);
        when(game.getDialogParameter()).thenReturn(new DialogPlayerChoiceParameter("home-team", PlayerChoiceMode.SOLID_DEFENCE,
            new String[] { "one", "two", "three" }, null, 6, 0));
        when(step.getId()).thenReturn(StepId.APPLY_KICKOFF_RESULT);
        when(((KickoffAdjustmentBudget) step).allowedParticipants()).thenReturn(6);
        when(((KickoffAdjustmentBudget) step).selectedParticipantIds()).thenReturn(List.of("one", "two", "three"));
        when(game.getTurnMode()).thenReturn(TurnMode.KICKOFF);
        assertEquals("selection", presentation.project(state, Collections.singleton("one")).getString("stage", null));
        when(game.getTurnMode()).thenReturn(TurnMode.SOLID_DEFENCE);
        JsonObject movement = presentation.project(state, Collections.emptySet());
        assertEquals("movement", movement.getString("stage", null));
        assertEquals(3, movement.getInt("selected", -1));
        assertEquals(2, movement.getInt("completed", -1));
        verify(step, never()).toJsonValue();
    }
}
