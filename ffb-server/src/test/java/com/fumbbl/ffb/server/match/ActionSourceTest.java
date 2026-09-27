package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

class ActionSourceTest {
    private final Game game = mock(Game.class);
    private final ActingPlayer acting = mock(ActingPlayer.class);
    private final Team home = mock(Team.class);
    private final Team away = mock(Team.class);
    private final Player<?> homePlayer = mock(Player.class);
    private final Player<?> awayPlayer = mock(Player.class);
    private final ActionSource source = new ActionSource();

    ActionSourceTest() {
        when(game.getActingPlayer()).thenReturn(acting);
        when(game.getTeamHome()).thenReturn(home);
        when(game.getTeamAway()).thenReturn(away);
        doReturn(homePlayer).when(game).getPlayerById("home-player");
        doReturn(awayPlayer).when(game).getPlayerById("away-player");
        when(homePlayer.getTeam()).thenReturn(home);
        when(awayPlayer.getTeam()).thenReturn(away);
    }

    @Test void idleDeclarationsBelongToThePlayerWhoCanMakeThem() {
        for (String kind : new String[] { "declareFoul", "declarePass", "declareHandOff", "declareThrowTeamMate", "secureBall" }) {
            assertEquals("home-player", source.playerId(game,
                new Action("choice", kind, "Choose", "home", null, "home-player")), kind);
        }
        assertNull(source.playerId(game, new Action("choice", "declarePass", "Choose", "home", null, "away-player")));
    }

    @Test void targetedBlocksKeepTheActingPlayerAsSource() {
        when(acting.getPlayerId()).thenReturn("home-player");
        assertEquals("home-player", source.playerId(game,
            new Action("block", "block", "Block", "home", null, "away-player")));
        assertNull(source.playerId(game, new Action("block", "block", "Block", "away", null, "home-player")));
    }
}
