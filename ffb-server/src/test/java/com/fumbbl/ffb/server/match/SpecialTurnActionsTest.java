package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.TtmMechanic;
import com.fumbbl.ffb.mechanics.bb2025.GameMechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandThrowTeamMate;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SpecialTurnActionsTest {
    private final SpecialTurnActions projection = new SpecialTurnActions();
    private final Game game = mock(Game.class);
    private final FieldModel field = mock(FieldModel.class);
    private final Player<?> player = mock(Player.class);
    private final TurnData turn = mock(TurnData.class);
    private final GameMechanic rules = mock(GameMechanic.class);
    private final TtmMechanic ttm = mock(TtmMechanic.class);

    @Test void bombAndRecoverDeclarationsUseNativeActionsOnlyWhileEligible() {
        when(game.getTurnMode()).thenReturn(TurnMode.REGULAR);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getTurnData()).thenReturn(turn);
        when(game.getMechanic(Mechanic.Type.GAME)).thenReturn(rules);
        when(game.getMechanic(Mechanic.Type.TTM)).thenReturn(ttm);
        when(player.getId()).thenReturn("p1");
        when(player.getName()).thenReturn("Thrower");
        when(player.hasSkillProperty(NamedProperties.enableThrowBombAction)).thenReturn(true);
        when(rules.isBombActionAllowed(TurnMode.REGULAR)).thenReturn(true);
        PlayerState standing = new PlayerState(PlayerState.STANDING).changeActive(true).changeConfused(true);
        List<Action> actions = new ArrayList<>();
        projection.declarations(game, player, standing, "home", actions);
        assertEquals(2, actions.size());
        assertEquals("declareBomb", actions.get(0).kind);
        assertEquals(PlayerAction.THROW_BOMB, ((ClientCommandActingPlayer) actions.get(0).command).getPlayerAction());
        assertEquals("declareRecover", actions.get(1).kind);
        assertEquals(PlayerAction.REMOVE_CONFUSION, ((ClientCommandActingPlayer) actions.get(1).command).getPlayerAction());
        when(turn.isBombUsed()).thenReturn(true);
        actions.clear();
        projection.declarations(game, player, standing, "home", actions);
        assertEquals(1, actions.size());
        assertEquals("declareRecover", actions.get(0).kind);
    }

    @Test void kickTeamMateTargetsCarryTheNativeKickFlag() {
        ActingPlayer acting = mock(ActingPlayer.class);
        Player<?> mate = mock(Player.class);
        when(game.getActingPlayer()).thenReturn(acting);
        doReturn(player).when(acting).getPlayer();
        when(acting.getPlayerAction()).thenReturn(PlayerAction.KICK_TEAM_MATE_MOVE);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getMechanic(Mechanic.Type.TTM)).thenReturn(ttm);
        when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(7, 7));
        when(ttm.findKickableTeamMates(game, player)).thenReturn(new Player<?>[] { mate });
        when(player.getId()).thenReturn("kicker");
        when(mate.getId()).thenReturn("mate");
        when(mate.getName()).thenReturn("Goblin");
        List<Action> actions = new ArrayList<>();
        projection.targets(game, "home", actions);
        assertEquals(1, actions.size());
        assertEquals("kickMate", actions.get(0).kind);
        ClientCommandThrowTeamMate command = (ClientCommandThrowTeamMate) actions.get(0).command;
        assertTrue(command.isKicked());
        assertEquals("kicker", command.getActingPlayerId());
        assertEquals("mate", command.getThrownPlayerId());
        doReturn(mate).when(game).getDefender();
        actions.clear();
        projection.targets(game, "away", actions);
        assertEquals(390, actions.size());
        assertTrue(((ClientCommandThrowTeamMate) actions.get(0).command).isKicked());
        assertEquals(new FieldCoordinate(25, 0), ((ClientCommandThrowTeamMate) actions.get(0).command).getTargetCoordinate());
    }
}
