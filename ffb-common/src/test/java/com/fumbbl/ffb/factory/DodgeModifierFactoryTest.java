package com.fumbbl.ffb.factory;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.inducement.Card;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.InducementSet;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.modifiers.DodgeContext;
import com.fumbbl.ffb.modifiers.DodgeModifier;
import com.fumbbl.ffb.modifiers.ModifierType;

import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DodgeModifierFactoryTest {
    @Test void prehensileTailBelongsToSelectedOpponentWithNoActorOrAnotherActor() {
        for (boolean anotherActor : new boolean[] { false, true }) {
            Game game = mock(Game.class);
            FieldModel field = mock(FieldModel.class);
            Team home = mock(Team.class), away = mock(Team.class);
            Player<?> selected = mock(Player.class), tail = mock(Player.class), current = mock(Player.class);
            ActingPlayer acting = mock(ActingPlayer.class), selectedActing = mock(ActingPlayer.class);
            TurnData homeTurn = mock(TurnData.class), awayTurn = mock(TurnData.class);
            InducementSet emptyCards = mock(InducementSet.class);
            Skill prehensileTail = mock(Skill.class);
            FieldCoordinate from = new FieldCoordinate(5, 5), to = new FieldCoordinate(6, 5);
            FieldCoordinate tailSquare = new FieldCoordinate(5, 6);
            when(game.getFieldModel()).thenReturn(field);
            when(game.getTeamHome()).thenReturn(home);
            when(game.getTeamAway()).thenReturn(away);
            when(game.getActingPlayer()).thenReturn(acting);
            doReturn(anotherActor ? current : null).when(acting).getPlayer();
            doReturn(selected).when(selectedActing).getPlayer();
            when(selected.getTeam()).thenReturn(away);
            when(tail.getTeam()).thenReturn(home);
            when(current.getTeam()).thenReturn(home);
            when(selected.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.emptySet());
            when(tail.getSkillsIncludingTemporaryOnes()).thenReturn(Collections.singleton(prehensileTail));
            when(prehensileTail.hasSkillProperty(NamedProperties.makesDodgingHarder)).thenReturn(true);
            when(field.findAdjacentCoordinates(any(FieldCoordinate.class), eq(FieldCoordinateBounds.FIELD), eq(1), anyBoolean()))
                .thenReturn(new FieldCoordinate[] { tailSquare });
            doReturn(tail).when(field).getPlayer(tailSquare);
            when(field.getPlayerState(tail)).thenReturn(new PlayerState(PlayerState.STANDING));
            when(game.getTurnDataHome()).thenReturn(homeTurn);
            when(game.getTurnDataAway()).thenReturn(awayTurn);
            when(homeTurn.getInducementSet()).thenReturn(emptyCards);
            when(awayTurn.getInducementSet()).thenReturn(emptyCards);
            when(emptyCards.getActiveCards()).thenReturn(new Card[0]);
            when(emptyCards.getDeactivatedCards()).thenReturn(new Card[0]);
            DodgeModifierFactory factory = new DodgeModifierFactory();
            factory.setModifierCollection(new com.fumbbl.ffb.modifiers.mixed.DodgeModifierCollection());
            Set<DodgeModifier> result = factory.findModifiers(new DodgeContext(game, selectedActing, from, to), selected);
            assertEquals(1, result.stream().filter(modifier -> modifier.getType() == ModifierType.PREHENSILE_TAIL).count());
            verify(game, never()).getActingPlayer();
        }
    }
}
