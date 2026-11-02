package com.fumbbl.ffb.server.skillbehaviour.bb2025;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.SkillUse;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.report.ReportSkillUse;
import com.fumbbl.ffb.server.model.SkillBehaviour;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.skill.bb2025.EyeGouge;
import com.fumbbl.ffb.util.UtilCards;

@RulesCollection(RulesCollection.Rules.BB2025)
public class EyeGougeBehaviour extends SkillBehaviour<EyeGouge> {
    /** Apply after the Block resolves: a prevented push and a fallen defender do not qualify. */
    public void applyAfterBlock(IStep step, FieldCoordinate originalPosition) {
        Game game = step.getGameState().getGame();
        Player<?> attacker = game.getActingPlayer().getPlayer(), defender = game.getDefender();
        if (attacker == null || defender == null || originalPosition == null) return;
        FieldCoordinate position = game.getFieldModel().getPlayerCoordinate(defender);
        PlayerState state = game.getFieldModel().getPlayerState(defender);
        if (!attacker.hasSkillProperty(NamedProperties.canRemoveOpponentAssists)
            || !FieldCoordinateBounds.FIELD.isInBounds(position) || originalPosition.equals(position)
            || !state.isStanding() || state.isEyeGouged()) return;
        game.getFieldModel().setPlayerState(defender, state.changeEyeGouged(true));
        UtilCards.getSkillWithProperty(attacker, NamedProperties.canRemoveOpponentAssists)
            .ifPresent(skill -> step.getResult().addReport(new ReportSkillUse(attacker.getId(), skill, true, SkillUse.EYE_GOUGED)));
    }
}
