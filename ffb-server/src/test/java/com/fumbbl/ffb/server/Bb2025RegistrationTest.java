package com.fumbbl.ffb.server;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.IKeyedItem;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.factory.ReportFactory;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.GameOptions;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.GameOptionString;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.bb2025.ReportKickTeamMateRoll;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.generator.SequenceGenerator;
import com.fumbbl.ffb.util.Scanner;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

class Bb2025RegistrationTest {
    @Test
    void preservesTheBb2025ImplementationsSelectedBeforePruning() throws Exception {
        GameOptions options = new GameOptions(null);
        options.addOption(new GameOptionString(GameOptionId.RULESVERSION).setValue("BB2025"));
        Set<String> registrations = new TreeSet<>();
        record(registrations, "factory", new Scanner<>(INamedObjectFactory.class).getInstancesImplementing(options));
        record(registrations, "mechanic", new Scanner<>(Mechanic.class).getInstancesImplementing(options));
        record(registrations, "skill", new Scanner<>(Skill.class).getSubclassInstances(options));
        record(registrations, "report", new Scanner<>(IReport.class).getInstancesImplementing(options));
        record(registrations, "sequence", new Scanner<>(SequenceGenerator.class).getSubclassInstances(options));
        GameState state = mock(GameState.class);
        record(registrations, "step", new Scanner<>(IStep.class).getInstancesImplementing(options, type -> {
            try {
                return type.getConstructor(GameState.class).newInstance(state);
            } catch (ReflectiveOperationException failure) {
                throw new AssertionError(type.getName(), failure);
            }
        }));
        String actual = String.join("\n", registrations) + "\n";
        try (var resource = getClass().getResourceAsStream("/bb2025-registrations.txt")) {
            Set<String> expected = new TreeSet<>(new String(resource.readAllBytes(), StandardCharsets.UTF_8).lines().toList());
            // These generic report registrations only served removed editions or old-save conversion.
            // Keep the original snapshot intact so every intentional registration delta remains explicit.
            expected.removeAll(Set.of(
                "report|biteSpectator|com.fumbbl.ffb.report.ReportBiteSpectator",
                "report|bombExplodesAfterCatch|com.fumbbl.ffb.report.ReportBombExplodesAfterCatch",
                "report|cardEffectRoll|com.fumbbl.ffb.report.ReportCardEffectRoll",
                "report|gameOptions|com.fumbbl.ffb.report.ReportGameOptions",
                "report|passDeviate|com.fumbbl.ffb.report.ReportPassDeviate",
                "report|pettyCash|com.fumbbl.ffb.report.ReportPettyCash",
                "report|pilingOn|com.fumbbl.ffb.report.ReportPilingOn",
                "report|safeThrowRoll|com.fumbbl.ffb.report.ReportSafeThrowRoll",
                "report|weepingDaggerRoll|com.fumbbl.ffb.report.ReportWeepingDaggerRoll"));
            // The retained Kick Team-Mate step directly emits this report. It must also
            // be discoverable when a new-build transcript or recovery record is read.
            expected.add("report|kickTeamMateRoll|com.fumbbl.ffb.report.bb2025.ReportKickTeamMateRoll");
            assertEquals(String.join("\n", expected) + "\n", actual);
        }
    }

    @Test
    void retainedKickTeamMateReportCanBeReadByTheBb2025Factory() {
        Game game = new Game(null, new FactoryManager());
        game.initializeRules();
        ReportKickTeamMateRoll original = new ReportKickTeamMateRoll("kicker", "teammate", true, new int[] {3, 4}, false, 7);
        ReportFactory factory = game.getFactory(FactoryType.Factory.REPORT);
        IReport restored = factory.forId(original.getId());
        restored.initFrom(game.getRules(), original.toJsonValue());
        assertEquals(original.toJsonValue(), restored.toJsonValue());
    }

    private void record(Set<String> registrations, String family, Collection<? extends IKeyedItem> items) {
        for (IKeyedItem item : items) {
            registrations.add(family + "|" + item.getKey() + "|" + item.getClass().getName());
        }
    }
}
