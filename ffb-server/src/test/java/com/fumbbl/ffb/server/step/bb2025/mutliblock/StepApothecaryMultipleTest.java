package com.fumbbl.ffb.server.step.bb2025.mutliblock;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.InjuryResult;
import com.fumbbl.ffb.server.factory.StepActionFactory;
import com.fumbbl.ffb.server.factory.StepIdFactory;
import com.fumbbl.ffb.server.step.StepException;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.StepStack;

import com.eclipsesource.json.JsonObject;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StepApothecaryMultipleTest {
    private final GameState state = mock(GameState.class);
    private final Game game = mock(Game.class);
    private final IFactorySource source = mock(IFactorySource.class);
    private final Team acting = mock(Team.class);
    private final Team defending = mock(Team.class);
    private final StepStack stack = new StepStack(state);

    StepApothecaryMultipleTest() {
        when(source.forContext(any())).thenReturn(source);
        doReturn(new StepIdFactory()).when(source).getFactory(FactoryType.Factory.STEP_ID);
        doReturn(new StepActionFactory()).when(source).getFactory(FactoryType.Factory.STEP_ACTION);
        when(state.getGame()).thenReturn(game);
        when(state.getStepStack()).thenReturn(stack);
        when(game.getActingTeam()).thenReturn(acting);
        when(game.getOtherTeam(acting)).thenReturn(defending);
        when(acting.getId()).thenReturn("acting");
        when(defending.getId()).thenReturn("defending");
        when(game.getTeamById("acting")).thenReturn(acting);
        when(game.getTeamById("defending")).thenReturn(defending);
        player("attacker", acting);
        player("defender", defending);
    }

    @Test void recoveredStepsAcceptTheirOwnQueuedInjuriesBeforeStarting() {
        for (boolean actingTeam : new boolean[] { true, false }) {
            StepApothecaryMultiple step = configured(actingTeam);
            StepApothecaryMultiple restored = new StepApothecaryMultiple(state).initFrom(source, step.toJsonValue());
            assertTrue(restored.setParameter(injury(actingTeam ? "attacker" : "defender")));
            assertFalse(restored.setParameter(injury(actingTeam ? "defender" : "attacker")));
        }
    }

    @Test void legacyCheckpointsRecoverOwnershipFromAlreadyQueuedInjuries() {
        StepApothecaryMultiple step = configured(false);
        assertTrue(step.setParameter(injury("defender")));
        JsonObject legacy = step.toJsonValue();
        legacy.remove(IServerJsonOption.TEAM_ID.getKey());
        StepApothecaryMultiple restored = new StepApothecaryMultiple(state).initFrom(source, legacy);
        assertTrue(restored.setParameter(injury("defender")));
        assertFalse(restored.setParameter(injury("attacker")));
    }

    @Test void legacyDetachedStepWithoutAnOwnerOrSequenceFailsExplicitly() {
        StepApothecaryMultiple restored = legacy(false);
        assertThrows(StepException.class, restored::toJsonValue);
    }

    @Test void legacyEmptyQueuedPairRecoversBothOwnersFromTheFixedSequence() {
        StepApothecaryMultiple defendingStep = legacy(false);
        StepApothecaryMultiple actingStep = legacy(true);
        stack.push(Arrays.asList(defendingStep, actingStep));
        assertEquals("defending", defendingStep.toJsonValue().getString("teamId", null));
        assertEquals("acting", actingStep.toJsonValue().getString("teamId", null));
        assertTrue(defendingStep.setParameter(injury("defender")));
        assertFalse(defendingStep.setParameter(injury("attacker")));
        assertTrue(actingStep.setParameter(injury("attacker")));
        assertFalse(actingStep.setParameter(injury("defender")));
    }

    @Test void legacyCurrentDefendingStepCountsItsQueuedActingPartner() {
        StepApothecaryMultiple defendingStep = legacy(false);
        StepApothecaryMultiple actingStep = legacy(true);
        when(state.getCurrentStep()).thenReturn(defendingStep);
        stack.push(actingStep);
        assertTrue(defendingStep.setParameter(injury("defender")));
        assertFalse(defendingStep.setParameter(injury("attacker")));
        assertTrue(actingStep.setParameter(injury("attacker")));
        assertFalse(actingStep.setParameter(injury("defender")));
    }

    @Test void legacyFinalStepBelongsToTheActingTeamWhetherQueuedOrCurrent() {
        for (boolean current : new boolean[] { false, true }) {
            StepApothecaryMultiple finalStep = legacy(true);
            stack.clear();
            when(state.getCurrentStep()).thenReturn(current ? finalStep : null);
            if (!current) stack.push(finalStep);
            assertTrue(finalStep.setParameter(injury("attacker")));
            assertFalse(finalStep.setParameter(injury("defender")));
        }
    }

    private StepApothecaryMultiple legacy(boolean actingTeam) {
        JsonObject legacy = configured(actingTeam).toJsonValue();
        legacy.remove(IServerJsonOption.TEAM_ID.getKey());
        return new StepApothecaryMultiple(state).initFrom(source, legacy);
    }

    private StepApothecaryMultiple configured(boolean actingTeam) {
        StepApothecaryMultiple step = new StepApothecaryMultiple(state);
        StepParameterSet parameters = new StepParameterSet();
        parameters.add(StepParameter.from(StepParameterKey.ACTING_TEAM, actingTeam));
        step.init(parameters);
        return step;
    }

    private StepParameter injury(String id) {
        InjuryResult injury = new InjuryResult();
        injury.injuryContext().setDefenderId(id);
        injury.injuryContext().setInjury(new PlayerState(PlayerState.PRONE));
        return StepParameter.from(StepParameterKey.INJURY_RESULT, injury);
    }

    private void player(String id, Team team) {
        Player<?> player = mock(Player.class);
        when(player.getTeam()).thenReturn(team);
        doReturn(player).when(game).getPlayerById(id);
    }
}
