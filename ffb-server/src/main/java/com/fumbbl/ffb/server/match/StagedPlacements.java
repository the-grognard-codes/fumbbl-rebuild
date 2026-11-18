package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.step.KickoffAdjustmentBudget;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

/** Worker-owned placement overlay. The native board stays at its durable baseline outside a projection or confirm. */
final class StagedPlacements {
    static final int SETUP_ADJUSTMENT_LIMIT = 100;

    private record Position(FieldCoordinate square, int state) { }

    private final Set<String> selection = new LinkedHashSet<>();
    private final Map<String, String> requests = new LinkedHashMap<>();
    private final Map<Player<?>, Position> positions = new LinkedHashMap<>();
    private final Map<Player<?>, Position> base = new LinkedHashMap<>();

    int sequence() { return requests.size(); }

    boolean duplicate(String key, String fingerprint) {
        String prior = requests.get(key);
        if (prior == null) return false;
        if (!prior.equals(fingerprint)) throw new MatchService.Failure("REQUEST_ID_REUSED");
        return true;
    }

    boolean exhausted(boolean setup) {
        return sequence() >= (setup ? SETUP_ADJUSTMENT_LIMIT : KickoffAdjustmentBudget.KICKOFF_ADJUSTMENT_LIMIT);
    }

    Set<String> selection() { return selection; }

    void toggle(String player) {
        if (!selection.remove(player)) selection.add(player);
    }

    void clear() {
        selection.clear();
        requests.clear();
        positions.clear();
        base.clear();
    }

    void record(String key, String fingerprint) { requests.put(key, fingerprint); }

    void adjust(FieldModel field, Team team, Runnable adjustment) {
        Map<Player<?>, Position> before = capture(field, team);
        field.withQuietPlayerPositions(() -> {
            try {
                apply(field, positions);
                adjustment.run();
                for (Map.Entry<Player<?>, Position> entry : capture(field, team).entrySet()) {
                    Player<?> player = entry.getKey();
                    Position original = before.get(player);
                    if (!entry.getValue().equals(original)) {
                        base.putIfAbsent(player, original);
                        positions.put(player, entry.getValue());
                    } else if (positions.containsKey(player)) {
                        positions.put(player, entry.getValue());
                    }
                }
            } finally {
                apply(field, before);
            }
            return null;
        });
    }

    <T> T project(FieldModel field, Supplier<T> projection) {
        if (positions.isEmpty()) return projection.get();
        return field.withQuietPlayerPositions(() -> {
            try {
                apply(field, positions);
                return projection.get();
            } finally {
                apply(field, base);
            }
        });
    }

    void commit(FieldModel field) {
        apply(field, positions);
    }

    void revert() { positions.replaceAll((player, position) -> base.get(player)); }

    List<String> movedPlayers() {
        List<String> moved = new ArrayList<>();
        positions.forEach((player, position) -> {
            if (!position.square().equals(base.get(player).square())) moved.add(player.getId());
        });
        return moved;
    }

    JsonObject message(String matchId, int revision) {
        JsonArray players = new JsonArray();
        positions.forEach((player, position) -> {
            FieldCoordinate square = position.square();
            boolean pitch = FieldCoordinateBounds.FIELD.isInBounds(square);
            players.add(new JsonObject().add("playerId", player.getId())
                .add("x", pitch ? JsonValue.valueOf(square.getX()) : JsonValue.NULL)
                .add("y", pitch ? JsonValue.valueOf(square.getY()) : JsonValue.NULL));
        });
        return new JsonObject().add("version", 2).add("type", "stagedPlacement").add("requestId", JsonValue.NULL)
            .add("code", "ACCEPTED").add("matchId", matchId).add("baseRevision", revision)
            .add("stageSeq", sequence()).add("players", players);
    }

    private Map<Player<?>, Position> capture(FieldModel field, Team team) {
        Map<Player<?>, Position> result = new LinkedHashMap<>();
        for (Player<?> player : team.getPlayers()) {
            FieldCoordinate square = field.getPlayerCoordinate(player);
            if (square != null) result.put(player, new Position(square, field.getPlayerState(player).getId()));
        }
        return result;
    }

    private void apply(FieldModel field, Map<Player<?>, Position> board) {
        board.forEach((player, position) -> {
            field.setPlayerCoordinate(player, position.square());
            field.setPlayerState(player, new PlayerState(position.state()));
        });
    }
}
