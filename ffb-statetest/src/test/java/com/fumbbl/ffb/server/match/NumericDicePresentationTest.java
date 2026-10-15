package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.server.mechanic.RollMechanic;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class NumericDicePresentationTest {
    @Test
    void legacyAndModernNativeCasualtiesKeepTheirActualDiceTypes() throws Exception {
        JsonObject legacy = new com.fumbbl.ffb.report.bb2016.ReportApothecaryRoll("target", new int[] {3, 2},
            new PlayerState(PlayerState.RESERVE), null).toJsonValue();
        JsonObject modern = new com.fumbbl.ffb.report.mixed.ReportApothecaryRoll("target", new int[] {3, 2},
            new PlayerState(PlayerState.RESERVE), null, null, Collections.emptySet()).toJsonValue();
        new NumericDicePresentation(new com.fumbbl.ffb.server.mechanic.bb2016.RollMechanic()).decorate(legacy);
        for (RollMechanic mechanic : new RollMechanic[] {new com.fumbbl.ffb.server.mechanic.bb2020.RollMechanic(),
            new com.fumbbl.ffb.server.mechanic.bb2025.RollMechanic()}) {
            new NumericDicePresentation(mechanic).decorate(modern);
            assertEquals(16, modern.get("numericDice").asObject().get("dice").asArray().get(0).asObject().getInt("sides", 0));
        }
        assertEquals(8, legacy.get("numericDice").asObject().get("dice").asArray().get(1).asObject().getInt("sides", 0));
        assertEquals(3, modern.get("numericDice").asObject().get("dice").asArray().get(0).asObject().getInt("value", 0));
        String fixturePath = System.getenv("FFB_NUMERIC_DICE_FIXTURE");
        if (fixturePath != null) Files.write(Paths.get(fixturePath), new JsonArray().add(legacy).add(modern).toString().getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void skippedInjuryPartsAndD3KickDistanceDoNotBecomeDice() {
        NumericDicePresentation presentation = new NumericDicePresentation(new com.fumbbl.ffb.server.mechanic.bb2025.RollMechanic());
        JsonObject report = new JsonObject().add("reportId", "injury").add("skipInjuryParts", "EVERYTHING_BUT_CAS")
            .add("armorRoll", new JsonArray().add(6).add(6)).add("injuryRoll", new JsonArray().add(6).add(6))
            .add("casualtyRoll", new JsonArray().add(16).add(1));
        presentation.decorate(report);
        assertEquals(2, report.get("numericDice").asObject().get("dice").asArray().size());
        JsonObject kick = new JsonObject().add("reportId", "kickoffScatter").add("rollScatterDirection", 2).add("rollScatterDistance", 3);
        presentation.decorate(kick);
        assertEquals(1, kick.get("numericDice").asObject().get("dice").asArray().size());
        JsonObject unsupported = new JsonObject().add("reportId", "prayerRoll").add("roll", 3);
        presentation.decorate(unsupported);
        assertNull(unsupported.get("numericDice"));
    }
}
