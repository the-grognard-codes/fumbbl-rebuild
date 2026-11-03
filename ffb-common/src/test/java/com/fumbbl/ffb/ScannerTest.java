package com.fumbbl.ffb;

import com.fumbbl.ffb.model.GameOptions;
import com.fumbbl.ffb.util.Scanner;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class ScannerTest {
    @Test
    void selectsBb2025ImplementationOverTheGenericDomainImplementation() {
        var implementations = new Scanner<>(DomainImplementation.class).getInstancesImplementing(new GameOptions(null));
        assertEquals(1, implementations.size());
        assertEquals(CurrentImplementation.class, implementations.iterator().next().getClass());
    }

    @Test
    void rejectsAmbiguousRegistrationsInsteadOfChoosingAnArbitraryImplementation() {
        assertThrows(FantasyFootballException.class,
            () -> new Scanner<>(AmbiguousImplementation.class).getInstancesImplementing(new GameOptions(null)));
    }

    public interface DomainImplementation extends IKeyedItem {
        default String getKey() { return "domain"; }
    }

    public interface AmbiguousImplementation extends IKeyedItem {
        default String getKey() { return "ambiguous"; }
    }

    @RulesCollection(RulesCollection.Rules.COMMON)
    public static class GenericImplementation implements DomainImplementation { }

    @RulesCollection(RulesCollection.Rules.BB2025)
    public static class CurrentImplementation implements DomainImplementation { }

    @RulesCollection(RulesCollection.Rules.BB2025)
    public static class FirstImplementation implements AmbiguousImplementation { }

    @RulesCollection(RulesCollection.Rules.BB2025)
    public static class SecondImplementation implements AmbiguousImplementation { }
}
