package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.kickoff.KickoffResult;
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
    private String lastWeather;
    private JsonObject pendingKickoff;
    private JsonObject deferredWeather;

    void kickoff(Game game, KickoffResult result) {
        boolean receiving = result == com.fumbbl.ffb.kickoff.bb2025.KickoffResult.QUICK_SNAP
            || result == com.fumbbl.ffb.kickoff.bb2025.KickoffResult.HIGH_KICK;
        pendingKickoff = event("kickoff", game, receiving != game.isHomePlaying(), result.getDescription())
            .add("headline", result.getName()).add("code", ((Enum<?>) result).name());
    }

    void weather(Game game) {
        Weather weather = game.getFieldModel().getWeather();
        if (weather == null || weather == Weather.INTRO || weather.name().equals(lastWeather)) return;
        lastWeather = weather.name();
        String reminder = switch (weather) {
            case SWELTERING_HEAT -> "D3 players from each team miss the next drive after this drive ends.";
            case VERY_SUNNY -> "−1 to Passing Ability tests.";
            case POURING_RAIN -> "−1 to pick up, catch and intercept.";
            case BLIZZARD -> "−1 to rush; only Quick and Short Passes.";
            default -> "No additional weather effects.";
        };
        JsonObject announcement = event("weather", game, game.isHomePlaying(), reminder)
            .add("headline", weather.getName()).add("code", weather.name());
        if (pendingKickoff == null) pending.add(announcement);
        else deferredWeather = announcement;
    }

    void finished(Game game) {
        boolean homeConceded = game.getGameResult().getTeamResultHome().hasConceded();
        boolean awayConceded = game.getGameResult().getTeamResultAway().hasConceded();
        int home = game.getGameResult().getTeamResultHome().getScore();
        int away = game.getGameResult().getTeamResultAway().getScore();
        boolean homeWins = awayConceded || !homeConceded && home > away;
        String winner = !homeConceded && !awayConceded && home == away ? "DRAW"
            : (homeWins ? game.getTeamHome() : game.getTeamAway()).getName() + " wins";
        pending.add(event("fullTime", game, homeWins, score(game) + " — " + winner)
            .add("headline", homeConceded || awayConceded ? "MATCH CONCEDED" : "FULL TIME")
            .add("code", homeConceded || awayConceded ? "CONCEDED" : home == away ? "DRAW" : "WIN"));
    }

    private String score(Game game) {
        return game.getTeamHome().getName() + " " + game.getGameResult().getTeamResultHome().getScore()
            + " – " + game.getGameResult().getTeamResultAway().getScore() + " " + game.getTeamAway().getName();
    }

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
            pending.add(event("touchdown", game, home, scorer.getName() + " #" + scorer.getNr() + " — " + score(game)));
        } else if (game.getTurnMode() == TurnMode.REGULAR && confirmed && !voluntary && !game.isTimeoutEnforced()) {
            pending.add(event("turnover", game, game.isHomePlaying(),
                reason == null ? "A rules-triggered turnover ended the turn." : reason));
        }
        if (halfEnded && game.getHalf() == 1) pending.add(event("halfTime", game, game.isHomePlaying(), score(game)));
        voluntary = false;
        confirmed = false;
        reason = null;
    }

    void playable(Game game) {
        if (game.getTurnMode() != TurnMode.REGULAR || game.getFinished() != null) return;
        String identity = game.getHalf() + ":" + game.isHomePlaying() + ":" + game.getTurnData().getTurnNr();
        if (identity.equals(lastTurn)) return;
        lastTurn = identity;
        if (pendingKickoff != null) { pending.add(pendingKickoff); pendingKickoff = null; }
        if (deferredWeather != null) { pending.add(deferredWeather); deferredWeather = null; }
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
            .add("lastTurn", nullable(lastTurn)).add("pending", pending)
            .add("lastWeather", nullable(lastWeather)).add("pendingKickoff", pendingKickoff == null ? JsonValue.NULL : pendingKickoff)
            .add("deferredWeather", deferredWeather == null ? JsonValue.NULL : deferredWeather);
    }

    void restore(JsonObject saved) {
        if (saved.size() != 5 && saved.size() != 8) throw new IllegalArgumentException("Invalid match announcement checkpoint");
        voluntary = saved.get("voluntary").asBoolean();
        confirmed = saved.get("confirmed").asBoolean();
        reason = saved.get("reason").isNull() ? null : saved.get("reason").asString();
        lastTurn = saved.get("lastTurn").isNull() ? null : saved.get("lastTurn").asString();
        pending = JsonArray.readFrom(saved.get("pending").toString());
        lastWeather = saved.get("lastWeather") == null || saved.get("lastWeather").isNull() ? null : saved.get("lastWeather").asString();
        pendingKickoff = saved.get("pendingKickoff") == null || saved.get("pendingKickoff").isNull() ? null : saved.get("pendingKickoff").asObject();
        deferredWeather = saved.get("deferredWeather") == null || saved.get("deferredWeather").isNull() ? null : saved.get("deferredWeather").asObject();
    }

    private JsonObject event(String kind, Game game, boolean home, String cause) {
        return new JsonObject().add("kind", kind).add("team", home ? "home" : "away")
            .add("turn", (home ? game.getTurnDataHome() : game.getTurnDataAway()).getTurnNr())
            .add("half", Math.max(1, game.getHalf())).add("reason", nullable(cause));
    }

    private JsonValue nullable(String value) { return value == null ? JsonValue.NULL : JsonValue.valueOf(value); }
}
