package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.kickoff.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.GameResult;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.TeamResult;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandEndTurn;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.bb2025.MatchSplashRules;
import com.fumbbl.ffb.server.match.bb2025.MatchSplashRules.KickoffPresentation;
import com.fumbbl.ffb.server.match.bb2025.MatchSplashRules.KickoffSide;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.util.UtilServerGame;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Resident presentation sidecar. Only native committed boundaries produce events. */
final class MatchAnnouncementPresentation {
    private static final List<String> LEGACY_CHECKPOINT_FIELDS = List.of("voluntary", "confirmed", "reason", "lastTurn", "pending");
    private static final List<String> KICKOFF_CHECKPOINT_FIELDS = List.of("lastWeather", "pendingKickoff", "deferredWeather");
    private final MatchSplashRules rules = new MatchSplashRules();
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
        KickoffPresentation kickoff = rules.kickoffPresentation(result);
        KickoffSide side = kickoff.side();
        pendingKickoff = event("kickoff", game, (side == KickoffSide.RECEIVING) != game.isHomePlaying(), result.getDescription())
            .add("headline", result.getName()).add("code", kickoff.code())
            .add("teamSpecific", side != KickoffSide.NEUTRAL);
    }

    void weather(Game game) {
        Weather weather = game.getFieldModel().getWeather();
        if (weather == null || weather == Weather.INTRO || weather.name().equals(lastWeather)) return;
        lastWeather = weather.name();
        JsonObject announcement = event("weather", game, game.isHomePlaying(), rules.weatherReminder(weather))
            .add("headline", weather.getName()).add("code", weather.name());
        if (pendingKickoff == null) pending.add(announcement);
        else deferredWeather = announcement;
    }

    void finished(Game game) {
        GameResult result = game.getGameResult();
        TeamResult homeResult = result.getTeamResultHome();
        TeamResult awayResult = result.getTeamResultAway();
        boolean homeConceded = homeResult.hasConceded();
        boolean awayConceded = awayResult.hasConceded();
        int home = homeResult.getScore();
        int away = awayResult.getScore();
        boolean homeWins = awayConceded || !homeConceded && home > away;
        String winner = !homeConceded && !awayConceded && home == away ? "DRAW"
            : (homeWins ? game.getTeamHome() : game.getTeamAway()).getName() + " wins";
        pending.add(event("fullTime", game, homeWins, score(game, home, away) + " — " + winner)
            .add("headline", homeConceded || awayConceded ? "MATCH CONCEDED" : "END OF MATCH")
            .add("code", homeConceded || awayConceded ? "CONCEDED" : home == away ? "DRAW" : "WIN"));
    }

    private String score(Game game) {
        GameResult result = game.getGameResult();
        return score(game, result.getTeamResultHome().getScore(), result.getTeamResultAway().getScore());
    }

    private String score(Game game, int home, int away) {
        return game.getTeamHome().getName() + " " + home + " – " + away + " " + game.getTeamAway().getName();
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
            pending.add(event("touchdown", game, home, score(game))
                .add("scorer", new JsonObject().add("name", scorer.getName()).add("number", scorer.getNr())));
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
        if (pendingKickoff != null) {
            Weather weather = game.getFieldModel().getWeather();
            if (rules.isChangingWeather(pendingKickoff.getString("code", "")) && weather != null && weather != Weather.INTRO) {
                pendingKickoff.add("weather", new JsonObject().add("code", weather.name())
                    .add("headline", weather.getName()).add("reason", rules.weatherReminder(weather)));
            }
            pending.add(pendingKickoff);
            pendingKickoff = null;
        }
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
        boolean legacy = saved.size() == LEGACY_CHECKPOINT_FIELDS.size();
        boolean current = saved.size() == LEGACY_CHECKPOINT_FIELDS.size() + KICKOFF_CHECKPOINT_FIELDS.size()
            && saved.names().containsAll(KICKOFF_CHECKPOINT_FIELDS);
        if (!saved.names().containsAll(LEGACY_CHECKPOINT_FIELDS) || !(legacy || current))
            throw new IllegalArgumentException("Invalid match announcement checkpoint fields");
        try {
            voluntary = saved.get("voluntary").asBoolean();
            confirmed = saved.get("confirmed").asBoolean();
            reason = readNullable(saved, "reason", JsonValue::asString);
            lastTurn = readNullable(saved, "lastTurn", JsonValue::asString);
            pending = JsonArray.readFrom(saved.get("pending").toString());
            lastWeather = legacy ? null : readNullable(saved, "lastWeather", JsonValue::asString);
            pendingKickoff = legacy ? null : readNullable(saved, "pendingKickoff", JsonValue::asObject);
            deferredWeather = legacy ? null : readNullable(saved, "deferredWeather", JsonValue::asObject);
        } catch (UnsupportedOperationException invalid) {
            throw new IllegalArgumentException("Invalid match announcement checkpoint field type", invalid);
        }
    }

    private <T> T readNullable(JsonObject saved, String field, Function<JsonValue, T> read) {
        JsonValue value = saved.get(field);
        return value.isNull() ? null : read.apply(value);
    }

    private JsonObject event(String kind, Game game, boolean home, String cause) {
        return new JsonObject().add("kind", kind).add("team", home ? "home" : "away")
            .add("turn", (home ? game.getTurnDataHome() : game.getTurnDataAway()).getTurnNr())
            .add("half", Math.max(1, game.getHalf())).add("reason", nullable(cause));
    }

    private JsonValue nullable(String value) { return value == null ? JsonValue.NULL : JsonValue.valueOf(value); }
}
