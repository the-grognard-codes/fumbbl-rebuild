package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogKickoffReturnParameter;
import com.fumbbl.ffb.dialog.DialogPileDriverParameter;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.TtmMechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandBlockChoice;
import com.fumbbl.ffb.net.commands.ClientCommandPileDriver;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.bb2025.block.StepBlockRoll;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepKickoffReturn;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepKickoffScatterRollAskAfter;
import com.fumbbl.ffb.server.step.bb2025.pass.StepPassBlock;
import com.fumbbl.ffb.util.UtilBox;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Roundup5NativeActionsTest {
    @Test void jumpUpRetainsTheConfirmedTargetAcrossARerollAndRecoveryAndFreeStandingDoesNotRoll() throws Exception {
        Scenario scenario = new Scenario(PlayerState.PRONE); scenario.skill(scenario.attacker, "Jump Up");
        scenario.game.getTurnData().setReRolls(1); scenario.blockRoll("push");
        JsonObject view = scenario.view(); view = scenario.apply(view, action(view, "jumpUpBlock"));
        assertEquals(StepId.JUMP_UP, scenario.state.getCurrentStep().getId());
        SetupSession restored = new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact());
        java.util.concurrent.atomic.AtomicInteger recoveredRolls = new java.util.concurrent.atomic.AtomicInteger();
        state(restored).getDiceRoller().setRecoveryRoll(sides -> recoveredRolls.getAndIncrement() == 0 ? 1 : 6);
        JsonObject reroll = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(option -> option.getString("id", "").endsWith("reroll:team")).findFirst().orElseThrow();
        JsonObject rolled = restored.apply(scenario.role, scenario.fixture.request("action", "recovered-jump-up", view)
            .add("actionId", reroll.get("id"))).get("state").asObject();
        assertTrue(has(rolled, "blockDie")); assertEquals(scenario.defender.getId(), state(restored).getGame().getDefenderId());
        assertEquals(0, state(restored).getGame().getTurnData().getReRolls());

        Scenario free = new Scenario(PlayerState.PRONE); free.skill(free.attacker, "Jump Up");
        java.util.concurrent.atomic.AtomicInteger rolls = new java.util.concurrent.atomic.AtomicInteger();
        free.state.getDiceRoller().setRecoveryRoll(sides -> { rolls.incrementAndGet(); return 1; });
        JsonObject stood = free.apply(free.view(), action(free.view(), "stand"));
        assertEquals(0, rolls.get()); assertEquals(0, free.game.getActingPlayer().getCurrentMove());
        assertTrue(has(stood, "move"));
    }

    @Test void kickoffReactionRecoveryRetainsItsCoachAndCanFinish() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING); scenario.skill(scenario.attacker, "On the Ball");
        scenario.place(scenario.defender, 20, 10, PlayerState.STANDING);
        scenario.place(scenario.attacker, "home".equals(scenario.role) ? 7 : 18, 7, PlayerState.STANDING);
        scenario.game.setHomePlaying(!scenario.game.isHomePlaying()); scenario.game.setTurnMode(TurnMode.KICKOFF);
        scenario.state.pushCurrentStepOnStack(); scenario.state.getStepStack().push(new StepKickoffReturn(scenario.state)); scenario.state.startNextStep();
        scenario.fixture.session.expireReactiveDecision(System.currentTimeMillis()); JsonObject view = scenario.view();
        SetupSession restored = new SetupSession(scenario.fixture.server, scenario.fixture.document, scenario.fixture.session.recoveryArtifact());
        JsonObject finish = action(view, "reactionEnd");
        assertEquals("WRONG_ACTOR", org.junit.jupiter.api.Assertions.assertThrows(MatchService.Failure.class,
            () -> restored.apply("home".equals(scenario.role) ? "away" : "home", scenario.fixture.request("action", "wrong-reaction-owner", view)
                .add("actionId", finish.get("id")))).code);
        restored.apply(scenario.role, scenario.fixture.request("action", "recovered-kickoff-reaction", view).add("actionId", finish.get("id")));
        assertEquals(TurnMode.KICKOFF, state(restored).getGame().getTurnMode()); assertFalse(restored.isFailed());
    }

    @Test void kickKeepsTheDecisionWhenBothDeviationsLandInTheReceivingHalf() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING);
        scenario.game.setHomePlaying(true); scenario.game.setDialogParameter(null);
        UtilBox.putAllPlayersIntoBox(scenario.game);
        Player<?> kicker = scenario.game.getTeamHome().getPlayers()[0];
        scenario.place(kicker, 7, 7, PlayerState.STANDING); scenario.skill(kicker, "Kick");
        scenario.state.getDiceRoller().setRecoveryRoll(sides -> 6);
        StepKickoffScatterRollAskAfter step = new StepKickoffScatterRollAskAfter(scenario.state);
        step.setParameter(StepParameter.from(StepParameterKey.KICKOFF_START_COORDINATE, new FieldCoordinate(19, 7))); step.start();
        assertTrue(scenario.game.getDialogParameter() instanceof com.fumbbl.ffb.dialog.DialogKickSkillParameter);
        assertEquals(StepAction.CONTINUE, step.getResult().getNextAction());
    }
    @Test void sameFaceBrawlerRerollReportsOnlyTheSelectedIndexAndRoundTrips() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING); scenario.skill(scenario.attacker, "Brawler");
        scenario.attacker.setStrength(5); scenario.blockRoll("bothdown");
        JsonObject view = scenario.view(); view = scenario.apply(view, action(view, "selectBlock")); view = scenario.apply(view, action(view, "block"));
        StepBlockRoll step = (StepBlockRoll) scenario.state.getCurrentStep();
        scenario.state.handleCommand(new ReceivedCommand(new com.fumbbl.ffb.net.commands.ClientCommandUseBrawler(), "home".equals(scenario.role)));
        assertEquals(2, step.getRerollDieIndexes().size());
        step.handleCommand(new ReceivedCommand(new ClientCommandBlockChoice(1), "home".equals(scenario.role)));
        JsonObject report = java.util.Arrays.stream(step.getResult().getReportList().getReports())
            .filter(value -> value.getId() == com.fumbbl.ffb.report.ReportId.BLOCK_RE_ROLL).findFirst().orElseThrow().toJsonValue().asObject();
        assertEquals(new com.eclipsesource.json.JsonArray().add(1), report.get("rerolledIndexes"));
        assertEquals(2, report.get("blockRoll").asArray().get(0).asInt());
        assertEquals(new com.eclipsesource.json.JsonArray().add(2).add(2), report.get("blockRollAfterReroll"));
        assertEquals(scenario.defender.getId(), report.getString("defenderId", null));
        JsonObject followingPool = java.util.Arrays.stream(step.getResult().getReportList().getReports())
            .filter(value -> value.getId() == com.fumbbl.ffb.report.ReportId.BLOCK_ROLL).findFirst().orElseThrow().toJsonValue().asObject();
        assertEquals(report.get("blockRollAfterReroll"), followingPool.get("blockRoll"));
        com.fumbbl.ffb.report.bb2025.ReportBlockReRoll restored = new com.fumbbl.ffb.report.bb2025.ReportBlockReRoll().initFrom(scenario.game.getRules(), report);
        assertEquals(report, restored.toJsonValue()); assertEquals(report, restored.transform(scenario.game.getRules()).toJsonValue());
        exportReroll("ordinary", step.getResult().getReportList());
    }

    @Test void multipleBlockPartialRerollReportsItsFullPoolAndTarget() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING);
        scenario.skill(scenario.attacker, "Multiple Block"); scenario.skill(scenario.attacker, "Brawler");
        scenario.attacker.setStrength(8); scenario.blockRoll("bothdown");
        scenario.place(scenario.game.getOtherTeam(scenario.attacker.getTeam()).getPlayers()[1], 7, 6, PlayerState.STANDING);
        JsonObject view = scenario.view(); view = scenario.apply(view, action(view, "declareMultipleBlock"));
        view = scenario.apply(view, action(view, "multiBlock"));
        com.fumbbl.ffb.server.step.bb2025.mutliblock.StepBlockRollMultiple step =
            (com.fumbbl.ffb.server.step.bb2025.mutliblock.StepBlockRollMultiple) scenario.state.getCurrentStep();
        step.handleCommand(new ReceivedCommand(new com.fumbbl.ffb.net.commands.ClientCommandUseBrawler(scenario.defender.getId()), "home".equals(scenario.role)));
        JsonObject report = java.util.Arrays.stream(step.getResult().getReportList().getReports())
            .filter(value -> value.getId() == com.fumbbl.ffb.report.ReportId.BLOCK_RE_ROLL).findFirst().orElseThrow().toJsonValue().asObject();
        assertEquals(scenario.defender.getId(), report.getString("defenderId", null));
        assertEquals(new com.eclipsesource.json.JsonArray().add(0), report.get("rerolledIndexes"));
        assertTrue(report.get("blockRollAfterReroll").asArray().size() > report.get("blockRoll").asArray().size());
        assertEquals(2, report.get("blockRollAfterReroll").asArray().get(0).asInt());
        assertEquals(report, new com.fumbbl.ffb.report.bb2025.ReportBlockReRoll().initFrom(scenario.game.getRules(), report).toJsonValue());
        exportReroll("multiple", step.getResult().getReportList());
    }

    private void exportReroll(String kind, com.fumbbl.ffb.report.ReportList reports) throws Exception {
        String export = System.getenv("ROUNDUP5_REROLL_FIXTURES");
        if (export != null) java.nio.file.Files.writeString(java.nio.file.Path.of(export),
            new JsonObject().add("kind", kind).add("reportList", reports.toJsonValue()).toString() + System.lineSeparator(),
            java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
    }

    @Test void passOnTheBallSelectMoveAndDeclineRestoreTheThrowersTurn() throws Exception {
        for (boolean move : new boolean[] {false, true}) {
            Scenario scenario = new Scenario(PlayerState.STANDING); scenario.skill(scenario.attacker, "On the Ball");
            scenario.place(scenario.defender, 20, 10, PlayerState.STANDING);
            scenario.place(scenario.attacker, "home".equals(scenario.role) ? 7 : 18, 7, PlayerState.STANDING);
            scenario.game.setHomePlaying(!scenario.game.isHomePlaying());
            scenario.game.getActingPlayer().setPlayerId(scenario.defender.getId()); scenario.game.getActingPlayer().setPlayerAction(PlayerAction.PASS);
            scenario.game.setThrowerId(scenario.defender.getId()); scenario.game.setThrowerAction(PlayerAction.PASS);
            scenario.game.setPassCoordinate(new FieldCoordinate(15, 7));
            scenario.state.pushCurrentStepOnStack(); StepPassBlock step = new StepPassBlock(scenario.state);
            StepParameterSet parameters = new StepParameterSet(); parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_END, "unused")); step.init(parameters);
            scenario.state.getStepStack().push(step); scenario.state.startNextStep();
            scenario.fixture.session.expireReactiveDecision(System.currentTimeMillis()); JsonObject view = scenario.view();
            assertEquals(TurnMode.PASS_BLOCK, scenario.game.getTurnMode());
            if (move) {
                JsonObject select = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                    .filter(option -> option.getString("id", "").contains("reaction-select:" + scenario.attacker.getId())).findFirst().orElseThrow();
                view = scenario.apply(view, select); assertTrue(has(view, "reactionMove"));
                view = scenario.apply(view, action(view, "reactionMove"));
            }
            view = scenario.apply(view, action(view, "reactionEnd"));
            assertEquals(TurnMode.REGULAR, scenario.game.getTurnMode());
            assertEquals(scenario.defender.getId(), scenario.game.getActingPlayer().getPlayerId());
            assertFalse(scenario.role.equals(scenario.game.isHomePlaying() ? "home" : "away"));
            assertFalse(scenario.fixture.session.isFailed());
        }
    }
    @Test void pileDriverOrdinaryBlockAcceptDeclineAndRefereeFinishWithoutUsingTheFoulAllowance() throws Exception {
        for (boolean accept : new boolean[] {false, true}) for (boolean foulAlreadyUsed : new boolean[] {false, true}) {
            Scenario scenario = new Scenario(PlayerState.STANDING); scenario.skill(scenario.attacker, "Pile Driver");
            com.fumbbl.ffb.model.TurnData turn = scenario.game.getTurnData();
            scenario.game.getTurnData().setFoulUsed(foulAlreadyUsed); scenario.blockRoll("pow");
            JsonObject view = scenario.view(); view = scenario.apply(view, action(view, "selectBlock"));
            view = scenario.apply(view, action(view, "block"));
            for (int index = 0; index < 12 && !has(view, "pileDriver"); index++) {
                JsonObject choice = resolution(view); assertNotNull(choice, view.toString()); view = scenario.apply(view, choice);
            }
            assertTrue(has(view, "pileDriver"), view.toString());
            assertEquals("Pile Driver", view.get("reaction").asObject().getString("title", null));
            final boolean use = accept;
            if (foulAlreadyUsed) {
                List<DiceCategory> safeFoul = new ArrayList<>();
                for (int value : new int[] {2, 3}) { DiceCategory die = new DiceCategory(); die.parseCommand(Integer.toString(value), scenario.game, scenario.attacker.getTeam()); safeFoul.add(die); }
                scenario.state.getDiceRoller().getTestRolls().put("General", safeFoul);
            }
            JsonObject choice = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(option -> use != option.getString("id", "").contains("decline")).findFirst().orElseThrow();
            view = scenario.apply(view, choice);
            for (int index = 0; index < 12 && scenario.game.getActingPlayer().getPlayer() != null; index++) {
                JsonObject continuation = resolution(view); assertNotNull(continuation, view.toString()); view = scenario.apply(view, continuation);
            }
            assertNull(scenario.game.getActingPlayer().getPlayer());
            assertEquals(accept ? 1 : 0, scenario.game.getGameResult().getPlayerResult(scenario.attacker).getFouls());
            assertEquals(foulAlreadyUsed, turn.isFoulUsed());
            assertNull(scenario.game.getTurnData().getLimitedAction(scenario.attacker.getId()));
            assertNull(scenario.fixture.player(view, scenario.attacker.getId()).get("limitedAction"));
        }
    }

    @Test void kickoffOnTheBallSelectMoveFinishAndDeclineResumeTheKickoff() throws Exception {
        for (boolean move : new boolean[] {false, true}) {
            Scenario scenario = new Scenario(PlayerState.STANDING); scenario.skill(scenario.attacker, "On the Ball");
            scenario.place(scenario.defender, 20, 10, PlayerState.STANDING);
            scenario.place(scenario.attacker, "home".equals(scenario.role) ? 7 : 18, 7, PlayerState.STANDING);
            scenario.game.setHomePlaying(!scenario.game.isHomePlaying()); scenario.game.setTurnMode(TurnMode.KICKOFF);
            FieldCoordinate initial = scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker);
            scenario.state.pushCurrentStepOnStack(); scenario.state.getStepStack().push(new StepKickoffReturn(scenario.state)); scenario.state.startNextStep();
            scenario.fixture.session.expireReactiveDecision(System.currentTimeMillis()); JsonObject view = scenario.view();
            assertEquals(TurnMode.KICKOFF_RETURN, scenario.game.getTurnMode());
            assertNotNull(view.get("reaction"));
            if (move) {
                JsonObject select = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                    .filter(option -> option.getString("id", "").contains("reaction-select:" + scenario.attacker.getId())).findFirst().orElseThrow();
                view = scenario.apply(view, select); assertTrue(has(view, "reactionMove"), view.toString());
                view = scenario.apply(view, action(view, "reactionMove"));
                assertFalse(initial.equals(scenario.game.getFieldModel().getPlayerCoordinate(scenario.attacker)));
            }
            view = scenario.apply(view, action(view, "reactionEnd"));
            assertEquals(TurnMode.KICKOFF, scenario.game.getTurnMode());
            assertNull(scenario.game.getDialogParameter()); assertFalse(scenario.fixture.session.isFailed());
        }
    }

    @Test void puntDirectionsCommitTargetingAndExecutionTogetherIncludingCrowdDirections() throws Exception {
        for (int edge : new int[] {7, 0}) for (int direction = 0; direction < 4; direction++) {
            Scenario scenario = new Scenario(PlayerState.STANDING);
            scenario.skill(scenario.attacker, "Punt"); scenario.place(scenario.attacker, 7, edge, PlayerState.STANDING);
            scenario.game.getFieldModel().setBallCoordinate(new FieldCoordinate(7, edge)); scenario.game.getFieldModel().setBallMoving(false);
            JsonObject view = scenario.view(); assertNotNull(action(view, "declarePunt"));
            view = scenario.apply(view, action(view, "declarePunt"));
            List<JsonObject> directions = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(option -> "puntDirection".equals(option.getString("kind", null))).collect(java.util.stream.Collectors.toList());
            assertEquals(4, directions.size()); assertEquals(PlayerAction.PUNT_MOVE, scenario.game.getActingPlayer().getPlayerAction());
            view = scenario.apply(view, directions.get(direction));
            assertTrue(scenario.game.getTurnData().isPuntUsed() || !scenario.role.equals(scenario.game.isHomePlaying() ? "home" : "away"));
            assertFalse(scenario.state.getCurrentStep().getId() == StepId.INIT_PUNT, view.toString());
        }
    }

    static JsonObject resolution(JsonObject view) {
        for (String kind : new String[] {"blockDie", "push", "followUp", "argueTheCall", "apothecary", "bribe"}) {
            JsonObject option = action(view, kind);
            if (kind.equals("followUp")) option = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(candidate -> candidate.getString("id", "").endsWith("follow-up:yes")).findFirst().orElse(option);
            if (option != null) return option;
        }
        return null;
    }
    @Test void eyeGougeRequiresACompletedPushAndAStandingDefender() throws Exception {
        for (String outcome : new String[] {"push", "stumble-dodge", "stumble", "pow", "stand-firm", "blitz-push"}) {
            Scenario scenario = new Scenario(PlayerState.STANDING); scenario.skill(scenario.attacker, "Eye Gouge");
            if (outcome.equals("stumble-dodge")) scenario.skill(scenario.defender, "Dodge");
            if (outcome.equals("stand-firm")) scenario.skill(scenario.defender, "Stand Firm");
            scenario.blockRoll(outcome.startsWith("stumble") ? "stumble" : outcome.equals("pow") ? "pow" : "push");
            JsonObject view = scenario.view();
            if (outcome.startsWith("blitz")) {
                view = scenario.fixture.session.apply(scenario.role, scenario.fixture.request("movement", "blitz-eye", view)
                    .add("playerId", scenario.attacker.getId()).add("kind", "blitz")
                    .add("targetPlayerId", scenario.defender.getId()).add("waypoints", new com.eclipsesource.json.JsonArray()))
                    .get("state").asObject();
            } else {
                view = scenario.apply(view, action(view, "selectBlock")); view = scenario.apply(view, action(view, "block"));
            }
            for (int index = 0; index < 12; index++) {
                JsonObject choice = null;
                for (JsonValue value : view.get("actions").asArray()) {
                    JsonObject candidate = value.asObject(); String kind = candidate.getString("kind", "");
                    if (kind.equals("blockDie") || kind.equals("push") || kind.equals("followUp")
                        || kind.equals("skill") && candidate.getString("id", "").endsWith(":true")) { choice = candidate; break; }
                }
                if (choice == null) break;
                if (choice.getString("kind", "").equals("push"))
                    assertFalse(scenario.game.getFieldModel().getPlayerState(scenario.defender).isEyeGouged(), "Pending push cannot apply Eye Gouge");
                view = scenario.apply(view, choice);
            }
            assertEquals(outcome.equals("push") || outcome.equals("stumble-dodge") || outcome.equals("blitz-push"),
                scenario.game.getFieldModel().getPlayerState(scenario.defender).isEyeGouged(), outcome);
        }
    }
    @Test void proneThrowAndKickDeclarationsDoNotRequireAThrowableTeamMate() throws Exception {
        for (String kind : new String[] {"declareThrowTeamMate", "declareKickTeamMate"}) {
            Scenario scenario = new Scenario(PlayerState.PRONE);
            scenario.skill(scenario.attacker, "Throw Team-Mate"); scenario.skill(scenario.attacker, "Kick Team-Mate");
            TtmMechanic mechanic = scenario.game.getMechanic(Mechanic.Type.TTM);
            assertTrue(mechanic.canThrow(scenario.game, scenario.attacker));
            JsonObject ready = scenario.view();
            JsonObject declaration = action(ready, kind);
            assertNotNull(declaration, kind + " must be available without an on-pitch team-mate");
            JsonObject declared = scenario.apply(ready, declaration);
            assertEquals(scenario.attacker.getId(), declared.getString("activePlayerId", null));
            assertTrue(scenario.game.getActingPlayer().isStandingUp());
            assertFalse(has(declared, "liftTeamMate")); assertFalse(has(declared, "kickMate"));
        }
    }

    @Test void bothTouchbackKickOutcomesSkipTheSkillDecision() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING);
        scenario.game.setHomePlaying(true); scenario.game.setDialogParameter(null);
        UtilBox.putAllPlayersIntoBox(scenario.game);
        Player<?> kicker = scenario.game.getTeamHome().getPlayers()[0];
        scenario.place(kicker, 7, 7, PlayerState.STANDING); scenario.skill(kicker, "Kick");
        // Pin direction and distance through the persisted step seam, then start it as a fresh roll.
        scenario.state.getDiceRoller().setRecoveryRoll(sides -> 6);
        StepKickoffScatterRollAskAfter step = new StepKickoffScatterRollAskAfter(scenario.state);
        step.setParameter(StepParameter.from(StepParameterKey.KICKOFF_START_COORDINATE, new FieldCoordinate(13, 14)));
        step.start();
        assertNull(scenario.game.getDialogParameter(), "Both full and halved southward deviations leave the receiving half");
        assertEquals(StepAction.NEXT_STEP, step.getResult().getNextAction());
        assertTrue(scenario.game.getFieldModel().isOutOfBounds());
    }

    @Test void kickoffOnTheBallHasOptionalSelectionAndFinishCommands() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING);
        scenario.skill(scenario.attacker, "On the Ball");
        scenario.game.setTurnMode(TurnMode.KICKOFF_RETURN);
        scenario.game.setDialogParameter(new DialogKickoffReturnParameter());
        List<CoreTurnActions.Action> actions = new ReactiveSkillActions().actions(scenario.state, Collections.emptySet());
        assertTrue(actions.stream().anyMatch(action -> action.id.startsWith("reaction-select:")), actions.toString());
        assertTrue(actions.stream().anyMatch(action -> action.id.equals("reaction-stop")));
    }

    @Test void pileDriverNativeDialogProjectsAcceptAndDeclineForItsCoach() throws Exception {
        Scenario scenario = new Scenario(PlayerState.STANDING);
        scenario.game.setDialogParameter(new DialogPileDriverParameter(scenario.attacker.getTeam().getId(),
            Collections.singletonList(scenario.defender.getId())));
        List<CoreTurnActions.Action> actions = new CorePromptActions(scenario.state).actions();
        assertEquals(2, actions.size());
        assertTrue(actions.stream().allMatch(action -> action.role.equals(scenario.role)));
        assertTrue(actions.stream().anyMatch(action -> action.command instanceof ClientCommandPileDriver
            && ((ClientCommandPileDriver) action.command).getPlayerId() == null));
        assertTrue(actions.stream().anyMatch(action -> action.command instanceof ClientCommandPileDriver
            && scenario.defender.getId().equals(((ClientCommandPileDriver) action.command).getPlayerId())));
    }

    @Test void jumpUpTargetsCommitOneNativeBlockAndPreserveFailurePosture() throws Exception {
        for (int roll : new int[] {6, 1}) {
            Scenario scenario = new Scenario(PlayerState.PRONE); scenario.skill(scenario.attacker, "Jump Up");
            scenario.state.getDiceRoller().setRecoveryRoll(sides -> roll);
            JsonObject ready = scenario.view();
            JsonObject jump = action(ready, "jumpUpBlock");
            assertNotNull(jump, "Prone Jump Up player beside a standing opponent has a target-specific action");
            assertEquals(scenario.defender.getId(), jump.get("target").asObject().getString("playerId", null));
            JsonObject committed = scenario.apply(ready, jump);
            if (roll == 6) {
                assertTrue(has(committed, "blockDie"), committed.toString());
                assertEquals(scenario.defender.getId(), scenario.game.getDefenderId());
            } else {
                assertEquals(PlayerState.PRONE, scenario.game.getFieldModel().getPlayerState(scenario.attacker).getBase());
                assertFalse(scenario.game.getFieldModel().getPlayerState(scenario.attacker).isActive());
                assertFalse(has(committed, "blockDie"));
            }
        }
    }

    static JsonObject action(JsonObject view, String kind) {
        return view.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(action -> kind.equals(action.getString("kind", null))).findFirst().orElse(null);
    }
    static boolean has(JsonObject view, String kind) { return action(view, kind) != null; }
    static GameState state(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
    }
    static final class Scenario {
        final SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        final GameState state;
        final Game game;
        final Player<?> attacker, defender;
        final String role;
        int request;
        Scenario(int posture) throws Exception {
            state = state(fixture.session); state.getDiceRoller().setRecoveryRoll(sides -> 1); fixture.advanceToTurn();
            game = state.getGame(); role = game.isHomePlaying() ? "home" : "away";
            attacker = game.getActingTeam().getPlayers()[0]; defender = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game); place(attacker, 7, 7, posture); place(defender, 8, 7, PlayerState.STANDING);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(20, 2)); game.getFieldModel().setBallMoving(true);
            game.getTurnData().setReRolls(0); game.getTurnData().setPassUsed(false); game.getTurnData().setFoulUsed(false);
        }
        void place(Player<?> player, int x, int y, int posture) {
            game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
            game.getFieldModel().setPlayerState(player, new PlayerState(posture).changeActive(true));
        }
        void skill(Player<?> player, String name) { ((RosterPlayer) player).addSkill(game.getRules().getSkillFactory().forName(name)); }
        void blockRoll(String face) {
            List<DiceCategory> rolls = new ArrayList<>();
            for (int index = 0; index < 12; index++) { BlockDiceCategory roll = new BlockDiceCategory(); roll.parseCommand(face, game, game.getTeamHome()); rolls.add(roll); }
            state.getDiceRoller().getTestRolls().put("Block", rolls);
        }
        JsonObject view() { return fixture.session.decorateSaveResume(fixture.session.reply("load", "ACCEPTED", false, role)).get("state").asObject(); }
        JsonObject apply(JsonObject view, JsonObject action) {
            JsonObject result = fixture.session.decorateSaveResume(fixture.session.apply(action.getString("actor", role), fixture.request("action", "roundup5-" + request++, view)
                .add("actionId", action.get("id")))).get("state").asObject();
            return result;
        }
    }
}
