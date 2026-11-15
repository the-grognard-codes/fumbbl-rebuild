package com.fumbbl.ffb.server.match.bb2025;

import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepApplyKickoffResult;

/** Emergency exit through the existing BB2025 cleanup continuations, on the engine owner only. */
public final class DecisionPeriodEnd {
    public void finish(GameState state, boolean normalHome, boolean charge) {
        IStep current = state.getCurrentStep();
        if (current instanceof StepApplyKickoffResult kickoff) {
            state.cleanupStepStack(kickoff.endAtDecisionLimit());
            state.startNextStep();
            return;
        }
        for (IStep step : state.getStepStack().toArray()) {
            if (step instanceof StepApplyKickoffResult kickoff) {
                state.cleanupStepStack(kickoff.endAtDecisionLimit());
                state.startNextStep();
                return;
            }
        }
        // Every native selection/activation retains END_SELECTING beneath its interruptions.
        // Let that continuation run feeding, carried-player and end-of-turn cleanup normally.
        for (IStep step : state.getStepStack().toArray()) {
            if (step.getId() != StepId.END_SELECTING) continue;
            while (state.getStepStack().peek() != step) state.getStepStack().pop();
            step.setParameter(StepParameter.from(StepParameterKey.END_TURN, true));
            state.getGame().setHomePlaying(normalHome);
            state.getGame().setTurnMode(charge ? TurnMode.BLITZ : TurnMode.REGULAR);
            state.startNextStep();
            return;
        }
        throw new IllegalStateException("No native decision-limit continuation");
    }
}
