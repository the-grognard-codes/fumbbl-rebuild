package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.report.logcontrol.SkipInjuryParts;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Optional public facts for grouped rolls whose die types are not present in old reports. */
final class NumericDicePresentation {
    void decorate(JsonObject report) {
        JsonArray dice = new JsonArray();
        String id = report.getString("reportId", "");
        if ("injury".equals(id) || "apothecaryRoll".equals(id)) {
            SkipInjuryParts skip = SkipInjuryParts.valueOf(report.getString("skipInjuryParts", "NONE"));
            if (!skip.isArmour()) group(dice, report.get("armorRoll"), new int[] {6, 6}, "Armour");
            if (!skip.isInjury()) group(dice, report.get("injuryRoll"), new int[] {6, 6}, "Injury");
            if (!skip.isCas()) {
                int[] sides = new int[] {16, 6};
                group(dice, report.get("casualtyRoll"), sides, "Casualty");
                group(dice, report.get("casualtyRollDecay"), sides, "Decay casualty");
            }
        } else if ("kickoffScatter".equals(id)) {
            int distanceSides = report.getInt("scatterDistanceSides", 0);
            boolean typedDistance = distanceSides == 3 || distanceSides == 6;
            String label = typedDistance ? "Deviation" : "Kick direction";
            die(dice, report.get("rollScatterDirection"), 8, label);
            if (typedDistance) die(dice, report.get("rollScatterDistance"), distanceSides, label);
        } else if ("scatterPlayer".equals(id)) {
            JsonValue scatter = report.get("isScatter");
            // Non-scatter player bounces remain outside the approved display scope.
            if (scatter != null && scatter.isBoolean() && scatter.asBoolean()) {
                JsonValue rolls = report.get("rolls");
                if (rolls != null && rolls.isArray()) for (JsonValue roll : rolls.asArray()) die(dice, roll, 8, "Player scatter");
            }
        }
        if (dice.size() > 0) report.set("numericDice", new JsonObject().add("version", 1).add("dice", dice));
    }

    private void group(JsonArray dice, JsonValue values, int[] sides, String label) {
        if (values == null || !values.isArray() || values.asArray().size() != sides.length) return;
        for (int index = 0; index < sides.length; index++) die(dice, values.asArray().get(index), sides[index], label);
    }

    private void die(JsonArray dice, JsonValue value, int sides, String label) {
        if (value == null || !value.isNumber()) return;
        int roll = value.asInt();
        if (roll >= 1 && roll <= sides) dice.add(new JsonObject().add("sides", sides).add("value", roll).add("label", label));
    }
}
