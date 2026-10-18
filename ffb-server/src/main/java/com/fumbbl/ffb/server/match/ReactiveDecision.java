package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.IDialogParameter;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommandPushback;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.step.bb2025.block.StepPushback;
import com.fumbbl.ffb.server.step.bb2025.shared.StepPlaceBall;
import com.fumbbl.ffb.server.util.UtilServerTimer;

import com.eclipsesource.json.JsonObject;

import java.util.List;

/** One authoritative optional activation. Automatic native resolutions never create this state. */
final class ReactiveDecision {
    static final long ALLOWANCE_MS = 30_000L;
    private String id, key, actor, title, detail;
    private long expiresAt;
    private boolean paused, normalHome;
    private Object step;
    private JsonObject interruptedMovement;
    private long movementRemainingMs;

    void refresh(GameState state, List<Action> actions, int revision, long now) {
        Game game = state.getGame();
        ReactiveSkillActions catalog = new ReactiveSkillActions();
        IDialogParameter dialog = game.getDialogParameter();
        String nextKey = null, nextTitle = null, nextDetail = "";
        Player<?> player = null;
        if (dialog instanceof DialogSkillUseParameter) {
            DialogSkillUseParameter choice = (DialogSkillUseParameter) dialog;
            if (catalog.covered(choice.getSkill().getName()) || game.getTurnMode() == TurnMode.PASS_BLOCK) {
                nextKey = choice.getSkill().getName() + ":" + choice.getPlayerId();
                nextTitle = "Use " + choice.getSkill().getName() + "?" + target(choice.getMinimumRoll());
                player = game.getPlayerById(choice.getPlayerId());
            }
        } else if (dialog instanceof DialogPlayerChoiceParameter) {
            DialogPlayerChoiceParameter choice = (DialogPlayerChoiceParameter) dialog;
            if (catalog.covered(choice.getPlayerChoiceMode())) {
                nextKey = choice.getPlayerChoiceMode().name() + ":" + choice.getTeamId();
                nextTitle = choice.getPlayerChoiceMode().getDialogHeader(choice.getMaxSelects());
                if (choice.getPlayerChoiceMode() == com.fumbbl.ffb.PlayerChoiceMode.SHADOWING && choice.getDescriptions().length > 0)
                    nextTitle += " " + choice.getDescriptions()[0];
                nextDetail = String.join(" ", new java.util.LinkedHashSet<>(java.util.Arrays.asList(choice.getDescriptions())));
            }
        } else if (dialog instanceof DialogReRollPropertiesParameter) {
            DialogReRollPropertiesParameter choice = (DialogReRollPropertiesParameter) dialog;
            if (game.getTurnMode() == TurnMode.PASS_BLOCK || choice.getReRollSkill() != null && catalog.covered(choice.getReRollSkill().getName())
                || catalog.covered(choice.getReRolledAction().getName(game.getRules().getSkillFactory()))) {
                nextKey = choice.getReRolledAction().getName(game.getRules().getSkillFactory()) + ":" + choice.getPlayerId();
                nextTitle = "Re-roll " + choice.getReRolledAction().getName(game.getRules().getSkillFactory()) + "?" + target(choice.getMinimumRoll());
                player = game.getPlayerById(choice.getPlayerId());
                nextDetail = String.join(" ", choice.getMessages());
            }
        }
        if (dialog == null && state.getCurrentStep() instanceof StepPushback) {
            for (Action action : actions) {
                if (!action.id.startsWith("push:")) continue;
                String pushedPlayerId = ((ClientCommandPushback) action.command).getPushback().getPlayerId();
                if (((StepPushback) state.getCurrentStep()).hasSelectedSideStep(pushedPlayerId)) {
                    nextKey = "Sidestep:" + pushedPlayerId;
                    nextTitle = "Choose a Sidestep destination";
                    player = game.getPlayerById(pushedPlayerId);
                    nextDetail = "Skill use is already committed; choose a highlighted square.";
                    break;
                }
            }
        }
        // These modes cover movement and optional follow-on decisions after native use is committed.
        boolean onTheBall = game.getTurnMode() == TurnMode.PASS_BLOCK;
        boolean dumpOff = game.getTurnMode() == TurnMode.DUMP_OFF;
        boolean trickster = game.getTurnMode() == TurnMode.TRICKSTER;
        boolean placing = game.getTurnMode() == TurnMode.SAFE_PAIR_OF_HANDS;
        boolean sequence = onTheBall || dumpOff || trickster || placing;
        if (sequence && nextKey == null && !actions.isEmpty()) {
            nextKey = game.getTurnMode().name();
            nextTitle = onTheBall ? "On the Ball" : dumpOff ? "Dump-Off" : trickster ? "Trickster" : "Safe Pair of Hands";
        }
        if (nextKey == null || actions.isEmpty() || game.getFinished() != null) { clear(state, now); return; }
        String nextActor = actions.get(0).role;
        if (onTheBall && interruptedMovement != null && nextActor.equals(interruptedMovement.getString("actor", null))) {
            JsonObject movement = interruptedMovement;
            long remaining = movementRemainingMs;
            interruptedMovement = null;
            restore(movement);
            expiresAt = now + remaining;
            step = null;
        } else if (onTheBall && key != null && !actor.equals(nextActor) && interruptedMovement == null) {
            interruptedMovement = checkpoint();
            movementRemainingMs = Math.max(0L, expiresAt - now);
            key = null;
            step = null;
        }
        String teamId = "home".equals(nextActor) ? game.getTeamHome().getId() : game.getTeamAway().getId();
        boolean selectedPlayer = key != null && key.endsWith(":" + teamId) && stem(key).equals(stem(nextKey));
        boolean sameChoice = key != null && (normalize(key).equals(normalize(nextKey)) || selectedPlayer);
        boolean keep = key != null && actor.equals(nextActor) && (sequence && interruptedMovement == null
            || sameChoice && (step == null || step == state.getCurrentStep()));
        if (!keep) {
            JsonObject movement = interruptedMovement;
            long remaining = movementRemainingMs;
            clear(state, now);
            interruptedMovement = movement;
            movementRemainingMs = remaining;
            id = "reaction-" + revision;
            expiresAt = now + ALLOWANCE_MS;
            normalHome = game.isHomePlaying();
            if (onTheBall || trickster) normalHome = !normalHome;
            if (state.getCurrentStep() instanceof StepPlaceBall && !((StepPlaceBall) state.getCurrentStep()).isBallCarrierTeamTurn()) normalHome = !normalHome;
        }
        key = nextKey;
        actor = nextActor;
        title = nextTitle;
        detail = (player == null ? "" : player.getName() + ". ") + nextDetail;
        step = state.getCurrentStep();
        boolean opponent = !actor.equals(normalHome ? "home" : "away") || dumpOff || trickster;
        if (opponent) { UtilServerTimer.stopTurnTimer(state, now); paused = true; }
        else {
            UtilServerTimer.startTurnTimer(state, now);
            if (state.getTurnTimeStarted() == 0) state.setTurnTimeStarted(now - game.getTurnTime());
            paused = false;
        }
    }

    boolean due(long now) { return key != null && now >= expiresAt; }
    boolean pending() { return key != null; }
    String actor() { return actor; }
    String id() { return id; }
    boolean normalHome() { return normalHome; }

    Action decline(GameState state, List<Action> actions) {
        for (String candidate : new String[] {"reaction-decline", "skill:false", "reroll:none", "reaction-pickup:no", "reaction-stop"})
            for (Action action : actions) if (candidate.equals(action.id)) return action;
        // Mandatory selection from an older checkpoint is already committed; never choose an optional use as a fallback.
        IDialogParameter dialog = state.getGame().getDialogParameter();
        boolean mandatoryCatcher = dialog instanceof DialogPlayerChoiceParameter && ((DialogPlayerChoiceParameter) dialog).getMinSelects() > 0;
        for (Action action : actions) {
            if (mandatoryCatcher && action.id.startsWith("reaction-player:")
                || action.id.startsWith("reaction-square:") || "confirm-end".equals(action.id)) return action;
            if (state.getCurrentStep() instanceof StepPushback && action.id.startsWith("push:")
                && ((StepPushback) state.getCurrentStep()).hasSelectedSideStep(((ClientCommandPushback) action.command).getPushback().getPlayerId())) return action;
        }
        throw new IllegalStateException("Reactive choice has no legal timeout continuation");
    }

    JsonObject publicJson(long now) {
        if (!pending()) return null;
        JsonObject result = new JsonObject().add("id", id).add("actor", actor).add("title", title)
            .add("expiresAt", expiresAt).add("serverNow", now);
        if (detail != null && !detail.isEmpty()) result.add("detail", detail);
        return result;
    }

    JsonObject checkpoint() {
        if (!pending()) return null;
        JsonObject saved = publicJson(0).add("key", key).add("paused", paused).add("normalHome", normalHome);
        if (interruptedMovement != null) saved.add("interruptedMovement", interruptedMovement).add("movementRemainingMs", movementRemainingMs);
        return saved;
    }

    void restore(JsonObject saved) {
        id = saved.get("id").asString(); key = saved.get("key").asString(); actor = saved.get("actor").asString();
        title = saved.get("title").asString(); detail = saved.getString("detail", ""); expiresAt = saved.get("expiresAt").asLong();
        paused = saved.get("paused").asBoolean(); normalHome = saved.get("normalHome").asBoolean();
        interruptedMovement = saved.get("interruptedMovement") == null ? null : saved.get("interruptedMovement").asObject();
        movementRemainingMs = saved.getLong("movementRemainingMs", 0L);
        if (movementRemainingMs < 0 || movementRemainingMs > ALLOWANCE_MS) throw new IllegalArgumentException("Invalid interrupted movement deadline");
        if (expiresAt < 0 || !id.matches("reaction-[0-9]+") || !("home".equals(actor) || "away".equals(actor)))
            throw new IllegalArgumentException("Invalid reactive checkpoint");
    }

    private void clear(GameState state, long now) {
        if (paused) UtilServerTimer.startTurnTimer(state, now);
        key = null; step = null; paused = false;
        interruptedMovement = null;
    }

    private String target(int minimumRoll) { return minimumRoll > 0 ? " (" + DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(minimumRoll) + "+)" : ""; }
    private String normalize(String value) { return value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9:]", ""); }
    private String stem(String value) { return normalize(value.split(":", 2)[0]); }
}
