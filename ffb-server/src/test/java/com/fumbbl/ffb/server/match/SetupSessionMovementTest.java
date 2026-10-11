package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameCache;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.net.SessionManager;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupSessionMovementTest {
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

    private boolean blockStarted(JsonObject state, String defenderId) {
        for (JsonValue value : state.get("players").asArray()) {
            JsonObject player = value.asObject();
            if (defenderId.equals(player.getString("id", null)))
                return "Blocked".equals(player.getString("status", null))
                    && (hasAction(state, "blockDie") || state.get("actions").asArray().toString().contains("block-reroll"));
        }
        return false;
    }

    private static final class Fixture {
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
