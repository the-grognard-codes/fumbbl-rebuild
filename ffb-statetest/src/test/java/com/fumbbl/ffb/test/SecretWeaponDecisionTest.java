package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.dialog.DialogArgueTheCallParameter;
import com.fumbbl.ffb.dialog.DialogBribesParameter;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.factory.InducementTypeFactory;
import com.fumbbl.ffb.inducement.Inducement;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.net.commands.ClientCommandArgueTheCall;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseInducement;
import com.fumbbl.ffb.option.GameOptionBoolean;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.IServerJsonOption;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.step.bb2025.StepEndTurn;
import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecretWeaponDecisionTest {
    @Test void optionalArgueRerollIsOfferedAndResolvedBeforeBribesOrAnotherPlayer() throws Exception {
        for (boolean use : new boolean[]{true, false}) {
            GameState state = state(true); Game game = state.getGame();
            InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
            game.getTurnDataHome().getInducementSet().addInducement(new Inducement(factory.forName("briberyAndCorruption"), 1));
            Inducement referee = new Inducement(factory.forName("biasedRef"), 1);
            referee.setValue(1);
            game.getTurnDataHome().getInducementSet().addInducement(referee);
            StepEngine.respond(state, choose(game, "one"), true);
            TestRolls.on(state).general(1, 6);
            StepEngine.respond(state, new ClientCommandArgueTheCall("one"), true);
            java.util.List<com.fumbbl.ffb.server.match.CoreTurnActions.Action> actions = new CorePromptActions(state).actions();
            assertEquals(2, actions.size());
            assertTrue(actions.stream().allMatch(action -> action.kind.equals("reroll")));
            StepEngine.respond(state, actions.stream().filter(action -> action.id.equals(use ? "argue-reroll:use" : "argue-reroll:none")).findFirst().orElseThrow().command, true);
            if (use) assertEquals("two", ((DialogArgueTheCallParameter) game.getDialogParameter()).getPlayerIds()[0]);
            else assertEquals("one", ((DialogBribesParameter) game.getDialogParameter()).getPlayerIds()[0]);
        }
    }

    @Test void legacyCheckpointStillOffersEveryPendingBribe() throws Exception {
        GameState state = state(true); Game game = state.getGame();
        JsonObject saved = state.getCurrentStep().toJsonValue();
        saved.remove("sequentialSendOffs"); saved.remove("resolvedSendOffs");
        StepEndTurn legacy = new StepEndTurn(state).initFrom(game.getRules(), saved);
        assertEquals(saved, legacy.toJsonValue(), "Old native step snapshots must round-trip without adding fields");
        DialogBribesParameter dialog = new DialogBribesParameter(game.getTeamHome().getId(), 2);
        dialog.addPlayerIds(new String[]{"one", "two"}); game.setDialogParameter(dialog);
        assertEquals(3, new CorePromptActions(state).actions().size());
    }

    @Test void resolvesSelectedPlayerBeforeNextAndPreservesBribesAfterCoachEjection() throws Exception {
        for (boolean home : new boolean[]{true, false}) {
            GameState state = state(home);
            Game game = state.getGame();
            assertTrue(game.getDialogParameter() instanceof DialogPlayerChoiceParameter);
            assertEquals(2, new CorePromptActions(state).actions().size());
            StepEngine.respond(state, choose(game, "two"), !home);
            assertTrue(game.getDialogParameter() instanceof DialogPlayerChoiceParameter);
            StepEngine.respond(state, choose(game, "two"), home);
            assertEquals("two", ((DialogArgueTheCallParameter) game.getDialogParameter()).getPlayerIds()[0]);
            TestRolls.on(state).general(1, 6);
            StepEngine.respond(state, new ClientCommandArgueTheCall("two"), home);
            assertTrue((home ? game.getTurnDataHome() : game.getTurnDataAway()).isCoachBanned());
            assertEquals("two", ((DialogBribesParameter) game.getDialogParameter()).getPlayerIds()[0]);
            assertTrue(new CorePromptActions(state).actions().stream().anyMatch(action -> action.id.equals("bribe:two")));
            // Persist and restore the actual pending native step; no reroll or resource reapplication.
            StepEndTurn restored = new StepEndTurn(state).initFrom(game.getRules(), state.getCurrentStep().toJsonValue());
            state.getStepStack().push(restored); StepEngine.start(state);
            InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
            StepEngine.respond(state, new ClientCommandUseInducement(factory.forName("bribes"), "two"), home);
            assertFalse(game.getGameResult().getPlayerResult(game.getPlayerById("two")).hasUsedSecretWeapon());
            assertEquals("one", ((DialogBribesParameter) game.getDialogParameter()).getPlayerIds()[0]);
            assertFalse(new CorePromptActions(state).actions().stream().anyMatch(action -> action.kind.equals("argueTheCall")));
        }
    }

    @Test void decliningOnlyResolvesCurrentPlayerAndRejectsAnotherPlayersCommand() throws Exception {
        GameState state = state(true); Game game = state.getGame();
        StepEngine.respond(state, choose(game, "one"), true);
        StepEngine.respond(state, new ClientCommandArgueTheCall("two"), true);
        assertEquals("one", ((DialogArgueTheCallParameter) game.getDialogParameter()).getPlayerIds()[0]);
        StepEngine.respond(state, new ClientCommandArgueTheCall(new String[0]), true);
        InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
        StepEngine.respond(state, new ClientCommandUseInducement(factory.forName("bribes")), true);
        assertEquals(PlayerState.BANNED, game.getFieldModel().getPlayerState(game.getPlayerById("one")).getBase());
        assertEquals("two", ((DialogArgueTheCallParameter) game.getDialogParameter()).getPlayerIds()[0]);
        assertEquals(2, game.getTurnDataHome().getInducementSet().get(factory.forName("bribes")).getUsesLeft());
    }

    private ClientCommandPlayerChoice choose(Game game, String id) {
        return new ClientCommandPlayerChoice(PlayerChoiceMode.SECRET_WEAPON, new Player<?>[]{game.getPlayerById(id)});
    }
    private GameState state(boolean home) throws Exception {
        GameState state = new GameStateBuilder(new TestServer().getGameState()).withRule("BB2025").withWeather(Weather.NICE)
            .withTeam(home, team -> {
                team.player("one", player -> player.at(6, 5).stats(6, 3, 3, 4, 9));
                team.player("two", player -> player.at(8, 5).stats(6, 3, 3, 4, 9));
            }).withTeam(!home, team -> team.player("other", player -> player.at(20, 5).stats(6, 3, 3, 4, 9))).build();
        Game game = state.getGame();
        game.getOptions().addOption(new GameOptionBoolean(GameOptionId.ARGUE_THE_CALL).setValue(true));
        for (String id : new String[]{"one", "two"}) game.getGameResult().getPlayerResult(game.getPlayerById(id)).setHasUsedSecretWeapon(true);
        game.getFieldModel().setPlayerState(game.getPlayerById("two"), new PlayerState(PlayerState.KNOCKED_OUT));
        game.getFieldModel().setPlayerCoordinate(game.getPlayerById("two"), null);
        InducementTypeFactory factory = game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
        (home ? game.getTurnDataHome() : game.getTurnDataAway()).getInducementSet().addInducement(new Inducement(factory.forName("bribes"), 2));
        StepEndTurn step = new StepEndTurn(state);
        JsonObject saved = step.toJsonValue();
        IServerJsonOption.WITHIN_SECRET_WEAPON_HANDLING.addTo(saved, true);
        IServerJsonOption.TOUCHDOWN.addTo(saved, true);
        step.initFrom(game.getRules(), saved);
        state.getStepStack().push(step); StepEngine.start(state);
        return state;
    }
}
