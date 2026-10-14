package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;

/** Displays the placed target while the native Kick decision precedes deviation. */
final class KickoffBallPresentation {
    FieldCoordinate coordinate(GameState state) {
        Game game = state.getGame();
        if (game.getDialogParameter() instanceof DialogSkillUseParameter) {
            DialogSkillUseParameter dialog = (DialogSkillUseParameter) game.getDialogParameter();
            if (dialog.getSkill().hasSkillProperty(NamedProperties.canReduceKickDistance)
                && state.getCurrentStep() != null) {
                FieldCoordinate target = IServerJsonOption.KICKOFF_START_COORDINATE.getFrom(null, state.getCurrentStep().toJsonValue());
                if (target != null) return target;
            }
        }
        return game.getFieldModel().getBallCoordinate();
    }
}
