package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApothecaryStunRecoveryTest {
    private final BrowserActionEvidence evidence = new BrowserActionEvidence(true);
    @Test void activeTeamSavedKoMissesTheEntireNextOwnTurn() throws Exception {
        GameState state = fixture();
        Game game = state.getGame();
        game.getTurnDataHome().setApothecaries(1);
        TestRolls.on(state).block("skull").armor(6, 6).injury(4, 4);
        perform(state, "selectBlock"); perform(state, "block"); perform(state, "blockDie");
        assertTrue(actions(state).stream().anyMatch(action -> action.id.startsWith("apothecary:")));
        performId(state, "apothecary:TEAM");
        assertFalse(game.isHomePlaying());
        assertStunnedOnPitch(game, "actor", new FieldCoordinate(7, 7));
        assertStunnedProjection(state, "actor");
        perform(state, "endTurn");
        assertTrue(game.isHomePlaying());
        assertStunnedOnPitch(game, "actor", new FieldCoordinate(7, 7));
        assertFalse(actions(state).stream().anyMatch(action -> "actor".equals(action.targetPlayerId)));
        perform(state, "endTurn");
        assertEquals(PlayerState.PRONE, game.getFieldModel().getPlayerState(game.getPlayerById("actor")).getBase());
        perform(state, "endTurn");
        assertTrue(game.getFieldModel().getPlayerState(game.getPlayerById("actor")).isActive());
    }

    @Test void inactiveTeamSavedKoRecoversOnlyAfterItsMissedTurn() throws Exception {
        GameState state = fixture();
        Game game = state.getGame();
        game.getTurnDataAway().setApothecaries(1);
        TestRolls.on(state).block("pow").armor(6, 6).injury(4, 4);
        perform(state, "selectBlock"); perform(state, "block"); perform(state, "blockDie");
        settlePush(state);
        FieldCoordinate square = game.getFieldModel().getPlayerCoordinate(game.getPlayerById("opponent"));
        performId(state, "apothecary:TEAM");
        assertStunnedOnPitch(game, "opponent", square);
        assertStunnedProjection(state, "opponent");
        perform(state, "endTurn");
        assertFalse(game.isHomePlaying());
        assertStunnedOnPitch(game, "opponent", square);
        perform(state, "endTurn");
        assertEquals(PlayerState.PRONE, game.getFieldModel().getPlayerState(game.getPlayerById("opponent")).getBase());
    }

    @Test void decliningApothecaryLeavesThePlayerKnockedOut() throws Exception {
        GameState state = fixture();
        Game game = state.getGame();
        game.getTurnDataHome().setApothecaries(1);
        TestRolls.on(state).block("skull").armor(6, 6).injury(4, 4);
        perform(state, "selectBlock"); perform(state, "block"); perform(state, "blockDie");
        performId(state, "apothecary:no");
        assertEquals(PlayerState.KNOCKED_OUT, game.getFieldModel().getPlayerState(game.getPlayerById("actor")).getBase());
        assertTrue(game.getFieldModel().getPlayerCoordinate(game.getPlayerById("actor")).isBoxCoordinate());
        assertEquals(1, game.getTurnDataHome().getApothecaries());
    }

    private void assertStunnedOnPitch(Game game, String id, FieldCoordinate square) {
        Player<?> player = game.getPlayerById(id);
        assertEquals(square, game.getFieldModel().getPlayerCoordinate(player));
        assertEquals(PlayerState.STUNNED, game.getFieldModel().getPlayerState(player).getBase());
        if (game.getActingTeam().hasPlayer(player)) {
            assertFalse(game.getFieldModel().getPlayerState(player).isActive());
        }
    }

    private void assertStunnedProjection(GameState state, String id) {
        for (String role : new String[] { "home", "away" }) {
            JsonObject view = evidence.snapshot(state, role).get("state").asObject();
            boolean found = false;
            for (JsonValue value : view.get("players").asArray()) {
                JsonObject player = value.asObject();
                if (id.equals(player.getString("id", null))) {
                    assertEquals("has been stunned", player.getString("state", null));
                    assertEquals("Stunned", player.getString("status", null));
                    assertEquals("pitch", player.getString("offPitch", null));
                    found = true;
                }
            }
            assertTrue(found);
        }
    }

    private GameState fixture() throws Exception {
        GameState state = new GameState(new TestServer().getServer()) {
            @Override public boolean usesLegacyPersistence() { return false; }
        };
        new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE)
            .withTeam(true, team -> {
                team.player("actor", player -> player.at(7, 7).stats(6, 3, 3, 4, 9));
                team.player("mate", player -> player.at(5, 2).stats(6, 3, 3, 4, 9));
            })
            .withTeam(false, team -> team.player("opponent", player -> player.at(8, 7).stats(6, 3, 3, 4, 9))).build();
        state.getGame().setHomePlaying(true);
        StepEngine.start(state);
        return state;
    }

    private List<Action> actions(GameState state) {
        List<Action> prompts = new CorePromptActions(state).actions();
        return prompts.isEmpty() ? new CoreTurnActions(state).actions() : prompts;
    }

    private void settlePush(GameState state) {
        for (int count = 0; count < 10; count++) {
            Action action = actions(state).stream().filter(item -> item.kind.equals("push") || item.id.equals("follow-up:no"))
                .findFirst().orElse(null);
            if (action == null) return;
            execute(state, action);
        }
        throw new AssertionError("Push decisions did not settle");
    }

    private void perform(GameState state, String kind) {
        execute(state, actions(state).stream().filter(action -> action.kind.equals(kind)).findFirst()
            .orElseThrow(() -> new AssertionError("Missing " + kind + " at " + state.getCurrentStep().getId())));
    }

    private void performId(GameState state, String id) {
        execute(state, actions(state).stream().filter(action -> action.id.equals(id)).findFirst()
            .orElseThrow(() -> new AssertionError("Missing " + id + " at " + state.getCurrentStep().getId())));
    }

    private void execute(GameState state, Action action) {
        evidence.perform(state, action);
    }
}
