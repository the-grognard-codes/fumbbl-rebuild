package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.MoveSquare;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.mechanics.JumpMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.TargetSelectionState;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandBlitzMove;
import com.fumbbl.ffb.net.commands.ClientCommandBlock;
import com.fumbbl.ffb.net.commands.ClientCommandEndTurn;
import com.fumbbl.ffb.net.commands.ClientCommandMove;
import com.fumbbl.ffb.net.commands.ClientCommandTargetSelected;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.UtilGameOption;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.util.UtilPlayer;
import com.fumbbl.ffb.util.pathfinding.PathFinderWithMultiJump;

import java.util.ArrayList;
import java.util.List;

/** Read-only projection of native core turn targets. No dice or state mutation. */
public final class CoreTurnActions {
    private final GameState state;
    private final boolean allowActivationSwitch;
    public CoreTurnActions(GameState state) { this(state, false); }
    CoreTurnActions(GameState state, boolean allowActivationSwitch) {
        this.state = state;
        this.allowActivationSwitch = allowActivationSwitch;
    }
    String legacyMovementLabel(FieldCoordinate target, boolean jumping) {
        for (MoveSquare square : state.getGame().getFieldModel().getMoveSquares())
            if (square.getCoordinate().equals(target)) return movementLabel(square, jumping, false);
        return null;
    }
    private String movementLabel(MoveSquare square, boolean jumping, boolean effective) {
        FieldCoordinate to = square.getCoordinate();
        String label = (jumping ? "Jump to " : "Move to ") + to.getX() + ", " + to.getY();
        int dodge = square.getMinimumRollDodge(), rush = square.getMinimumRollGoForIt();
        if (dodge > 0) label += " (dodge " + (effective ? DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(dodge) : dodge) + "+)";
        if (rush > 0) label += " (rush " + (effective ? DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(rush) : rush) + "+)";
        return label;
    }
    public List<Action> actions() {
        List<Action> result = new ArrayList<>();
        Game game = state.getGame();
        ActingPlayer acting = game.getActingPlayer();
        String role = game.isHomePlaying() ? "home" : "away";
        if (game.getTurnMode() == TurnMode.SELECT_BLITZ_TARGET && acting.getPlayer() != null) {
            FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(acting.getPlayer());
            for (Player<?> target : game.getOtherTeam(game.getActingTeam()).getPlayers()) {
                FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(target);
                if (!FieldCoordinateBounds.FIELD.isInBounds(at) || !game.getFieldModel().getPlayerState(target).canBeBlocked()) continue;
                FieldCoordinate[] path = new PathFinderWithMultiJump().getPathToBlitzTarget(game, target);
                if (!at.isAdjacent(from) && (path == null || path.length == 0)) continue;
                result.add(new Action("target-" + target.getId(), "blitzTarget", "Blitz " + target.getName(), role, new ClientCommandTargetSelected(target.getId()), target.getId()));
            }
            if (allowActivationSwitch) declarations(game, role, result, false);
            return result;
        }
        boolean consumedKickoffChoice = game.getDialogParameter() instanceof DialogPlayerChoiceParameter
            && (((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.CHARGE
                || ((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.SOLID_DEFENCE);
        if (!turnActionContext(game, consumedKickoffChoice)) return result;
        result.add(new Action("end-turn", "endTurn", "End turn", role, new ClientCommandEndTurn(game.getTurnMode(), null)));
        if (acting.getPlayer() == null || allowActivationSwitch) declarations(game, role, result, false);
        if (acting.getPlayer() == null) return result;
        String id = acting.getPlayerId();
        FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(acting.getPlayer());
        result.add(new Action("end-action", "endAction", "End player action", role, new ClientCommandActingPlayer(null, null, false)));
        PlayerAction action = acting.getPlayerAction();
        if (action != null && (action.isMoving() || action.isStandingUp())) {
            JumpMechanic jump = game.getMechanic(Mechanic.Type.JUMP);
            if (acting.isJumping() || jump.isAvailableAsNextMove(game, acting, false))
                result.add(new Action("toggle-jump", "jumpMode", acting.isJumping() ? "Walk normally" : "Jump over a prone or stunned player", role,
                    new ClientCommandActingPlayer(id, action, !acting.isJumping())));
            for (MoveSquare square : game.getFieldModel().getMoveSquares()) {
                FieldCoordinate to = square.getCoordinate();
                if (!FieldCoordinateBounds.FIELD.isInBounds(to) || game.getFieldModel().getPlayer(to) != null
                    || (acting.isJumping() ? !jump.isValidJump(game, acting.getPlayer(), from, to) : !to.isAdjacent(from))) continue;
                String label = movementLabel(square, acting.isJumping(), true);
                ClientCommand command = action.isBlitzing() ? new ClientCommandBlitzMove(id, oriented(from, role), new FieldCoordinate[] { oriented(to, role) })
                    : new ClientCommandMove(id, oriented(from, role), new FieldCoordinate[] { oriented(to, role) }, null);
                result.add(new Action("move-" + to.getX() + "-" + to.getY(), acting.isJumping() ? "jump" : "move", label, role, command, to));
            }
        }
        new BallAndFoulActions().targets(game, role, result);
        new SpecialTurnActions().targets(game, role, result);
        if (action == PlayerAction.MULTIPLE_BLOCK && !acting.hasBlocked())
            new MultipleBlockActions().targets(game, acting.getPlayer(), role, result);
        if (action != null && (action.isBlockOrSpecialAction() || action.isBlitzing()) && !acting.hasBlocked()) {
            TargetSelectionState selected = game.getFieldModel().getTargetSelectionState();
            for (Player<?> target : UtilPlayer.findAdjacentBlockablePlayers(game, game.getOtherTeam(game.getActingTeam()), from)) {
                FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(target);
                if (game.getFieldModel().getDiceDecoration(at) == null || selected != null && !target.getId().equals(selected.getSelectedPlayerId())) continue;
                if (action == PlayerAction.BLOCK || action.isBlitzing())
                    result.add(new Action("block-" + target.getId(), "block", "Block " + target.getName(), role,
                        new ClientCommandBlock(id, target.getId(), false, false, false, false, false), target.getId()));
                new SpecialBlockActions().targets(acting.getPlayer(), action, target, role, result);
            }
        }
        return result;
    }
    public List<Action> playerActionMenu() {
        List<Action> result = new ArrayList<>();
        Game game = state.getGame();
        String role = game.isHomePlaying() ? "home" : "away";
        if (game.getTurnMode() == TurnMode.SELECT_BLITZ_TARGET) {
            if (allowActivationSwitch) {
                declarations(game, role, result, true);
                markReservedActions(result);
            }
            return result;
        }
        boolean consumedKickoffChoice = game.getDialogParameter() instanceof DialogPlayerChoiceParameter
            && (((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.CHARGE
                || ((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.SOLID_DEFENCE);
        if (!turnActionContext(game, consumedKickoffChoice)) return result;
        declarations(game, role, result, true);
        markReservedActions(result);
        return result;
    }
    private void markReservedActions(List<Action> declarations) {
        if (!allowActivationSwitch) return;
        PlayerActivation activation = new PlayerActivation(state);
        for (int index = 0; index < declarations.size(); index++) {
            Action declaration = declarations.get(index);
            if (!(declaration.command instanceof ClientCommandActingPlayer)) continue;
            ClientCommandActingPlayer command = (ClientCommandActingPlayer) declaration.command;
            if (!declaration.spent && activation.reserves(command.getPlayerAction()))
                declarations.set(index, new Action(declaration.id, declaration.kind, declaration.label,
                    declaration.role, declaration.command, declaration.targetPlayerId, true));
        }
    }
    private boolean turnActionContext(Game game, boolean consumedKickoffChoice) {
        return (state.getCurrentStep().getId() == StepId.INIT_SELECTING || state.getCurrentStep().getId() == StepId.INIT_MOVING
            || state.getCurrentStep().getId() == StepId.INIT_BLOCKING || state.getCurrentStep().getId() == StepId.INIT_PASSING
            || state.getCurrentStep().getId() == StepId.INIT_THROW_TEAM_MATE || state.getCurrentStep().getId() == StepId.INIT_FOULING
            || state.getCurrentStep().getId() == StepId.INIT_BOMB || state.getCurrentStep().getId() == StepId.INIT_PUNT
            || state.getCurrentStep().getId() == StepId.INIT_KICK_TEAM_MATE)
            && (game.getDialogParameter() == null || consumedKickoffChoice)
            && (game.getTurnMode() == TurnMode.REGULAR || game.getTurnMode() == TurnMode.BLITZ);
    }
    private void declarations(Game game, String role, List<Action> result, boolean menu) {
        TurnMode mode = game.getTurnMode() == TurnMode.SELECT_BLITZ_TARGET ? game.getLastTurnMode() : game.getTurnMode();
        for (Player<?> player : game.getActingTeam().getPlayers()) {
            PlayerState status = game.getFieldModel().getPlayerState(player);
            FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(player);
            boolean currentPlayer = player == game.getActingPlayer().getPlayer();
            if (!FieldCoordinateBounds.FIELD.isInBounds(at) || (!menu && currentPlayer)
                || (!currentPlayer && !status.isActive())) continue;
            new SpecialTurnActions().declarations(game, player, status, role, result, menu);
            boolean canMove = status.isAbleToMove() || menu && currentPlayer && canMoveWithoutActivationFlag(status);
            if (!canMove) continue;
            boolean prone = status.getBase() == PlayerState.PRONE;
            if (!prone && UtilGameOption.isOptionEnabled(game, GameOptionId.ENABLE_STALLING_CHECK))
                result.add(new Action("forgo-" + player.getId(), "forgo", "Forgo activation of " + player.getName(), role,
                    new ClientCommandActingPlayer(player.getId(), PlayerAction.FORGO, false), player.getId()));
            new BallAndFoulActions().declarations(game, player, role, result, menu);
            result.add(new Action("select-" + player.getId(), prone ? "stand" : "select", (prone ? "Stand up " : "Move ") + player.getName(), role,
                new ClientCommandActingPlayer(player.getId(), prone ? PlayerAction.STAND_UP : PlayerAction.MOVE, false), player.getId()));
            boolean blitzSpent = game.getTurnData().isBlitzUsed();
            if (menu || !blitzSpent)
                result.add(new Action("blitz-" + player.getId(), "blitz", "Start blitz with " + player.getName(), role,
                    new ClientCommandActingPlayer(player.getId(), PlayerAction.BLITZ_MOVE, false), player.getId(), blitzSpent));
            boolean blockEligible = !prone && mode == TurnMode.REGULAR
                && !player.hasSkillProperty(NamedProperties.preventRegularBlockAction);
            boolean canBlock = blockEligible && UtilPlayer.findAdjacentBlockablePlayers(game, game.getOtherTeam(game.getActingTeam()), at).length > 0;
            if (canBlock || menu && blockEligible)
                result.add(new Action("select-block-" + player.getId(), "selectBlock", "Block with " + player.getName(), role,
                    new ClientCommandActingPlayer(player.getId(), PlayerAction.BLOCK, false), player.getId()));
            new MultipleBlockActions().declaration(game, player, status, role, result, menu);
            new SpecialBlockActions().declarations(player, status, menu ? blockEligible : canBlock, role, result);
        }
        if (allowActivationSwitch && !menu) {
            PlayerActivation activation = new PlayerActivation(state);
            result.removeIf(action -> action.command instanceof ClientCommandActingPlayer
                && activation.reserves(((ClientCommandActingPlayer) action.command).getPlayerAction()));
        }
    }
    private boolean canMoveWithoutActivationFlag(PlayerState status) {
        int base = status.getBase();
        return (base == PlayerState.STANDING || base == PlayerState.MOVING || base == PlayerState.PRONE) && !status.isPinned();
    }
    private FieldCoordinate oriented(FieldCoordinate coordinate, String role) { return "home".equals(role) ? coordinate : coordinate.transform(); }
    public static final class Action {
        public final String id, kind, label, role;
        public final ClientCommand command;
        public final String targetPlayerId;
        public final FieldCoordinate targetSquare;
        public final boolean spent;
        public Action(String id, String kind, String label, String role, ClientCommand command) {
            this(id, kind, label, role, command, null, null);
        }
        public Action(String id, String kind, String label, String role, ClientCommand command, String playerId) {
            this(id, kind, label, role, command, playerId, null);
        }
        public Action(String id, String kind, String label, String role, ClientCommand command, FieldCoordinate square) {
            this(id, kind, label, role, command, null, square);
        }
        private Action(String id, String kind, String label, String role, ClientCommand command, String playerId, FieldCoordinate square) {
            this(id, kind, label, role, command, playerId, square, false);
        }
        Action(String id, String kind, String label, String role, ClientCommand command, String playerId, boolean spent) {
            this(id, kind, label, role, command, playerId, null, spent);
        }
        private Action(String id, String kind, String label, String role, ClientCommand command, String playerId, FieldCoordinate square, boolean spent) {
            this.id = id; this.kind = kind; this.label = label; this.role = role; this.command = command;
            this.targetPlayerId = playerId; this.targetSquare = square; this.spent = spent;
        }
    }
}
