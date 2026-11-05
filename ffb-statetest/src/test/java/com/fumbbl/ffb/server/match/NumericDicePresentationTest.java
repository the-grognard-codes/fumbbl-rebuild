package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.Direction;
import com.fumbbl.ffb.FactoryType.Factory;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.DirectionFactory;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.factory.ReportIdFactory;
import com.fumbbl.ffb.report.ReportKickoffScatter;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NumericDicePresentationTest {
    @Test
    void nativeCasualtiesKeepTheirActualDiceTypes() throws Exception {
        JsonObject report = new com.fumbbl.ffb.report.bb2025.ReportApothecaryRoll("target", new int[] {3, 2},
            new PlayerState(PlayerState.RESERVE), null, null, Collections.emptySet()).toJsonValue();
        new NumericDicePresentation().decorate(report);
        JsonArray dice = report.get("numericDice").asObject().get("dice").asArray();
        assertEquals(2, dice.size());
        assertEquals(16, dice.get(0).asObject().getInt("sides", 0));
        assertEquals(6, dice.get(1).asObject().getInt("sides", 0));
        assertEquals(3, dice.get(0).asObject().getInt("value", 0));
        assertEquals(2, dice.get(1).asObject().getInt("value", 0));
        String fixturePath = System.getenv("FFB_NUMERIC_DICE_FIXTURE");
        if (fixturePath != null) Files.write(Paths.get(fixturePath), new JsonArray().add(report).toString().getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void skippedInjuryPartsAndUntypedKickDistanceDoNotBecomeDice() {
        NumericDicePresentation presentation = new NumericDicePresentation();
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

    @Test
    void deviationPreservesActualDistanceTypeThroughRecoveryAndCoachTransform() {
        IFactorySource source = mock(IFactorySource.class);
        when(source.forContext(any())).thenReturn(source);
        when(source.getFactory(Factory.REPORT_ID)).thenReturn(new ReportIdFactory());
        when(source.getFactory(Factory.DIRECTION)).thenReturn(new DirectionFactory());
        for (int sides : new int[] {3, 6}) {
            ReportKickoffScatter original = new ReportKickoffScatter(new FieldCoordinate(10, 7), Direction.EAST, 3, 2, sides);
            ReportKickoffScatter restored = new ReportKickoffScatter().initFrom(source, original.toJsonValue());
            assertEquals(original.toJsonValue(), restored.toJsonValue());
            JsonObject report = restored.transform(source).toJsonValue().asObject();
            assertEquals(sides, report.getInt("scatterDistanceSides", 0));
            assertEquals("West", report.getString("scatterDirection", ""));
            new NumericDicePresentation().decorate(report);
            JsonArray dice = report.get("numericDice").asObject().get("dice").asArray();
            assertEquals(2, dice.size());
            assertEquals(8, dice.get(0).asObject().getInt("sides", 0));
            assertEquals(sides, dice.get(1).asObject().getInt("sides", 0));
            assertEquals(2, dice.get(1).asObject().getInt("value", 0));
            assertEquals("Deviation", dice.get(0).asObject().getString("label", ""));
            assertEquals("Deviation", dice.get(1).asObject().getString("label", ""));
        }
        JsonObject legacy = new ReportKickoffScatter(new FieldCoordinate(10, 7), Direction.EAST, 3, 2).toJsonValue();
        assertEquals(legacy, new ReportKickoffScatter().initFrom(source, legacy).toJsonValue());
        assertThrows(IllegalArgumentException.class, () -> new ReportKickoffScatter().initFrom(source,
            new JsonObject(legacy).add("scatterDistanceSides", 8)));
    }
}
