package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/** Worker-owned placement overlay. The native board stays at its durable baseline outside a projection or confirm. */
final class StagedPlacements {
    private record Position(FieldCoordinate square, int state) { }

    private final Map<Player<?>, Position> positions = new LinkedHashMap<>();
    private final Map<Player<?>, Position> base = new LinkedHashMap<>();

    void clear() {
        positions.clear();
        base.clear();
    }

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

    int movedCount() {
        return (int) positions.entrySet().stream()
            .filter(entry -> !entry.getValue().square().equals(base.get(entry.getKey()).square())).count();
    }

    Map<String, FieldCoordinate> squares() {
        Map<String, FieldCoordinate> result = new LinkedHashMap<>();
        positions.forEach((player, position) -> result.put(player.getId(), position.square()));
        return result;
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
