package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.ReportSkillRoll;
import com.fumbbl.ffb.report.mixed.ReportDodgeRoll;
import com.fumbbl.ffb.report.mixed.ReportPassRoll;
import com.fumbbl.ffb.server.DiceInterpreter;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.HashMap;
import java.util.Map;

/** Public roll facts frozen from the resident native game, without executing it again. */
final class PrimaryRollPresentation {
    private final Map<String, Integer> agility = new HashMap<>();
    private final Map<String, Integer> passing = new HashMap<>();
    private final Map<String, JsonValue> squares = new HashMap<>();

    PrimaryRollPresentation(Game game) {
        for (Team team : new Team[] {game.getTeamHome(), game.getTeamAway()}) for (Player<?> player : team.getPlayers()) {
            agility.put(player.getId(), player.getAgilityWithModifiers(game));
            passing.put(player.getId(), player.getPassingWithModifiers(game));
            squares.put(player.getId(), square(game.getFieldModel().getPlayerCoordinate(player)));
        }
    }

    void decorate(ServerCommandModelSync command, JsonObject publicSync) {
        JsonArray changes = publicSync.get("modelChangeList").asObject().get("modelChangeArray").asArray();
        for (JsonValue value : changes) {
            JsonObject change = value.asObject();
            if ("fieldModelSetPlayerCoordinate".equals(change.getString("modelChangeId", null))) {
                JsonValue coordinate = change.get("modelChangeValue");
                JsonValue point = JsonValue.NULL;
                if (coordinate != null && coordinate.isArray()) {
                    JsonArray array = coordinate.asArray();
                    if (array.size() == 2) point = square(new FieldCoordinate(array.get(0).asInt(), array.get(1).asInt()));
                }
                squares.put(change.getString("modelChangeKey", ""), point);
            }
        }
        IReport[] reports = command.getReportList().getReports();
        JsonArray publicReports = publicSync.get("reportList").asObject().get("reports").asArray();
        for (int index = 0; index < reports.length; index++) {
            IReport report = reports[index];
            if (!(report instanceof ReportSkillRoll)) continue;
            ReportSkillRoll roll = (ReportSkillRoll) report;
            Integer base;
            switch (report.getId()) {
                case PICK_UP_ROLL:
                    base = report instanceof com.fumbbl.ffb.report.bb2025.ReportPickupRoll
                        && ((com.fumbbl.ffb.report.bb2025.ReportPickupRoll) report).isSecureTheBall() ? 2 : agility.get(roll.getPlayerId());
                    break;
                case PASS_ROLL:
                    base = report instanceof ReportPassRoll && ((ReportPassRoll) report).isHailMaryPass() ? 2 : passing.get(roll.getPlayerId());
                    break;
                case GO_FOR_IT_ROLL: base = 2; break;
                case DODGE_ROLL:
                case CATCH_ROLL:
                case JUMP_ROLL: base = agility.get(roll.getPlayerId()); break;
                default: continue;
            }
            if (base == null || base < 1) continue;
            int modifier = 0;
            for (com.fumbbl.ffb.modifiers.RollModifier<?> item : roll.getRollModifiers()) modifier -= item.getModifier();
            if (report instanceof ReportDodgeRoll && ((ReportDodgeRoll) report).getStatBasedRollModifier() != null)
                modifier += ((ReportDodgeRoll) report).getStatBasedRollModifier().getModifier();
            if (report instanceof ReportPassRoll && ((ReportPassRoll) report).getStatBasedRollModifier() != null)
                modifier -= ((ReportPassRoll) report).getStatBasedRollModifier().getModifier();
            if (report instanceof ReportPassRoll && !((ReportPassRoll) report).isHailMaryPass()
                && ((ReportPassRoll) report).getPassingDistance() != null)
                modifier -= ((ReportPassRoll) report).getPassingDistance().getModifier2020();
            publicReports.get(index).asObject().add("logRoll", new JsonObject().add("version", 1).add("base", base)
                .add("target", DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(roll.getMinimumRoll()))
                .add("modifier", modifier).add("square", squares.getOrDefault(roll.getPlayerId(), JsonValue.NULL)));
        }
    }

    private JsonValue square(FieldCoordinate coordinate) {
        return FieldCoordinateBounds.FIELD.isInBounds(coordinate)
            ? new JsonObject().add("x", coordinate.getX()).add("y", coordinate.getY()) : JsonValue.NULL;
    }
}
