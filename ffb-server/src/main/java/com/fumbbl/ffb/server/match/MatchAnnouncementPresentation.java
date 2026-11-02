package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandEndTurn;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.util.UtilServerGame;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Resident presentation sidecar. Only native committed boundaries produce events. */
final class MatchAnnouncementPresentation {
    private final Map<Integer, JsonArray> syncs = new LinkedHashMap<>();
    private JsonArray pending = new JsonArray();
    private boolean voluntary;
    private boolean confirmed;
    private String reason;
    private String lastTurn;

    void prepare(Game game, ClientCommand command) {
        if (command instanceof ClientCommandEndTurn && game.getTurnMode() == TurnMode.REGULAR)
            voluntary = true;
    }

    void cause(Game game, StepId source, boolean endTurn) {
        if (!endTurn) { confirmed = false; reason = null; return; }
        if (game.getTurnMode() != TurnMode.REGULAR) return;
        confirmed = true;
        if (reason != null) return;
        Player<?> player = game.getActingPlayer().getPlayer();
        String name = player == null ? "The active player" : player.getName();
        switch (source) {
            case MOVE_DODGE: reason = name + " failed to dodge."; break;
            case GO_FOR_IT: reason = name + " fell while rushing."; break;
            case JUMP: reason = name + " failed to jump."; break;
            default: break;
        }
    }

    void reason(Game game, String confirmedReason) {
        if (game.getTurnMode() == TurnMode.REGULAR && reason == null) reason = confirmedReason;
    }

    void end(Game game, Player<?> scorer, boolean halfEnded) {
        // Kickoff bonus actions and setup are not normal numbered team turns.
        if (scorer != null) {
            boolean home = game.getTeamHome().hasPlayer(scorer);
            pending.add(event("touchdown", game, home, null));
        } else if (game.getTurnMode() == TurnMode.REGULAR && confirmed && !voluntary && !game.isTimeoutEnforced()) {
            pending.add(event("turnover", game, game.isHomePlaying(),
                reason == null ? "A rules-triggered turnover ended the turn." : reason));
        }
        voluntary = false;
        confirmed = false;
        reason = null;
    }

    void playable(Game game) {
        if (game.getTurnMode() != TurnMode.REGULAR || game.getFinished() != null) return;
        String identity = game.getHalf() + ":" + game.isHomePlaying() + ":" + game.getTurnData().getTurnNr();
        if (identity.equals(lastTurn)) return;
        lastTurn = identity;
        pending.add(event("turnStart", game, game.isHomePlaying(), null));
    }

    void flush(GameState state) {
        if (pending.size() == 0) return;
        // Freeze the causative resolution before StepEndTurn can move anyone into setup
        // or switch teams. A silent INIT_SELECTING still gets a durable numbered boundary.
        if (!UtilServerGame.syncGameModel(state.getCurrentStep())) {
            Game game = state.getGame();
            state.getServer().getCommunication().sendModelSync(state, new ModelChangeList(), new ReportList(),
                null, null, game.getGameTime(), game.getTurnTime());
        }
    }

    void observe(ServerCommandModelSync sync) {
        if (pending.size() == 0) return;
        syncs.put(sync.getCommandNr(), pending);
        pending = new JsonArray();
    }

    void decorate(List<JsonObject> outcomes) {
        // A test or non-recording communication implementation can omit silent syncs.
        // Retain their final boundary on the last available resolution sync.
        if (pending.size() > 0 && !outcomes.isEmpty()) {
            int number = outcomes.get(outcomes.size() - 1).getInt("commandNr", -1);
            JsonArray events = syncs.computeIfAbsent(number, ignored -> new JsonArray());
            for (JsonValue value : pending) events.add(value);
            pending = new JsonArray();
        }
        for (JsonObject sync : outcomes) {
            JsonArray events = syncs.get(sync.getInt("commandNr", -1));
            if (events != null) sync.add("matchAnnouncements", new JsonObject().add("version", 1).add("events", events));
        }
        syncs.clear();
    }

    void recorded() { syncs.clear(); pending = new JsonArray(); }

    JsonObject checkpoint() {
        return new JsonObject().add("voluntary", voluntary).add("confirmed", confirmed).add("reason", nullable(reason))
            .add("lastTurn", nullable(lastTurn)).add("pending", pending);
    }

    void restore(JsonObject saved) {
        if (saved.size() != 5) throw new IllegalArgumentException("Invalid match announcement checkpoint");
        voluntary = saved.get("voluntary").asBoolean();
        confirmed = saved.get("confirmed").asBoolean();
        reason = saved.get("reason").isNull() ? null : saved.get("reason").asString();
        lastTurn = saved.get("lastTurn").isNull() ? null : saved.get("lastTurn").asString();
        pending = JsonArray.readFrom(saved.get("pending").toString());
    }

    private JsonObject event(String kind, Game game, boolean home, String cause) {
        return new JsonObject().add("kind", kind).add("team", home ? "home" : "away")
            .add("turn", (home ? game.getTurnDataHome() : game.getTurnDataAway()).getTurnNr())
            .add("half", game.getHalf()).add("reason", nullable(cause));
    }

    private JsonValue nullable(String value) { return value == null ? JsonValue.NULL : JsonValue.valueOf(value); }
}
