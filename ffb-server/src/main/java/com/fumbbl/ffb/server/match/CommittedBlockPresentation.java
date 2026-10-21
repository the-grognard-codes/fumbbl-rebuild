package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.dialog.DialogOpponentBlockSelectionPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogReRollBlockForTargetsPropertiesParameter;
import com.fumbbl.ffb.model.BlockRollProperties;
import com.fumbbl.ffb.model.BlockTarget;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandBlock;
import com.fumbbl.ffb.net.commands.ClientCommandBlockOrReRollChoiceForTarget;
import com.fumbbl.ffb.net.commands.ClientCommandSynchronousMultiBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseBrawler;
import com.fumbbl.ffb.net.commands.ClientCommandUseHatred;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.ReportBlock;
import com.fumbbl.ffb.report.ReportBlockChoice;
import com.fumbbl.ffb.report.ReportBlockRoll;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.bb2025.mutliblock.StepBlockRollMultiple;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Browser-only sidecar: records native block facts without changing model or step flow. */
final class CommittedBlockPresentation {
    private final Map<String, JsonObject> blocks = new LinkedHashMap<>();
    private final Set<String> rolled = new LinkedHashSet<>();
    private final Map<Integer, JsonValue> syncs = new LinkedHashMap<>();
    private String active;
    private boolean planned;

    void prepare(GameState state, ClientCommand command) {
        if (command instanceof ClientCommandBlock) {
            ClientCommandBlock block = (ClientCommandBlock) command;
            clear();
            if (!block.isUsingStab() && !block.isUsingChainsaw() && !block.isUsingVomit()
                && !block.isUsingBreatheFire() && !block.isUsingChomp())
                add(state.getGame(), block.getActingPlayerId(), block.getDefenderId(), false);
        } else if (command instanceof ClientCommandSynchronousMultiBlock) {
            clear();
            for (BlockTarget target : ((ClientCommandSynchronousMultiBlock) command).getSelectedTargets())
                add(state.getGame(), state.getGame().getActingPlayer().getPlayerId(), target.getPlayerId(), true);
        } else if (command instanceof ClientCommandBlockOrReRollChoiceForTarget) {
            String target = ((ClientCommandBlockOrReRollChoiceForTarget) command).getTargetId();
            if (blocks.containsKey(target)) active = target;
        } else if (command instanceof ClientCommandUseBrawler || command instanceof ClientCommandUseHatred) {
            String target = command instanceof ClientCommandUseBrawler ? ((ClientCommandUseBrawler) command).getTargetId()
                : ((ClientCommandUseHatred) command).getTargetId();
            if (blocks.containsKey(target)) active = target;
        }
    }

    void plan(JsonObject highlight) {
        clear();
        active = highlight.getString("targetPlayerId", null);
        blocks.put(active, JsonObject.readFrom(highlight.toString()));
        planned = true;
    }

    void observe(GameState state, ServerCommandModelSync sync) {
        Game game = state.getGame();
        PlayerAction action = game.getActingPlayer().getPlayerAction();
        boolean multiple = action == PlayerAction.MULTIPLE_BLOCK;
        if (planned && game.getFinished() == null && !blocks.isEmpty()
            && !blocks.values().iterator().next().getString("playerId", "").equals(game.getActingPlayer().getPlayerId())) {
            // Switching players finishes the previous activation before starting the queued blitz.
            // Its syncs must not discard the accepted future blocking square.
            syncs.put(sync.getCommandNr(), json());
            return;
        }
        if (game.getFinished() != null || game.getActingPlayer().getPlayer() == null
            || !(action == PlayerAction.BLOCK || multiple || action != null && action.isBlitzing())) clear();
        else {
            // Initial Multiple Block rolls synchronize separately without roll reports.
            // Freeze each target as its native roll becomes available, before resolution can move players.
            if (multiple && state.getCurrentStep() instanceof StepBlockRollMultiple)
                for (String target : ((StepBlockRollMultiple) state.getCurrentStep()).getRolledTargetIds())
                    if (blocks.containsKey(target) && !rolled.contains(target)) {
                        add(game, game.getActingPlayer().getPlayerId(), target, true);
                        rolled.add(target);
                    }
            if (multiple) {
                List<BlockRollProperties> choices = game.getDialogParameter() instanceof DialogOpponentBlockSelectionPropertiesParameter
                    ? ((DialogOpponentBlockSelectionPropertiesParameter) game.getDialogParameter()).getBlockRolls()
                    : game.getDialogParameter() instanceof DialogReRollBlockForTargetsPropertiesParameter
                        ? ((DialogReRollBlockForTargetsPropertiesParameter) game.getDialogParameter()).getBlockRolls() : Collections.emptyList();
                String only = null; int count = 0;
                for (BlockRollProperties choice : choices) if (choice.needsSelection()) { only = choice.getTargetId(); count++; }
                if (count == 1 && blocks.containsKey(only)) active = only;
            }
            for (IReport report : sync.getReportList() == null ? new IReport[0] : sync.getReportList().getReports()) {
                if (report instanceof ReportBlockChoice) {
                    String target = ((ReportBlockChoice) report).getDefenderId();
                    if (blocks.containsKey(target)) active = target;
                    continue;
                }
                String target = report instanceof ReportBlock ? ((ReportBlock) report).getDefenderId()
                    : report instanceof ReportBlockRoll ? ((ReportBlockRoll) report).getDefenderId() : null;
                if (report instanceof ReportBlockRoll && target == null) target = game.getDefenderId();
                if (target == null) continue;
                if (!rolled.contains(target) && (!multiple || blocks.containsKey(target)))
                    add(game, game.getActingPlayer().getPlayerId(), target, multiple);
                planned = false;
                if (!multiple || active == null) active = target;
                if (report instanceof ReportBlockRoll) rolled.add(target);
            }
            for (String targetId : new ArrayList<>(blocks.keySet())) {
                JsonObject block = blocks.get(targetId);
                Player<?> attacker = game.getPlayerById(block.getString("playerId", null));
                Player<?> target = game.getPlayerById(targetId);
                FieldCoordinate at = target == null ? null : game.getFieldModel().getPlayerCoordinate(target);
                if (attacker == null || !attacker.getId().equals(game.getActingPlayer().getPlayerId())
                    || rolled.contains(targetId) && !same(at, block.get("to").asObject())) remove(targetId);
                else if (!planned && !rolled.contains(targetId)) add(game, attacker.getId(), targetId, multiple);
            }
            if (state.getCurrentStep() != null && state.getCurrentStep().getId() == StepId.END_BLOCKING
                && state.getCurrentStep().getResult().getNextAction().triggerNextStep()) remove(active);
        }
        syncs.put(sync.getCommandNr(), json());
    }

    void finishCommand(GameState state, boolean pendingRoute) {
        if (planned && !pendingRoute && state.getGame().getDefenderId() == null) clear();
    }

    JsonValue json() {
        if (blocks.isEmpty()) return JsonValue.NULL;
        if (active == null || !blocks.containsKey(active)) active = blocks.keySet().iterator().next();
        JsonArray values = new JsonArray();
        blocks.values().forEach(block -> values.add(JsonObject.readFrom(block.toString())));
        return new JsonObject().add("version", 1).add("activeTargetPlayerId", active).add("blocks", values);
    }

    JsonObject checkpoint() {
        JsonArray frozen = new JsonArray(); rolled.forEach(frozen::add);
        return new JsonObject().add("context", json()).add("rolled", frozen).add("planned", planned);
    }

    void restore(JsonObject saved, Game game) {
        if (saved.size() != 3 || saved.get("context") == null || saved.get("rolled") == null || saved.get("planned") == null)
            throw new IllegalArgumentException("Invalid committed block checkpoint");
        clear();
        if (!saved.get("context").isNull()) {
            JsonObject context = saved.get("context").asObject();
            JsonArray players = new JsonArray();
            for (Player<?> player : game.getPlayers()) players.add(new JsonObject().add("id", player.getId())
                .add("role", player.getTeam() == game.getTeamHome() ? "home" : "away"));
            new BlockHighlightJson().context(context, players);
            active = context.getString("activeTargetPlayerId", null);
            for (JsonValue value : context.get("blocks").asArray()) {
                JsonObject block = new BlockHighlightJson().normalized(value.asObject());
                blocks.put(block.getString("targetPlayerId", null), block);
            }
        }
        for (JsonValue id : saved.get("rolled").asArray()) {
            if (!blocks.containsKey(id.asString()) || !rolled.add(id.asString())) throw new IllegalArgumentException("Invalid frozen block target");
        }
        planned = saved.get("planned").asBoolean();
        if (planned && (blocks.size() != 1 || !rolled.isEmpty())) throw new IllegalArgumentException("Invalid planned block");
    }

    void decorate(JsonObject sync) {
        JsonValue context = syncs.get(sync.getInt("commandNr", -1));
        if (context != null) sync.add("blockContext", context);
    }

    void recorded() { syncs.clear(); }

    private void add(Game game, String attacker, String target, boolean multiple) {
        JsonObject block = new BlockHighlightProjection().project(game, attacker, target, multiple);
        if (block != null) { blocks.put(target, block); if (active == null) active = target; }
        else remove(target);
    }

    private void remove(String target) {
        if (target == null) return;
        blocks.remove(target); rolled.remove(target);
        if (target.equals(active)) active = null;
    }

    private void clear() { blocks.clear(); rolled.clear(); active = null; planned = false; }
    private boolean same(FieldCoordinate at, JsonObject square) {
        return at != null && at.getX() == square.getInt("x", -1) && at.getY() == square.getInt("y", -1);
    }
}
