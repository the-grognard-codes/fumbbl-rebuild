package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepId;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Read-only native eligibility and effective zone sources for the current coach view. */
final class ThreatPresentation {
    JsonObject project(GameState state, String role, Set<String> chargeSelection) {
        if (!"home".equals(role) && !"away".equals(role)) return null;
        Game game = state.getGame();
        Team team;
        Set<String> chargeChoices = null;
        int chargeLimit = Integer.MAX_VALUE;
        if (game.getTurnMode() == TurnMode.REGULAR || game.getTurnMode() == TurnMode.BLITZ) {
            team = game.getActingTeam();
        } else if (state.getCurrentStep() != null && state.getCurrentStep().getId() == StepId.APPLY_KICKOFF_RESULT
            && game.getDialogParameter() instanceof DialogPlayerChoiceParameter
            && ((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.CHARGE) {
            DialogPlayerChoiceParameter choice = (DialogPlayerChoiceParameter) game.getDialogParameter();
            team = game.getTeamHome().getId().equals(choice.getTeamId()) ? game.getTeamHome()
                : game.getTeamAway().getId().equals(choice.getTeamId()) ? game.getTeamAway() : null;
            chargeChoices = new HashSet<>(Arrays.asList(choice.getPlayerIds()));
            chargeLimit = choice.getMaxSelects();
        } else return null;
        if (team == null || !role.equals(team == game.getTeamHome() ? "home" : "away")) return null;

        JsonArray eligible = new JsonArray();
        for (Player<?> player : team.getPlayers()) {
            if (chargeChoices != null && (!chargeChoices.contains(player.getId())
                || !chargeSelection.contains(player.getId()) && chargeSelection.size() >= chargeLimit)) continue;
            if (!FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(player))) continue;
            PlayerState status = game.getFieldModel().getPlayerState(player);
            int posture = status.getBase();
            if (status.isActive() && (posture == PlayerState.STANDING || posture == PlayerState.MOVING
                || posture == PlayerState.PRONE)) eligible.add(player.getId());
        }
        if (eligible.isEmpty()) return null;

        JsonArray zones = new JsonArray();
        for (Team sourceTeam : new Team[] { game.getTeamHome(), game.getTeamAway() })
            for (Player<?> player : sourceTeam.getPlayers())
                if (FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(player))
                    && game.getFieldModel().getPlayerState(player).hasTacklezones()) zones.add(player.getId());
        return new JsonObject().add("version", 1).add("eligiblePlayerIds", eligible).add("zonePlayerIds", zones);
    }
}
