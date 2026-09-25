package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CorePromptActions;
import com.fumbbl.ffb.server.match.CoreTurnActions;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.net.ReceivedCommand;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CoreTurnActionsTest {
    @Test void nativePushAndFollowupMoveBothPlayers() throws Exception {
        GameState state = fixture(true);
        TestRolls.on(state).block("pushback");
        perform(state, "selectBlock"); perform(state, "block");
        assertTrue(actions(state).stream().anyMatch(action -> action.label.contains("PUSH")));
        perform(state, "blockDie");
        Action push = find(state, "push");
        state.handleCommand(new ReceivedCommand(push.command, "home".equals(push.role)));
        perform(state, "followUp");
        assertEquals(new FieldCoordinate(8, 7), state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("home1")));
    }
    @Test void bothDownUsesNativeKnockdownsAndDoesNotOfferFurtherBlocks() throws Exception {
        GameState state = fixture(true);
        TestRolls.on(state).block("bothdown").armor(2, 2).armor(2, 2);
        perform(state, "selectBlock"); perform(state, "block"); perform(state, "blockDie");
        Game game = state.getGame();
        assertEquals(PlayerState.PRONE, game.getFieldModel().getPlayerState(game.getPlayerById("home1")).getBase());
        assertEquals(PlayerState.PRONE, game.getFieldModel().getPlayerState(game.getPlayerById("away1")).getBase());
        assertTrue(actions(state).stream().noneMatch(action -> "block".equals(action.kind)));
    }
    @Test void awayMovementUsesCanonicalProjectionAndTrustedRole() throws Exception {
        GameState state = fixture(false);
        state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("home1"), new FieldCoordinate(2, 2));
        perform(state, "select");
        Action move = actions(state).stream().filter(action -> action.kind.equals("move") && !action.label.contains("dodge")).findFirst().get();
        String before = state.toJsonValue().toString();
        actions(state); actions(state);
        assertEquals(before, state.toJsonValue().toString());
        FieldCoordinate from = state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("away1"));
        state.handleCommand(new ReceivedCommand(move.command, false));
        FieldCoordinate to = state.getGame().getFieldModel().getPlayerCoordinate(state.getGame().getPlayerById("away1"));
        assertTrue(to.isAdjacent(from));
    }
    @Test void pronePlayerCanStandAndBlitzerCanDeclareAdjacentTarget() throws Exception {
        GameState state = fixture(true);
        state.getGame().getFieldModel().setPlayerState(state.getGame().getPlayerById("home1"), new PlayerState(PlayerState.PRONE).changeActive(true));
        perform(state, "stand");
        assertTrue(state.getGame().getActingPlayer().isStandingUp() || state.getGame().getFieldModel().getPlayerState(state.getGame().getPlayerById("home1")).isStanding());
        state = fixture(true);
        perform(state, "blitz"); perform(state, "blitzTarget");
        assertTrue(actions(state).stream().anyMatch(action -> action.kind.equals("block")));
    }
    @Test void failedDodgeOffersTeamRerollAndUsesItOnce() throws Exception {
        GameState state = fixture(true);
        state.getGame().getTurnDataHome().setReRolls(2);
        TestRolls.on(state).general(1, 6);
        perform(state, "select");
        Action move = find(state, "move");
        state.handleCommand(new ReceivedCommand(move.command, true));
        Action reroll = actions(state).stream().filter(action -> action.id.equals("reroll:team")).findFirst()
            .orElseThrow(() -> new AssertionError("Missing team reroll at " + state.getCurrentStep().getId()));
        state.handleCommand(new ReceivedCommand(reroll.command, true));
        assertEquals(1, state.getGame().getTurnDataHome().getReRolls());
        assertTrue(actions(state).stream().noneMatch(action -> action.id.equals("reroll:team")));
    }

    @Test void blitzCanDeclareReachableNonAdjacentTarget() throws Exception {
        GameState state = fixture(true);
        state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("away1"), new FieldCoordinate(11, 7));
        perform(state, "blitz");
        perform(state, "blitzTarget");
        assertEquals("away1", state.getGame().getFieldModel().getTargetSelectionState().getSelectedPlayerId());
        assertTrue(actions(state).stream().anyMatch(action -> "move".equals(action.kind)));
    }
    @Test void continuousBlitzPublishesConsistentActorAndSpectatorCheckpoints() throws Exception {
        GameState state = fixture(true);
        state.getGame().getFieldModel().setWeather(Weather.NICE);
        state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("away1"), new FieldCoordinate(11, 7));
        SetupSession session = new SetupSessionTest().session(11);
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        field.set(session, state);
        JsonArray frames = new JsonArray();
        capture(session, frames, "ready");
        submit(session, "blitz", null);
        capture(session, frames, "declared");
        submit(session, "blitzTarget", null);
        capture(session, frames, "target-selected");
        for (int x = 8; x <= 10; x++) {
            submit(session, "move", x);
            capture(session, frames, "moved-" + x);
        }
        TestRolls.on(state).block("pushback");
        submit(session, "block", null);
        capture(session, frames, "block-dice");
        submit(session, "blockDie", null);
        capture(session, frames, "push-choice");
        Files.createDirectories(Paths.get("target"));
        Files.write(Paths.get("target", "m5a-blitz-projections.json"), frames.toString().getBytes(StandardCharsets.UTF_8));
        assertEquals(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures", "m5a-blitz-projections.json")), StandardCharsets.UTF_8), frames.toString());
    }

    private void capture(SetupSession session, JsonArray frames, String checkpoint) {
        JsonObject actor = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
        JsonObject spectator = session.spectatorView();
        assertEquals(actor.get("revision"), spectator.get("revision"));
        assertEquals(actor.get("players"), spectator.get("players"));
        assertEquals(actor.get("ball"), spectator.get("ball"));
        assertEquals(actor.get("phase"), spectator.get("phase"));
        assertEquals(0, spectator.get("actions").asArray().size());
        assertTrue(spectator.get("prompt").isNull());
        actor.set("matchId", "00000000-0000-0000-0000-000000000001");
        spectator.set("matchId", "00000000-0000-0000-0000-000000000001");
        frames.add(new JsonObject().add("checkpoint", checkpoint).add("actor", actor).add("spectator", spectator));
    }

    private void submit(SetupSession session, String kind, Integer targetX) {
        JsonObject view = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
        JsonObject selected = null;
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (!kind.equals(action.getString("kind", null))) continue;
            if (targetX != null && !action.getString("id", "").endsWith("move-" + targetX + "-7")) continue;
            selected = action;
            break;
        }
        assertTrue(selected != null, "Missing " + kind + " at " + view);
        JsonObject request = new JsonObject().add("version", 1).add("type", "setup").add("operation", "action")
            .add("requestId", UUID.randomUUID().toString()).add("matchId", view.get("matchId"))
            .add("expectedRevision", view.get("revision")).add("actionId", selected.get("id"));
        assertEquals("ACCEPTED", session.apply("home", request).getString("code", null));
    }
    @Test void rushFailureOffersNativeDecision() throws Exception {
        GameState state = fixture(true);
        state.getGame().getFieldModel().setPlayerCoordinate(state.getGame().getPlayerById("away1"), new FieldCoordinate(20, 7));
        state.getGame().getTurnDataHome().setReRolls(2);
        perform(state, "select");
        state.getGame().getActingPlayer().setCurrentMove(6);
        state.getGame().getActingPlayer().setGoingForIt(true);
        com.fumbbl.ffb.server.util.UtilServerPlayerMove.updateMoveSquares(state, false);
        TestRolls.on(state).general(1, 6);
        Action rush = actions(state).stream().filter(action -> action.label.contains("rush")).findFirst().get();
        state.handleCommand(new ReceivedCommand(rush.command, true));
        assertTrue(actions(state).stream().anyMatch(action -> action.id.equals("reroll:team")));
    }

    @Test void nativeSkillPromptRetainsModifyingAlternativeAndNeverUseFlag() throws Exception {
        GameState state = fixture(true);
        com.fumbbl.ffb.model.skill.Skill primary = state.getGame().getRules().getSkillFactory().forName("Block");
        com.fumbbl.ffb.model.skill.Skill modifier = state.getGame().getRules().getSkillFactory().forName("Dodge");
        state.getGame().setDialogParameter(new com.fumbbl.ffb.dialog.DialogSkillUseParameter("away1", primary, 0, modifier));
        List<Action> choices = actions(state);
        assertEquals(3, choices.size());
        Action modifying = choices.stream().filter(action -> action.id.equals("skill:modify")).findFirst().get();
        assertEquals("away", modifying.role);
        assertEquals(modifier, ((com.fumbbl.ffb.net.commands.ClientCommandUseSkill) modifying.command).getSkill());
        state.getGame().setDialogParameter(new com.fumbbl.ffb.dialog.DialogSkillUseParameter("home1", primary, 0, true));
        Action never = actions(state).stream().filter(action -> action.id.equals("skill:never")).findFirst().get();
        assertTrue(((com.fumbbl.ffb.net.commands.ClientCommandUseSkill) never.command).isNeverUse());
    }

    private GameState fixture(boolean home) throws Exception {
        GameState state = new GameState(new TestServer().getServer()) { @Override public boolean usesLegacyPersistence() { return false; } };
        new GameStateBuilder(state).withRule("BB2025")
            .withTeam(true, team -> team.player("home1", p -> p.at(7, 7).stats(6, 3, 3, 5, 8)))
            .withTeam(false, team -> team.player("away1", p -> p.at(8, 7).stats(6, 3, 3, 5, 8))).build();
        state.getGame().setHomePlaying(home);
        StepEngine.start(state);
        return state;
    }
    private List<Action> actions(GameState state) {
        List<Action> actions = new CorePromptActions(state).actions();
        return actions.isEmpty() ? new CoreTurnActions(state).actions() : actions;
    }
    private Action find(GameState state, String kind) {
        return actions(state).stream().filter(action -> kind.equals(action.kind)).findFirst()
            .orElseThrow(() -> new AssertionError("Missing " + kind + " at " + state.getCurrentStep().getId() + " dialog " + state.getGame().getDialogParameter()));
    }
    private void perform(GameState state, String kind) {
        Action action = find(state, kind);
        state.handleCommand(new ReceivedCommand(action.command, "home".equals(action.role)));
    }
}
