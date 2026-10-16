package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.bb2025.block.StepEndBlocking;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NativeRuleFlowTest {
    @Test void actualGetTheRefKickoffPublishesBothBribesDuringTheLiveTurn() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        nativeState(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
        JsonObject view = fixture.advanceToTurn();
        assertEquals(1, view.get("homeResources").asObject().getInt("bribes", -1));
        assertEquals(1, view.get("awayResources").asObject().getInt("bribes", -1));
    }

    @Test void completedBlockOffersHitAndRunSquaresDirectlyAndResumesAfterEitherCoachChooses() throws Exception {
        for (boolean home : new boolean[] {true, false}) {
            SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
            nativeState(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
            fixture.advanceToTurn();
            GameState state = nativeState(fixture.session);
            Game game = state.getGame();
            game.setHomePlaying(home);
            Player<?> player = game.getActingTeam().getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            place(game, player, 7, 7, PlayerState.MOVING);
            Player<?> defender = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            place(game, defender, 9, 7, PlayerState.STANDING);
            game.setDefenderId(defender.getId());
            ((RosterPlayer) player).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName("Hit and Run"));
            game.getActingPlayer().setPlayerId(player.getId());
            game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(20, 7));
            state.pushCurrentStepOnStack();
            StepEndBlocking endBlocking = new StepEndBlocking(state);
            endBlocking.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
            state.getStepStack().push(endBlocking);
            state.startNextStep();
            assertNull(game.getDialogParameter(), "Hit and Run must not ask whether to use the skill first");
            assertEquals(TurnMode.HIT_AND_RUN, game.getTurnMode(),
                "Completing the block must show destination arrows immediately, without a skill-use dialog");
            String role = home ? "home" : "away";
            JsonObject view = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
            JsonObject square = action(view, "hitAndRun");
            assertNotNull(square, "Hit and Run must offer a selectable destination: " + view.get("actions"));
            JsonObject legacy = JsonObject.readFrom(fixture.session.recoveryArtifact());
            for (String seat : new String[] { "homeView", "awayView" })
                legacy.get("payload").asObject().get(seat).asObject().set("actions", new JsonArray());
            StringBuilder checksum = new StringBuilder();
            for (byte value : MessageDigest.getInstance("SHA-256").digest(legacy.get("payload").toString().getBytes(StandardCharsets.UTF_8)))
                checksum.append(String.format("%02x", value & 255));
            legacy.set("sha256", checksum.toString());
            SetupSession restored = new SetupSession(fixture.server, fixture.document, legacy.toString());
            JsonObject resumed = restored.reply("load", "ACCEPTED", false, role).get("state").asObject();
            assertNotNull(action(resumed, "hitAndRun"));
            JsonObject declined = restored.apply(role, fixture.request("action", "decline-hit-run", resumed)
                .add("actionId", action(resumed, "hitAndRunDecline").get("id"))).get("state").asObject();
            assertEquals("REGULAR", declined.getString("turnMode", null));
            assertEquals(new FieldCoordinate(7, 7), nativeState(restored).getGame().getFieldModel()
                .getPlayerCoordinate(nativeState(restored).getGame().getPlayerById(player.getId())));
            JsonObject target = square.get("target").asObject();
            JsonObject accepted = fixture.session.apply(role, fixture.request("action", "hit-run", view)
                .add("actionId", square.get("id")));
            assertEquals("ACCEPTED", accepted.getString("code", null));
            assertEquals(new FieldCoordinate(target.getInt("x", -1), target.getInt("y", -1)),
                game.getFieldModel().getPlayerCoordinate(player));
            assertEquals(TurnMode.REGULAR, game.getTurnMode());
            assertFalse(state.getCurrentStep().getId() == StepId.HIT_AND_RUN);
            assertTrue(accepted.get("state").asObject().get("actions").asArray().size() > 0);
        }
    }

    @Test void stunnedPlayersRemainStunnedThroughoutTheirTurnAndRecoverAtItsEnd() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        nativeState(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
        JsonObject view = fixture.advanceToTurn();
        Game game = nativeState(fixture.session).getGame();
        Player<?> oldStun = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        Player<?> newStun = game.getOtherTeam(game.getActingTeam()).getPlayers()[1];
        place(game, oldStun, 6, 6, PlayerState.STUNNED);
        place(game, newStun, 6, 8, PlayerState.STANDING);
        view = endTurn(fixture, view, "opponent-end");
        assertEquals(PlayerState.STUNNED, game.getFieldModel().getPlayerState(oldStun).getBase(),
            "A stunned player stays face down during the missed turn");
        assertFalse(game.getFieldModel().getPlayerState(oldStun).isActive());
        for (JsonValue value : view.get("actions").asArray())
            assertFalse(JsonValue.valueOf(oldStun.getId()).equals(value.asObject().get("sourcePlayerId")));
        place(game, newStun, 6, 8, PlayerState.STUNNED);
        view = fixture.session.reply("load", "ACCEPTED", false, view.getString("actor", null)).get("state").asObject();
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        JsonObject restoredView = restored.reply("load", "ACCEPTED", false, view.getString("actor", null)).get("state").asObject();
        JsonObject end = action(restoredView, "endTurn");
        JsonObject after = restored.apply(restoredView.getString("actor", null), fixture.request("action", "own-end", restoredView)
            .add("actionId", end.get("id"))).get("state").asObject();
        Game recovered = nativeState(restored).getGame();
        assertEquals(PlayerState.PRONE, recovered.getFieldModel().getPlayerState(recovered.getPlayerById(oldStun.getId())).getBase());
        assertEquals(PlayerState.STUNNED, recovered.getFieldModel().getPlayerState(recovered.getPlayerById(newStun.getId())).getBase(),
            "A player stunned during this turn must still miss its next turn");
        after = endTurn(fixture, restored, after, "next-opponent-end");
        assertEquals(PlayerState.STUNNED, recovered.getFieldModel().getPlayerState(recovered.getPlayerById(newStun.getId())).getBase());
        assertTrue(recovered.getFieldModel().getPlayerState(recovered.getPlayerById(oldStun.getId())).isActive());
        endTurn(fixture, restored, after, "next-own-end");
        assertEquals(PlayerState.PRONE, recovered.getFieldModel().getPlayerState(recovered.getPlayerById(newStun.getId())).getBase());
    }

    private JsonObject endTurn(SetupSessionMovementTest.Fixture fixture, JsonObject view, String id) {
        return endTurn(fixture, fixture.session, view, id);
    }

    private JsonObject endTurn(SetupSessionMovementTest.Fixture fixture, SetupSession session, JsonObject view, String id) {
        view = session.reply("load", "ACCEPTED", false, view.getString("actor", null)).get("state").asObject();
        return session.apply(view.getString("actor", null), fixture.request("action", id, view)
            .add("actionId", action(view, "endTurn").get("id"))).get("state").asObject();
    }

    private JsonObject action(JsonObject view, String kind) {
        for (JsonValue value : view.get("actions").asArray())
            if (kind.equals(value.asObject().getString("kind", null))) return value.asObject();
        return null;
    }

    private void place(Game game, Player<?> player, int x, int y, int base) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(base).changeActive(true));
    }

    private GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        return (GameState) field.get(session);
    }
}
