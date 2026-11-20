package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.KickoffAdjustmentBudget;

/** Finds the same native allowance for offers and accepted toggles, including interruptions. */
final class KickoffBudgetLookup {
    KickoffAdjustmentBudget find(GameState state) {
        if (state.getCurrentStep() instanceof KickoffAdjustmentBudget budget) return budget;
        if (state.getStepStack() != null) for (var step : state.getStepStack().toArray())
            if (step instanceof KickoffAdjustmentBudget budget) return budget;
        return null;
    }
}
