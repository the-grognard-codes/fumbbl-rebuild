package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.KickoffAdjustmentBudget;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonArray;
import java.util.Set;

/** Read-only public progress from the native kickoff step, including interruptions on its stack. */
final class KickoffPresentation {
    JsonObject project(GameState state, Set<String> selection) {
        return project(state, selection, new KickoffBudgetLookup().find(state));
    }

    JsonObject project(GameState state, Set<String> selection, KickoffAdjustmentBudget budget) {
        Game game = state.getGame();
        String actor = game.isHomePlaying() ? "home" : "away";
        if (game.getTurnMode() != TurnMode.SOLID_DEFENCE && game.getDialogParameter() instanceof DialogPlayerChoiceParameter) {
            DialogPlayerChoiceParameter dialog = (DialogPlayerChoiceParameter) game.getDialogParameter();
            PlayerChoiceMode mode = dialog.getPlayerChoiceMode();
            if (mode == PlayerChoiceMode.CHARGE || mode == PlayerChoiceMode.SOLID_DEFENCE || mode == PlayerChoiceMode.QUICK_SNAP) {
                actor = game.getTeamHome().getId().equals(dialog.getTeamId()) ? "home" : "away";
                return progress(mode.name(), actor, "selection", dialog.getMaxSelects(), 0, selection.size());
            }
        }
        int completed = budget == null ? 0 : budget.completedParticipants();
        TurnMode mode = game.getTurnMode();
        if (mode == TurnMode.BLITZ || mode == TurnMode.SELECT_BLITZ_TARGET && game.getLastTurnMode() == TurnMode.BLITZ) {
            JsonArray participants = participants(game);
            return progress("CHARGE", actor, "movement", participants.size(), completed, participants.size()).add("participantIds", participants);
        }
        if (mode == TurnMode.HIGH_KICK) return progress("HIGH_KICK", actor, "movement", 1, completed, 0);
        if (mode != TurnMode.QUICK_SNAP && mode != TurnMode.SOLID_DEFENCE) return null;
        if (budget == null) return null;
        return progress(mode.name(), actor, "movement", budget.allowedParticipants(), completed, budget.selectedParticipantIds().size())
            .add("participantIds", participants(game));
    }

    private JsonArray participants(Game game) {
        JsonArray ids = new JsonArray();
        for (Player<?> player : game.getActingTeam().getPlayers())
            if (FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(player))
                && game.getFieldModel().getPlayerState(player).isActive()) ids.add(player.getId());
        return ids;
    }

    private JsonObject progress(String event, String actor, String stage, int allowed, int completed, int selected) {
        return new JsonObject().add("version", 1).add("event", event).add("actor", actor).add("stage", stage)
            .add("allowed", allowed).add("completed", completed).add("selected", selected);
    }
}
