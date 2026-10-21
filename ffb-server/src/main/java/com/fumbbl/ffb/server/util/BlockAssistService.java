package com.fumbbl.ffb.server.util;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.SkillMechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.util.UtilPlayer;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** The native block-strength contributor calculation, shared with read-only presentation. */
public final class BlockAssistService {
    public List<Player<?>> contributors(Game game, Player<?> supported, Player<?> opponent, boolean multipleBlock) {
        List<Player<?>> contributors = new ArrayList<>();
        Team opponentTeam = opponent.getTeam();
        boolean sameTeam = supported.getTeam() == opponentTeam;
        boolean ignoresAssists = supported.hasSkillProperty(NamedProperties.ignoreBlockAssists)
            || opponent.hasSkillProperty(NamedProperties.ignoreBlockAssists);
        if (ignoresAssists && sameTeam) return contributors;
        if (supported.hasSkillProperty(NamedProperties.flipSameTeamOpponentToOtherTeam) && sameTeam)
            opponentTeam = UtilPlayer.findOtherTeam(game, opponent);
        FieldCoordinate opponentAt = game.getFieldModel().getPlayerCoordinate(opponent);
        Player<?>[] candidates = UtilPlayer.findAdjacentPlayersWithTacklezones(game, supported.getTeam(), opponentAt, false);
        SkillMechanic mechanic = (SkillMechanic) game.getFactory(FactoryType.Factory.MECHANIC).forName(Mechanic.Type.SKILL.name());
        for (Player<?> candidate : candidates) {
            if (candidate == supported || game.getFieldModel().getPlayerState(candidate).isEyeGouged()) continue;
            FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(candidate);
            Player<?>[] marking = UtilPlayer.findAdjacentPlayersWithTacklezones(game, opponentTeam, at, false);
            int others = 0;
            for (Player<?> marker : marking) if (marker != opponent) others++;
            boolean guardCancelled = mechanic.allowsCancellingGuard(game.getTurnMode()) && game.getActingTeam().hasPlayer(supported)
                && Arrays.stream(marking).flatMap(player -> player.getSkillsIncludingTemporaryOnes().stream())
                    .anyMatch(skill -> skill.canCancel(NamedProperties.assistsBlocksInTacklezones));
            if (((candidate.hasSkillProperty(NamedProperties.assistsBlocksInTacklezones) && !guardCancelled) || others == 0)
                && mechanic.isValidAssist(multipleBlock, game.getFieldModel(), candidate)) contributors.add(candidate);
        }
        return contributors;
    }
}
