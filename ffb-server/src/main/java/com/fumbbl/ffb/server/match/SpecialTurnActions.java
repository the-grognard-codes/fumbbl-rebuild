package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.CardEffect;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.MoveSquare;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.mechanics.TtmMechanic;
import com.fumbbl.ffb.mechanics.bb2025.GameMechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandFieldCoordinate;
import com.fumbbl.ffb.net.commands.ClientCommandGaze;
import com.fumbbl.ffb.net.commands.ClientCommandPass;
import com.fumbbl.ffb.net.commands.ClientCommandThrowTeamMate;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.UtilGameOption;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.util.UtilPlayer;

import java.util.List;

/** Native BB2025 special declarations and their server-validated target commands. */
final class SpecialTurnActions {
    void declarations(Game game, Player<?> player, PlayerState status, String role, List<Action> actions) {
        if (game.getTurnMode() != TurnMode.REGULAR) return;
        GameMechanic rules = game.getMechanic(Mechanic.Type.GAME);
        if (rules.isGazeActionAllowed(game, player) && UtilPlayer.canGaze(game, player))
            declare(actions, player, role, "declareGaze", "Hypnotic gaze", PlayerAction.GAZE_MOVE);
        if (rules.isBombActionAllowed(game.getTurnMode()) && !game.getTurnData().isBombUsed()
            && !game.getFieldModel().hasCardEffect(player, CardEffect.ILLEGALLY_SUBSTITUTED)
            && !status.isProneOrStunned() && player.hasSkillProperty(NamedProperties.enableThrowBombAction))
            declare(actions, player, role, "declareBomb", "Throw bomb", PlayerAction.THROW_BOMB);
        if (!game.getTurnData().isPuntUsed() && player.hasSkillProperty(NamedProperties.canPunt)
            && !player.hasSkillProperty(NamedProperties.preventPuntAction)
            && (status.isAbleToMove() || UtilPlayer.hasBall(game, player))
            && (status.getBase() != PlayerState.PRONE
                || UtilGameOption.isOptionEnabled(game, GameOptionId.ALLOW_SPECIAL_ACTIONS_FROM_PRONE))
            && UtilPlayer.isBallAvailable(game, player))
            declare(actions, player, role, "declarePunt", "Punt", PlayerAction.PUNT_MOVE);
        TtmMechanic ttm = game.getMechanic(Mechanic.Type.TTM);
        if (rules.isKickTeamMateActionAllowed(game.getTurnMode()) && ttm.isKtmAvailable(game.getTurnData())
            && player.hasSkillProperty(NamedProperties.canKickTeamMates)
            && !game.getFieldModel().hasCardEffect(player, CardEffect.ILLEGALLY_SUBSTITUTED)
            && !player.hasSkillProperty(NamedProperties.preventKickTeamMateAction)) {
            for (Player<?> mate : player.getTeam().getPlayers()) {
                if (FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(mate))
                    && ttm.canBeKicked(game, mate)) {
                    if (status.isAbleToMove() || ttm.findKickableTeamMates(game, player).length > 0)
                        declare(actions, player, role, "declareKickTeamMate", "Kick team-mate", PlayerAction.KICK_TEAM_MATE_MOVE);
                    break;
                }
            }
        }
        if (status.getBase() != PlayerState.PRONE
            && (status.isConfused() && !player.hasSkillProperty(NamedProperties.preventRecoverFromConcusionAction)
                || status.isHypnotized() && !player.hasSkillProperty(NamedProperties.preventRecoverFromGazeAction)
                || status.isEyeGouged()))
            declare(actions, player, role, "declareRecover", "Recover", PlayerAction.REMOVE_CONFUSION);
    }

    void targets(Game game, String role, List<Action> actions) {
        ActingPlayer acting = game.getActingPlayer();
        Player<?> player = acting.getPlayer();
        if (player == null) return;
        PlayerAction action = acting.getPlayerAction();
        FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(player);
        if (action == PlayerAction.GAZE_MOVE || action == PlayerAction.GAZE) {
            if (UtilPlayer.canGaze(game, player)) for (Player<?> victim : game.getOtherTeam(player.getTeam()).getPlayers()) {
                FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(victim);
                if (FieldCoordinateBounds.FIELD.isInBounds(at) && from.isAdjacent(at)
                    && game.getFieldModel().getPlayerState(victim).hasTacklezones())
                    actions.add(new Action("gaze-" + victim.getId(), "gaze", "Gaze at " + victim.getName(), role,
                        new ClientCommandGaze(player.getId(), victim.getId()), victim.getId()));
            }
        }
        if (action == PlayerAction.THROW_BOMB || action == PlayerAction.HAIL_MARY_BOMB) {
            PassMechanic pass = game.getMechanic(Mechanic.Type.PASS);
            for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
                FieldCoordinate at = new FieldCoordinate(x, y);
                if (action != PlayerAction.HAIL_MARY_BOMB && pass.findPassingDistance(game, from, at, false) == null) continue;
                actions.add(new Action("bomb-" + x + "-" + y, "bomb", "Throw bomb towards " + x + ", " + y,
                    role, new ClientCommandPass(player.getId(), oriented(at, role)), at));
            }
        }
        if (action == PlayerAction.PUNT_MOVE && UtilPlayer.hasBall(game, player))
            actions.add(new Action("punt-now", "puntNow", "Punt now", role,
                new ClientCommandActingPlayer(player.getId(), PlayerAction.PUNT, acting.isJumping()), player.getId()));
        if (action == PlayerAction.PUNT && UtilPlayer.hasBall(game, player)) for (MoveSquare square : game.getFieldModel().getMoveSquares()) {
            FieldCoordinate at = square.getCoordinate();
            if (!FieldCoordinateBounds.FIELD.isInBounds(at)) continue;
            actions.add(new Action("punt-" + at.getX() + "-" + at.getY(), "punt", "Punt towards " + at.getX() + ", " + at.getY(),
                role, new ClientCommandFieldCoordinate(oriented(at, role)), at));
        }
        if (action == PlayerAction.KICK_TEAM_MATE_MOVE || action == PlayerAction.KICK_TEAM_MATE) {
            TtmMechanic ttm = game.getMechanic(Mechanic.Type.TTM);
            if (game.getDefender() == null) {
                for (Player<?> mate : ttm.findKickableTeamMates(game, player))
                    actions.add(new Action("kick-mate-" + mate.getId(), "kickMate", "Select " + mate.getName() + " to kick", role,
                        new ClientCommandThrowTeamMate(player.getId(), mate.getId(), true), mate.getId()));
            } else if (game.getPassCoordinate() == null) {
                for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
                    FieldCoordinate at = new FieldCoordinate(x, y);
                    actions.add(new Action("kick-mate-to-" + x + "-" + y, "kickMateTo", "Kick team-mate towards " + x + ", " + y,
                        role, new ClientCommandThrowTeamMate(player.getId(), oriented(at, role), true), at));
                }
            }
        }
    }

    private void declare(List<Action> actions, Player<?> player, String role, String kind, String label, PlayerAction action) {
        actions.add(new Action(kind + "-" + player.getId(), kind, label + " with " + player.getName(), role,
            new ClientCommandActingPlayer(player.getId(), action, false), player.getId()));
    }

    private FieldCoordinate oriented(FieldCoordinate at, String role) { return "home".equals(role) ? at : at.transform(); }
}
