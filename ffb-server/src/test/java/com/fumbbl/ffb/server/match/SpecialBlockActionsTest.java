package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandBlock;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SpecialBlockActionsTest {
    private final SpecialBlockActions projection = new SpecialBlockActions();
    private final Player<?> attacker = mock(Player.class);
    private final Player<?> defender = mock(Player.class);
    private final PlayerState standing = new PlayerState(PlayerState.STANDING).changeActive(true);

    @Test void declarationsUseOnlyCurrentSkillEligibilityAndNativeActions() {
        when(attacker.getId()).thenReturn("attacker");
        when(attacker.getName()).thenReturn("Attacker");
        when(attacker.canDeclareSkillAction(NamedProperties.providesStabBlockAlternative, standing)).thenReturn(true);
        when(attacker.canDeclareSkillAction(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFailWithTurnover, standing)).thenReturn(true);
        List<Action> actions = new ArrayList<>();
        projection.declarations(attacker, standing, false, "home", actions);
        assertTrue(actions.isEmpty());
        projection.declarations(attacker, standing, true, "home", actions);
        assertEquals(2, actions.size());
        assertEquals("declareStab", actions.get(0).kind);
        assertEquals(PlayerAction.STAB, ((ClientCommandActingPlayer) actions.get(0).command).getPlayerAction());
        assertEquals("attacker", actions.get(0).targetPlayerId);
        assertEquals(PlayerAction.BREATHE_FIRE, ((ClientCommandActingPlayer) actions.get(1).command).getPlayerAction());
    }

    @Test void blitzVariantsCarryTheExactNativeBlockFlagsAndTarget() {
        when(attacker.getId()).thenReturn("attacker");
        when(defender.getId()).thenReturn("defender");
        when(defender.getName()).thenReturn("Defender");
        when(attacker.hasSkillProperty(NamedProperties.providesStabBlockAlternative)).thenReturn(true);
        when(attacker.hasSkillProperty(NamedProperties.providesChainsawBlockAlternative)).thenReturn(true);
        when(attacker.hasUnusedSkillProperty(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFail)).thenReturn(true);
        List<Action> actions = new ArrayList<>();
        projection.targets(attacker, PlayerAction.BLITZ, defender, "home", actions);
        assertEquals(3, actions.size());
        assertEquals("Blitz - Stab Defender", actions.get(0).label);
        assertEquals("defender", actions.get(0).targetPlayerId);
        ClientCommandBlock stab = (ClientCommandBlock) actions.get(0).command;
        assertEquals("attacker", stab.getActingPlayerId());
        assertEquals("defender", stab.getDefenderId());
        assertTrue(stab.isUsingStab());
        assertFalse(stab.isUsingChainsaw());
        assertTrue(((ClientCommandBlock) actions.get(1).command).isUsingChainsaw());
        assertTrue(((ClientCommandBlock) actions.get(2).command).isUsingVomit());
        actions.clear();
        projection.targets(attacker, PlayerAction.STAB, defender, "home", actions);
        assertEquals(1, actions.size(), "A declared Stab cannot become a different attack at the target");
        when(attacker.hasSkillProperty(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFailWithTurnover)).thenReturn(true);
        actions.clear();
        projection.targets(attacker, PlayerAction.BREATHE_FIRE, defender, "home", actions);
        assertEquals(1, actions.size(), "A declared Breathe Fire remains available after declaration");
        assertTrue(((ClientCommandBlock) actions.get(0).command).isUsingBreatheFire());
    }
}
