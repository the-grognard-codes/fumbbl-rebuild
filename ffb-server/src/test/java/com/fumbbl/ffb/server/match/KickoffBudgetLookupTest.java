package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.KickoffAdjustmentBudget;
import com.fumbbl.ffb.server.step.StepStack;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

class KickoffBudgetLookupTest {
    @Test void currentAndInterruptedSelectionsResolveTheSameBudget() {
        GameState state = mock(GameState.class);
        IStep kickoff = mock(IStep.class, withSettings().extraInterfaces(KickoffAdjustmentBudget.class));
        when(state.getCurrentStep()).thenReturn(kickoff);
        KickoffBudgetLookup lookup = new KickoffBudgetLookup();
        assertSame(kickoff, lookup.find(state));
        StepStack stack = new StepStack(state);
        stack.push(kickoff);
        when(state.getStepStack()).thenReturn(stack);
        when(state.getCurrentStep()).thenReturn(mock(IStep.class));
        assertSame(kickoff, lookup.find(state), "Offers and accepted selection toggles use the stacked allowance");
        stack.clear();
        assertNull(lookup.find(state));
    }
}
