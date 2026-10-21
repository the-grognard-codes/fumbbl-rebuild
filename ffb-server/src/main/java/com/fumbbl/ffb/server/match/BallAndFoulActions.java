package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.mechanics.PassRangeService;
import com.fumbbl.ffb.mechanics.TtmMechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Keyword;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandFoul;
import com.fumbbl.ffb.net.commands.ClientCommandHandOver;
import com.fumbbl.ffb.net.commands.ClientCommandPass;
import com.fumbbl.ffb.net.commands.ClientCommandThrowTeamMate;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.util.UtilPlayer;

import java.util.List;

/** Browser intent projection for the frozen Human catalog, using native range and trait mechanics. */
public final class BallAndFoulActions {
    public void declarations(Game game, Player<?> player, String role, List<Action> actions) {
        declarations(game, player, role, actions, false);
    }

    void declarations(Game game, Player<?> player, String role, List<Action> actions, boolean menu) {
        TurnMode mode = game.getTurnMode() == TurnMode.SELECT_BLITZ_TARGET ? game.getLastTurnMode() : game.getTurnMode();
        if (mode != TurnMode.REGULAR) return;
        boolean passSpent = game.getTurnData().isPassUsed();
        boolean handOverSpent = game.getTurnData().isHandOverUsed();
        if (game.getFieldModel().isBallInPlay()) {
            if (menu || !passSpent) {
                declare(actions, player, role, "declarePass", "Pass", PlayerAction.PASS_MOVE, menu, passSpent);
                if (player.hasSkillProperty(NamedProperties.canPassToAnySquare))
                    declare(actions, player, role, "declareHailMaryPass", "Hail Mary Pass", PlayerAction.HAIL_MARY_PASS, menu, passSpent);
            }
            if (menu || !handOverSpent) declare(actions, player, role, "declareHandOff", "Hand off", PlayerAction.HAND_OVER_MOVE, menu, handOverSpent);
        }
        boolean foulSpent = game.getTurnData().isFoulUsed();
        if (menu || !foulSpent) {
            if (menu) {
                declare(actions, player, role, "declareFoul", "Foul", PlayerAction.FOUL_MOVE, true, foulSpent);
            } else {
                for (Player<?> opponent : game.getOtherTeam(player.getTeam()).getPlayers()) {
                    if (onPitch(game, opponent) && game.getFieldModel().getPlayerState(opponent).canBeFouled()) {
                        declare(actions, player, role, "declareFoul", "Foul", PlayerAction.FOUL_MOVE, false, foulSpent);
                        break;
                    }
                }
            }
        }
        TtmMechanic ttm = game.getMechanic(Mechanic.Type.TTM);
        boolean ttmSpent = game.getTurnData().isTtmUsed();
        if ((menu || ttm.isTtmAvailable(game.getTurnData())) && ttm.canThrow(game, player)) {
            if (menu) {
                declare(actions, player, role, "declareThrowTeamMate", "Throw team-mate", PlayerAction.THROW_TEAM_MATE_MOVE, true, ttmSpent);
            } else {
                for (Player<?> mate : player.getTeam().getPlayers()) {
                    if (onPitch(game, mate) && ttm.canBeThrown(game, mate)) {
                        declare(actions, player, role, "declareThrowTeamMate", "Throw team-mate", PlayerAction.THROW_TEAM_MATE_MOVE, false, ttmSpent);
                        break;
                    }
                }
            }
        }
        FieldCoordinate ball = game.getFieldModel().getBallCoordinate();
        boolean secureEligible = !player.hasSkillProperty(NamedProperties.preventSecureTheBallAction)
            && !player.getPosition().getKeywords().contains(Keyword.BIG_GUY);
        if (menu && secureEligible) {
            declare(actions, player, role, "secureBall", "Secure the ball with", PlayerAction.SECURE_THE_BALL,
                true, game.getTurnData().isSecureTheBallUsed());
        } else if (!menu && game.getFieldModel().isBallInPlay() && game.getFieldModel().isBallMoving()
            && FieldCoordinateBounds.FIELD.isInBounds(ball) && !game.getTurnData().isSecureTheBallUsed() && secureEligible
            && UtilPlayer.findPlayersWithTackleZonesTwoSquaresAway(game, game.getOtherTeam(player.getTeam()), ball).length == 0) {
            declare(actions, player, role, "secureBall", "Secure the ball with", PlayerAction.SECURE_THE_BALL,
                false, false);
        }
    }

    public void targets(Game game, String role, List<Action> actions) {
        ActingPlayer acting = game.getActingPlayer();
        Player<?> player = acting.getPlayer();
        if (player == null) return;
        PlayerAction action = new HailMaryActions().action(game);
        FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(player);
        if (!acting.hasPassed() && UtilPlayer.hasBall(game, player)) {
            if (action == PlayerAction.PASS_MOVE || action == PlayerAction.PASS || action == PlayerAction.HAIL_MARY_PASS) {
                PassRangeService range = new PassRangeService();
                for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
                    FieldCoordinate to = new FieldCoordinate(x, y);
                    if (action != PlayerAction.HAIL_MARY_PASS && to.equals(from) || !range.isInRange(game, player, to, action)) continue;
                    actions.add(new Action("pass-" + x + "-" + y, "pass", targetLabel(game, "Pass to", to), role,
                        new ClientCommandPass(player.getId(), oriented(to, role)), to));
                }
            }
            if (action == PlayerAction.HAND_OVER_MOVE || action == PlayerAction.HAND_OVER) {
                for (Player<?> catcher : player.getTeam().getPlayers()) {
                    FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(catcher);
                    if (onPitch(game, catcher) && from.isAdjacent(at) && game.getFieldModel().getPlayerState(catcher).hasTacklezones())
                        actions.add(new Action("hand-off-" + catcher.getId(), "handOff", "Hand off to " + catcher.getName(), role,
                            new ClientCommandHandOver(player.getId(), catcher.getId()), catcher.getId()));
                }
            }
        }
        if ((action == PlayerAction.FOUL_MOVE || action == PlayerAction.FOUL) && !acting.hasFouled()) {
            // UtilPlayer.isFoulable assumes a desktop-oriented home team. Keep canonical persisted sides here.
            for (Player<?> opponent : game.getOtherTeam(player.getTeam()).getPlayers()) {
                if (onPitch(game, opponent) && from.isAdjacent(game.getFieldModel().getPlayerCoordinate(opponent))
                    && game.getFieldModel().getPlayerState(opponent).canBeFouled()
                    && !opponent.hasSkillProperty(NamedProperties.preventBeingFouled)) {
                    actions.add(new Action("foul-" + opponent.getId(), "foul", "Foul " + opponent.getName(), role,
                        new ClientCommandFoul(player.getId(), opponent.getId(), false), opponent.getId()));
                    if (player.hasSkillProperty(NamedProperties.providesChainsawFoulingAlternative))
                        actions.add(new Action("foul-chainsaw-" + opponent.getId(), "foulChainsaw", "Foul - Chainsaw " + opponent.getName(), role,
                            new ClientCommandFoul(player.getId(), opponent.getId(), true), opponent.getId()));
                }
            }
        }
        if (action == PlayerAction.THROW_TEAM_MATE_MOVE || action == PlayerAction.THROW_TEAM_MATE) {
            TtmMechanic ttm = game.getMechanic(Mechanic.Type.TTM);
            if (game.getDefender() == null) {
                for (Player<?> mate : ttm.findThrowableTeamMates(game, player))
                    actions.add(new Action("lift-" + mate.getId(), "liftTeamMate", "Pick up " + mate.getName() + " to throw", role,
                        new ClientCommandThrowTeamMate(player.getId(), mate.getId()), mate.getId()));
            } else if (game.getPassCoordinate() == null) {
                PassMechanic pass = game.getMechanic(Mechanic.Type.PASS);
                for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
                    FieldCoordinate to = new FieldCoordinate(x, y);
                    if (to.equals(from) || pass.findPassingDistance(game, from, to, true) == null) continue;
                    actions.add(new Action("throw-mate-" + x + "-" + y, "throwTeamMate", targetLabel(game, "Throw team-mate towards", to), role,
                        new ClientCommandThrowTeamMate(player.getId(), oriented(to, role)), to));
                }
            }
        }
    }

    private boolean onPitch(Game game, Player<?> player) {
        return FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(player));
    }
    private String targetLabel(Game game, String verb, FieldCoordinate at) {
        Player<?> target = game.getFieldModel().getPlayer(at);
        return verb + " " + at.getX() + ", " + at.getY() + (target == null ? " (empty square)" : " (" + target.getName() + ")");
    }
    private FieldCoordinate oriented(FieldCoordinate at, String role) { return "home".equals(role) ? at : at.transform(); }
    private void declare(List<Action> actions, Player<?> player, String role, String kind, String label,
                         PlayerAction action, boolean menu, boolean spent) {
        if (spent && !menu) return;
        actions.add(new Action(kind + "-" + player.getId(), kind, label + " " + player.getName(), role,
            new ClientCommandActingPlayer(player.getId(), action, false), player.getId(), spent));
    }
}
