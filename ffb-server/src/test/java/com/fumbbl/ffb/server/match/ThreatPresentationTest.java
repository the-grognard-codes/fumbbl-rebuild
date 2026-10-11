package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;

import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ThreatPresentationTest {
    @Test void regularTurnUsesUnfinishedOwnPlayersAndNativeZoneStatusFromBothTeams() {
        Fixture fixture = new Fixture();
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.REGULAR);
        fixture.status(fixture.homeA, new PlayerState(PlayerState.PRONE).changeActive(true));
        fixture.status(fixture.homeB, new PlayerState(PlayerState.STANDING));
        fixture.status(fixture.awayA, new PlayerState(PlayerState.STANDING).changeRooted(true));
        fixture.status(fixture.awayB, new PlayerState(PlayerState.STANDING).changeConfused(true));
        fixture.status(fixture.awayC, new PlayerState(PlayerState.STUNNED));

        JsonObject threats = fixture.project("home");
        assertEquals(1, threats.getInt("version", -1));
        assertEquals("[\"home-a\"]", threats.get("eligiblePlayerIds").toString());
        assertEquals("[\"home-b\",\"away-a\"]", threats.get("zonePlayerIds").toString());
        assertNull(fixture.project("away"));
        assertNull(fixture.project("spectator"));
    }

    @Test void chargeSelectionUsesDialogTeamAndChoicesThenBlitzUsesParticipantActivation() {
        Fixture fixture = new Fixture();
        fixture.status(fixture.awayA, new PlayerState(PlayerState.STANDING).changeActive(true));
        fixture.status(fixture.awayB, new PlayerState(PlayerState.PRONE).changeActive(true));
        fixture.status(fixture.awayC, new PlayerState(PlayerState.STANDING).changeActive(true));
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.KICKOFF);
        IStep step = mock(IStep.class);
        when(step.getId()).thenReturn(StepId.APPLY_KICKOFF_RESULT);
        when(fixture.state.getCurrentStep()).thenReturn(step);
        when(fixture.game.getDialogParameter()).thenReturn(new DialogPlayerChoiceParameter("away-team",
            PlayerChoiceMode.CHARGE, new String[] { "away-a", "away-b" }, null, 2, 0));

        assertEquals("[\"away-a\",\"away-b\"]", fixture.project("away")
            .get("eligiblePlayerIds").toString());
        assertNull(fixture.project("home"));
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.BLITZ);
        when(fixture.game.getActingTeam()).thenReturn(fixture.away);
        fixture.status(fixture.awayB, new PlayerState(PlayerState.PRONE));
        fixture.status(fixture.awayC, new PlayerState(PlayerState.STANDING));
        assertEquals("[\"away-a\"]", fixture.project("away")
            .get("eligiblePlayerIds").toString());
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.QUICK_SNAP);
        when(fixture.game.getDialogParameter()).thenReturn(null);
        assertNull(fixture.project("away"));
    }

    @Test void noEligiblePlayerOrOtherKickoffModeOmitsGuidance() {
        Fixture fixture = new Fixture();
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.REGULAR);
        fixture.status(fixture.homeA, new PlayerState(PlayerState.STUNNED).changeActive(true));
        fixture.status(fixture.homeB, new PlayerState(PlayerState.STANDING));
        assertNull(fixture.project("home"));
        fixture.status(fixture.homeA, new PlayerState(PlayerState.MOVING).changeActive(true));
        assertEquals("[\"home-a\"]", fixture.project("home")
            .get("eligiblePlayerIds").toString());
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.HIGH_KICK);
        assertNull(fixture.project("home"));
    }

    @Test void hypnotizedProneAndOffPitchPlayersLoseZonesAndFinishedActivationLosesEligibility() {
        Fixture fixture = new Fixture();
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.REGULAR);
        fixture.status(fixture.homeA, new PlayerState(PlayerState.MOVING).changeActive(true));
        when(fixture.field.getPlayerCoordinate(fixture.homeB)).thenReturn(null);
        fixture.status(fixture.awayA, new PlayerState(PlayerState.STANDING).changeHypnotized(true));
        fixture.status(fixture.awayB, new PlayerState(PlayerState.PRONE));
        when(fixture.field.getPlayerCoordinate(fixture.awayC)).thenReturn(new FieldCoordinate(-1, -1));

        JsonObject threats = fixture.project("home");
        assertEquals("[\"home-a\"]", threats.get("eligiblePlayerIds").toString());
        assertEquals("[\"home-a\"]", threats.get("zonePlayerIds").toString());
        fixture.status(fixture.homeA, new PlayerState(PlayerState.STANDING));
        assertNull(fixture.project("home"));
    }

    @Test void chargeAtParticipantLimitOnlyOffersAlreadySelectedPlayers() {
        Fixture fixture = new Fixture();
        when(fixture.game.getTurnMode()).thenReturn(TurnMode.KICKOFF);
        IStep step = mock(IStep.class);
        when(step.getId()).thenReturn(StepId.APPLY_KICKOFF_RESULT);
        when(fixture.state.getCurrentStep()).thenReturn(step);
        when(fixture.game.getDialogParameter()).thenReturn(new DialogPlayerChoiceParameter("away-team",
            PlayerChoiceMode.CHARGE, new String[] { "away-a", "away-b", "away-c" }, null, 2, 0));
        for (Player<?> player : new Player[] { fixture.awayA, fixture.awayB, fixture.awayC })
            fixture.status(player, new PlayerState(PlayerState.STANDING).changeActive(true));
        assertEquals("[\"away-a\",\"away-b\",\"away-c\"]", fixture.project("away").get("eligiblePlayerIds").toString());
        fixture.chargeSelection.add("away-a"); fixture.chargeSelection.add("away-b");
        assertEquals("[\"away-a\",\"away-b\"]", fixture.project("away").get("eligiblePlayerIds").toString());
        fixture.chargeSelection.remove("away-b");
        assertEquals("[\"away-a\",\"away-b\",\"away-c\"]", fixture.project("away").get("eligiblePlayerIds").toString());
    }

    private static final class Fixture {
        final GameState state = mock(GameState.class);
        final Game game = mock(Game.class);
        final FieldModel field = mock(FieldModel.class);
        final Team home = mock(Team.class);
        final Team away = mock(Team.class);
        final Player<?> homeA = player("home-a");
        final Player<?> homeB = player("home-b");
        final Player<?> awayA = player("away-a");
        final Player<?> awayB = player("away-b");
        final Player<?> awayC = player("away-c");
        final ThreatPresentation presentation = new ThreatPresentation();
        final Set<String> chargeSelection = new HashSet<>();

        Fixture() {
            when(state.getGame()).thenReturn(game);
            when(game.getFieldModel()).thenReturn(field);
            when(game.getTeamHome()).thenReturn(home);
            when(game.getTeamAway()).thenReturn(away);
            when(game.getActingTeam()).thenReturn(home);
            when(home.getId()).thenReturn("home-team");
            when(away.getId()).thenReturn("away-team");
            when(home.getPlayers()).thenReturn(new Player[] { homeA, homeB });
            when(away.getPlayers()).thenReturn(new Player[] { awayA, awayB, awayC });
            when(field.getPlayerCoordinate(homeA)).thenReturn(new FieldCoordinate(2, 2));
            when(field.getPlayerCoordinate(homeB)).thenReturn(new FieldCoordinate(3, 2));
            when(field.getPlayerCoordinate(awayA)).thenReturn(new FieldCoordinate(20, 2));
            when(field.getPlayerCoordinate(awayB)).thenReturn(new FieldCoordinate(20, 3));
            when(field.getPlayerCoordinate(awayC)).thenReturn(new FieldCoordinate(20, 4));
            for (Player<?> player : new Player[] { homeA, homeB, awayA, awayB, awayC })
                status(player, new PlayerState(PlayerState.STANDING));
        }

        void status(Player<?> player, PlayerState status) { when(field.getPlayerState(player)).thenReturn(status); }

        JsonObject project(String role) { return presentation.project(state, role, chargeSelection); }

        private static Player<?> player(String id) {
            Player<?> player = mock(Player.class);
            when(player.getId()).thenReturn(id);
            return player;
        }
    }
}
