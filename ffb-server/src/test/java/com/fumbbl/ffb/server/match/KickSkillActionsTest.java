package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.dialog.DialogKickSkillParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.step.IStep;

import com.eclipsesource.json.JsonObject;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class KickSkillActionsTest {
    @Test void pendingPreDeviationKickDisplaysThePlacedTargetWithoutChangingTheNativeBall() {
        GameState state = mock(GameState.class);
        Game game = mock(Game.class);
        FieldModel field = mock(FieldModel.class);
        IStep step = mock(IStep.class);
        Skill skill = mock(Skill.class);
        when(state.getGame()).thenReturn(game);
        when(state.getCurrentStep()).thenReturn(step);
        when(game.getFieldModel()).thenReturn(field);
        when(skill.hasSkillProperty(NamedProperties.canReduceKickDistance)).thenReturn(true);
        when(game.getDialogParameter()).thenReturn(new DialogSkillUseParameter("kicker", skill, 0));
        JsonObject nativeStep = new JsonObject();
        IServerJsonOption.KICKOFF_START_COORDINATE.addTo(nativeStep, new FieldCoordinate(20, 7));
        when(step.toJsonValue()).thenReturn(nativeStep);
        assertEquals(new FieldCoordinate(20, 7), new KickoffBallPresentation().coordinate(state));
        assertEquals(null, field.getBallCoordinate());
        when(game.getDialogParameter()).thenReturn(null);
        assertEquals(null, new KickoffBallPresentation().coordinate(state));
    }

    @Test void nativeKickDialogOffersBothCommandsToItsPlayerOwner() {
        for (boolean homeKicks : new boolean[] {true, false}) {
            GameState state = mock(GameState.class);
            Game game = mock(Game.class);
            Player<?> player = mock(Player.class);
            Team home = mock(Team.class), away = mock(Team.class);
            Skill skill = mock(Skill.class);
            when(state.getGame()).thenReturn(game);
            when(game.getTeamHome()).thenReturn(home);
            when(game.getTeamAway()).thenReturn(away);
            when(home.hasPlayer(player)).thenReturn(homeKicks);
            when(away.hasPlayer(player)).thenReturn(!homeKicks);
            doReturn(player).when(game).getPlayerById("kicker");
            when(player.getId()).thenReturn("kicker");
            when(player.getSkillWithProperty(NamedProperties.canReduceKickDistance)).thenReturn(skill);
            DialogKickSkillParameter dialog = new DialogKickSkillParameter("kicker", new FieldCoordinate(28, 4), new FieldCoordinate(25, 4));
            when(game.getDialogParameter()).thenReturn(dialog);
            List<Action> actions = new CorePromptActions(state).actions();
            assertEquals(2, actions.size());
            for (int index = 0; index < actions.size(); index++) {
                Action action = actions.get(index);
                ClientCommandUseSkill command = (ClientCommandUseSkill) action.command;
                assertEquals(homeKicks ? "home" : "away", action.role);
                assertEquals("kickSkill", action.kind);
                assertEquals(index == 0, command.isSkillUsed());
                assertEquals("kicker", command.getPlayerId());
                assertSame(skill, command.getSkill());
            }
            assertSame(dialog, game.getDialogParameter());
            when(skill.hasSkillProperty(NamedProperties.canReduceKickDistance)).thenReturn(true);
            when(game.getDialogParameter()).thenReturn(new DialogSkillUseParameter("kicker", skill, 0));
            List<Action> beforeRoll = new CorePromptActions(state).actions();
            assertEquals(2, beforeRoll.size());
            assertEquals("kickSkill", beforeRoll.get(0).kind);
            assertEquals("No", beforeRoll.get(0).label);
            assertEquals("Yes", beforeRoll.get(1).label);
            assertEquals(false, ((ClientCommandUseSkill) beforeRoll.get(0).command).isSkillUsed());
            assertEquals(true, ((ClientCommandUseSkill) beforeRoll.get(1).command).isSkillUsed());
        }
    }
}
