package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandFoul;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

class BallAndFoulActionsTest {
    @Test void adjacentFoulOffersChainsawOnlyForAnEligibleAttacker() {
        Game game = mock(Game.class);
        FieldModel field = mock(FieldModel.class);
        ActingPlayer acting = mock(ActingPlayer.class);
        Player<?> attacker = mock(Player.class);
        Player<?> defender = mock(Player.class);
        Team own = mock(Team.class);
        Team opponent = mock(Team.class);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getActingPlayer()).thenReturn(acting);
        doReturn(attacker).when(acting).getPlayer();
        when(acting.getPlayerAction()).thenReturn(PlayerAction.FOUL_MOVE);
        when(acting.hasPassed()).thenReturn(true);
        when(attacker.getId()).thenReturn("attacker");
        when(attacker.getTeam()).thenReturn(own);
        when(defender.getId()).thenReturn("defender");
        when(defender.getName()).thenReturn("Defender");
        when(game.getOtherTeam(own)).thenReturn(opponent);
        when(opponent.getPlayers()).thenReturn(new Player<?>[] { defender });
        when(field.getPlayerCoordinate(attacker)).thenReturn(new FieldCoordinate(5, 5));
        when(field.getPlayerCoordinate(defender)).thenReturn(new FieldCoordinate(6, 5));
        when(field.getPlayerState(defender)).thenReturn(new PlayerState(PlayerState.PRONE));
        when(attacker.hasSkillProperty(NamedProperties.providesChainsawFoulingAlternative)).thenReturn(true);
        List<Action> actions = new ArrayList<>();
        new BallAndFoulActions().targets(game, "home", actions);
        assertEquals(2, actions.size());
        assertFalse(((ClientCommandFoul) actions.get(0).command).isUsingChainsaw());
        assertEquals("Foul - Chainsaw Defender", actions.get(1).label);
        ClientCommandFoul chainsaw = (ClientCommandFoul) actions.get(1).command;
        assertTrue(chainsaw.isUsingChainsaw());
        assertEquals("attacker", chainsaw.getActingPlayerId());
        assertEquals("defender", chainsaw.getDefenderId());
    }
}
