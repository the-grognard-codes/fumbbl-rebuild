package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepKickoffReturn;
import com.fumbbl.ffb.server.step.bb2025.pass.StepPassBlock;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OnTheBallMovementTest {
    @Test void finishingWithoutMovingConsumesTheSelectedReactionPlayer() throws Exception {
        for (boolean passing : new boolean[] {false, true}) {
            Roundup5NativeActionsTest.Scenario scenario = passing ? pass() : kickoff();
            JsonObject view = scenario.view();
            view = scenario.apply(view, byId(view, "reaction-select:" + scenario.attacker.getId()));
            view = scenario.apply(view, byId(view, "reaction-end-player"));
            assertFalse(view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .anyMatch(action -> action.getString("id", "").contains("reaction-select:" + scenario.attacker.getId())),
                "Finishing a reaction must not offer the same player again: " + view);
        }
    }

    @Test void aPassReactionRoutePausesForDivingTackleAndPreservesNativeOutcomeAfterRecovery() throws Exception {
        for (boolean legacy : new boolean[] {false, true}) {
            for (boolean tackle : new boolean[] {false, true}) {
                Roundup5NativeActionsTest.Scenario scenario = pass();
                Player<?> tackler = scenario.defender.getTeam().getPlayers()[1];
                scenario.place(tackler, 8, 7, PlayerState.STANDING);
                scenario.skill(tackler, "Diving Tackle");
                JsonObject selection = scenario.view();
                JsonObject accepted = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
                JsonArray points = new JsonArray().add(new JsonObject().add("x", 7).add("y", 4));
                JsonObject preview = scenario.fixture.session.movementPreview(scenario.role, accepted.getInt("revision", -1),
                    scenario.attacker.getId(), "move", null, points);
                assertTrue(preview.get("route").asObject().get("steps").asArray().values().stream()
                    .anyMatch(value -> value.asObject().getInt("dodge", 0) > 0));
                int dodgeTarget = preview.get("route").asObject().get("steps").asArray().values().stream().map(JsonValue::asObject)
                    .filter(step -> step.getInt("dodge", 0) > 0).findFirst().orElseThrow().getInt("dodge", 0);
                scenario.state.getDiceRoller().setRecoveryRoll(sides -> dodgeTarget);
                JsonObject paused = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "dodge-route", accepted)
                    .add("playerId", scenario.attacker.getId()).add("kind", "move").add("waypoints", points)).get("state").asObject();
                assertNotNull(Roundup5NativeActionsTest.action(paused, "reactiveSkill"), paused.toString());
                assertFalse(JsonObject.readFrom(scenario.fixture.session.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
                JsonObject artifact = JsonObject.readFrom(scenario.fixture.session.recoveryArtifact());
                if (legacy) {
                    JsonObject payload = artifact.get("payload").asObject();
                    removeReactionFlags(payload.get("native"));
                    artifact.set("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                        .digest(payload.toString().getBytes(StandardCharsets.UTF_8))));
                }
                SetupSession recovered = new SetupSession(scenario.fixture.server, scenario.fixture.document, artifact.toString());
                assertEquals(scenario.state.getCurrentStep().toJsonValue(), Roundup5NativeActionsTest.state(recovered).getCurrentStep().toJsonValue());
                if (!legacy) assertEquals(scenario.state.getStepStack().toJsonValue(), Roundup5NativeActionsTest.state(recovered).getStepStack().toJsonValue());
                Roundup5NativeActionsTest.state(recovered).getDiceRoller().setRecoveryRoll(sides -> 6);
                JsonObject answer = byId(paused, tackle ? "reaction-player:" + tackler.getId() : "reaction-decline");
                JsonObject request = scenario.fixture.request("action", "tackle-answer", paused).add("actionId", answer.get("id"));
                scenario.state.getDiceRoller().setRecoveryRoll(sides -> 6);
                scenario.fixture.session.apply(answer.getString("actor", null), request);
                recovered.apply(answer.getString("actor", null), request);
                assertEquals(scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker),
                    Roundup5NativeActionsTest.state(recovered).getGame().getFieldModel().getPlayerCoordinate(scenario.attacker));
                assertEquals(scenario.game.getFieldModel().getPlayerState(scenario.attacker).getBase(),
                    Roundup5NativeActionsTest.state(recovered).getGame().getFieldModel().getPlayerState(scenario.attacker).getBase());
                assertFalse(recovered.isFailed());
                assertTrue(JsonObject.readFrom(recovered.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
            }
        }
    }

    private void removeReactionFlags(JsonValue value) {
        if (value.isObject()) {
            value.asObject().remove("reactionDodging");
            value.asObject().remove("reactionJumping");
            for (JsonObject.Member member : value.asObject()) removeReactionFlags(member.getValue());
        } else if (value.isArray()) for (JsonValue item : value.asArray()) removeReactionFlags(item);
    }

    @Test void anInterruptedJumpKeepsItsNativeCheckAndOutcomeAfterCurrentOrLegacyRecovery() throws Exception {
        for (boolean legacy : new boolean[] {false, true}) for (boolean success : new boolean[] {false, true}) {
            Roundup5NativeActionsTest.Scenario scenario = pass();
            scenario.place(scenario.attacker.getTeam().getPlayers()[1], 7, 6, PlayerState.PRONE);
            Player<?> holder = scenario.defender.getTeam().getPlayers()[1];
            scenario.place(holder, 8, 7, PlayerState.STANDING); scenario.skill(holder, "Tentacles");
            JsonObject selection = scenario.view();
            JsonObject active = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
            JsonArray points = new JsonArray().add(new JsonObject().add("x", 7).add("y", 5).add("jump", true))
                .add(new JsonObject().add("x", 7).add("y", 4));
            JsonObject paused = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "jump-pause", active)
                .add("playerId", scenario.attacker.getId()).add("kind", "move").add("waypoints", points)).get("state").asObject();
            assertTrue(scenario.game.getActingPlayer().isJumping());
            JsonObject artifact = JsonObject.readFrom(scenario.fixture.session.recoveryArtifact());
            if (legacy) {
                JsonObject payload = artifact.get("payload").asObject(); removeReactionFlags(payload.get("native"));
                artifact.set("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(payload.toString().getBytes(StandardCharsets.UTF_8))));
            }
            SetupSession recovered = new SetupSession(scenario.fixture.server, scenario.fixture.document, artifact.toString());
            JsonObject answer = byId(paused, "reaction-decline");
            JsonObject request = scenario.fixture.request("action", "holder-decline", paused).add("actionId", answer.get("id"));
            scenario.state.getDiceRoller().setRecoveryRoll(sides -> success ? 6 : 1);
            Roundup5NativeActionsTest.state(recovered).getDiceRoller().setRecoveryRoll(sides -> success ? 6 : 1);
            scenario.fixture.session.apply(answer.getString("actor", null), request);
            recovered.apply(answer.getString("actor", null), request);
            assertEquals(success, new FieldCoordinate(7, 4).equals(scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker)));
            assertEquals(scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker),
                Roundup5NativeActionsTest.state(recovered).getGame().getFieldModel().getPlayerCoordinate(scenario.attacker));
            assertEquals(scenario.game.getFieldModel().getPlayerState(scenario.attacker).getBase(),
                Roundup5NativeActionsTest.state(recovered).getGame().getFieldModel().getPlayerState(scenario.attacker).getBase());
            assertFalse(recovered.isFailed());
            assertTrue(JsonObject.readFrom(recovered.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
        }
    }

    @Test void tentaclesHoldingThePlayerCancelsRestoredWalkingAndJumpingChecks() throws Exception {
        for (boolean legacy : new boolean[] {false, true}) for (boolean jumping : new boolean[] {false, true}) {
            Roundup5NativeActionsTest.Scenario scenario = pass();
            if (jumping) scenario.place(scenario.attacker.getTeam().getPlayers()[1], 7, 6, PlayerState.PRONE);
            Player<?> holder = scenario.defender.getTeam().getPlayers()[1];
            scenario.place(holder, 8, 7, PlayerState.STANDING); scenario.skill(holder, "Tentacles");
            JsonObject selection = scenario.view();
            JsonObject active = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
            JsonArray points = jumping ? new JsonArray().add(new JsonObject().add("x", 7).add("y", 5).add("jump", true))
                .add(new JsonObject().add("x", 7).add("y", 4))
                : new JsonArray().add(new JsonObject().add("x", 7).add("y", 4));
            JsonObject paused = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "held-route", active)
                .add("playerId", scenario.attacker.getId()).add("kind", "move").add("waypoints", points)).get("state").asObject();
            JsonObject artifact = JsonObject.readFrom(scenario.fixture.session.recoveryArtifact());
            if (legacy) {
                JsonObject payload = artifact.get("payload").asObject(); removeReactionFlags(payload.get("native"));
                artifact.set("sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(payload.toString().getBytes(StandardCharsets.UTF_8))));
            }
            SetupSession recovered = new SetupSession(scenario.fixture.server, scenario.fixture.document, artifact.toString());
            JsonObject answer = byId(paused, "reaction-player:" + holder.getId());
            JsonObject request = scenario.fixture.request("action", "holder-use", paused).add("actionId", answer.get("id"));
            AtomicInteger originalRolls = new AtomicInteger(), restoredRolls = new AtomicInteger();
            scenario.state.getDiceRoller().setRecoveryRoll(sides -> originalRolls.getAndIncrement() == 0 ? 6 : 1);
            Roundup5NativeActionsTest.state(recovered).getDiceRoller().setRecoveryRoll(sides -> restoredRolls.getAndIncrement() == 0 ? 6 : 1);
            scenario.fixture.session.apply(answer.getString("actor", null), request);
            recovered.apply(answer.getString("actor", null), request);
            assertEquals(1, originalRolls.get(), "A successful hold cancels the pending dodge or jump roll");
            assertEquals(originalRolls.get(), restoredRolls.get());
            assertEquals(scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker),
                Roundup5NativeActionsTest.state(recovered).getGame().getFieldModel().getPlayerCoordinate(scenario.attacker));
            assertEquals(scenario.game.getFieldModel().getPlayerState(scenario.attacker).getBase(),
                Roundup5NativeActionsTest.state(recovered).getGame().getFieldModel().getPlayerState(scenario.attacker).getBase());
            assertFalse(recovered.isFailed());
        }
    }

    @Test void aFailedNativeDodgeCancelsTheRemainingReactionRoute() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = pass();
        scenario.place(scenario.defender, 8, 7, PlayerState.STANDING);
        JsonObject selection = scenario.view();
        JsonObject accepted = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
        JsonArray points = new JsonArray().add(new JsonObject().add("x", 7).add("y", 4));
        scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "failed-dodge-route", accepted)
            .add("playerId", scenario.attacker.getId()).add("kind", "move").add("waypoints", points));
        assertFalse(new FieldCoordinate(7, 4).equals(scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker)));
        assertEquals(TurnMode.REGULAR, scenario.game.getTurnMode());
        assertFalse(scenario.fixture.session.isFailed());
        assertTrue(JsonObject.readFrom(scenario.fixture.session.recoveryArtifact()).get("payload").asObject().get("pendingRoute").isNull());
    }

    @Test void aPlannedJumpAndWalkShareTheThreeSquareReactionBudget() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = pass();
        scenario.place(scenario.attacker.getTeam().getPlayers()[1], 7, 6, PlayerState.PRONE);
        scenario.state.getDiceRoller().setRecoveryRoll(sides -> 6);
        JsonObject selection = scenario.view();
        JsonObject accepted = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
        JsonObject empty = scenario.fixture.session.movementPreview(scenario.role, accepted.getInt("revision", -1),
            scenario.attacker.getId(), "move", null, new JsonArray());
        assertFalse(empty.get("jumpOptions").asArray().isEmpty());
        JsonArray points = new JsonArray().add(new JsonObject().add("x", 7).add("y", 5).add("jump", true))
            .add(new JsonObject().add("x", 7).add("y", 4));
        JsonObject plan = scenario.fixture.session.movementPreview(scenario.role, accepted.getInt("revision", -1),
            scenario.attacker.getId(), "move", null, points);
        assertEquals(2, plan.get("route").asObject().get("steps").asArray().size());
        assertEquals(0, plan.get("range").asObject().getInt("remaining", -1));
        scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "jump-route", accepted)
            .add("playerId", scenario.attacker.getId()).add("kind", "move").add("waypoints", points));
        assertEquals(new FieldCoordinate(7, 4), scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker));
        assertFalse(scenario.fixture.session.isFailed());
    }

    @Test void kickoffRejectsMarkedPlayersAndRoutesIntoTheOpposingHalf() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = kickoff();
        JsonObject selection = scenario.view();
        JsonObject accepted = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
        scenario.place(scenario.attacker, "home".equals(scenario.role) ? 12 : 13, 7, PlayerState.MOVING);
        assertThrows(MatchService.Failure.class, () -> scenario.fixture.session.movementPreview(scenario.role,
            accepted.getInt("revision", -1), scenario.attacker.getId(), "move", null,
            new JsonArray().add(new JsonObject().add("x", "home".equals(scenario.role) ? 13 : 12).add("y", 7))));
        assertThrows(MatchService.Failure.class, () -> scenario.fixture.session.movementPreview(scenario.role,
            accepted.getInt("revision", -1), scenario.attacker.getId(), "blitz", scenario.defender.getId(), new JsonArray()));
        Roundup5NativeActionsTest.Scenario marked = new Roundup5NativeActionsTest.Scenario(PlayerState.STANDING);
        marked.skill(marked.attacker, "On the Ball");
        marked.game.setHomePlaying(!marked.game.isHomePlaying());
        marked.game.setTurnMode(TurnMode.KICKOFF);
        marked.state.pushCurrentStepOnStack(); marked.state.getStepStack().push(new StepKickoffReturn(marked.state)); marked.state.startNextStep();
        assertEquals(TurnMode.KICKOFF, marked.game.getTurnMode());
        assertFalse(Roundup5NativeActionsTest.has(marked.view(), "onTheBall"));
    }

    @Test void passAndKickoffRoutesMoveThreeSquaresAndRejectAFourthSquare() throws Exception {
        JsonObject contracts = new JsonObject();
        for (boolean pass : new boolean[] {false, true}) {
            Roundup5NativeActionsTest.Scenario scenario = pass ? pass() : kickoff();
            JsonObject selection = scenario.view();
            JsonObject accepted = scenario.apply(selection, byId(selection, "reaction-select:" + scenario.attacker.getId()));
            String acceptedCheckpoint = scenario.fixture.session.recoveryArtifact();
            JsonObject emptyPlan = scenario.fixture.session.movementPreview(scenario.role, accepted.getInt("revision", -1),
                scenario.attacker.getId(), "move", null, new JsonArray());
            FieldCoordinate start = scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker);
            JsonArray points = new JsonArray().add(new JsonObject().add("x", start.getX()).add("y", start.getY() - 3));
            JsonObject preview = scenario.fixture.session.movementPreview(scenario.role, accepted.getInt("revision", -1),
                scenario.attacker.getId(), "move", null, points);
            assertEquals(3, preview.get("route").asObject().get("steps").asArray().size());
            assertEquals(3, preview.get("route").asObject().getInt("remaining", -1));
            assertThrows(MatchService.Failure.class, () -> scenario.fixture.session.movementPreview(scenario.role,
                accepted.getInt("revision", -1), scenario.attacker.getId(), "move", null,
                new JsonArray().add(new JsonObject().add("x", start.getX()).add("y", start.getY() - 4))));
            JsonObject moved = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "onball-route", accepted)
                .add("playerId", scenario.attacker.getId()).add("kind", "move").add("waypoints", points)).get("state").asObject();
            assertEquals(new FieldCoordinate(start.getX(), start.getY() - 3), scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker));
            assertFalse(Roundup5NativeActionsTest.has(moved, "reactionMove"));
            SetupSession finishSession = new SetupSession(scenario.fixture.server, scenario.fixture.document, acceptedCheckpoint);
            JsonObject finished = finishSession.apply(scenario.role, scenario.fixture.request("action", "finish-without-moving", accepted)
                .add("actionId", byId(accepted, "reaction-end-player").get("id"))).get("state").asObject();
            assertFalse(scenario.fixture.session.isFailed());
            contracts.add(pass ? "pass" : "kickoff", new JsonObject().add("selection", selection)
                .add("active", accepted).add("emptyPlan", emptyPlan).add("plan", preview).add("moved", moved).add("finished", finished));
        }
        String destination = System.getenv("FFB_ON_THE_BALL_CONTRACTS");
        if (destination != null) Files.writeString(Path.of(destination), contracts.toString());
    }

    @Test void decliningPassAndKickoffResumesTheNativeSequence() throws Exception {
        for (boolean passing : new boolean[] {false, true}) {
            Roundup5NativeActionsTest.Scenario scenario = passing ? pass() : kickoff();
            JsonObject selection = scenario.view();
            JsonObject result = scenario.apply(selection, byId(selection, "reaction-stop"));
            assertEquals(passing ? TurnMode.REGULAR : TurnMode.KICKOFF, scenario.game.getTurnMode());
            assertFalse(scenario.fixture.session.isFailed());
            assertFalse(Roundup5NativeActionsTest.has(result, "onTheBall"));
        }
    }

    static Roundup5NativeActionsTest.Scenario pass() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = new Roundup5NativeActionsTest.Scenario(PlayerState.STANDING);
        scenario.skill(scenario.attacker, "On the Ball");
        scenario.place(scenario.defender, 20, 10, PlayerState.STANDING);
        scenario.game.setHomePlaying(!scenario.game.isHomePlaying());
        scenario.game.setThrowerId(scenario.defender.getId());
        scenario.game.setThrowerAction(PlayerAction.PASS_MOVE);
        scenario.game.setPassCoordinate(new FieldCoordinate(15, 10));
        scenario.game.getActingPlayer().setPlayer(scenario.defender);
        scenario.game.getActingPlayer().setPlayerAction(PlayerAction.PASS_MOVE);
        scenario.game.getActingPlayer().setOldPlayerState(scenario.game.getFieldModel().getPlayerState(scenario.defender));
        scenario.state.pushCurrentStepOnStack();
        scenario.state.getStepStack().push(new StepPassBlock(scenario.state));
        scenario.state.startNextStep();
        scenario.fixture.session.expireReactiveDecision(System.currentTimeMillis());
        return scenario;
    }

    static Roundup5NativeActionsTest.Scenario kickoff() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = new Roundup5NativeActionsTest.Scenario(PlayerState.STANDING);
        scenario.skill(scenario.attacker, "On the Ball");
        scenario.place(scenario.defender, 20, 10, PlayerState.STANDING);
        scenario.place(scenario.attacker, "home".equals(scenario.role) ? 7 : 18, 7, PlayerState.STANDING);
        scenario.game.setHomePlaying(!scenario.game.isHomePlaying());
        scenario.game.setTurnMode(TurnMode.KICKOFF);
        scenario.state.pushCurrentStepOnStack();
        scenario.state.getStepStack().push(new StepKickoffReturn(scenario.state));
        scenario.state.startNextStep();
        scenario.fixture.session.expireReactiveDecision(System.currentTimeMillis());
        return scenario;
    }

    static JsonObject byId(JsonObject view, String id) {
        JsonObject result = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(action -> action.getString("id", "").endsWith(id)).findFirst().orElse(null);
        assertNotNull(result, id + ": " + view);
        return result;
    }
}
