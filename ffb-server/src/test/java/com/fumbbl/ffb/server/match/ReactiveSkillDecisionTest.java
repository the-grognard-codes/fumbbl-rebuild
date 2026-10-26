package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.Direction;
import com.fumbbl.ffb.CatchScatterThrowInMode;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.PushbackSquare;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.bb2025.block.StepPushback;
import com.fumbbl.ffb.server.step.bb2025.move.StepShadowing;
import com.fumbbl.ffb.server.step.action.block.StepDumpOff;
import com.fumbbl.ffb.server.step.bb2025.block.StepTrickster;
import com.fumbbl.ffb.server.step.bb2025.shared.StepPlaceBall;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReactiveSkillDecisionTest {
    @Test void nativeTackleAndTentaclesPromptsExposeCalculatedTargetsAndTimeoutAsDeclines() throws Exception {
        for (String name : new String[] {"Diving Tackle", "Tentacles"}) {
            SetupSessionMovementTest.Fixture fixture = fixture(); GameState state = state(fixture.session); Game game = state.getGame();
            game.setHomePlaying(true); game.setThrowerId(null); UtilBox.putAllPlayersIntoBox(game);
            Player<?> mover = game.getTeamHome().getPlayers()[0], reactor = game.getTeamAway().getPlayers()[0];
            place(game, mover, 9, 7); place(game, reactor, 7, 8);
            ((RosterPlayer) reactor).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName(name));
            game.getActingPlayer().setPlayerId(mover.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.MOVE); game.getActingPlayer().setDodging(true);
            state.pushCurrentStepOnStack();
            if ("Diving Tackle".equals(name)) {
                com.fumbbl.ffb.server.step.action.move.StepDivingTackle step = new com.fumbbl.ffb.server.step.action.move.StepDivingTackle(state);
                step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_FROM, new FieldCoordinate(8, 7)));
                step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_TO, new FieldCoordinate(9, 7)));
                step.setParameter(StepParameter.from(StepParameterKey.DODGE_ROLL, 4)); state.getStepStack().push(step);
            } else {
                com.fumbbl.ffb.server.step.mixed.move.StepTentacles step = new com.fumbbl.ffb.server.step.mixed.move.StepTentacles(state);
                step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_FROM, new FieldCoordinate(8, 7))); state.getStepStack().push(step);
            }
            state.startNextStep(); fixture.session.expireReactiveDecision(System.currentTimeMillis());
            JsonObject before = live(fixture.session, "away"); JsonObject reaction = before.get("reaction").asObject();
            assertEquals("away", reaction.getString("actor", null));
            assertTrue(reaction.getString("detail", "").contains("Diving Tackle".equals(name) ? "5+, rolled 4" : "6+"), reaction.toString());
            assertTrue(fixture.session.expireReactiveDecision(reaction.getLong("expiresAt", -1)));
            assertEquals(new FieldCoordinate(7, 8), game.getFieldModel().getPlayerCoordinate(reactor));
            assertFalse(fixture.session.isFailed());
        }
    }

    @Test void alreadyCommittedSideStepRecoveryCompletesALegalDestinationAtExpiry() throws Exception {
        SetupSessionMovementTest.Fixture fixture = pushback("Sidestep", false);
        GameState state = state(fixture.session); Player<?> defender = state.getGame().getDefender();
        state.handleCommand(new com.fumbbl.ffb.server.net.ReceivedCommand(new ClientCommandUseSkill(
            ((SkillFactory) state.getGame().getFactory(FactoryType.Factory.SKILL)).forName("Sidestep"), true, defender.getId(), null, false), false));
        SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        JsonObject before = live(recovered, "away");
        assertTrue(before.get("reaction").asObject().getString("title", "").contains("Sidestep"));
        assertTrue(recovered.expireReactiveDecision(before.get("reaction").asObject().getLong("expiresAt", -1)));
        assertFalse(new FieldCoordinate(8, 7).equals(state(recovered).getGame().getFieldModel().getPlayerCoordinate(state(recovered).getGame().getPlayerById(defender.getId()))));
    }

    @Test void ownTurnBallPlacementRetainsClockOwnershipAndTeamControlAcrossRecovery() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture(); GameState state = state(fixture.session); Game game = state.getGame();
        game.setHomePlaying(true); Player<?> carrier = game.getTeamHome().getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game); place(game, carrier, 8, 7);
        ((RosterPlayer) carrier).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName("Safe Pair of Hands"));
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(8, 7)); game.getFieldModel().setBallMoving(false);
        state.pushCurrentStepOnStack(); StepPlaceBall placement = new StepPlaceBall(state);
        placement.setParameter(StepParameter.from(StepParameterKey.DROPPED_BALL_CARRIER, carrier.getId()));
        placement.setParameter(StepParameter.from(StepParameterKey.CATCH_SCATTER_THROW_IN_MODE, CatchScatterThrowInMode.SCATTER_BALL));
        state.getStepStack().push(placement); state.startNextStep(); fixture.session.expireReactiveDecision(System.currentTimeMillis());
        SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        assertTrue(state(recovered).getTurnTimeStarted() > 0);
        JsonObject view = live(recovered, "home");
        recovered.apply("home", fixture.request("action", "decline-placement", view).add("actionId", view.getInt("revision", -1) + ":reaction-decline"));
        assertTrue(state(recovered).getGame().isHomePlaying());
    }

    @Test void selectedPlayersOptionalRerollSharesTheActivationDeadline() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture(); GameState state = state(fixture.session); Game game = state.getGame();
        game.setHomePlaying(true); Player<?> player = game.getTeamAway().getPlayers()[0];
        game.setDialogParameter(new DialogPlayerChoiceParameter(game.getTeamAway().getId(), PlayerChoiceMode.SHADOWING, new Player<?>[] {player}, null, 1));
        ReactiveDecision decision = new ReactiveDecision();
        decision.refresh(state, new ReactiveSkillActions().actions(state, Collections.emptySet()), 1, 1000);
        String id = decision.id();
        game.setDialogParameter(new com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter(player.getId(), com.fumbbl.ffb.ReRolledActions.SHADOWING,
            4, Collections.emptyList(), false, null, null, null, null, null));
        List<Action> actions = new CorePromptActions(state).actions();
        decision.refresh(state, actions, 2, 12_000);
        assertEquals(id, decision.id()); assertEquals(31_000, decision.publicJson(12_000).getLong("expiresAt", -1));
        assertEquals("reroll:none", decision.decline(state, actions).id);
    }

    @Test void movementTimerWaitsForTheOtherCoachsNestedReactionWithoutResettingItsAllowance() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture(); GameState state = state(fixture.session); Game game = state.getGame();
        game.setHomePlaying(false); game.setTurnMode(com.fumbbl.ffb.TurnMode.PASS_BLOCK); game.getActingPlayer().setPlayerId(null);
        game.setDialogParameter(null);
        ReactiveDecision decision = new ReactiveDecision(); ReactiveSkillActions catalog = new ReactiveSkillActions();
        decision.refresh(state, catalog.actions(state, Collections.emptySet()), 1, 1000);
        String movementId = decision.id();
        assertEquals(0, state.getTurnTimeStarted(), "The normal clock pauses during the opponent's movement");
        Player<?> reactor = game.getTeamHome().getPlayers()[0];
        game.setDialogParameter(new DialogPlayerChoiceParameter(game.getTeamHome().getId(), PlayerChoiceMode.TENTACLES, new Player<?>[] {reactor}, null, 1));
        decision.refresh(state, catalog.actions(state, Collections.emptySet()), 2, 12_000);
        assertEquals("home", decision.actor()); assertEquals(42_000, decision.publicJson(12_000).getLong("expiresAt", -1));
        assertTrue(state.getTurnTimeStarted() > 0, "The normal turn coach's nested choice consumes normal turn time");
        assertFalse(decision.checkpoint().getBoolean("paused", true));
        ReactiveDecision recovered = new ReactiveDecision(); recovered.restore(decision.checkpoint());
        String tentaclesId = recovered.id();
        recovered.refresh(state, catalog.actions(state, Collections.emptySet()), 3, 17_000);
        assertEquals(tentaclesId, recovered.id()); assertEquals(42_000, recovered.publicJson(17_000).getLong("expiresAt", -1));
        game.setDialogParameter(new DialogPlayerChoiceParameter(game.getTeamHome().getId(), PlayerChoiceMode.DIVING_TACKLE, new Player<?>[] {reactor}, null, 1));
        recovered.refresh(state, catalog.actions(state, Collections.emptySet()), 4, 20_000);
        assertFalse(tentaclesId.equals(recovered.id()), "A different nested skill receives its own activation");
        assertEquals(50_000, recovered.publicJson(20_000).getLong("expiresAt", -1));
        ReactiveDecision nextRecovered = new ReactiveDecision(); nextRecovered.restore(recovered.checkpoint());
        game.setDialogParameter(null);
        nextRecovered.refresh(state, catalog.actions(state, Collections.emptySet()), 5, 22_000);
        assertEquals("away", nextRecovered.actor()); assertEquals(movementId, nextRecovered.id());
        assertEquals(41_000, nextRecovered.publicJson(22_000).getLong("expiresAt", -1));
        assertEquals(0, state.getTurnTimeStarted(), "The normal clock pauses when the opponent resumes movement");
    }

    @Test void idleServerDeadlineDeclinesAndPublishesWithoutAnyCoachRequest() throws Exception {
        SetupSessionMovementTest.Fixture fixture = pushback("Stand Firm", false);
        fixture.session.expireReactiveDecision(System.currentTimeMillis());
        long deadline = live(fixture.session, "away").get("reaction").asObject().get("expiresAt").asLong();
        SetupApplication application = new SetupApplication(fixture.server, org.mockito.Mockito.mock(MatchService.class), null, false,
            Clock.fixed(Instant.ofEpochMilli(deadline), ZoneOffset.UTC));
        Field sessions = SetupApplication.class.getDeclaredField("sessions"); sessions.setAccessible(true);
        @SuppressWarnings("unchecked") Map<String, SetupSession> resident = (Map<String, SetupSession>) sessions.get(application);
        resident.put(fixture.document.matchId, fixture.session);
        Map<String, JsonObject> publications = application.expireReactiveDecisions();
        assertTrue(publications.containsKey(fixture.document.matchId));
        assertNull(state(fixture.session).getGame().getDialogParameter());
        assertTrue(application.expireReactiveDecisions().isEmpty(), "Expiry must execute once");
    }

    @Test void onTheBallKeepsCompletedMoveAndStopsRemainingMovementAtTheOriginalDeadline() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture(); GameState state = state(fixture.session); Game game = state.getGame();
        game.setHomePlaying(true); UtilBox.putAllPlayersIntoBox(game);
        Player<?> passer = game.getTeamHome().getPlayers()[0], reactor = game.getTeamAway().getPlayers()[0];
        place(game, passer, 10, 7); place(game, reactor, 15, 7);
        game.getFieldModel().setPlayerState(passer, new PlayerState(PlayerState.STANDING).changeActive(true));
        ((RosterPlayer) reactor).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName("On The Ball"));
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(10, 7)); game.getFieldModel().setBallMoving(false);
        JsonObject before = live(fixture.session, "home");
        before = perform(fixture, before, "declarePass", "home");
        JsonObject pass = before.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(action -> "pass".equals(action.getString("kind", "")) && action.get("target").asObject().getInt("x", -1) == 12
                && action.get("target").asObject().getInt("y", -1) == 7).findFirst().orElseThrow(AssertionError::new);
        fixture.session.apply("home", fixture.request("action", "start-pass", before).add("actionId", pass.get("id")));
        JsonObject reaction = live(fixture.session, "away");
        long deadline = reaction.get("reaction").asObject().get("expiresAt").asLong();
        assertEquals(0, state.getTurnTimeStarted());
        reaction = perform(fixture, reaction, "reactiveSkill", "away");
        reaction = perform(fixture, reaction, "reactionMove", "away");
        FieldCoordinate completed = game.getFieldModel().getPlayerCoordinate(reactor);
        assertFalse(new FieldCoordinate(15, 7).equals(completed));
        assertEquals(deadline, reaction.get("reaction").asObject().get("expiresAt").asLong());
        fixture.session.expireReactiveDecision(deadline);
        assertFalse(game.getTurnMode() == com.fumbbl.ffb.TurnMode.PASS_BLOCK);
        assertEquals(completed, game.getFieldModel().getPlayerCoordinate(reactor));
    }

    @Test void tricksterAndSafePairOfHandsHaveAtomicTargetsAndCanDeclineBeforeCommitting() throws Exception {
        for (String skill : new String[] {"Trickster", "Safe Pair of Hands", "Dump-Off"}) {
            SetupSessionMovementTest.Fixture fixture = fixture(); GameState state = state(fixture.session); Game game = state.getGame();
            game.setHomePlaying(true); UtilBox.putAllPlayersIntoBox(game);
            Player<?> attacker = game.getTeamHome().getPlayers()[0], defender = game.getTeamAway().getPlayers()[0];
            place(game, attacker, 7, 7); place(game, defender, 8, 7);
            ((RosterPlayer) defender).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName(skill));
            game.getActingPlayer().setPlayerId(attacker.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK); game.setDefenderId(defender.getId());
            game.getActingPlayer().setOldPlayerState(new PlayerState(PlayerState.STANDING));
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(8, 7)); game.getFieldModel().setBallMoving(false);
            state.pushCurrentStepOnStack();
            if ("Trickster".equals(skill)) state.getStepStack().push(new StepTrickster(state));
            else if ("Dump-Off".equals(skill)) state.getStepStack().push(new StepDumpOff(state));
            else {
                StepPlaceBall step = new StepPlaceBall(state);
                step.setParameter(StepParameter.from(StepParameterKey.DROPPED_BALL_CARRIER, defender.getId()));
                step.setParameter(StepParameter.from(StepParameterKey.CATCH_SCATTER_THROW_IN_MODE, CatchScatterThrowInMode.SCATTER_BALL));
                state.getStepStack().push(step);
            }
            state.startNextStep(); fixture.session.expireReactiveDecision(System.currentTimeMillis());
            JsonObject before = live(fixture.session, "away");
            assertTrue(before.get("actions").asArray().values().stream().anyMatch(value -> "reactiveSquare".equals(value.asObject().getString("kind", ""))), skill);
            if ("Dump-Off".equals(skill)) {
                com.fumbbl.ffb.mechanics.PassRangeService range = new com.fumbbl.ffb.mechanics.PassRangeService();
                assertTrue(range.isInRange(game, defender, new FieldCoordinate(9, 7), PlayerAction.DUMP_OFF));
                assertFalse(range.isInRange(game, defender, new FieldCoordinate(14, 7), PlayerAction.DUMP_OFF));
                assertTrue(range.isInRange(game, defender, new FieldCoordinate(14, 7), PlayerAction.PASS));
                assertTrue(before.get("actions").asArray().values().stream().map(JsonValue::asObject)
                    .filter(value -> "reactiveSquare".equals(value.getString("kind", "")))
                    .allMatch(value -> Math.abs(value.get("target").asObject().getInt("x", -1) - 8) <= 3));
            }
            SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            JsonObject selected = before.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(value -> "reactiveSquare".equals(value.getString("kind", ""))).findFirst().orElseThrow(AssertionError::new);
            restored.apply("away", fixture.request("action", "atomic-use", before).add("actionId", selected.get("id")));
            assertFalse(state(restored).getCurrentStep() instanceof com.fumbbl.ffb.server.step.mixed.pass.StepInitPassing, "Pass target must be dispatched after native transition");
            long deadline = before.get("reaction").asObject().get("expiresAt").asLong();
            fixture.session.expireReactiveDecision(deadline);
            assertEquals(new FieldCoordinate(8, 7), game.getFieldModel().getPlayerCoordinate(defender), skill);
            assertEquals(new FieldCoordinate(8, 7), game.getFieldModel().getBallCoordinate(), skill);
        }
    }

    @Test void allApprovedNativeSkillDialogsHaveCorrectOwnerAndDeclineWithoutChangingAutomaticBehavior() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        GameState state = state(fixture.session);
        Game game = state.getGame();
        game.getActingPlayer().setPlayerId(game.getActingTeam().getPlayers()[0].getId());
        game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
        for (String name : new String[] {"Dodge", "Stand Firm", "Sidestep", "Wrestle", "Fend", "Taunt", "Dump-Off", "Trickster", "Steady Footing", "Safe Pair of Hands", "Saboteur", "Dwarfen Grit"}) {
            Player<?> player = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            com.fumbbl.ffb.model.skill.Skill skill = ((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName(name);
            assertNotNull(skill, name);
            game.setDialogParameter(new DialogSkillUseParameter(player.getId(), skill, 4));
            List<Action> actions = new ReactiveSkillActions().actions(state, Collections.emptySet());
            if (actions.isEmpty()) actions = new CorePromptActions(state).actions();
            ReactiveDecision decision = new ReactiveDecision();
            decision.refresh(state, actions, 1, 1000);
            assertEquals(game.getTeamHome().hasPlayer(player) ? "home" : "away", decision.actor(), name);
            assertFalse(((ClientCommandUseSkill) decision.decline(state, actions).command).isSkillUsed(), name);
            assertFalse(decision.due(30_999));
            assertTrue(decision.due(31_000));
            assertTrue(decision.publicJson(1000).getString("title", "").contains("4+"));
            game.setDialogParameter(null);
            decision.refresh(state, Collections.emptyList(), 2, 2000);
            assertFalse(decision.pending());
        }
    }

    @Test void playerSelectorsUseNativeModesAndCanAlwaysDeclineOptionalUse() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        GameState state = state(fixture.session);
        Game game = state.getGame();
        Player<?> player = game.getTeamAway().getPlayers()[0];
        for (PlayerChoiceMode mode : new PlayerChoiceMode[] {PlayerChoiceMode.TENTACLES, PlayerChoiceMode.SHADOWING,
            PlayerChoiceMode.DIVING_TACKLE, PlayerChoiceMode.ARM_BAR, PlayerChoiceMode.CATCH, PlayerChoiceMode.DIVING_CATCH}) {
            game.setDialogParameter(new DialogPlayerChoiceParameter(game.getTeamAway().getId(), mode, new Player<?>[] {player}, new String[] {"native context"}, 1));
            List<Action> actions = new ReactiveSkillActions().actions(state, Collections.emptySet());
            assertEquals(2, actions.size());
            assertEquals("away", actions.get(0).role);
            assertEquals(mode, ((ClientCommandPlayerChoice) actions.get(0).command).getPlayerChoiceMode());
            if (mode != PlayerChoiceMode.DIVING_TACKLE) assertTrue(actions.get(0).label.contains("native context"));
            assertEquals(0, ((ClientCommandPlayerChoice) actions.get(1).command).getPlayerIds().length);
        }
    }

    @Test void nativeStandFirmTimeoutDeclinesAndRetainsClockDeadlineAcrossRecovery() throws Exception {
        SetupSessionMovementTest.Fixture fixture = pushback("Stand Firm", false);
        SetupSession session = fixture.session;
        session.expireReactiveDecision(System.currentTimeMillis());
        JsonObject before = live(session, "away");
        JsonObject reaction = before.get("reaction").asObject();
        long deadline = reaction.get("expiresAt").asLong();
        assertEquals("away", reaction.getString("actor", null));
        assertEquals(0, state(session).getTurnTimeStarted());
        assertEquals("WRONG_ACTOR", assertThrows(MatchService.Failure.class, () -> session.apply("home",
            fixture.request("action", "wrong-coach", before).add("actionId", before.getInt("revision", -1) + ":skill:true"))).code);
        assertFalse(session.expireReactiveDecision(deadline - 1));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, session.recoveryArtifact());
        assertEquals(deadline, live(restored, "away").get("reaction").asObject().get("expiresAt").asLong());
        assertTrue(restored.expireReactiveDecision(deadline));
        assertNull(state(restored).getGame().getDialogParameter());
        assertTrue(live(restored, "home").get("actions").asArray().values().stream().anyMatch(value -> "push".equals(value.asObject().getString("kind", ""))));
        for (JsonValue event : com.eclipsesource.json.JsonArray.readFrom(JsonObject.readFrom(restored.recoveryArtifact()).get("payload").asObject().get("eventsJson").asString()))
            assertNull(event.asObject().get("state").asObject().get("reaction"), "Replay must not contain a live deadline");
        JsonObject stale = fixture.request("action", "late-use", before).add("actionId", before.getInt("revision", -1) + ":skill:true");
        assertEquals("STALE_REVISION", assertThrows(MatchService.Failure.class, () -> restored.apply("away", stale)).code);
    }

    @Test void nativeSideStepCommitsUseAndDestinationInOneActionForEitherCoach() throws Exception {
        for (boolean own : new boolean[] {false, true}) {
            SetupSessionMovementTest.Fixture fixture = pushback("Sidestep", own);
            fixture.session.expireReactiveDecision(System.currentTimeMillis());
            String role = own ? "home" : "away";
            JsonObject before = live(fixture.session, role);
            JsonObject choice = before.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(value -> "reactiveSquare".equals(value.getString("kind", ""))).findFirst().orElseThrow(AssertionError::new);
            assertEquals(role, choice.getString("actor", null));
            if (own) assertTrue(state(fixture.session).getTurnTimeStarted() > 0, "Own-turn choices must keep the normal clock running");
            Player<?> defender = state(fixture.session).getGame().getDefender();
            assertEquals(defender.getId(), choice.getString("sourcePlayerId", null));
            JsonObject payload = JsonObject.readFrom(fixture.session.recoveryArtifact()).get("payload").asObject();
            String legacySource = new ActionSource().actingPlayerId(state(fixture.session).getGame(), role);
            for (String seat : new String[] { "homeView", "awayView" })
                for (JsonValue value : payload.get(seat).asObject().get("actions").asArray())
                    value.asObject().set("sourcePlayerId", legacySource == null ? JsonValue.NULL : JsonValue.valueOf(legacySource));
            SetupSession restored = new SetupSession(fixture.server, fixture.document,
                new RecoveryArtifactJson().encode(payload, 128 * 1024 * 1024));
            JsonObject recovered = live(restored, role);
            assertEquals(before.get("actions"), recovered.get("actions"), "Recovery retains exact destinations and corrects their graphical owner");
            assertEquals(before.get("reaction").asObject().get("expiresAt"), recovered.get("reaction").asObject().get("expiresAt"));
            payload.get("homeView").asObject().get("actions").asArray().get(0).asObject().set("sourcePlayerId", "unrelated-player");
            assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class, () -> new SetupSession(fixture.server, fixture.document,
                new RecoveryArtifactJson().encode(payload, 128 * 1024 * 1024))).code);
            JsonObject result = restored.apply(role, fixture.request("action", "choose-square", recovered).add("actionId", choice.get("id")));
            assertEquals("ACCEPTED", result.getString("code", null));
            JsonObject target = choice.get("target").asObject();
            assertEquals(new FieldCoordinate(target.getInt("x", -1), target.getInt("y", -1)), state(restored).getGame().getFieldModel().getPlayerCoordinate(state(restored).getGame().getPlayerById(defender.getId())));
        }
    }

    @Test void sidestepTimeoutDeclinesOptionalUseWithoutChoosingADestination() throws Exception {
        for (boolean own : new boolean[] { false, true }) {
            SetupSessionMovementTest.Fixture fixture = pushback("Sidestep", own);
            fixture.session.expireReactiveDecision(System.currentTimeMillis());
            String role = own ? "home" : "away";
            JsonObject before = live(fixture.session, role);
            Player<?> defender = state(fixture.session).getGame().getDefender();
            assertTrue(fixture.session.expireReactiveDecision(before.get("reaction").asObject().getLong("expiresAt", -1)));
            assertEquals(new FieldCoordinate(8, 7), state(fixture.session).getGame().getFieldModel().getPlayerCoordinate(defender));
            assertFalse(fixture.session.isFailed());
            assertTrue(live(fixture.session, "home").get("actions").asArray().values().stream()
                .anyMatch(value -> "push".equals(value.asObject().getString("kind", null))));
        }
    }

    @Test void nativeShadowingHasUseAndDeclineAndRecoversItsOptionalState() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        GameState state = state(fixture.session);
        Game game = state.getGame();
        game.setHomePlaying(true);
        game.setThrowerId(null);
        UtilBox.putAllPlayersIntoBox(game);
        Player<?> mover = game.getTeamHome().getPlayers()[0], shadower = game.getTeamAway().getPlayers()[0];
        place(game, mover, 9, 7); place(game, shadower, 8, 8);
        ((RosterPlayer) shadower).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName("Shadowing"));
        game.getActingPlayer().setPlayerId(mover.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.MOVE);
        state.pushCurrentStepOnStack();
        StepShadowing shadowing = new StepShadowing(state);
        shadowing.setParameter(StepParameter.from(StepParameterKey.COORDINATE_FROM, new FieldCoordinate(8, 7)));
        state.getStepStack().push(shadowing); state.startNextStep();
        fixture.session.expireReactiveDecision(System.currentTimeMillis());
        JsonObject before = live(fixture.session, "away");
        assertTrue(before.get("reaction").asObject().getString("title", "").contains("4+"));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        JsonObject response = restored.apply("away", fixture.request("action", "decline-shadowing", before)
            .add("actionId", before.getInt("revision", -1) + ":reaction-decline"));
        assertEquals("ACCEPTED", response.getString("code", null));
        assertEquals(new FieldCoordinate(8, 8), state(restored).getGame().getFieldModel().getPlayerCoordinate(state(restored).getGame().getPlayerById(shadower.getId())));
        SetupSession using = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        state(using).getDiceRoller().setRecoveryRoll(sides -> 6);
        using.apply("away", fixture.request("action", "use-shadowing", before)
            .add("actionId", before.getInt("revision", -1) + ":reaction-player:" + shadower.getId()));
        assertEquals(new FieldCoordinate(8, 7), state(using).getGame().getFieldModel().getPlayerCoordinate(state(using).getGame().getPlayerById(shadower.getId())));
    }

    private SetupSessionMovementTest.Fixture fixture() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        state(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
        fixture.advanceToTurn();
        return fixture;
    }

    private JsonObject perform(SetupSessionMovementTest.Fixture fixture, JsonObject view, String kind, String role) {
        JsonObject action = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
            .filter(value -> kind.equals(value.getString("kind", "")) && !value.getString("id", "").contains("decline"))
            .findFirst().orElseThrow(() -> new AssertionError("Missing " + kind + " in " + view));
        fixture.session.apply(role, fixture.request("action", "perform-" + view.getInt("revision", -1), view).add("actionId", action.get("id")));
        return live(fixture.session, role);
    }

    private SetupSessionMovementTest.Fixture pushback(String skill, boolean own) throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        GameState state = state(fixture.session); Game game = state.getGame(); game.setHomePlaying(true);
        UtilBox.putAllPlayersIntoBox(game);
        Player<?> attacker = game.getTeamHome().getPlayers()[0], defender = (own ? game.getTeamHome() : game.getTeamAway()).getPlayers()[1];
        place(game, attacker, 7, 7); place(game, defender, 8, 7);
        ((RosterPlayer) defender).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName(skill));
        game.setDefenderId(defender.getId()); game.getActingPlayer().setPlayerId(attacker.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.BLOCK);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(20, 7)); game.getFieldModel().setBallMoving(true);
        state.pushCurrentStepOnStack(); StepPushback pushback = new StepPushback(state);
        pushback.setParameter(StepParameter.from(StepParameterKey.STARTING_PUSHBACK_SQUARE, new PushbackSquare(new FieldCoordinate(8, 7), Direction.EAST, true)));
        pushback.setParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
        state.getStepStack().push(pushback); state.startNextStep();
        return fixture;
    }

    private void place(Game game, Player<?> player, int x, int y) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING));
    }
    private GameState state(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
    }
    private JsonObject live(SetupSession session, String role) {
        JsonObject view = session.decorateSaveResume(session.reply("load", "ACCEPTED", false, role)).get("state").asObject();
        String export = System.getProperty("reactive.fixture");
        if (export != null) {
            try {
                java.nio.file.Files.write(java.nio.file.Paths.get(export), (view.toString() + System.lineSeparator()).getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
            } catch (java.io.IOException failure) { throw new AssertionError("Could not export native reaction contract", failure); }
        }
        return view;
    }
}
