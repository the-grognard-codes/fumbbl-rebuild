package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.DiceDecoration;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.BlockKind;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandSynchronousMultiBlock;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MultipleBlockActionsTest {
    private final MultipleBlockActions projection = new MultipleBlockActions();
    private final Game game = mock(Game.class);
    private final FieldModel field = mock(FieldModel.class);
    private final Player<?> attacker = mock(Player.class);
    private final Player<?> first = mock(Player.class);
    private final Player<?> second = mock(Player.class);
    private final Team home = mock(Team.class);
    private final Team away = mock(Team.class);
    private final Skill skill = mock(Skill.class);
    private final PlayerState standing = new PlayerState(PlayerState.STANDING).changeActive(true);
    private final FieldCoordinate from = new FieldCoordinate(10, 7);
    private final FieldCoordinate atFirst = new FieldCoordinate(11, 6);
    private final FieldCoordinate atSecond = new FieldCoordinate(11, 7);

    private void availablePair() {
        when(game.getTurnMode()).thenReturn(TurnMode.REGULAR);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getOtherTeam(home)).thenReturn(away);
        when(attacker.getTeam()).thenReturn(home);
        when(attacker.getId()).thenReturn("attacker");
        when(attacker.getName()).thenReturn("Blocker");
        when(attacker.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.singleton(skill));
        when(skill.hasSkillProperty(NamedProperties.canBlockTwoAtOnce)).thenReturn(true);
        when(skill.getSkillProperties()).thenReturn(Collections.emptyList());
        when(field.getPlayerCoordinate(attacker)).thenReturn(from);
        when(field.findAdjacentCoordinates(from, FieldCoordinateBounds.FIELD, 1, false))
            .thenReturn(new FieldCoordinate[] { atSecond, atFirst });
        doReturn(first).when(field).getPlayer(atFirst);
        doReturn(second).when(field).getPlayer(atSecond);
        when(first.getTeam()).thenReturn(away);
        when(second.getTeam()).thenReturn(away);
        when(first.getId()).thenReturn("first");
        when(second.getId()).thenReturn("second");
        when(first.getName()).thenReturn("First");
        when(second.getName()).thenReturn("Second");
        when(field.getPlayerState(first)).thenReturn(standing);
        when(field.getPlayerState(second)).thenReturn(standing);
        when(field.getPlayerCoordinate(first)).thenReturn(atFirst);
        when(field.getPlayerCoordinate(second)).thenReturn(atSecond);
        when(field.getDiceDecoration(atFirst)).thenReturn(new DiceDecoration(atFirst, 1, BlockKind.BLOCK));
        when(field.getDiceDecoration(atSecond)).thenReturn(new DiceDecoration(atSecond, 1, BlockKind.BLOCK));
    }

    @Test void declarationRequiresTwoBlockableDefendersAndNativeSkill() {
        availablePair();
        List<Action> actions = new ArrayList<>();
        projection.declaration(game, attacker, standing, "home", actions);
        assertEquals(1, actions.size());
        assertEquals("declareMultipleBlock", actions.get(0).kind);
        assertEquals(PlayerAction.MULTIPLE_BLOCK, ((ClientCommandActingPlayer) actions.get(0).command).getPlayerAction());
        when(field.getPlayer(atSecond)).thenReturn(null);
        actions.clear();
        projection.declaration(game, attacker, standing, "home", actions);
        assertTrue(actions.isEmpty());
    }

    @Test void pairCarriesOriginalDefenderStatesInStableNativeOrder() {
        availablePair();
        List<Action> actions = new ArrayList<>();
        projection.targets(game, attacker, "home", actions);
        assertEquals(1, actions.size());
        assertEquals("multiBlock", actions.get(0).kind);
        assertEquals("Block First and Second", actions.get(0).label);
        ClientCommandSynchronousMultiBlock command = (ClientCommandSynchronousMultiBlock) actions.get(0).command;
        assertEquals("first", command.getSelectedTargets().get(0).getPlayerId());
        assertEquals("second", command.getSelectedTargets().get(1).getPlayerId());
        assertEquals(standing, command.getSelectedTargets().get(0).getOriginalPlayerState());
        assertEquals(BlockKind.BLOCK, command.getSelectedTargets().get(1).getKind());
        when(field.getDiceDecoration(atSecond)).thenReturn(null);
        actions.clear();
        projection.targets(game, attacker, "home", actions);
        assertFalse(actions.stream().anyMatch(action -> action.kind.equals("multiBlock")));
    }
}
