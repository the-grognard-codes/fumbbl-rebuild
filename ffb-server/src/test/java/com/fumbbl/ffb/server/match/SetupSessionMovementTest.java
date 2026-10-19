package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameCache;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.net.SessionManager;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;
import com.fumbbl.ffb.util.UtilBox;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupSessionMovementTest {
    @Test void plannedTransfersValidateTheEndpointWithoutChangingTheGameAndExecuteOnce() throws Exception {
        JsonArray journeys = new JsonArray();
        for (String kind : new String[] {"pass", "handOff"}) for (boolean loose : new boolean[] {false, true})
            for (boolean moving : new boolean[] {false, true}) {
            if (loose && !moving) continue;
            BallFixture ball = new BallFixture(loose, "pass".equals(kind) ? 12 : moving ? 9 : 8, moving ? 7 : 8, 0);
            JsonObject ready = ball.ready();
            String checkpoint = ball.fixture.session.recoveryArtifact();
            String nativeBefore = nativeState(ball.fixture.session).toJsonValue(true, 0).toString();
            JsonArray waypoints = moving ? points(8, 7) : new JsonArray();
            JsonObject plan = ball.fixture.session.movementPreview(ball.role, ready.getInt("revision", -1),
                ball.source.getId(), kind, ball.target.getId(), waypoints);
            assertEquals(checkpoint, ball.fixture.session.recoveryArtifact());
            assertEquals(nativeBefore, nativeState(ball.fixture.session).toJsonValue(true, 0).toString());
            FieldCoordinate endpoint = new FieldCoordinate(moving ? 8 : 7, 7);
            String alternateKind = endpoint.isAdjacent(ball.game.getFieldModel().getPlayerCoordinate(ball.alternate)) ? "handOff" : "pass";
            JsonObject alternatePlan = ball.fixture.session.movementPreview(ball.role, ready.getInt("revision", -1),
                ball.source.getId(), alternateKind, ball.alternate.getId(), waypoints);
            forceGeneralRolls(ball.fixture.session, 6, 6, 6, 6, 6, 6);
            JsonObject request = ball.request(ready, kind, waypoints);
            JsonObject accepted = ball.fixture.session.apply(ball.role, request);
            assertTrue(UtilPlayer.hasBall(ball.game, ball.target), accepted.toString());
            assertTrue(ball.fixture.session.apply(ball.role, request).getBoolean("duplicate", false));
            SetupSession restored = new SetupSession(ball.fixture.server, ball.fixture.document, ball.fixture.session.recoveryArtifact());
            assertTrue(restored.apply(ball.role, request).getBoolean("duplicate", false));
            assertTrue(JsonObject.readFrom(restored.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
            journeys.add(new JsonObject().add("kind", kind).add("loose", loose).add("moving", moving).add("sourceId", ball.source.getId())
                .add("targetId", ball.target.getId()).add("alternateId", ball.alternate.getId()).add("ready", ready)
                .add("plan", plan).add("alternatePlan", alternatePlan).add("movePlan",
                    new JsonObject().add("planVersion", 1).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
                        .add("waypoints", waypoints).add("route", plan.get("route")))
                .add("accepted", accepted.get("state")));
        }
        String output = System.getProperty("transfer.fixture");
        if (output != null) Files.write(Paths.get(output), journeys.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Test void stationaryTransfersDoNotInventMovement() throws Exception {
        for (String kind : new String[] {"pass", "handOff"}) {
            BallFixture ball = new BallFixture(false, "pass".equals(kind) ? 12 : 8, 8, 0);
            JsonObject ready = ball.ready();
            JsonObject plan = ball.fixture.session.movementPreview(ball.role, ready.getInt("revision", -1),
                ball.source.getId(), kind, ball.target.getId(), new JsonArray());
            assertTrue(plan.get("route").asObject().get("steps").asArray().isEmpty());
            forceGeneralRolls(ball.fixture.session, 6, 6, 6, 6);
            ball.fixture.session.apply(ball.role, ball.request(ready, kind, new JsonArray()));
            assertEquals(new FieldCoordinate(7, 7), ball.game.getFieldModel().getPlayerCoordinate(ball.source));
            assertTrue(UtilPlayer.hasBall(ball.game, ball.target));
        }
    }

    @Test void intermediateGeneratedSquaresCanPickUpTheBallAndFailureCausesTheNormalTurnover() throws Exception {
        for (boolean success : new boolean[] {false, true}) {
            BallFixture ball = new BallFixture(true, 10, 7, 0);
            // Force ordinary pathfinding through the one open square in this column.
            // Two nearby blockers still permit a longer, safer route around the loose ball.
            int row = 0;
            for (Player<?> blocker : ball.game.getPlayers()) {
                if (blocker == ball.source || blocker == ball.target) continue;
                if (row == 7) row++;
                if (row >= 15) break;
                place(ball.game, blocker, 8, row++, PlayerState.PRONE);
            }
            JsonObject ready = ball.ready();
            JsonObject plan = ball.fixture.session.movementPreview(ball.role, ready.getInt("revision", -1),
                ball.source.getId(), "handOff", ball.target.getId(), points(9, 7));
            assertEquals(2, plan.get("route").asObject().get("steps").asArray().size());
            assertEquals(8, plan.get("route").asObject().get("steps").asArray().get(0).asObject().getInt("x", -1));
            forceGeneralRolls(ball.fixture.session, success ? 6 : 1, 6, 6, 6, 6, 6);
            JsonObject after = ball.fixture.session.apply(ball.role, ball.request(ready, "handOff", points(9, 7))).get("state").asObject();
            // The captain can still offer Pro when the team has no rerolls.
            if (!success && hasAction(after, "reroll")) after = chooseReroll(ball.fixture.session, ball.role, after, "none");
            assertEquals(success, UtilPlayer.hasBall(ball.game, ball.target));
            if (!success) assertFalse(ball.role.equals(after.getString("actor", null)), "Failed pickup turns over normally: " + after);
            assertTrue(JsonObject.readFrom(ball.fixture.session.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
        }
    }

    @Test void explicitPassStillAllowsAnAdjacentReceiverAndCannotAcquireAnImpliedTransfer() throws Exception {
        BallFixture ball = new BallFixture(false, 8, 8, 0);
        JsonObject ready = ball.ready();
        JsonObject declaration = offered(ready, "declarePass", ball.source.getId());
        JsonObject active = ball.fixture.session.apply(ball.role, ball.fixture.request("action", "explicit-pass", ready)
            .add("actionId", declaration.get("id"))).get("state").asObject();
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            active.getInt("revision", -1), ball.source.getId(), "handOff", ball.target.getId(), new JsonArray()));
        JsonObject pass = null;
        for (JsonValue value : active.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if ("pass".equals(action.getString("kind", null)) && action.get("target").isObject()
                && action.get("target").asObject().getInt("x", -1) == 8
                && action.get("target").asObject().getInt("y", -1) == 8) pass = action;
        }
        assertTrue(pass != null);
        forceGeneralRolls(ball.fixture.session, 6, 6, 6, 6);
        ball.fixture.session.apply(ball.role, ball.fixture.request("action", "adjacent-pass", active).add("actionId", pass.get("id")));
        assertTrue(UtilPlayer.hasBall(ball.game, ball.target));
    }

    @Test void invalidImpliedTransfersRejectWithoutDeclaringOrChangingTheRoute() throws Exception {
        BallFixture ball = new BallFixture(true, 9, 7, 0);
        JsonObject ready = ball.ready();
        String checkpoint = ball.fixture.session.recoveryArtifact();
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            ready.getInt("revision", -1), ball.source.getId(), "handOff", ball.target.getId(), points(7, 8)));
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            ready.getInt("revision", -1), ball.source.getId(), "pass", ball.target.getId(), points(8, 7)));
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            ready.getInt("revision", -1), ball.source.getId(), "handOff", ball.source.getId(), points(8, 7)));
        assertEquals(checkpoint, ball.fixture.session.recoveryArtifact());
        ball.game.getTurnData().setHandOverUsed(true);
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            ready.getInt("revision", -1), ball.source.getId(), "handOff", ball.target.getId(), points(8, 7)));
        ball.game.getTurnData().setHandOverUsed(false);
        ball.game.getFieldModel().setPlayerState(ball.target, new PlayerState(PlayerState.PRONE));
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            ready.getInt("revision", -1), ball.source.getId(), "handOff", ball.target.getId(), points(8, 7)));
        place(ball.game, ball.target, 25, 14, PlayerState.STANDING);
        assertThrows(MatchService.Failure.class, () -> ball.fixture.session.movementPreview(ball.role,
            ready.getInt("revision", -1), ball.source.getId(), "pass", ball.target.getId(), points(8, 7)));
    }

    @Test void pickupRerollResumesConfirmedTransferAcrossRecoveryAndDeclineCancelsIt() throws Exception {
        for (String kind : new String[] {"pass", "handOff"}) {
            BallFixture ball = new BallFixture(true, "pass".equals(kind) ? 12 : 9, 7, 1);
            JsonObject ready = ball.ready();
            forceGeneralRolls(ball.fixture.session, 1, 6, 6, 6, 6, 6, 6);
            JsonObject request = ball.request(ready, kind, points(8, 7));
            JsonObject paused = ball.fixture.session.apply(ball.role, request).get("state").asObject();
            assertTrue(hasAction(paused, "reroll"), paused.toString());
            String checkpoint = ball.fixture.session.recoveryArtifact();
            SetupSession declined = new SetupSession(ball.fixture.server, ball.fixture.document, checkpoint);
            chooseReroll(declined, ball.role, paused, "none");
            assertTrue(JsonObject.readFrom(declined.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
            assertFalse(UtilPlayer.hasBall(nativeState(declined).getGame(),
                nativeState(declined).getGame().getPlayerById(ball.target.getId())));
            SetupSession resumed = new SetupSession(ball.fixture.server, ball.fixture.document, checkpoint);
            assertTrue(resumed.apply(ball.role, request).getBoolean("duplicate", false));
            chooseReroll(resumed, ball.role, paused, "team");
            Game game = nativeState(resumed).getGame();
            assertTrue(UtilPlayer.hasBall(game, game.getPlayerById(ball.target.getId())));
            assertTrue(JsonObject.readFrom(resumed.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
        }
    }

    @Test void anInvalidatedRecipientOrDisplacedMoverCancelsTheConfirmedTransfer() throws Exception {
        for (boolean displaced : new boolean[] {false, true}) {
            BallFixture ball = new BallFixture(true, 10, 7, 1);
            JsonObject ready = ball.ready();
            forceGeneralRolls(ball.fixture.session, 1, 6, 6, 6, 6, 6);
            JsonArray path = points(8, 7).add(new JsonObject().add("x", 9).add("y", 7));
            JsonObject paused = ball.fixture.session.apply(ball.role, ball.request(ready, "handOff", path)).get("state").asObject();
            assertTrue(hasAction(paused, "reroll"), paused.toString());
            if (displaced) ball.game.getFieldModel().setPlayerCoordinate(ball.source, new FieldCoordinate(6, 7));
            else ball.game.getFieldModel().setPlayerState(ball.target, new PlayerState(PlayerState.PRONE));
            chooseReroll(ball.fixture.session, ball.role, paused, "team");
            assertFalse(UtilPlayer.hasBall(ball.game, ball.target));
            assertTrue(JsonObject.readFrom(ball.fixture.session.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
        }
    }

    private final class BallFixture {
        final Fixture fixture;
        final Game game;
        final Player<?> source, target, alternate;
        final String role;

        BallFixture(boolean loose, int targetX, int targetY, int rerolls) throws Exception {
            fixture = new Fixture(rerolls);
            role = fixture.advanceToTurn().getString("actor", null);
            game = nativeState(fixture.session).getGame();
            source = game.getActingTeam().getPlayers()[0];
            target = game.getActingTeam().getPlayers()[1];
            alternate = game.getActingTeam().getPlayers()[2];
            UtilBox.putAllPlayersIntoBox(game);
            place(game, source, 7, 7, PlayerState.STANDING);
            place(game, target, targetX, targetY, PlayerState.STANDING);
            place(game, alternate, targetX >= 12 ? 9 : 12, targetX >= 12 ? 8 : 9, PlayerState.STANDING);
            game.getTurnData().setPassUsed(false);
            game.getTurnData().setHandOverUsed(false);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(loose ? 8 : 7, 7));
            game.getFieldModel().setBallMoving(loose);
            game.getFieldModel().setBallInPlay(true);
        }

        JsonObject ready() { return fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }

        JsonObject request(JsonObject ready, String kind, JsonArray points) {
            return fixture.request("movement", "planned-transfer", ready).add("playerId", source.getId())
                .add("kind", kind).add("targetPlayerId", target.getId()).add("waypoints", points);
        }
    }

    @Test void passAndHandOffCanBeDeclaredBeforeTheLooseBallIsPickedUp() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> passer = game.getActingTeam().getPlayers()[0];
        Player<?> next = game.getActingTeam().getPlayers()[1];
        Player<?> opponent = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, passer, 7, 7, PlayerState.STANDING);
        place(game, next, 4, 4, PlayerState.STANDING);
        place(game, opponent, 16, 7, PlayerState.STANDING);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(5, 5));
        game.getFieldModel().setBallMoving(false);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();

        JsonObject pass = offered(ready, "declarePass", passer.getId());
        assertTrue(pass != null, ready.toString());
        assertTrue(offered(ready, "declareHandOff", passer.getId()) != null, ready.toString());
        JsonObject accepted = fixture.session.apply(role, fixture.request("action", "pass-before-pickup", ready)
            .add("actionId", pass.getString("id", null)));
        assertEquals("ACCEPTED", accepted.getString("code", null));
        JsonObject active = accepted.get("state").asObject();
        assertTrue(active.getString("activePlayerAction", "").length() > 0, active.toString());
        assertTrue(menuHas(active, passer.getId(), "declarePass", true), active.toString());
        game.getTurnData().setPassUsed(false);
        JsonObject reserved = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertTrue(menuHas(reserved, passer.getId(), "declarePass", true), reserved.toString());
        assertTrue(menuHas(reserved, next.getId(), "declarePass", true), reserved.toString());
        assertFalse(hasAction(reserved, "declarePass"));
        assertThrows(MatchService.Failure.class, () -> fixture.session.apply(role,
            fixture.request("action", "reserved-pass-rejected", reserved).add("actionId", reserved.getInt("revision", -1)
                + ":declarePass-" + next.getId())));
    }

    @Test void playerActionMenuMarksSpentDeclarationsAndKeepsThemOutOfExecutableActions() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> player = game.getActingTeam().getPlayers()[0];
        Player<?> opponent = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, player, 7, 7, PlayerState.STANDING);
        place(game, opponent, 15, 7, PlayerState.STANDING);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(5, 5));
        game.getFieldModel().setBallMoving(false);
        game.getTurnData().setBlitzUsed(true);
        game.getTurnData().setPassUsed(true);
        game.getTurnData().setHandOverUsed(true);
        game.getTurnData().setFoulUsed(true);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();

        assertTrue(menuHas(ready, player.getId(), "blitz", true), ready.toString());
        assertTrue(menuHas(ready, player.getId(), "declarePass", true), ready.toString());
        assertTrue(menuHas(ready, player.getId(), "declareHandOff", true), ready.toString());
        assertTrue(menuHas(ready, player.getId(), "declareFoul", true), ready.toString());
        assertTrue(menuHas(ready, player.getId(), "selectBlock", false), ready.toString());
        assertFalse(hasAction(ready, "blitz"));
        assertFalse(hasAction(ready, "declarePass"));
        assertFalse(hasAction(ready, "declareHandOff"));
        assertFalse(hasAction(ready, "declareFoul"));
        JsonObject spentState = ready;
        assertThrows(MatchService.Failure.class, () -> fixture.session.apply(role,
            fixture.request("action", "spent-pass-rejected", spentState).add("actionId", spentState.getInt("revision", -1)
                + ":declarePass-" + player.getId())));
    }

    @Test void nativeBlockPreviewIncludesAssistsAndBlitzEndpointWithoutChangingLiveState() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?> attacker = game.getActingTeam().getPlayers()[0];
        Player<?> helper = game.getActingTeam().getPlayers()[1];
        Player<?> defender = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        clearBlockPreviewKickoffEffects(nativeState(fixture.session));
        UtilBox.putAllPlayersIntoBox(game);
        place(game, attacker, 7, 7, PlayerState.STANDING);
        place(game, helper, 9, 8, PlayerState.STANDING);
        place(game, defender, 8, 7, PlayerState.STANDING);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
        game.getFieldModel().setBallMoving(true);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(2, blockPreviewDice(ready, attacker.getId(), defender.getId()));
        String checkpoint = fixture.session.recoveryArtifact();
        String nativeBefore = nativeState(fixture.session).toJsonValue(true, 0).toString();
        fixture.session.spectatorView();
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertEquals(nativeBefore, nativeState(fixture.session).toJsonValue(true, 0).toString());

        place(game, helper, 20, 8, PlayerState.STANDING);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(1, blockPreviewDice(ready, attacker.getId(), defender.getId()));

        place(game, attacker, 6, 7, PlayerState.STANDING);
        place(game, helper, 9, 8, PlayerState.STANDING);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        checkpoint = fixture.session.recoveryArtifact();
        nativeBefore = nativeState(fixture.session).toJsonValue(true, 0).toString();
        JsonObject plan = fixture.session.movementPreview(role, ready.getInt("revision", -1), attacker.getId(),
            "blitz", defender.getId(), points(7, 7));
        assertEquals(2, plan.getInt("blockDice", 0));
        assertEquals(new FieldCoordinate(6, 7), game.getFieldModel().getPlayerCoordinate(attacker));
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertEquals(nativeBefore, nativeState(fixture.session).toJsonValue(true, 0).toString());
        JsonObject move = fixture.session.movementPreview(role, ready.getInt("revision", -1), attacker.getId(),
            "move", null, points(7, 7));
        assertFalse(move.names().contains("blockDice"));
    }

    private int blockPreviewDice(JsonObject state, String attackerId, String defenderId) {
        for (JsonValue value : state.get("blockPreview").asObject().get("rolls").asArray()) {
            JsonObject roll = value.asObject();
            if (attackerId.equals(roll.getString("playerId", null))
                && defenderId.equals(roll.getString("targetPlayerId", null))) return roll.getInt("dice", 0);
        }
        throw new AssertionError("Missing block preview for " + attackerId + " against " + defenderId);
    }

    private void clearBlockPreviewKickoffEffects(GameState state) {
        Game game = state.getGame();
        // These fixtures count on-pitch assists only, independently of random kickoff bonuses.
        state.removeAdditionalAssist(game.getTeamHome().getId());
        state.removeAdditionalAssist(game.getTeamAway().getId());
        game.getTurnDataHome().setCheeringFansBlockAssist(0);
        game.getTurnDataAway().setCheeringFansBlockAssist(0);
        for (Player<?> player : game.getPlayers())
            game.getFieldModel().removeSkillEnhancements(player, KickoffResult.DODGY_SNACK.getName());
    }

    @Test void blockPreviewKeepsThreeDiceAndOpponentChoiceSigned() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?>[] own = game.getActingTeam().getPlayers();
        Player<?>[] opponents = game.getOtherTeam(game.getActingTeam()).getPlayers();
        clearBlockPreviewKickoffEffects(nativeState(fixture.session));
        UtilBox.putAllPlayersIntoBox(game);
        place(game, own[0], 7, 7, PlayerState.STANDING);
        place(game, opponents[0], 8, 7, PlayerState.STANDING);
        int[][] attackingAssists = { { 9, 6 }, { 9, 7 }, { 9, 8 }, { 8, 6 } };
        for (int i = 0; i < attackingAssists.length; i++)
            place(game, own[i + 1], attackingAssists[i][0], attackingAssists[i][1], PlayerState.STANDING);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(3, blockPreviewDice(ready, own[0].getId(), opponents[0].getId()));

        UtilBox.putAllPlayersIntoBox(game);
        place(game, own[0], 7, 7, PlayerState.STANDING);
        place(game, opponents[0], 8, 7, PlayerState.STANDING);
        int[][] defendingAssists = { { 6, 6 }, { 6, 7 }, { 6, 8 }, { 7, 6 }, { 7, 8 }, { 8, 8 } };
        for (int i = 0; i < defendingAssists.length; i++)
            place(game, opponents[i + 1], defendingAssists[i][0], defendingAssists[i][1], PlayerState.STANDING);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(-3, blockPreviewDice(ready, own[0].getId(), opponents[0].getId()));

        UtilBox.putAllPlayersIntoBox(game);
        place(game, own[0], 7, 7, PlayerState.STANDING);
        place(game, opponents[0], 8, 7, PlayerState.STANDING);
        place(game, opponents[1], 6, 7, PlayerState.STANDING);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(-2, blockPreviewDice(ready, own[0].getId(), opponents[0].getId()));

        // Cheering Fans supplies the extra attacking assist that turns this uphill block into one die.
        GameState nativeGame = nativeState(fixture.session);
        nativeGame.setTeamIdsAdditionalAssist(Collections.singleton(game.getActingTeam().getId()));
        game.getTurnData().setCheeringFansBlockAssist(1);
        String checkpoint = fixture.session.recoveryArtifact();
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(1, blockPreviewDice(ready, own[0].getId(), opponents[0].getId()));
        assertEquals(1, nativeGame.getAdditionalAssist(game.getActingTeam().getId()));
        assertEquals(checkpoint, fixture.session.recoveryArtifact(), "Previewing must not consume the kickoff assist");
    }

    @Test void anotherPlayerCanDeclareWithoutExplicitlyEndingTheCurrentActivation() {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        JsonObject first = null, second = null;
        for (JsonValue value : ready.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (!"select".equals(action.getString("kind", null))) continue;
            if (first == null) first = action;
            else { second = action; break; }
        }
        assertTrue(first != null && second != null);
        JsonObject active = fixture.session.apply(role, fixture.request("action", "first-player", ready)
            .add("actionId", first.get("id"))).get("state").asObject();
        String nextId = second.getString("sourcePlayerId", null);
        assertTrue(active.get("actions").asArray().values().stream().anyMatch(value ->
            "select".equals(value.asObject().getString("kind", null))
                && nextId.equals(value.asObject().getString("sourcePlayerId", null))),
            "The next player must be offered without an explicit End player action");
        String firstId = active.getString("activePlayerId", null);
        JsonObject next = perform(fixture, active, "select", nextId);
        assertEquals(nextId, next.getString("activePlayerId", null));
        assertFalse(next.get("actions").asArray().values().stream().anyMatch(value ->
            firstId.equals(value.asObject().getString("sourcePlayerId", null))));
    }

    @Test void movementBlitzAndFoulSequenceCommitsOnlyOnConfirmation() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        Game game = nativeState(fixture.session).getGame();
        Player<?>[] own = game.getActingTeam().getPlayers();
        Player<?>[] opponents = game.getOtherTeam(game.getActingTeam()).getPlayers();
        // This sequence uses six-MA linemen; random kickoff stat penalties are outside its setup.
        for (Player<?> player : own)
            game.getFieldModel().removeSkillEnhancements(player, KickoffResult.DODGY_SNACK.getName());
        UtilBox.putAllPlayersIntoBox(game);
        place(game, own[0], 4, 2, PlayerState.STANDING);
        place(game, own[1], 4, 5, PlayerState.STANDING);
        place(game, own[2], 10, 8, PlayerState.STANDING);
        place(game, own[3], 10, 12, PlayerState.STANDING);
        place(game, opponents[0], 12, 8, PlayerState.STANDING);
        place(game, opponents[1], 12, 12, PlayerState.PRONE);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
        game.getFieldModel().setBallMoving(true);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject afterA = movement(fixture, ready, own[0].getId(), "move", null, points(9, 2));
        assertEquals(1, normalRemaining(fixture, afterA, own[0].getId()));
        JsonObject afterB = movement(fixture, afterA, own[1].getId(), "move", null, points(8, 5));
        assertEquals(2, normalRemaining(fixture, afterB, own[1].getId()));
        assertFalse(game.getFieldModel().getPlayerState(own[0]).isActive());
        forceBlockRolls(fixture.session);
        forceGeneralRolls(fixture.session, 6, 6, 6, 6);
        JsonObject blitz = movement(fixture, afterB, own[2].getId(), "blitz", opponents[0].getId(), new JsonArray());
        assertTrue(blockStarted(blitz, opponents[0].getId()));
        assertFalse(game.getFieldModel().getPlayerState(own[1]).isActive());
        assertTrue(game.getTurnData().isBlitzUsed());
        assertFalse(hasAction(blitz, "select"), "A block decision cannot be bypassed by switching players");
        // Resolve the pinned push result, including the native push and follow-up decisions.
        for (int decision = 0; decision < 8 && !hasAction(blitz, "move"); decision++) {
            JsonObject chosen = null;
            for (JsonValue value : blitz.get("actions").asArray()) {
                JsonObject action = value.asObject();
                String kind = action.getString("kind", "");
                if ("blockDie".equals(kind) || "push".equals(kind) || "followUp".equals(kind)
                    || "reroll".equals(kind) && action.getString("id", "").endsWith(":none")) {
                    chosen = action; break;
                }
            }
            assertTrue(chosen != null, blitz.get("actions").toString());
            blitz = fixture.session.apply(chosen.getString("actor", null), fixture.request("action", "block-" + decision, blitz)
                .add("actionId", chosen.get("id"))).get("state").asObject();
        }
        assertTrue(hasAction(blitz, "move"));
        JsonObject step = blitz.get("actions").asArray().values().stream()
            .map(JsonValue::asObject).filter(action -> "move".equals(action.getString("kind", null))).findFirst().get();
        JsonObject target = step.get("target").asObject();
        JsonObject continued = movement(fixture, blitz, own[2].getId(), "move", null,
            points(target.getInt("x", -1), target.getInt("y", -1)));
        assertEquals(3, normalRemaining(fixture, continued, own[2].getId()));
        forceGeneralRolls(fixture.session, 2, 3);
        JsonObject foul = movement(fixture, continued, own[3].getId(), "foul", opponents[1].getId(), new JsonArray());
        assertEquals(1, game.getGameResult().getPlayerResult(own[3]).getFouls(),
            "Fouler: " + fixture.player(foul, own[3].getId())
                + "; native step: " + nativeState(fixture.session).getCurrentStep().getId());
        assertFalse(game.getFieldModel().getPlayerState(own[2]).isActive());
        assertFalse(game.getFieldModel().getPlayerState(own[3]).isActive());
        assertEquals(continued.getInt("revision", -1) + 1, foul.getInt("revision", -1));
    }

    @Test void unperformedLimitedDeclarationsRemainSpentAfterSwitchingAndRecovery() throws Exception {
        for (String kind : new String[] { "declarePass", "declareHandOff", "blitz", "declareFoul", "declareThrowTeamMate", "declareKickTeamMate", "declareBomb" }) {
            Fixture fixture = new Fixture();
            JsonObject ready = fixture.advanceToTurn();
            String role = ready.getString("actor", null);
            Game game = nativeState(fixture.session).getGame();
            Player<?> first = game.getActingTeam().getPlayers()[0];
            Player<?> next = game.getActingTeam().getPlayers()[1];
            Player<?> opponent = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            place(game, first, 7, 7, PlayerState.STANDING);
            place(game, next, 4, 4, PlayerState.STANDING);
            place(game, opponent, 10, 7, "declareFoul".equals(kind) ? PlayerState.PRONE : PlayerState.STANDING);
            SkillFactory skills = game.getFactory(FactoryType.Factory.SKILL);
            ((RosterPlayer) first).addSkill(skills.forName("Throw Team-Mate"));
            ((RosterPlayer) first).addSkill(skills.forName("Kick Team-Mate"));
            ((RosterPlayer) first).addSkill(skills.forName("Bombardier"));
            ((RosterPlayer) next).addSkill(skills.forName("Right Stuff"));
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(5, 5));
            game.getFieldModel().setBallMoving(true);
            ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
            JsonObject declared = perform(fixture, ready, kind, first.getId());
            assertFalse(hasAction(declared, kind), kind + " is spent on declaration");
            JsonObject switched = movement(fixture, declared, next.getId(), "move", null, points(4, 5));
            assertEquals(JsonValue.valueOf(next.getId()), switched.get("activePlayerId"), kind + ": " + switched.get("actions"));
            assertFalse(game.getFieldModel().getPlayerState(first).isActive(), kind);
            assertFalse(hasAction(switched, kind), kind + " must not be refunded");
            SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            assertFalse(hasAction(recovered.reply("load", "ACCEPTED", false, role).get("state").asObject(), kind));
        }
    }

    @Test void legacyActiveCheckpointLoadsAndReservesItsUnperformedDeclaration() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        JsonObject offered = ready.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(action -> "declarePass".equals(action.getString("kind", null))).findFirst().get();
        JsonObject active = perform(fixture, ready, "declarePass", offered.getString("sourcePlayerId", null));
        nativeState(fixture.session).getGame().getTurnData().setPassUsed(false);
        Field sequencing = SetupSession.class.getDeclaredField("activationSequencing");
        sequencing.setAccessible(true);
        sequencing.set(fixture.session, false);
        JsonObject envelope = JsonObject.readFrom(fixture.session.recoveryArtifact());
        JsonObject payload = envelope.get("payload").asObject();
        payload.remove("activationVersion");
        envelope.set("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(payload.toString().getBytes(StandardCharsets.UTF_8))));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, envelope.toString());
        JsonObject recovered = restored.reply("load", "ACCEPTED", false, role).get("state").asObject();
        assertEquals(active.get("activePlayerId"), recovered.get("activePlayerId"));
        assertTrue(hasAction(recovered, "select"), "Old checkpoints gain tentative player switching");
        assertFalse(hasAction(recovered, "declarePass"), "An old active declaration still reserves its limited action");
    }

    private JsonObject perform(Fixture fixture, JsonObject view, String kind, String playerId) {
        JsonObject action = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(value -> kind.equals(value.getString("kind", null)) && playerId.equals(value.getString("sourcePlayerId", null)))
            .findFirst().orElseThrow(() -> new AssertionError("Missing " + kind + " for " + playerId + ": " + view.get("actions")));
        return fixture.session.apply(view.getString("actor", null), fixture.request("action", "declare-" + view.getInt("revision", -1), view)
            .add("actionId", action.get("id"))).get("state").asObject();
    }

    private JsonObject movement(Fixture fixture, JsonObject view, String playerId, String kind, String target, JsonArray waypoints) {
        String role = view.getString("actor", null);
        String checkpoint = fixture.session.recoveryArtifact();
        JsonObject plan = fixture.session.movementPreview(role, view.getInt("revision", -1), playerId, kind, target, waypoints);
        assertEquals(checkpoint, fixture.session.recoveryArtifact(), "Planning another player must preserve the active player and dice");
        JsonObject request = fixture.request("movement", "movement-" + view.getInt("revision", -1), view)
            .add("playerId", playerId).add("kind", kind).add("targetPlayerId", target == null ? JsonValue.NULL : JsonValue.valueOf(target))
            .add("waypoints", plan.get("waypoints"));
        JsonObject accepted = fixture.session.apply(role, request);
        assertEquals("ACCEPTED", accepted.getString("code", null));
        assertTrue(fixture.session.apply(role, request).getBoolean("duplicate", false), "Switch and movement retry only once");
        return accepted.get("state").asObject();
    }

    private int normalRemaining(Fixture fixture, JsonObject view, String playerId) {
        return fixture.session.movementRange(view.getString("actor", null), view.getInt("revision", -1), playerId)
            .getInt("normalRemaining", -1);
    }

    private GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        return (GameState) field.get(session);
    }

    private void place(Game game, Player<?> player, int x, int y, int base) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(base).changeActive(true));
    }

    private JsonArray points(int x, int y) { return new JsonArray().add(new JsonObject().add("x", x).add("y", y)); }

    @Test void liveThreatGuidanceOnlyDecoratesCurrentCoachPlayState() {
        Fixture fixture = new Fixture();
        JsonObject view = fixture.advanceToTurn();
        String role = view.getString("actor", null);
        String checkpoint = fixture.session.recoveryArtifact();
        assertTrue(view.get("threats") == null);
        JsonObject live = fixture.session.decorateSaveResumeState(JsonObject.readFrom(view.toString()));
        assertEquals(1, live.get("threats").asObject().getInt("version", -1));
        assertTrue(live.get("threats").asObject().get("eligiblePlayerIds").asArray().size() > 0);

        JsonObject stale = JsonObject.readFrom(view.toString());
        stale.set("revision", view.getInt("revision", -1) - 1);
        assertTrue(fixture.session.decorateSaveResumeState(stale).get("threats") == null);
        JsonObject spectator = JsonObject.readFrom(view.toString());
        spectator.set("callerRole", "spectator");
        assertTrue(fixture.session.decorateSaveResumeState(spectator).get("threats") == null);
        JsonObject reaction = JsonObject.readFrom(view.toString());
        reaction.set("actor", "home".equals(role) ? "away" : "home");
        assertTrue(fixture.session.decorateSaveResumeState(reaction).get("threats") == null);
        JsonObject legacy = JsonObject.readFrom(view.toString());
        legacy.set("projectionVersion", 3);
        assertTrue(fixture.session.decorateSaveResumeState(legacy).get("threats") == null);
        JsonObject setup = JsonObject.readFrom(view.toString());
        setup.set("phase", "SETUP");
        assertTrue(fixture.session.decorateSaveResumeState(setup).get("threats") == null);
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertTrue(fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject().get("threats") == null);

        JsonObject proposed = fixture.session.saveResume(role, fixture.request("saveRequest", "pause", view), 1000);
        String proposalId = fixture.session.decorateSaveResume(proposed).get("state").asObject()
            .get("saveResume").asObject().getString("proposalId", null);
        fixture.session.saveResume("home".equals(role) ? "away" : "home",
            fixture.request("saveAccept", "pause-accept", view).add("proposalId", proposalId), 1001);
        assertTrue(fixture.session.decorateSaveResumeState(JsonObject.readFrom(view.toString())).get("threats") == null);
    }

    @Test void specialTurnForecastsAreBoundedAndOtherModesGiveNoGuidance() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject view = fixture.advanceToTurn();
        String role = view.getString("actor", null);
        String otherRole = "home".equals(role) ? "away" : "home";
        int revision = view.getInt("revision", -1);
        String activeId = null, inactiveId = null;
        for (JsonValue value : view.get("players").asArray()) {
            JsonObject candidate = value.asObject();
            if (!"pitch".equals(candidate.getString("offPitch", null))) continue;
            if (role.equals(candidate.getString("role", null)) && activeId == null)
                activeId = candidate.getString("id", null);
            if (otherRole.equals(candidate.getString("role", null)) && inactiveId == null)
                inactiveId = candidate.getString("id", null);
        }
        Field stateField = SetupSession.class.getDeclaredField("state");
        stateField.setAccessible(true);
        Game game = ((GameState) stateField.get(fixture.session)).getGame();
        game.getActingPlayer().setPlayerId(activeId);
        game.getActingPlayer().setPlayerAction(PlayerAction.MOVE);
        game.getActingPlayer().setCurrentMove(1);
        for (TurnMode mode : new TurnMode[] { TurnMode.KICKOFF_RETURN, TurnMode.PASS_BLOCK }) {
            game.setTurnMode(mode);
            String checkpoint = fixture.session.recoveryArtifact();
            JsonObject active = fixture.session.movementRange(otherRole, revision, activeId);
            JsonObject inactive = fixture.session.movementRange(role, revision, inactiveId);
            assertEquals(2, active.getInt("remaining", -1));
            assertEquals(2, active.getInt("normalRemaining", -1));
            assertEquals(active.get("normal").toString(), active.get("full").toString());
            assertEquals(8, inactive.getInt("remaining", -1));
            assertEquals(checkpoint, fixture.session.recoveryArtifact());
            game.getActingPlayer().setPlayerAction(PlayerAction.STAND_UP);
            assertEquals(0, fixture.session.movementRange(role, revision, activeId).get("full").asArray().size());
            game.getActingPlayer().setPlayerAction(PlayerAction.MOVE);
        }
        game.setTurnMode(TurnMode.SETUP);
        assertEquals(0, fixture.session.movementRange(role, revision, activeId).get("full").asArray().size());
        assertEquals(0, fixture.session.movementRange(otherRole, revision, inactiveId).get("full").asArray().size());
    }

    @Test void activeStandingUpActionKeepsProneRangeAndSpentStandingBudget() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject view = fixture.advanceToTurn();
        String role = view.getString("actor", null);
        String otherRole = "home".equals(role) ? "away" : "home";
        int revision = view.getInt("revision", -1);
        String playerId = null;
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if ("select".equals(action.getString("kind", null))) {
                playerId = action.get("target").asObject().getString("playerId", null); break;
            }
        }
        Field stateField = SetupSession.class.getDeclaredField("state");
        stateField.setAccessible(true);
        Game game = ((GameState) stateField.get(fixture.session)).getGame();
        Player<?> player = game.getPlayerById(playerId);
        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.PRONE).changeActive(true));
        game.getActingPlayer().setPlayerId(playerId);
        game.getActingPlayer().setPlayerAction(PlayerAction.STAND_UP);
        String checkpoint = fixture.session.recoveryArtifact();
        JsonObject prone = fixture.session.movementRange(otherRole, revision, playerId);
        assertEquals(3, prone.getInt("normalRemaining", -1));
        assertEquals(5, prone.getInt("remaining", -1));
        assertEquals(prone.toString(), fixture.session.movementRange(role, revision, playerId).toString());
        assertEquals(checkpoint, fixture.session.recoveryArtifact());

        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true));
        game.getActingPlayer().setCurrentMove(3);
        JsonObject stood = fixture.session.movementRange(role, revision, playerId);
        assertEquals(3, stood.getInt("normalRemaining", -1));
        assertEquals(5, stood.getInt("remaining", -1));
    }

    @Test void activeAndInactiveTeamEligibilityUsesMatchTurnForEitherViewer() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject view = fixture.advanceToTurn();
        String activeRole = view.getString("actor", null);
        String otherRole = "home".equals(activeRole) ? "away" : "home";
        int revision = view.getInt("revision", -1);
        String activeId = null, inactiveId = null;
        for (JsonValue value : view.get("players").asArray()) {
            JsonObject player = value.asObject();
            if (!"pitch".equals(player.getString("offPitch", null))) continue;
            if (activeRole.equals(player.getString("role", null)) && activeId == null)
                activeId = player.getString("id", null);
            if (otherRole.equals(player.getString("role", null)) && inactiveId == null)
                inactiveId = player.getString("id", null);
        }
        Field stateField = SetupSession.class.getDeclaredField("state");
        stateField.setAccessible(true);
        Game game = ((GameState) stateField.get(fixture.session)).getGame();
        Player<?> active = game.getPlayerById(activeId), inactive = game.getPlayerById(inactiveId);
        game.getFieldModel().setPlayerState(active, new PlayerState(PlayerState.STANDING));
        game.getFieldModel().setPlayerState(inactive, new PlayerState(PlayerState.STANDING));
        String checkpoint = fixture.session.recoveryArtifact();
        JsonObject finished = fixture.session.movementRange(otherRole, revision, activeId);
        JsonObject forecast = fixture.session.movementRange(activeRole, revision, inactiveId);
        assertEquals(0, finished.get("full").asArray().size());
        assertTrue(forecast.get("full").asArray().size() > 0);
        assertEquals(forecast.toString(), fixture.session.movementRange(otherRole, revision, inactiveId).toString());
        assertEquals(checkpoint, fixture.session.recoveryArtifact());

        game.getFieldModel().setPlayerState(inactive, new PlayerState(PlayerState.STANDING).changeRooted(true));
        assertEquals(0, fixture.session.movementRange(activeRole, revision, inactiveId).get("full").asArray().size());
        game.getFieldModel().setPlayerState(inactive, new PlayerState(PlayerState.STUNNED));
        assertEquals(0, fixture.session.movementRange(otherRole, revision, inactiveId).get("full").asArray().size());
    }

    @Test void dodgySnackModifiersRecoverFromEitherStoredOrderWithoutChangingEffects() throws Exception {
        Fixture fixture = new Fixture();
        Field stateField = SetupSession.class.getDeclaredField("state");
        stateField.setAccessible(true);
        Game game = ((GameState) stateField.get(fixture.session)).getGame();
        Player<?> player = game.getTeamHome().getPlayers()[0];
        String source = KickoffResult.DODGY_SNACK.getName();
        game.getFieldModel().addEnhancements(player, source);
        assertEquals(player.getMovement() - 1, player.getMovementWithModifiers(game));
        assertEquals(player.getArmour() - 1, player.getArmourWithModifiers(game));

        String checkpoint = fixture.session.recoveryArtifact();
        for (boolean reverse : new boolean[] {false, true}) {
            JsonObject envelope = JsonObject.readFrom(checkpoint);
            JsonObject payload = envelope.get("payload").asObject();
            JsonObject modifiers = payload.get("native").asObject().get("game").asObject()
                .get("teamHome").asObject().get("playerArray").asArray().get(0).asObject()
                .get("temporaryModifiersMap").asObject();
            JsonArray stored = modifiers.get(source).asArray();
            assertEquals(2, stored.size());
            if (reverse) modifiers.set(source, new JsonArray().add(stored.get(1)).add(stored.get(0)));
            envelope.set("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(payload.toString().getBytes(StandardCharsets.UTF_8))));

            SetupSession recovered = new SetupSession(fixture.server, fixture.document, envelope.toString());
            Game restoredGame = ((GameState) stateField.get(recovered)).getGame();
            Player<?> restored = restoredGame.getPlayerById(player.getId());
            assertEquals(player.getMovementWithModifiers(game), restored.getMovementWithModifiers(restoredGame));
            assertEquals(player.getArmourWithModifiers(game), restored.getArmourWithModifiers(restoredGame));
            assertEquals(checkpoint, recovered.recoveryArtifact());
        }
    }

    @Test void pausedBlitzRetainsSelectedTargetAcrossRecoveryAndStopsAfterDeclinedReroll() throws Exception {
        Fixture fixture = new Fixture(1);
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        JsonObject plan = null;
        String playerId = null, targetId = null;
        for (JsonValue candidate : ready.get("actions").asArray()) {
            JsonObject action = candidate.asObject();
            if (!"blitz".equals(action.getString("kind", null))) continue;
            String sourceId = action.get("target").asObject().getString("playerId", null);
            for (JsonValue entry : ready.get("players").asArray()) {
                JsonObject defender = entry.asObject();
                if (role.equals(defender.getString("role", null)) || !"pitch".equals(defender.getString("offPitch", null))) continue;
                String defenderId = defender.getString("id", null);
                JsonObject base;
                try { base = fixture.session.movementPreview(role, ready.getInt("revision", -1),
                    sourceId, "blitz", defenderId, new JsonArray()); }
                catch (MatchService.Failure unavailable) { continue; }
                JsonArray steps = base.get("route").asObject().get("steps").asArray();
                if (steps.size() != 2 || !safe(steps)) continue;
                JsonObject source = base.get("route").asObject().get("from").asObject();
                JsonObject first = steps.get(0).asObject(), last = steps.get(1).asObject();
                for (int dx = -1; dx <= 1 && plan == null; dx++) for (int dy = -1; dy <= 1 && plan == null; dy++) {
                    if (dx == 0 && dy == 0) continue;
                    int x = source.getInt("x", -1) + dx, y = source.getInt("y", -1) + dy;
                    if (Math.abs(x - first.getInt("x", -1)) > 1 || Math.abs(y - first.getInt("y", -1)) > 1) continue;
                    JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", x).add("y", y))
                        .add(new JsonObject().add("x", first.getInt("x", -1)).add("y", first.getInt("y", -1)))
                        .add(new JsonObject().add("x", last.getInt("x", -1)).add("y", last.getInt("y", -1)));
                    try {
                        JsonObject candidatePlan = fixture.session.movementPreview(role, ready.getInt("revision", -1),
                            sourceId, "blitz", defenderId, waypoints);
                        if (!hasRisk(candidatePlan.get("route").asObject().get("steps").asArray())) continue;
                        plan = candidatePlan; playerId = sourceId; targetId = defenderId;
                    } catch (MatchService.Failure unavailable) { /* Try another nearby square. */ }
                }
            }
            if (plan != null) break;
        }
        assertTrue(plan != null, ready.toString());
        forceGeneralRolls(fixture.session, 1, 6, 6, 6, 6, 6);
        JsonObject request = fixture.request("movement", "prompted-blitz", ready)
            .add("playerId", playerId).add("kind", "blitz").add("targetPlayerId", targetId)
            .add("waypoints", plan.get("waypoints"));
        JsonObject paused = fixture.session.apply(role, request).get("state").asObject();
        assertTrue(hasAction(paused, "reroll"), paused.toString());
        JsonObject saved = JsonObject.readFrom(fixture.session.recoveryArtifact()).get("payload").asObject();
        assertTrue(saved.get("pendingRoute").asObject().getBoolean("targetSelected", false));
        assertTrue(fixture.session.apply(role, request).getBoolean("duplicate", false));
        String checkpoint = fixture.session.recoveryArtifact();
        SetupSession declined = new SetupSession(fixture.server, fixture.document, checkpoint);
        JsonObject decline = chooseReroll(declined, role, paused, "none");
        assertTrue(!hasAction(decline, "blockDie"), decline.toString());
        assertTrue(JsonObject.readFrom(declined.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
        SetupSession resumed = new SetupSession(fixture.server, fixture.document, checkpoint);
        assertTrue(resumed.apply(role, request).getBoolean("duplicate", false));
        JsonObject continued = chooseReroll(resumed, role, paused, "team");
        assertTrue(hasAction(continued, "blockDie") || continued.get("actions").asArray().toString().contains("block-reroll"),
            continued.toString());
        assertEquals("Blocked", fixture.player(continued, targetId).getString("status", null));
        assertTrue(JsonObject.readFrom(resumed.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
        assertTrue(resumed.apply(role, request).getBoolean("duplicate", false));
    }

    private JsonObject chooseReroll(SetupSession session, String role, JsonObject paused, String choice) {
        String actionId = null;
        for (JsonValue value : paused.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if ("reroll".equals(action.getString("kind", null)) && action.getString("id", "").endsWith(":" + choice)) {
                actionId = action.getString("id", null); break;
            }
        }
        assertTrue(actionId != null, paused.toString());
        JsonObject decision = new JsonObject().add("version", 1).add("type", "setup").add("operation", "action")
            .add("requestId", "reroll-" + choice).add("matchId", paused.getString("matchId", null))
            .add("expectedRevision", paused.getInt("revision", -1)).add("actionId", actionId);
        return session.apply(role, decision).get("state").asObject();
    }

    private void forceGeneralRolls(SetupSession session, int... values) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        GameState state = (GameState) field.get(session);
        List<DiceCategory> rolls = new ArrayList<>();
        for (int value : values) {
            DiceCategory roll = new DiceCategory();
            roll.parseCommand(Integer.toString(value), state.getGame(), state.getGame().getTeamHome());
            rolls.add(roll);
        }
        state.getDiceRoller().getTestRolls().put("General", rolls);
    }

    private void forceBlockRolls(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        GameState state = (GameState) field.get(session);
        List<DiceCategory> rolls = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            BlockDiceCategory roll = new BlockDiceCategory();
            roll.parseCommand("push", state.getGame(), state.getGame().getTeamHome());
            rolls.add(roll);
        }
        state.getDiceRoller().getTestRolls().put("Block", rolls);
    }

    private boolean hasRisk(JsonArray steps) {
        for (JsonValue value : steps) {
            JsonObject step = value.asObject();
            if (step.getInt("dodge", -1) > 0 || step.getInt("rush", -1) > 0) return true;
        }
        return false;
    }

    @Test void activePassMoverCanContinueWithACommittedMovementRoute() {
        Fixture fixture = new Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        JsonObject declaration = null;
        for (JsonValue value : ready.get("actions").asArray()) {
            if ("declarePass".equals(value.asObject().getString("kind", null))) {
                declaration = value.asObject(); break;
            }
        }
        assertTrue(declaration != null, ready.toString());
        String playerId = declaration.get("target").asObject().getString("playerId", null);
        JsonObject active = fixture.session.apply(role, fixture.request("action", "declare-pass", ready)
            .add("actionId", declaration.get("id"))).get("state").asObject();
        JsonObject offered = null;
        for (JsonValue value : active.get("actions").asArray()) {
            if ("move".equals(value.asObject().getString("kind", null))) {
                offered = value.asObject(); break;
            }
        }
        assertTrue(offered != null, active.toString());
        JsonObject destination = offered.get("target").asObject();
        JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", destination.getInt("x", -1))
            .add("y", destination.getInt("y", -1)));
        JsonObject range = fixture.session.movementRange(role, active.getInt("revision", -1), playerId);
        assertTrue(range.getInt("remaining", -1) > 0);
        fixture.session.movementPreview(role, active.getInt("revision", -1), playerId, "move", null, waypoints);
        JsonObject accepted = fixture.session.apply(role, fixture.request("movement", "pass-move", active)
            .add("playerId", playerId).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", waypoints));
        assertEquals("ACCEPTED", accepted.getString("code", null));
        JsonObject moved = fixture.player(accepted.get("state").asObject(), playerId);
        assertEquals(destination.getInt("x", -1), moved.getInt("x", -1));
        assertEquals(destination.getInt("y", -1), moved.getInt("y", -1));
    }

    @Test void rangeReadsAreImmutableAndOneMovementDecisionDeclaresAndMovesWithDurableRetry() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject state = fixture.advanceToTurn();
        String role = state.getString("actor", null);
        Game rangeGame = nativeState(fixture.session).getGame();
        Player<?> rangeOpponent = rangeGame.getOtherTeam(rangeGame.getActingTeam()).getPlayers()[0];
        // Range and retry assertions need movable players, regardless of kickoff casualties or positions.
        UtilBox.putAllPlayersIntoBox(rangeGame);
        place(rangeGame, rangeGame.getActingTeam().getPlayers()[0], 7, 7, PlayerState.STANDING);
        place(rangeGame, rangeOpponent, 20, 7, PlayerState.STANDING);
        rangeGame.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
        rangeGame.getFieldModel().setBallMoving(true);
        state = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject selectable = null;
        JsonObject destination = null;
        int revision = state.getInt("revision", -1);
        for (JsonValue value : state.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (!"select".equals(action.getString("kind", null))) continue;
            String candidateId = action.get("target").asObject().getString("playerId", null);
            JsonObject candidateSource = fixture.player(state, candidateId);
            JsonObject candidateRange = fixture.session.movementRange(role, revision, candidateId);
            for (JsonValue squareValue : candidateRange.get("normal").asArray()) {
                JsonObject square = squareValue.asObject();
                if (Math.abs(square.getInt("x", -1) - candidateSource.getInt("x", -1)) > 1
                    || Math.abs(square.getInt("y", -1) - candidateSource.getInt("y", -1)) > 1) continue;
                JsonArray candidate = new JsonArray().add(new JsonObject().add("x", square.getInt("x", -1))
                    .add("y", square.getInt("y", -1)));
                JsonObject proposal = fixture.session.movementPreview(role, revision, candidateId, "move", null, candidate);
                if (safe(proposal.get("route").asObject().get("steps").asArray())) {
                    selectable = action; destination = square; break;
                }
            }
            if (selectable != null) break;
        }
        assertTrue(selectable != null, state.toString());
        String playerId = selectable.get("target").asObject().getString("playerId", null);
        assertTrue(playerId != null, selectable.toString());
        String checkpoint = fixture.session.recoveryArtifact();
        JsonObject own = fixture.session.movementRange(role, revision, playerId);
        JsonObject opponent = null;
        for (JsonValue value : state.get("players").asArray()) {
            JsonObject player = value.asObject();
            if (!role.equals(player.getString("role", null)) && "pitch".equals(player.getString("offPitch", null))) {
                opponent = player; break;
            }
        }
        assertTrue(opponent != null, state.toString());
        JsonObject other = fixture.session.movementRange(role, revision, opponent.getString("id", null));
        String offTurnRole = "home".equals(role) ? "away" : "home";
        JsonObject offTurnOwn = fixture.session.movementRange(offTurnRole, revision, opponent.getString("id", null));
        JsonObject offTurnActive = fixture.session.movementRange(offTurnRole, revision, playerId);
        assertEquals(2, own.getInt("rangeVersion", -1));
        assertEquals(2, other.getInt("rangeVersion", -1));
        assertEquals(other.getInt("remaining", -1), offTurnOwn.getInt("remaining", -1));
        assertEquals(other.get("normal").toString(), offTurnOwn.get("normal").toString());
        assertEquals(other.get("full").toString(), offTurnOwn.get("full").toString());
        assertEquals(own.toString(), offTurnActive.toString());
        assertTrue(offTurnOwn.get("full").asArray().size() > 0);
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertEquals(revision, fixture.session.spectatorView().getInt("revision", -1));

        assertTrue(destination != null, own.toString());
        JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", destination.getInt("x", -1))
            .add("y", destination.getInt("y", -1)));
        JsonObject plan = fixture.session.movementPreview(role, revision, playerId, "move", null, waypoints);
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertEquals(1, plan.getInt("planVersion", -1));
        JsonObject request = fixture.request("movement", "move-once", state)
            .add("playerId", playerId).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", waypoints);
        JsonObject accepted = fixture.session.apply(role, request);
        assertEquals("ACCEPTED", accepted.getString("code", null));
        assertTrue(accepted.get("state").asObject().getInt("revision", -1) > revision);
        JsonObject moved = fixture.player(accepted.get("state").asObject(), playerId);
        assertEquals(destination.getInt("x", -1), moved.getInt("x", -1));
        assertEquals(destination.getInt("y", -1), moved.getInt("y", -1));
        JsonObject acceptedState = accepted.get("state").asObject();
        JsonObject postMoveRange = fixture.session.movementRange(role, acceptedState.getInt("revision", -1), playerId);
        assertEquals(destination.getInt("x", -1), postMoveRange.get("from").asObject().getInt("x", -1));
        assertEquals(destination.getInt("y", -1), postMoveRange.get("from").asObject().getInt("y", -1));
        assertEquals(own.getInt("remaining", -1) - 1, postMoveRange.getInt("remaining", -1));
        Field stateField = SetupSession.class.getDeclaredField("state");
        stateField.setAccessible(true);
        ActingPlayer nativeActor = ((GameState) stateField.get(fixture.session)).getGame().getActingPlayer();
        nativeActor.setHeldInPlace(true);
        assertEquals(0, fixture.session.movementRange(offTurnRole, acceptedState.getInt("revision", -1), playerId)
            .get("full").asArray().size());
        nativeActor.setHeldInPlace(false);
        nativeActor.setJumping(true);
        assertTrue(fixture.session.movementRange(role, acceptedState.getInt("revision", -1), playerId)
            .get("full").asArray().size() > 0);
        nativeActor.setJumping(false);
        String opponentId = opponent.getString("id", null);
        assertThrows(MatchService.Failure.class, () -> fixture.session.movementPreview(role,
            acceptedState.getInt("revision", -1), playerId, "blitz", opponentId, new JsonArray()));
        assertTrue(fixture.session.apply(role, request).getBoolean("duplicate", false));
        SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        assertTrue(recovered.apply(role, request).getBoolean("duplicate", false));

        Fixture blitz = new Fixture();
        JsonObject blitzReady = blitz.advanceToTurn();
        String blitzRole = blitzReady.getString("actor", null);
        JsonObject blitzPlan = null;
        String blitzPlayerId = null, targetId = null;
        for (JsonValue candidate : blitzReady.get("actions").asArray()) {
            JsonObject action = candidate.asObject();
            if (!"blitz".equals(action.getString("kind", null))) continue;
            String sourceId = action.get("target").asObject().getString("playerId", null);
            for (JsonValue entry : blitzReady.get("players").asArray()) {
                JsonObject player = entry.asObject();
                if (blitzRole.equals(player.getString("role", null)) || !"pitch".equals(player.getString("offPitch", null))) continue;
                try {
                    JsonObject proposal = blitz.session.movementPreview(blitzRole, blitzReady.getInt("revision", -1),
                        sourceId, "blitz", player.getString("id", null), new JsonArray());
                    if (blitzPlan == null || proposal.get("route").asObject().get("steps").asArray().size()
                        < blitzPlan.get("route").asObject().get("steps").asArray().size()) {
                        blitzPlan = proposal; blitzPlayerId = sourceId; targetId = player.getString("id", null);
                    }
                } catch (MatchService.Failure unavailable) { /* Another target may have a legal approach. */ }
            }
        }
        assertTrue(blitzPlan != null, blitzReady.toString());
        JsonObject blitzRequest = blitz.request("movement", "blitz-once", blitzReady)
            .add("playerId", blitzPlayerId).add("kind", "blitz").add("targetPlayerId", targetId)
            .add("waypoints", blitzPlan.get("waypoints"));
        forceBlockRolls(blitz.session);
        JsonObject blitzAccepted = blitz.session.apply(blitzRole, blitzRequest);
        assertEquals("ACCEPTED", blitzAccepted.getString("code", null));
        assertTrue(blitz.session.apply(blitzRole, blitzRequest).getBoolean("duplicate", false));
        SetupSession recoveredBlitz = new SetupSession(blitz.server, blitz.document, blitz.session.recoveryArtifact());
        assertTrue(recoveredBlitz.apply(blitzRole, blitzRequest).getBoolean("duplicate", false));
        assertTrue(blockStarted(blitzAccepted.get("state").asObject(), targetId), blitzAccepted.toString());

        Fixture distant = new Fixture();
        JsonObject distantReady = distant.advanceToTurn();
        String distantRole = distantReady.getString("actor", null);
        JsonObject distantPlan = null;
        String distantPlayerId = null, distantTargetId = null;
        for (JsonValue candidate : distantReady.get("actions").asArray()) {
            JsonObject action = candidate.asObject();
            if (!"blitz".equals(action.getString("kind", null))) continue;
            String sourceId = action.get("target").asObject().getString("playerId", null);
            for (JsonValue entry : distantReady.get("players").asArray()) {
                JsonObject defender = entry.asObject();
                if (distantRole.equals(defender.getString("role", null)) || !"pitch".equals(defender.getString("offPitch", null))) continue;
                try {
                    JsonObject proposal = distant.session.movementPreview(distantRole, distantReady.getInt("revision", -1),
                        sourceId, "blitz", defender.getString("id", null), new JsonArray());
                    JsonArray steps = proposal.get("route").asObject().get("steps").asArray();
                    if (steps.size() != 2 || !safe(steps)) continue;
                    distantPlan = proposal; distantPlayerId = sourceId; distantTargetId = defender.getString("id", null);
                    break;
                } catch (MatchService.Failure unavailable) { /* Try another target. */ }
            }
            if (distantPlan != null) break;
        }
        assertTrue(distantPlan != null, distantReady.toString());
        JsonArray approachSteps = distantPlan.get("route").asObject().get("steps").asArray();
        JsonArray overlongApproach = new JsonArray();
        for (int index = 0; index < 4; index++) for (JsonValue step : approachSteps) {
            JsonObject square = step.asObject();
            overlongApproach.add(new JsonObject().add("x", square.getInt("x", -1)).add("y", square.getInt("y", -1)));
        }
        String beforeInvalid = distant.session.recoveryArtifact();
        String invalidMoverId = distantPlayerId, invalidTargetId = distantTargetId;
        assertEquals("NO_ROUTE", assertThrows(MatchService.Failure.class,
            () -> distant.session.movementPreview(distantRole, distantReady.getInt("revision", -1),
                invalidMoverId, "blitz", invalidTargetId, overlongApproach)).code);
        assertEquals(beforeInvalid, distant.session.recoveryArtifact());
        JsonObject distantRequest = distant.request("movement", "distant-blitz", distantReady)
            .add("playerId", distantPlayerId).add("kind", "blitz").add("targetPlayerId", distantTargetId)
            .add("waypoints", distantPlan.get("waypoints"));
        forceBlockRolls(distant.session);
        JsonObject distantAccepted = distant.session.apply(distantRole, distantRequest);
        assertEquals("ACCEPTED", distantAccepted.getString("code", null));
        assertTrue(blockStarted(distantAccepted.get("state").asObject(), distantTargetId), distantAccepted.toString());

        Fixture distantMove = new Fixture();
        JsonObject distantMoveReady = distantMove.advanceToTurn();
        String distantMoveRole = distantMoveReady.getString("actor", null);
        JsonObject distantMovePlan = null;
        String distantMoverId = null;
        for (JsonValue candidate : distantMoveReady.get("actions").asArray()) {
            JsonObject action = candidate.asObject();
            if (!"select".equals(action.getString("kind", null))) continue;
            String sourceId = action.get("target").asObject().getString("playerId", null);
            JsonObject range = distantMove.session.movementRange(distantMoveRole,
                distantMoveReady.getInt("revision", -1), sourceId);
            for (JsonValue value : range.get("full").asArray()) {
                JsonObject square = value.asObject();
                JsonArray waypoint = new JsonArray().add(new JsonObject().add("x", square.getInt("x", -1))
                    .add("y", square.getInt("y", -1)));
                try {
                    JsonObject proposal = distantMove.session.movementPreview(distantMoveRole,
                        distantMoveReady.getInt("revision", -1), sourceId, "move", null, waypoint);
                    JsonArray steps = proposal.get("route").asObject().get("steps").asArray();
                    if (steps.size() < 3 || steps.size() > 4 || !safe(steps)) continue;
                    distantMovePlan = proposal; distantMoverId = sourceId; break;
                } catch (MatchService.Failure unavailable) { /* Try another destination. */ }
            }
            if (distantMovePlan != null) break;
        }
        assertTrue(distantMovePlan != null, distantMoveReady.toString());
        JsonObject distantMoveRequest = distantMove.request("movement", "distant-move", distantMoveReady)
            .add("playerId", distantMoverId).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
            .add("waypoints", distantMovePlan.get("waypoints"));
        JsonObject distantMoveAccepted = distantMove.session.apply(distantMoveRole, distantMoveRequest);
        JsonArray distantSteps = distantMovePlan.get("route").asObject().get("steps").asArray();
        JsonObject last = distantSteps.get(distantSteps.size() - 1).asObject();
        JsonObject distantMoved = distantMove.player(distantMoveAccepted.get("state").asObject(), distantMoverId);
        assertEquals(last.getInt("x", -1), distantMoved.getInt("x", -1));
        assertEquals(last.getInt("y", -1), distantMoved.getInt("y", -1));
        JsonObject postDistantMoveRange = distantMove.session.movementRange(distantMoveRole,
            distantMoveAccepted.get("state").asObject().getInt("revision", -1), distantMoverId);
        assertEquals(distantSteps.size(), distantMovePlan.get("route").asObject().getInt("remaining", -1)
            - postDistantMoveRange.getInt("remaining", -1));

        String fixturePath = System.getProperty("movement.fixture");
        if (fixturePath != null) {
            JsonObject export = new JsonObject()
                .add("meta", new JsonObject().add("matchId", fixture.document.matchId).add("role", role)
                    .add("playerId", playerId).add("opponentId", opponent.getString("id", null))
                    .add("blitzRole", blitzRole).add("blitzPlayerId", blitzPlayerId).add("blitzTargetId", targetId)
                    .add("distantMoveRole", distantMoveRole).add("distantMoverId", distantMoverId)
                    .add("distantBlitzRole", distantRole).add("distantBlitzPlayerId", distantPlayerId)
                    .add("distantBlitzTargetId", distantTargetId))
                .add("readyState", state).add("blitzReadyState", blitzReady)
                .add("ownRange", response("movementRange", "own-range", "range", own, fixture.document.matchId))
                .add("opponentRange", response("movementRange", "opponent-range", "range", other, fixture.document.matchId))
                .add("postMoveRange", response("movementRange", "post-move-range", "range", postMoveRange, fixture.document.matchId))
                .add("movePlan", response("movementPreview", "move-plan", "plan", plan, fixture.document.matchId))
                .add("moveAcceptedState", accepted.get("state"))
                .add("blitzPlan", response("movementPreview", "blitz-plan", "plan", blitzPlan, blitz.document.matchId))
                .add("blitzAcceptedState", blitzAccepted.get("state"))
                .add("distantMoveReadyState", distantMoveReady)
                .add("distantMovePlan", response("movementPreview", "distant-move-plan", "plan", distantMovePlan, distantMove.document.matchId))
                .add("distantMoveAcceptedState", distantMoveAccepted.get("state"))
                .add("postDistantMoveRange", response("movementRange", "post-distant-move-range", "range", postDistantMoveRange, distantMove.document.matchId))
                .add("distantBlitzReadyState", distantReady)
                .add("distantBlitzPlan", response("movementPreview", "distant-blitz-plan", "plan", distantPlan, distant.document.matchId))
                .add("distantBlitzAcceptedState", distantAccepted.get("state"));
            try { Files.write(Paths.get(fixturePath), export.toString().getBytes(StandardCharsets.UTF_8)); }
            catch (java.io.IOException failure) { throw new AssertionError(failure); }
        }
    }

    private JsonObject response(String type, String requestId, String key, JsonObject value, String matchId) {
        return new JsonObject().add("version", 2).add("type", type).add("requestId", requestId).add("code", "ACCEPTED")
            .add("matchId", matchId).add(key, value);
    }

    private boolean safe(JsonArray steps) {
        for (JsonValue value : steps) {
            JsonObject step = value.asObject();
            if (step.getInt("dodge", -1) > 0 || step.getInt("rush", -1) > 0
                || step.get("reactions").asArray().size() > 0) return false;
        }
        return true;
    }

    private boolean hasAction(JsonObject state, String kind) {
        for (JsonValue value : state.get("actions").asArray())
            if (kind.equals(value.asObject().getString("kind", null))) return true;
        return false;
    }

    private JsonObject offered(JsonObject state, String kind, String playerId) {
        for (JsonValue value : state.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (kind.equals(action.getString("kind", null)) && playerId.equals(action.getString("sourcePlayerId", null))) return action;
        }
        return null;
    }

    private boolean menuHas(JsonObject state, String playerId, String kind, boolean spent) {
        JsonArray menu = state.get("playerActionMenu").asArray();
        for (JsonValue value : menu) {
            JsonObject action = value.asObject();
            if (playerId.equals(action.getString("playerId", null)) && kind.equals(action.getString("kind", null))
                && spent == action.getBoolean("spent", false)) return true;
        }
        return false;
    }

    private boolean blockStarted(JsonObject state, String defenderId) {
        for (JsonValue value : state.get("players").asArray()) {
            JsonObject player = value.asObject();
            if (defenderId.equals(player.getString("id", null)))
                return "Blocked".equals(player.getString("status", null))
                    && (hasAction(state, "blockDie") || state.get("actions").asArray().toString().contains("block-reroll"));
        }
        return false;
    }

    static final class Fixture {
        final FantasyFootballServer server = mock(FantasyFootballServer.class);
        final MatchDocument document;
        final SetupSession session;

        Fixture() {
            this(0);
        }

        Fixture(int rerolls) {
            RosterCatalog catalog = new RosterCatalog();
            List<TeamDraft.Player> players = new ArrayList<>();
            for (int slot = 1; slot <= 11; slot++)
                players.add(new TeamDraft.Player("player" + slot, slot, "lineman", Collections.emptyList()));
            Map<String, Integer> resources = new LinkedHashMap<>();
            for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
            resources.put("rerolls", rerolls);
            TeamDraft draft = new TeamDraft(RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET,
                "player1", players, resources);
            FrozenTeam home = new FrozenTeam("00000000-0000-0000-0000-000000000011", 1, "home", draft, 550000 + 50000 * rerolls, 0, catalog);
            FrozenTeam away = new FrozenTeam("00000000-0000-0000-0000-000000000012", 1, "away", draft, 550000 + 50000 * rerolls, 0, catalog);
            document = new MatchDocument("00000000-0000-0000-0000-000000000021", 3, "away", MatchDocument.Lifecycle.ACTIVATED,
                new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away));
            FactoryManager manager = new FactoryManager();
            when(server.getFactoryManager()).thenReturn(manager);
            when(server.getFactorySource()).thenReturn(server);
            when(server.forContext(any())).thenReturn(server);
            Map<FactoryType.Factory, INamedObjectFactory> factories = manager.getFactoriesForContext(FactoryType.FactoryContext.APPLICATION, server);
            when(server.getFactory(any())).thenAnswer(invocation -> factories.get(invocation.getArgument(0)));
            when(server.getDebugLog()).thenReturn(mock(DebugLog.class));
            when(server.getGameCache()).thenReturn(mock(GameCache.class));
            when(server.getCommunication()).thenReturn(mock(ServerCommunication.class));
            when(server.getSessionManager()).thenReturn(new SessionManager());
            session = new SetupSession(server, document, -2, true, true, true, true, true, true);
        }

        JsonObject request(String operation, String id, JsonObject state) {
            return new JsonObject().add("version", 1).add("type", "setup").add("operation", operation)
                .add("requestId", id).add("matchId", document.matchId).add("expectedRevision", state.getInt("revision", -1));
        }

        JsonObject advanceToTurn() {
            JsonObject view = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
            for (int index = 0; index < 100; index++) {
                JsonObject endTurn = null;
                for (JsonValue item : view.get("actions").asArray())
                    if ("endTurn".equals(item.asObject().getString("kind", null))) endTurn = item.asObject();
                if ("REGULAR".equals(view.getString("turnMode", null)) && endTurn != null)
                    return session.reply("load", "ACCEPTED", false, view.getString("actor", null)).get("state").asObject();
                JsonObject request = request("action", "advance-" + index, view);
                if ("SETUP".equals(view.getString("phase", null))) request.set("operation", "confirm");
                else if (!view.get("prompt").isNull()) {
                    JsonObject prompt = view.get("prompt").asObject();
                    request.set("operation", "choice").add("promptId", prompt.get("id"))
                        .add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
                } else {
                    assertTrue(view.get("actions").asArray().size() > 0, view.toString());
                    JsonObject action = endTurn == null ? view.get("actions").asArray().get(0).asObject() : endTurn;
                    request.add("actionId", action.get("id"));
                }
                view = session.apply(view.getString("actor", null), request).get("state").asObject();
            }
            throw new AssertionError("Did not reach a regular turn: " + view);
        }

        JsonObject player(JsonObject state, String playerId) {
            for (JsonValue value : state.get("players").asArray()) {
                JsonObject player = value.asObject();
                if (playerId.equals(player.getString("id", null))) return player;
            }
            throw new AssertionError("Missing player " + playerId);
        }
    }
}
