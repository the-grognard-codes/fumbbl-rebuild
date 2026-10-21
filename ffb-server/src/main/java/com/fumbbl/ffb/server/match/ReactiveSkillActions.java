package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.MoveSquare;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogDefenderActionParameter;
import com.fumbbl.ffb.dialog.DialogPassBlockParameter;
import com.fumbbl.ffb.dialog.DialogPickUpChoiceParameter;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.mechanics.JumpMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassRangeService;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandEndTurn;
import com.fumbbl.ffb.net.commands.ClientCommandFieldCoordinate;
import com.fumbbl.ffb.net.commands.ClientCommandMove;
import com.fumbbl.ffb.net.commands.ClientCommandPass;
import com.fumbbl.ffb.net.commands.ClientCommandPickUpChoice;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.step.bb2025.block.StepPushback;
import com.fumbbl.ffb.server.step.bb2025.block.StepTrickster;
import com.fumbbl.ffb.server.step.bb2025.shared.StepPlaceBall;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Browser projection of native reactions. No rolls or skill eligibility are invented here. */
final class ReactiveSkillActions {

    private final Set<String> skills = new HashSet<>(Arrays.asList("divingtackle", "tentacles", "shadowing",
        "armbar", "dodge", "standfirm", "sidestep", "wrestle", "fend", "taunt", "dumpoff", "trickster",
        "steadyfooting", "safepairofhands", "saboteur", "ontheball", "divingcatch", "catch", "dwarfengrit",
        "tackle", "stripball", "pass", "surehands", "surefeet", "grab"));

    boolean covered(String name) { return name != null && skills.contains(name.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z]", "")); }

    boolean covered(PlayerChoiceMode mode) {
        return mode == PlayerChoiceMode.DIVING_TACKLE || mode == PlayerChoiceMode.TENTACLES
            || mode == PlayerChoiceMode.SHADOWING || mode == PlayerChoiceMode.ARM_BAR
            || mode == PlayerChoiceMode.DIVING_CATCH || mode == PlayerChoiceMode.DECLARE_DIVING_CATCH || mode == PlayerChoiceMode.CATCH
            || mode == PlayerChoiceMode.PICK_ME_UP;
    }

    List<Action> actions(GameState state, Set<String> selected) {
        Game game = state.getGame();
        List<Action> result = new ArrayList<>();
        if (game.getDialogParameter() instanceof DialogPlayerChoiceParameter) {
            DialogPlayerChoiceParameter dialog = (DialogPlayerChoiceParameter) game.getDialogParameter();
            if (!covered(dialog.getPlayerChoiceMode())) return result;
            String role = game.getTeamHome().getId().equals(dialog.getTeamId()) ? "home" : "away";
            String[] ids = dialog.getPlayerIds(), descriptions = dialog.getDescriptions();
            for (int index = 0; index < ids.length; index++) {
                Player<?> player = game.getPlayerById(ids[index]);
                if (player == null) continue;
                String label = player.getName() + (dialog.getPlayerChoiceMode() != PlayerChoiceMode.DIVING_TACKLE && index < descriptions.length ? " " + descriptions[index] : "");
                if (dialog.getMaxSelects() > 1) {
                    if (selected.contains(ids[index]) || selected.size() < dialog.getMaxSelects())
                        result.add(new Action("event-pick:" + ids[index], "reactiveSkill", (selected.contains(ids[index]) ? "Deselect " : "Select ") + label, role, null, ids[index]));
                } else result.add(new Action("reaction-player:" + ids[index], "reactiveSkill", "Use " + dialog.getPlayerChoiceMode().getStatusTitle() + ": " + label,
                    role, new ClientCommandPlayerChoice(dialog.getPlayerChoiceMode(), new Player<?>[] {player}), ids[index]));
            }
            if (dialog.getMaxSelects() > 1 && selected.size() >= dialog.getMinSelects()) {
                ClientCommandPlayerChoice choice = new ClientCommandPlayerChoice(dialog.getPlayerChoiceMode(), null);
                selected.forEach(choice::addPlayerId);
                result.add(new Action("reaction-confirm", "reactiveSkill", "Confirm selected players", role, choice));
            }
            if (dialog.getMinSelects() == 0) result.add(new Action("reaction-decline", "reactiveSkill", "Decline", role,
                new ClientCommandPlayerChoice(dialog.getPlayerChoiceMode(), null)));
            return result;
        }
        if (game.getDialogParameter() instanceof DialogSkillUseParameter) {
            DialogSkillUseParameter dialog = (DialogSkillUseParameter) game.getDialogParameter();
            List<FieldCoordinate> squares = optionalSquares(state, dialog);
            if (squares.isEmpty()) return result; // Other native yes/no skills use the existing catalog.
            Player<?> player = game.getPlayerById(dialog.getPlayerId());
            String role = game.getTeamHome().hasPlayer(player) ? "home" : "away";
            for (FieldCoordinate square : squares) result.add(new Action("reaction-use:" + square.getX() + ":" + square.getY(), "reactiveSquare",
                "Use " + dialog.getSkill().getName() + " at " + square.getX() + ", " + square.getY(), role,
                new ClientCommandUseSkill(dialog.getSkill(), true, dialog.getPlayerId(), null, false), square));
            result.add(new Action("reaction-decline", "reactiveSkill", "Decline", role,
                new ClientCommandUseSkill(dialog.getSkill(), false, dialog.getPlayerId(), null, false)));
            return result;
        }
        String role = game.isHomePlaying() ? "home" : "away";
        if (game.getTurnMode() == TurnMode.PASS_BLOCK && (game.getDialogParameter() == null || game.getDialogParameter() instanceof DialogPassBlockParameter)) {
            Player<?> player = game.getActingPlayer().getPlayer();
            result.add(new Action("reaction-stop", "reactionEnd", "Finish On the Ball movement", role, new ClientCommandEndTurn(TurnMode.PASS_BLOCK, null)));
            if (player == null) {
                for (Player<?> candidate : game.getActingTeam().getPlayers()) {
                    if (game.getFieldModel().getPlayerState(candidate).isActive() && FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(candidate)))
                        result.add(new Action("reaction-select:" + candidate.getId(), "reactiveSkill", "Move " + candidate.getName(), role,
                            new ClientCommandActingPlayer(candidate.getId(), PlayerAction.MOVE, false), candidate.getId()));
                }
            } else {
                JumpMechanic jump = game.getMechanic(Mechanic.Type.JUMP);
                boolean jumping = game.getActingPlayer().isJumping();
                if (jumping || jump.isAvailableAsNextMove(game, game.getActingPlayer(), false))
                    result.add(new Action("reaction-jump-mode", "reactiveSkill", jumping ? "Walk normally" : "Jump over a prone or stunned player", role,
                        new ClientCommandActingPlayer(player.getId(), game.getActingPlayer().getPlayerAction(), !jumping)));
                for (MoveSquare square : game.getFieldModel().getMoveSquares()) {
                    FieldCoordinate to = square.getCoordinate(), from = game.getFieldModel().getPlayerCoordinate(player);
                    if (!FieldCoordinateBounds.FIELD.isInBounds(to) || game.getFieldModel().getPlayer(to) != null
                        || (jumping ? !jump.isValidJump(game, player, from, to) : !to.isAdjacent(from))) continue;
                    String label = (jumping ? "Jump to " : "Move to ") + to.getX() + ", " + to.getY();
                    if (square.getMinimumRollDodge() > 0) label += " (" + (jumping ? "jump " : "dodge ") + DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(square.getMinimumRollDodge()) + "+)";
                    if (square.getMinimumRollGoForIt() > 0) label += " (rush " + DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(square.getMinimumRollGoForIt()) + "+)";
                    result.add(new Action("reaction-move:" + to.getX() + ":" + to.getY(), "reactionMove", label, role,
                        new ClientCommandMove(player.getId(), orient(from, role), new FieldCoordinate[] {orient(to, role)}, null), to));
                }
                result.add(new Action("reaction-end-player", "reactiveSkill", "Finish this player's movement", role, new ClientCommandActingPlayer(null, null, false)));
            }
        } else if (game.getTurnMode() == TurnMode.DUMP_OFF && game.getDialogParameter() instanceof DialogDefenderActionParameter) {
            Player<?> thrower = game.getThrower();
            if (thrower == null) throw new IllegalStateException("Committed Dump-Off has no thrower");
            role = game.getTeamHome().hasPlayer(thrower) ? "home" : "away";
            for (FieldCoordinate to : passTargets(game, thrower)) result.add(new Action("reaction-square:dump:" + to.getX() + ":" + to.getY(), "reactiveSquare",
                "Dump-Off to " + to.getX() + ", " + to.getY(), role, new ClientCommandPass(thrower.getId(), orient(to, role)), to));
        } else if (game.getTurnMode() == TurnMode.TRICKSTER || game.getTurnMode() == TurnMode.SAFE_PAIR_OF_HANDS) {
            if (game.getDialogParameter() instanceof DialogPickUpChoiceParameter) {
                result.add(new Action("reaction-pickup:no", "reactiveSkill", "Decline pickup", role, new ClientCommandPickUpChoice(false)));
                result.add(new Action("reaction-pickup:yes", "reactiveSkill", "Attempt pickup", role, new ClientCommandPickUpChoice(true)));
            } else for (MoveSquare square : game.getFieldModel().getMoveSquares()) result.add(new Action("reaction-square:" + square.getCoordinate(), "reactiveSquare",
                "Select " + square.getCoordinate().getX() + ", " + square.getCoordinate().getY(), role,
                new ClientCommandFieldCoordinate(orient(square.getCoordinate(), role)), square.getCoordinate()));
        }
        return result;
    }

    private List<FieldCoordinate> optionalSquares(GameState state, DialogSkillUseParameter dialog) {
        String name = dialog.getSkill().getName().toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z]", "");
        if ("sidestep".equals(name) && state.getCurrentStep() instanceof StepPushback) {
            List<FieldCoordinate> squares = new ArrayList<>();
            Arrays.stream(((StepPushback) state.getCurrentStep()).sideStepChoices()).forEach(square -> squares.add(square.getCoordinate()));
            return squares;
        }
        if ("trickster".equals(name) && state.getCurrentStep() instanceof StepTrickster) return ((StepTrickster) state.getCurrentStep()).reactionChoices();
        if ("safepairofhands".equals(name) && state.getCurrentStep() instanceof StepPlaceBall) return ((StepPlaceBall) state.getCurrentStep()).reactionChoices();
        if ("dumpoff".equals(name)) {
            Game game = state.getGame();
            return passTargets(game, game.getPlayerById(dialog.getPlayerId()));
        }
        return Collections.emptyList();
    }

    private List<FieldCoordinate> passTargets(Game game, Player<?> player) {
        List<FieldCoordinate> squares = new ArrayList<>();
        PassRangeService range = new PassRangeService();
        for (int x = 0; x < 26; x++) for (int y = 0; y < 15; y++) {
            FieldCoordinate to = new FieldCoordinate(x, y);
            if (!to.equals(game.getFieldModel().getPlayerCoordinate(player)) && range.isInRange(game, player, to, PlayerAction.DUMP_OFF)) squares.add(to);
        }
        return squares;
    }

    ClientCommand continuation(GameState state, Action action) {
        if (!action.id.startsWith("reaction-use:")) return null;
        ClientCommandUseSkill use = (ClientCommandUseSkill) action.command;
        if (state.getGame().getTurnMode() == TurnMode.DUMP_OFF)
            return new ClientCommandPass(use.getPlayerId(), orient(action.targetSquare, action.role));
        for (Action offered : new CorePromptActions(state).actions())
            if (action.targetSquare.equals(offered.targetSquare) && action.role.equals(offered.role)) return offered.command;
        for (Action offered : actions(state, Collections.emptySet()))
            if (action.targetSquare.equals(offered.targetSquare) && action.role.equals(offered.role)) return offered.command;
        throw new IllegalStateException("Native reaction destination disappeared");
    }

    private FieldCoordinate orient(FieldCoordinate coordinate, String role) { return "home".equals(role) ? coordinate : coordinate.transform(); }
}
