package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogConfirmEndActionParameter;
import com.fumbbl.ffb.dialog.DialogSelectBlitzTargetParameter;
import com.fumbbl.ffb.mechanics.PassRangeService;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandConfirm;
import com.fumbbl.ffb.net.commands.ClientCommandPass;
import com.fumbbl.ffb.net.commands.ClientCommandTargetSelected;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.util.UtilServerDialog;
import com.fumbbl.ffb.server.util.UtilServerGame;

/** Commits browser declarations while leaving selection and route previews read-only. */
final class PlayerActivation {
    private final GameState state;

    PlayerActivation(GameState state) { this.state = state; }

    /** Returns false only when the new declaration must wait for the old activation's decision. */
    boolean handle(ClientCommand command, String role) {
        Game game = state.getGame();
        boolean home = "home".equals(role);
        if (!(command instanceof ClientCommandActingPlayer)) {
            if (command instanceof ClientCommandPass && game.getActingPlayer().isHailMaryPassMode()
                && !game.getActingPlayer().hasPassed()
                && game.getActingPlayer().getPlayerId().equals(((ClientCommandPass) command).getActingPlayerId())) {
                FieldCoordinate target = ((ClientCommandPass) command).getTargetCoordinate();
                if (!home && target != null) target = target.transform();
                if (!new PassRangeService().isInRange(game, game.getActingPlayer().getPlayer(), target, PlayerAction.HAIL_MARY_PASS)) return true;
                game.getActingPlayer().setPlayerAction(PlayerAction.HAIL_MARY_PASS);
            }
            state.handleCommand(new ReceivedCommand(command, home));
            return true;
        }
        ClientCommandActingPlayer declaration = (ClientCommandActingPlayer) command;
        Player<?> previous = game.getActingPlayer().getPlayer();
        String nextId = declaration.getPlayerId();
        PlayerAction requested = declaration.getPlayerAction();
        ActingPlayer acting = game.getActingPlayer();
        if (previous != null && previous.getId().equals(nextId) && requested == acting.getPlayerAction()
            && declaration.isJumping() != acting.isJumping()) {
            state.handleCommand(new ReceivedCommand(command, home));
            return true;
        }
        if (previous != null && previous.getId().equals(nextId)
            && (!acting.hasPassed() || limitedAction(requested) == PlayerAction.THROW_BOMB && game.getPassCoordinate() == null)
            && limitedAction(acting.getPlayerAction()) == limitedAction(requested)
            && (requested == PlayerAction.PASS_MOVE || requested == PlayerAction.HAIL_MARY_PASS
                || requested == PlayerAction.THROW_BOMB || requested == PlayerAction.HAIL_MARY_BOMB)) {
            if (limitedAction(requested) == PlayerAction.PASS) {
                acting.setHailMaryPassMode(requested == PlayerAction.HAIL_MARY_PASS);
                acting.setPlayerAction(PlayerAction.PASS_MOVE);
            } else acting.setPlayerAction(requested);
            UtilServerGame.syncGameModel(state, null, null, null);
            return true;
        }
        if (previous != null && !previous.getId().equals(nextId)) {
            PlayerAction previousAction = game.getActingPlayer().getPlayerAction();
            TurnData turn = game.getTurnData();
            int turnNr = turn.getTurnNr();
            long actionWindow = turn.getActionWindow();
            ClientCommand end = game.getTurnMode() == TurnMode.SELECT_BLITZ_TARGET
                ? new ClientCommandTargetSelected(previous.getId()) : new ClientCommandActingPlayer(null, null, false);
            state.handleCommand(new ReceivedCommand(end, home));
            if (game.getDialogParameter() instanceof DialogConfirmEndActionParameter)
                state.handleCommand(new ReceivedCommand(new ClientCommandConfirm(), home));
            if (game.getActingPlayer().getPlayer() == null
                && game.getDialogParameter() instanceof DialogSelectBlitzTargetParameter)
                UtilServerDialog.hideDialog(state);
            if (game.getTurnData() != turn || turn.getTurnNr() != turnNr || turn.getActionWindow() != actionWindow) return true;
            // Native selection may undo an unperformed action. A browser declaration is already committed.
            consume(turn, previous.getId(), previousAction);
            game.getFieldModel().setPlayerState(previous,
                game.getFieldModel().getPlayerState(previous).changeActive(false));
            // End-of-activation skill decisions must resolve before another player can start.
            if (nextId == null) return true;
            if (game.getActingPlayer().getPlayer() != null || game.getDialogParameter() != null) return false;
        }
        TurnData turn = game.getTurnData();
        int turnNr = turn.getTurnNr();
        long actionWindow = turn.getActionWindow();
        ClientCommand nativeCommand = requested == PlayerAction.HAIL_MARY_PASS
            ? new ClientCommandActingPlayer(nextId, PlayerAction.PASS_MOVE, declaration.isJumping())
            : requested == PlayerAction.HAIL_MARY_BOMB
                ? new ClientCommandActingPlayer(nextId, PlayerAction.THROW_BOMB, declaration.isJumping()) : command;
        state.handleCommand(new ReceivedCommand(nativeCommand, home));
        if (nextId != null && nextId.equals(acting.getPlayerId()) && !acting.hasPassed()) {
            acting.setHailMaryPassMode(requested == PlayerAction.HAIL_MARY_PASS);
            if (requested == PlayerAction.HAIL_MARY_BOMB) acting.setPlayerAction(requested);
            UtilServerGame.syncGameModel(state, null, null, null);
        }
        if (nextId != null && game.getTurnData() == turn && turn.getTurnNr() == turnNr && turn.getActionWindow() == actionWindow)
            consume(turn, nextId, declaration.getPlayerAction());
        return true;
    }

    private void consume(TurnData turn, String playerId, PlayerAction action) {
        action = limitedAction(action);
        if (action == null) return;
        turn.recordLimitedAction(playerId, action);
        if (action.isBlitzing()) turn.setBlitzUsed(true);
        switch (action) {
            case PASS:
            case PASS_MOVE:
            case HAIL_MARY_PASS:
                turn.setPassUsed(true); break;
            case HAND_OVER:
            case HAND_OVER_MOVE:
                turn.setHandOverUsed(true); break;
            case FOUL:
            case FOUL_MOVE:
                turn.setFoulUsed(true); break;
            case THROW_TEAM_MATE:
            case THROW_TEAM_MATE_MOVE:
                turn.setTtmUsed(true); break;
            case KICK_TEAM_MATE:
            case KICK_TEAM_MATE_MOVE:
                turn.setKtmUsed(true); break;
            case PUNT:
            case PUNT_MOVE:
                turn.setPuntUsed(true); break;
            case SECURE_THE_BALL:
                turn.setSecureTheBallUsed(true); break;
            case THROW_BOMB:
            case HAIL_MARY_BOMB:
                turn.setBombUsed(true); break;
            default:
                break;
        }
    }

    boolean reserves(PlayerAction action) {
        PlayerAction reserved = limitedAction(state.getGame().getActingPlayer().getPlayerAction());
        return reserved != null && reserved == limitedAction(action);
    }

    private PlayerAction limitedAction(PlayerAction action) {
        if (action == null) return null;
        if (action.isBlitzing() || action == PlayerAction.STAND_UP_BLITZ) return PlayerAction.BLITZ_MOVE;
        if (action.getDelegate() != null) action = action.getDelegate();
        switch (action) {
            case PASS: case PASS_MOVE: case HAIL_MARY_PASS: return PlayerAction.PASS;
            case HAND_OVER: case HAND_OVER_MOVE: return PlayerAction.HAND_OVER;
            case FOUL: case FOUL_MOVE: return PlayerAction.FOUL;
            case THROW_TEAM_MATE: case THROW_TEAM_MATE_MOVE: return PlayerAction.THROW_TEAM_MATE;
            case KICK_TEAM_MATE: case KICK_TEAM_MATE_MOVE: return PlayerAction.KICK_TEAM_MATE;
            case PUNT: case PUNT_MOVE: return PlayerAction.PUNT;
            case THROW_BOMB: case HAIL_MARY_BOMB: return PlayerAction.THROW_BOMB;
            case SECURE_THE_BALL: return action;
            default: return null;
        }
    }
}
