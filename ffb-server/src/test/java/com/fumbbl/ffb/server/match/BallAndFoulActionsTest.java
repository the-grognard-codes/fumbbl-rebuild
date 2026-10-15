package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Position;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.TtmMechanic;
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
    @Test void passAndHandOffDeclarationsAreOfferedBeforeThePlayerHasTheBall() {
        Game game = mock(Game.class);
        FieldModel field = mock(FieldModel.class);
        TurnData turn = mock(TurnData.class);
        TtmMechanic ttm = mock(TtmMechanic.class);
        Player<?> player = mock(Player.class);
        Position position = mock(Position.class);
        Team own = mock(Team.class);
        when(game.getTurnMode()).thenReturn(com.fumbbl.ffb.TurnMode.REGULAR);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getTurnData()).thenReturn(turn);
        when(game.getMechanic(Mechanic.Type.TTM)).thenReturn(ttm);
        when(game.getOtherTeam(own)).thenReturn(mock(Team.class));
        when(turn.isFoulUsed()).thenReturn(true);
        when(ttm.isTtmAvailable(turn)).thenReturn(false);
        when(ttm.canThrow(game, player)).thenReturn(false);
        when(player.getId()).thenReturn("p1");
        when(player.getName()).thenReturn("Catcher");
        when(player.getTeam()).thenReturn(own);
        doReturn(position).when(player).getPosition();
        when(position.getKeywords()).thenReturn(java.util.Collections.emptyList());
        when(field.isBallInPlay()).thenReturn(true);
        when(field.getBallCoordinate()).thenReturn(new FieldCoordinate(5, 5));
        when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(7, 7));
        List<Action> actions = new ArrayList<>();

        new BallAndFoulActions().declarations(game, player, "home", actions);

        assertTrue(actions.stream().anyMatch(action -> action.kind.equals("declarePass")));
        assertTrue(actions.stream().anyMatch(action -> action.kind.equals("declareHandOff")));
    }

    @Test void playerActionMenuMarksSpentLimitedDeclarationsWithoutMakingThemExecutableOffers() {
        Game game = mock(Game.class);
        FieldModel field = mock(FieldModel.class);
        TurnData turn = mock(TurnData.class);
        TtmMechanic ttm = mock(TtmMechanic.class);
        Player<?> player = mock(Player.class);
        Position position = mock(Position.class);
        Team own = mock(Team.class);
        when(game.getTurnMode()).thenReturn(com.fumbbl.ffb.TurnMode.REGULAR);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getTurnData()).thenReturn(turn);
        when(game.getMechanic(Mechanic.Type.TTM)).thenReturn(ttm);
        when(game.getOtherTeam(own)).thenReturn(mock(Team.class));
        when(turn.isPassUsed()).thenReturn(true);
        when(turn.isHandOverUsed()).thenReturn(true);
        when(turn.isFoulUsed()).thenReturn(true);
        when(ttm.isTtmAvailable(turn)).thenReturn(false);
        when(ttm.canThrow(game, player)).thenReturn(false);
        when(player.getId()).thenReturn("p1");
        when(player.getName()).thenReturn("Catcher");
        when(player.getTeam()).thenReturn(own);
        doReturn(position).when(player).getPosition();
        when(position.getKeywords()).thenReturn(java.util.Collections.emptyList());
        when(field.isBallInPlay()).thenReturn(true);
        when(field.getBallCoordinate()).thenReturn(new FieldCoordinate(5, 5));
        when(field.getPlayerCoordinate(player)).thenReturn(new FieldCoordinate(7, 7));
        List<Action> menu = new ArrayList<>();
        List<Action> executable = new ArrayList<>();

        new BallAndFoulActions().declarations(game, player, "home", menu, true);
        new BallAndFoulActions().declarations(game, player, "home", executable);

        assertTrue(menu.stream().anyMatch(action -> action.kind.equals("declarePass") && action.spent));
        assertTrue(menu.stream().anyMatch(action -> action.kind.equals("declareHandOff") && action.spent));
        assertTrue(menu.stream().anyMatch(action -> action.kind.equals("secureBall") && !action.spent));
        assertTrue(executable.isEmpty());
    }

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
