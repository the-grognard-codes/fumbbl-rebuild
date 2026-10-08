package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.dialog.DialogBlockRollPropertiesParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepId;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Freezes native block participants, chooser and resolved player changes on public copies. */
final class NativeBlockPresentation {
    private final Game game;
    private final String attackerId;
    private String defenderId;
    private String chooser;
    private boolean pushing;
    private boolean bothDown;
    private boolean blockContext;
    private boolean wrestling;
    private final boolean following;
    private final Map<String, FieldCoordinate> coordinates = new HashMap<>();
    private final Map<String, Integer> states = new HashMap<>();
    private final Map<String, String> blockingSkills = new HashMap<>();

    NativeBlockPresentation(GameState state) {
        game = state.getGame();
        attackerId = game.getActingPlayer().getPlayerId();
        defenderId = game.getDefenderId();
        if (game.getDialogParameter() instanceof DialogBlockRollPropertiesParameter)
            chooser = role(((DialogBlockRollPropertiesParameter) game.getDialogParameter()).getChoosingTeamId());
        bothDown = state.getCurrentStep() != null && (state.getCurrentStep().getId() == StepId.WRESTLE || state.getCurrentStep().getId() == StepId.BOTH_DOWN);
        following = state.getCurrentStep() != null && state.getCurrentStep().getId() == StepId.FOLLOWUP;
        pushing = state.getCurrentStep() != null && state.getCurrentStep().getId() == StepId.PUSHBACK;
        PlayerAction action = game.getActingPlayer().getPlayerAction();
        blockContext = pushing || bothDown || state.getCurrentStep() != null && state.getCurrentStep().getId() == StepId.FOLLOWUP
            || defenderId != null && (action == PlayerAction.BLOCK || action != null && action.isBlitzing());
        for (Team team : new Team[] {game.getTeamHome(), game.getTeamAway()}) for (Player<?> player : team.getPlayers()) {
            FieldCoordinate coordinate = game.getFieldModel().getPlayerCoordinate(player);
            coordinates.put(player.getId(), coordinate == null ? null : new FieldCoordinate(coordinate.getX(), coordinate.getY()));
            PlayerState playerState = game.getFieldModel().getPlayerState(player);
            if (playerState != null) states.put(player.getId(), playerState.getBase());
            Skill skill = player.getSkillWithProperty(NamedProperties.preventFallOnBothDown);
            if (skill != null) blockingSkills.put(player.getId(), skill.getName());
        }
    }

    void decorate(JsonObject sync) {
        for (JsonValue value : sync.get("reportList").asObject().get("reports").asArray()) {
            JsonObject report = value.asObject();
            String id = report.getString("reportId", "");
            if ("block".equals(id) || "blockChoice".equals(id) || "blockRoll".equals(id) || "blockReRoll".equals(id)) blockContext = true;
            if ("block".equals(id) || "blockChoice".equals(id)) defenderId = report.getString("defenderId", defenderId);
            if ("blockRoll".equals(id)) chooser = role(report.getString("choosingTeamId", null));
            if ("blockChoice".equals(id) && "BOTH DOWN".equals(report.getString("blockResult", ""))) bothDown = true;
            if ("pushback".equals(id)) pushing = true;
            if ("pushback".equals(id) && attackerId != null && string(report, "defenderId") != null) {
                String pushed = string(report, "defenderId");
                boolean sideStep = "sideStep".equals(string(report, "pushbackMode"));
                report.add("logActors", new JsonObject().add("version", 1).add("actorId", sideStep ? pushed : attackerId)
                    .add("targetId", sideStep ? attackerId : pushed));
            }
            if ("skillUse".equals(id) && "Wrestle".equals(string(report, "skill")) && report.getBoolean("used", false)) wrestling = true;
            if ("block".equals(id) || "blockRoll".equals(id) || "blockChoice".equals(id) || "blockReRoll".equals(id))
                report.add("logBlock", new JsonObject().add("version", 1).add("attackerId", nullable(attackerId))
                    .add("defenderId", nullable(defenderId)).add("chooser", nullable(chooser)));
            if (blockContext && "skillUse".equals(id) && string(report, "playerId") != null && attackerId != null && defenderId != null) {
                String owner = string(report, "playerId");
                String target = owner.equals(attackerId) ? defenderId : owner.equals(defenderId) ? attackerId : null;
                report.add("logActors", new JsonObject().add("version", 1).add("actorId", owner).add("targetId", nullable(target)));
            }
        }
        JsonArray events = new JsonArray();
        for (JsonValue value : sync.get("modelChangeList").asObject().get("modelChangeArray").asArray()) {
            JsonObject change = value.asObject();
            String id = change.getString("modelChangeId", ""), playerId = string(change, "modelChangeKey");
            JsonValue changed = change.get("modelChangeValue");
            if ("fieldModelSetPlayerCoordinate".equals(id)) {
                FieldCoordinate from = coordinates.get(playerId), to = coordinate(changed);
                if (blockContext && pushing && from != null && to != null && !from.equals(to) && !playerId.equals(attackerId))
                    events.add(event(playerId, "push", from, to, null));
                else if (blockContext && (defenderId != null || following) && playerId.equals(attackerId) && from != null && to != null && !from.equals(to))
                    events.add(event(playerId, "followUp", from, to, null));
                coordinates.put(playerId, to);
            } else if ("fieldModelSetPlayerState".equals(id) && changed != null && changed.isNumber()) {
                int base = new PlayerState(changed.asInt()).getBase();
                Integer previous = states.put(playerId, base);
                if (!blockContext || defenderId == null || previous == null || previous == base) continue;
                // FALLING is a pending native state: Wrestle/other decisions can still change its outcome.
                if (previous == PlayerState.FALLING && base != PlayerState.STANDING && base != PlayerState.MOVING && base != PlayerState.BLOCKED && base != PlayerState.FALLING && !wrestling)
                    events.add(event(playerId, "knockdown", coordinates.get(playerId), coordinates.get(playerId), null));
                String kind = base == PlayerState.PRONE && (previous != PlayerState.FALLING || wrestling) ? "prone"
                    : base == PlayerState.STUNNED ? "stunned" : base == PlayerState.KNOCKED_OUT ? "knockedOut"
                    : base == PlayerState.BADLY_HURT || base == PlayerState.SERIOUS_INJURY ? "removed"
                    : base == PlayerState.RIP ? "dead" : null;
                if (kind != null) events.add(event(playerId, kind, coordinates.get(playerId), coordinates.get(playerId), null));
            }
        }
        if (events.size() > 0) sync.add("logOutcomes", new JsonObject().add("version", 1).add("events", events));
    }

    void finish(List<JsonObject> syncs) {
        if (!bothDown || syncs.isEmpty() || game.getDialogParameter() != null) return;
        JsonObject last = syncs.get(syncs.size() - 1);
        JsonArray events = last.get("logOutcomes") == null ? new JsonArray() : last.get("logOutcomes").asObject().get("events").asArray();
        for (String id : new String[] {attackerId, defenderId}) {
            if (id == null) continue;
            Player<?> player = game.getPlayerById(id);
            PlayerState state = player == null ? null : game.getFieldModel().getPlayerState(player);
            if (state != null && state.isStanding() && blockingSkills.containsKey(id))
                events.add(event(id, "standing", coordinates.get(id), coordinates.get(id), blockingSkills.get(id)));
        }
        if (events.size() > 0) last.set("logOutcomes", new JsonObject().add("version", 1).add("events", events));
    }

    private String role(String teamId) {
        return game.getTeamHome().getId().equals(teamId) ? "home" : game.getTeamAway().getId().equals(teamId) ? "away" : null;
    }
    private JsonObject event(String id, String kind, FieldCoordinate from, FieldCoordinate to, String skill) {
        return new JsonObject().add("playerId", id).add("kind", kind).add("from", square(from)).add("to", square(to)).add("skill", nullable(skill));
    }
    private FieldCoordinate coordinate(JsonValue value) {
        return value != null && value.isArray() && value.asArray().size() == 2
            ? new FieldCoordinate(value.asArray().get(0).asInt(), value.asArray().get(1).asInt()) : null;
    }
    private JsonValue square(FieldCoordinate point) {
        return FieldCoordinateBounds.FIELD.isInBounds(point) ? new JsonObject().add("x", point.getX()).add("y", point.getY()) : JsonValue.NULL;
    }
    private JsonValue nullable(String value) { return value == null ? JsonValue.NULL : JsonValue.valueOf(value); }
    private String string(JsonObject value, String key) {
        JsonValue item = value.get(key);
        return item != null && item.isString() ? item.asString() : null;
    }
}
