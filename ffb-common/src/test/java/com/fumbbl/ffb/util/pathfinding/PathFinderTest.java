package com.fumbbl.ffb.util.pathfinding;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PathFinderTest {
    private Game game;
    private FieldModel field;
    private Team home;
    private Player<?> mover;

    @BeforeEach
    void setUp() {
        game = mock(Game.class);
        home = mock(Team.class);
        field = new FieldModel(game);
        when(game.getFieldModel()).thenReturn(field);
        when(game.getTeamHome()).thenReturn(home);
        mover = placePlayer("mover", home, 5, 5);
    }

    @Test
    void respectsRemainingMovement() {
        when(mover.getMovementWithModifiers()).thenReturn(3);
        FieldCoordinate target = new FieldCoordinate(8, 5);

        FieldCoordinate[] path = pathTo(target, 0);

        assertNotNull(path);
        assertEquals(3, path.length);
        assertEquals(target, path[path.length - 1]);
        assertNull(pathTo(target, 1));
    }

    @Test
    void routesAroundOccupiedSquaresAndCannotEndOnAPlayer() {
        when(mover.getMovementWithModifiers()).thenReturn(2);
        FieldCoordinate occupied = new FieldCoordinate(6, 5);
        placePlayer("teammate", home, 6, 5);

        FieldCoordinate[] path = pathTo(new FieldCoordinate(7, 5), 0);

        assertNotNull(path);
        assertEquals(2, path.length);
        assertFalse(Arrays.asList(path).contains(occupied));
        assertNull(pathTo(occupied, 0));
    }

    @Test
    void canEndInATackleZoneButCannotCrossIt() {
        when(mover.getMovementWithModifiers()).thenReturn(4);
        placePlayer("opponent", mock(Team.class), 8, 5);
        FieldCoordinate targetInTackleZone = new FieldCoordinate(7, 5);

        FieldCoordinate[] path = pathTo(targetInTackleZone, 0);

        assertNotNull(path);
        assertEquals(2, path.length);
        assertEquals(targetInTackleZone, path[path.length - 1]);
        // Reaching the far side in four squares would require crossing a tackle zone.
        assertNull(pathTo(new FieldCoordinate(9, 5), 0));
    }

    private FieldCoordinate[] pathTo(FieldCoordinate target, int currentMove) {
        return PathFinder.INSTANCE.getShortestPath(game, Set.of(target), mover, currentMove);
    }

    private Player<?> placePlayer(String id, Team team, int x, int y) {
        Player<?> player = mock(Player.class);
        when(player.getId()).thenReturn(id);
        when(player.getTeam()).thenReturn(team);
        doReturn(player).when(game).getPlayerById(id);
        field.setPlayerCoordinate(player, new FieldCoordinate(x, y));
        field.setPlayerState(player, new PlayerState(PlayerState.STANDING));
        return player;
    }
}
