package com.fumbbl.ffb;

import com.fumbbl.ffb.model.GameOptions;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.GameOptionString;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class RulesTest {
    @Test
    void newGameOptionsDefaultToBb2025() {
        assertEquals(RulesCollection.Rules.BB2025, new GameOptions(null).getRulesVersion());
    }

    @Test
    void rejectsUnsupportedEditionAndRegistrationLayerAsPlayableRules() {
        for (String value : new String[] {"UNSUPPORTED", "COMMON", "", "bb2025"}) {
            GameOptions options = new GameOptions(null);
            options.addOption(new GameOptionString(GameOptionId.RULESVERSION).setValue(value));
            assertThrows(FantasyFootballException.class, options::getRulesVersion);
        }
    }
}
