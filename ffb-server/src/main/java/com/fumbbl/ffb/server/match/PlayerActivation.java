package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogConfirmEndActionParameter;
import com.fumbbl.ffb.dialog.DialogSelectBlitzTargetParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandConfirm;
import com.fumbbl.ffb.net.commands.ClientCommandTargetSelected;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.util.UtilServerDialog;

/** Commits browser declarations while leaving selection and route previews read-only. */
final class PlayerActivation {
    private final GameState state;

    PlayerActivation(GameState state) { this.state = state; }

    /** Returns false only when the new declaration must wait for the old activation's decision. */
    boolean handle(ClientCommand command, String role) {
        Game game = state.getGame();
        boolean home = "home".equals(role);
        if (!(command instanceof ClientCommandActingPlayer)) {
            state.handleCommand(new ReceivedCommand(command, home));
            return true;
        }
        ClientCommandActingPlayer declaration = (ClientCommandActingPlayer) command;
        Player<?> previous = game.getActingPlayer().getPlayer();
        String nextId = declaration.getPlayerId();
        if (previous != null && !previous.getId().equals(nextId)) {
            PlayerAction previousAction = game.getActingPlayer().getPlayerAction();
            TurnData turn = game.getTurnData();
            int turnNr = turn.getTurnNr();
            ClientCommand end = game.getTurnMode() == TurnMode.SELECT_BLITZ_TARGET
                ? new ClientCommandTargetSelected(previous.getId()) : new ClientCommandActingPlayer(null, null, false);
            state.handleCommand(new ReceivedCommand(end, home));
            if (game.getDialogParameter() instanceof DialogConfirmEndActionParameter)
                state.handleCommand(new ReceivedCommand(new ClientCommandConfirm(), home));
            if (game.getActingPlayer().getPlayer() == null
                && game.getDialogParameter() instanceof DialogSelectBlitzTargetParameter)
                UtilServerDialog.hideDialog(state);
            if (game.getTurnData() != turn || turn.getTurnNr() != turnNr) return true;
            // Native selection may undo an unperformed action. A browser declaration is already committed.
            consume(turn, previousAction);
            game.getFieldModel().setPlayerState(previous,
                game.getFieldModel().getPlayerState(previous).changeActive(false));
            // End-of-activation skill decisions must resolve before another player can start.
            if (nextId == null) return true;
            if (game.getActingPlayer().getPlayer() != null || game.getDialogParameter() != null) return false;
        }
        TurnData turn = game.getTurnData();
        int turnNr = turn.getTurnNr();
        state.handleCommand(new ReceivedCommand(command, home));
        if (nextId != null && game.getTurnData() == turn && turn.getTurnNr() == turnNr)
            consume(turn, declaration.getPlayerAction());
        return true;
    }

    private void consume(TurnData turn, PlayerAction action) {
        action = limitedAction(action);
        if (action == null) return;
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
        if (action.isBlitzing()) return PlayerAction.BLITZ_MOVE;
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
