package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.ApothecaryType;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.IDialogParameter;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogApothecaryChoiceParameter;
import com.fumbbl.ffb.dialog.DialogArgueTheCallParameter;
import com.fumbbl.ffb.dialog.DialogBribesParameter;
import com.fumbbl.ffb.dialog.DialogUseApothecaryParameter;
import com.fumbbl.ffb.factory.InducementTypeFactory;
import com.fumbbl.ffb.inducement.Inducement;
import com.fumbbl.ffb.inducement.InducementType;
import com.fumbbl.ffb.inducement.Usage;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepStack;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepApplyKickoffResult;
import com.fumbbl.ffb.server.step.generator.Sequence;
import com.fumbbl.ffb.server.step.generator.bb2025.Select;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Cross-runtime regression: server offers -> shipped Node policy -> accepted native action. Requires Node 26. */
class ComputerCoachNativeDecisionTest {
    @Test void fiftySelectionTogglesStopWithoutEndingTheEventAndRestoreStartsAFreshStage() throws Exception {
        for (KickoffResult event : new KickoffResult[] { KickoffResult.CHARGE, KickoffResult.QUICK_SNAP, KickoffResult.SOLID_DEFENCE }) {
            BogrukEngineFixture fixture = kickoffFixture(event);
            JsonObject view = fixture.reply("away").get("state").asObject();
            String toggle = view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .map(action -> action.getString("id", "")).filter(id -> id.contains("event-pick:")).findFirst().orElseThrow().split(":", 2)[1];
            for (int i = 0; i < 50; i++) {
                view = rawAction(fixture, view, toggle, "toggle-" + i).get("state").asObject();
            }
            assertEquals("selection", view.get("kickoff").asObject().getString("stage", null));
            assertTrue(view.get("actions").asArray().values().stream()
                .noneMatch(value -> value.asObject().getString("id", "").contains("event-pick:")));
            assertRejectedWithoutMutation(fixture, view, toggle);
            fixture.restore();
            view = fixture.reply("away").get("state").asObject();
            assertEquals(0, view.getInt("stageSeq", 0));
            view = rawAction(fixture, view, toggle, "first-after-restore").get("state").asObject();
            if (event == KickoffResult.SOLID_DEFENCE) {
                String player = toggle.substring("event-pick:".length());
                JsonObject request = actionRequest(fixture, view, "event-confirm", "confirm-selection")
                    .add("playerIds", new JsonArray().add(player));
                view = fixture.session.apply("away", request).get("state").asObject();
                assertEquals("movement", view.get("kickoff").asObject().getString("stage", null));
                assertEquals(0, nativeState(fixture).getCurrentStep().toJsonValue().getInt("kickoffAdjustments", 0),
                    "Movement has a fresh stage allowance after fifty selection toggles");
                assertTrue(view.get("actions").asArray().values().stream()
                    .anyMatch(value -> "kickoffMove".equals(value.asObject().getString("kind", null))));
            } else assertEquals("ACCEPTED", rawAction(fixture, view, "decline-event", "decline").getString("code", null));
        }
    }

    @Test void everyOfferedSolidDefencePlacementChangesPositions() throws Exception {
        BogrukEngineFixture fixture = kickoffFixture(KickoffResult.SOLID_DEFENCE);
        JsonObject view = fixture.reply("away").get("state").asObject();
        JsonArray chosen = new JsonArray();
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (action.getString("id", "").contains("event-pick:") && chosen.size() < 5)
                chosen.add(action.get("target").asObject().getString("playerId", null));
        }
        assertEquals(5, chosen.size());
        fixture.session.apply("away", actionRequest(fixture, view, "event-confirm", "selection").add("playerIds", chosen));
        GameState state = nativeState(fixture);
        Game game = state.getGame();
        // A restored soak checkpoint can retain active flags on unselected players.
        // Selection, not activation state, authorizes Solid Defence redeployment.
        for (Player<?> player : game.getTeamAway().getPlayers())
            game.getFieldModel().setPlayerState(player, game.getFieldModel().getPlayerState(player).changeActive(true));
        IStep step = state.getCurrentStep();
        JsonObject nativeStep = step.toJsonValue();
        Map<Player<?>, FieldCoordinate> base = new LinkedHashMap<>();
        for (Player<?> player : game.getTeamAway().getPlayers()) base.put(player, game.getFieldModel().getPlayerCoordinate(player));
        List<CoreTurnActions.Action> uninterrupted = new KickoffActions(state).actions();
        GameState interrupted = mock(GameState.class);
        IStep interruption = mock(IStep.class);
        when(interrupted.getGame()).thenReturn(game);
        when(interrupted.getCurrentStep()).thenReturn(interruption);
        when(interruption.getId()).thenReturn(StepId.APOTHECARY);
        when(interruption.toJsonValue()).thenReturn(new JsonObject());
        StepStack stack = new StepStack(interrupted);
        stack.push(step);
        when(interrupted.getStepStack()).thenReturn(stack);
        List<CoreTurnActions.Action> offers = new KickoffActions(interrupted).actions();
        assertEquals(uninterrupted.size(), offers.size(), "An interruption retains all native selected-player placements and swaps");
        int moves = 0, swaps = 0;
        for (CoreTurnActions.Action action : offers) {
            if (!action.id.startsWith("solid-place:")) continue;
            ClientCommandSetupPlayer command = (ClientCommandSetupPlayer) action.command;
            Player<?> player = game.getPlayerById(command.getPlayerId());
            FieldCoordinate from = game.getFieldModel().getPlayerCoordinate(player);
            Player<?> occupant = game.getFieldModel().getPlayer(command.getCoordinate().transform());
            step.handleCommand(new ReceivedCommand(command, false));
            assertNotEquals(from, game.getFieldModel().getPlayerCoordinate(player), action.id + " must move its player");
            if (occupant != null) {
                assertEquals(from, game.getFieldModel().getPlayerCoordinate(occupant), "Offered swaps move both selected players");
                swaps++;
            }
            moves++;
            // Replay each offer independently without hitting the technical stage cap.
            for (Player<?> reset : base.keySet()) game.getFieldModel().setPlayerCoordinate(reset, null);
            base.forEach((reset, square) -> game.getFieldModel().setPlayerCoordinate(reset, square));
            step.initFrom(game.getRules(), nativeStep);
        }
        assertTrue(moves > 0);
        assertTrue(swaps > 0, "The fixture exercises selected-player swaps as well as empty targets");
    }

    @Test void fiftySolidDefencePlacementsWithFivePlayersLeaveConfirmationAndRejectFiftyOne() throws Exception {
        for (boolean illegalLast : new boolean[] { false, true }) {
            BogrukEngineFixture fixture = kickoffFixture(KickoffResult.SOLID_DEFENCE);
            JsonObject view = fixture.reply("away").get("state").asObject();
            JsonArray chosen = new JsonArray();
            for (JsonValue value : view.get("actions").asArray()) {
                JsonObject action = value.asObject();
                if (action.getString("id", "").contains("event-pick:") && chosen.size() < 5)
                    chosen.add(action.get("target").asObject().getString("playerId", null));
            }
            assertEquals(5, chosen.size());
            JsonObject confirm = actionRequest(fixture, view, "event-confirm", "selection").add("playerIds", chosen);
            view = fixture.session.apply("away", confirm).get("state").asObject();
            JsonArray base = JsonArray.readFrom(view.get("players").toString());
            String player = chosen.get(0).asString();
            String placement = null;
            for (int i = 0; i < 50; i++) {
                placement = "solid-place:" + player + ":" + 17 + ":" + (illegalLast && i == 49 ? 13 : i % 2 == 0 ? 1 : 2);
                view = rawAction(fixture, view, placement, "placement-" + i).get("state").asObject();
            }
            assertEquals(5, view.get("kickoff").asObject().getInt("selected", -1));
            assertEquals(1, view.get("actions").asArray().size());
            assertRejectedWithoutMutation(fixture, view, placement);
            if (illegalLast) assertEquals(base, view.get("players"), "An illegal last edit restores the stage's base positions");
            fixture.restore();
            view = fixture.reply("away").get("state").asObject();
            assertEquals(base, view.get("players"));
            assertEquals(0, view.getInt("stageSeq", 0));
            assertEquals("ACCEPTED", rawAction(fixture, view, "confirm-solid-defence", "confirm").getString("code", null));
        }
    }

    private JsonObject rawAction(BogrukEngineFixture fixture, JsonObject view, String action, String id) {
        JsonObject response = fixture.session.apply("away", actionRequest(fixture, view, action, id));
        assertEquals("ACCEPTED", response.getString("code", null));
        return response;
    }

    private JsonObject actionRequest(BogrukEngineFixture fixture, JsonObject view, String action, String id) {
        return new JsonObject().add("version", 2).add("type", "setup").add("operation", "action")
            .add("matchId", fixture.document.matchId).add("requestId", id).add("expectedRevision", view.get("revision"))
            .add("actionId", view.getInt("revision", -1) + ":" + action);
    }

    private void assertRejectedWithoutMutation(BogrukEngineFixture fixture, JsonObject view, String action) {
        String before = fixture.session.recoveryArtifact();
        MatchService.Failure failure = assertThrows(MatchService.Failure.class,
            () -> fixture.session.apply("away", actionRequest(fixture, view, action, "over-limit")));
        assertEquals("INVALID_OPTION", failure.code);
        assertEquals(before, fixture.session.recoveryArtifact(), "Rejected adjustment changes no state, revision, history or event");
    }
    @Test void genericLimitEndsAChargeActivationWithoutStartingANormalTurn() throws Exception {
        BogrukEngineFixture fixture = kickoffFixture(KickoffResult.CHARGE);
        JsonObject view = fixture.reply("away").get("state").asObject();
        for (int i = 0; "selection".equals(view.get("kickoff").asObject().getString("stage", null)) && i < 10; i++) {
            JsonObject outcome = choose(view, false, 0.99);
            view = fixture.apply("away", request(fixture, view, outcome, "charge-select-" + i)).get("state").asObject();
        }
        assertEquals("BLITZ", view.getString("turnMode", null));
        fillDecisionBudget(fixture, view);
        JsonObject response = fixture.apply("away", request(fixture, view, choose(view, false, 0.99), "charge-limit"));
        assertEquals("ACCEPTED", response.getString("code", null));
        assertEquals("KICKOFF", response.get("state").asObject().getString("turnMode", null));
        assertTrue(response.get("state").asObject().get("kickoff") == null);
    }

    @Test void genericLimitIgnoresStagedSelectionAcrossAllThreeKickoffEvents() throws Exception {
        for (KickoffResult event : new KickoffResult[] { KickoffResult.CHARGE, KickoffResult.QUICK_SNAP, KickoffResult.SOLID_DEFENCE }) {
            BogrukEngineFixture fixture = kickoffFixture(event);
            JsonObject view = fixture.reply("away").get("state").asObject();
            fillDecisionBudget(fixture, view);
            JsonObject outcome = choose(view, false, 0.99);
            JsonObject request = request(fixture, view, outcome, "limit");
            PrintStream previous = System.err;
            ByteArrayOutputStream warnings = new ByteArrayOutputStream();
            JsonObject response;
            try (PrintStream capture = new PrintStream(warnings, true, StandardCharsets.UTF_8)) {
                System.setErr(capture);
                response = fixture.apply("away", request);
            } finally { System.setErr(previous); }
            assertEquals("ACCEPTED", response.getString("code", null));
            assertEquals("selection", response.get("state").asObject().get("kickoff").asObject().getString("stage", null));
            assertEquals(view.get("revision"), response.get("state").asObject().get("revision"));
            assertFalse(warnings.toString(StandardCharsets.UTF_8).contains("DECISION_LIMIT"));
        }
    }

    @Test void genericLimitEndsANormalTurnThroughNativeCleanup() throws Exception {
        BogrukEngineFixture fixture = kickoffFixture(KickoffResult.CHARGE);
        GameState state = nativeState(fixture);
        state.getGame().setTurnMode(TurnMode.REGULAR);
        state.getGame().setDialogParameter(null);
        state.getGame().setHomePlaying(true);
        state.getGame().getTurnDataHome().setTurnNr(1);
        state.getStepStack().clear();
        new Select().pushSequence(new Select.SequenceParams(state, false));
        state.startNextStep();
        JsonObject view = fixture.reply("home").get("state").asObject();
        assertEquals("REGULAR", view.getString("turnMode", null));
        String role = view.getString("actor", null);
        fillDecisionBudget(fixture, view);
        JsonObject select = null;
        for (JsonValue value : view.get("actions").asArray())
            if ("select".equals(value.asObject().getString("kind", null))) { select = value.asObject(); break; }
        assertNotNull(select);
        JsonObject outcome = choose(view, "home".equals(role), 0.99);
        outcome.set("decision", new JsonObject().add("operation", "action").add("actionId", select.get("id")));
        JsonObject result = fixture.apply(role, request(fixture, view, outcome, "normal-limit"));
        assertEquals("ACCEPTED", result.getString("code", null));
        assertFalse(role.equals(result.get("state").asObject().getString("actor", null)), "Forced native turn end advances the coach");
    }

    private void fillDecisionBudget(BogrukEngineFixture fixture, JsonObject view) {
        JsonArray events = new JsonArray();
        events.add(new JsonObject().add("kind", "START").add("state", view));
        JsonObject recorded = new JsonObject().add("kind", "ACTION").add("state", view);
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 1; i++) events.add(recorded);
        fixture.session.restoreDecisionLimit(events);
    }

    private JsonObject request(BogrukEngineFixture fixture, JsonObject view, JsonObject outcome, String id) {
        JsonObject request = JsonObject.readFrom(outcome.get("decision").toString()).add("version", 2).add("type", "setup")
            .add("matchId", fixture.document.matchId).add("requestId", id).add("expectedRevision", view.get("revision"));
        if ("away".equals(view.getString("callerRole", null))) request.add("computerDecision", new JsonObject()
            .add("policyVersion", "bogruk-v1").add("reason", outcome.get("reason")).add("nextPolicyState", outcome.get("nextPolicyState")));
        return request;
    }

    @Test void bogrukParticipatesInEveryOfferedKickoffEventAndFinishesLegally() throws Exception {
        for (KickoffResult event : new KickoffResult[] { KickoffResult.CHARGE, KickoffResult.QUICK_SNAP, KickoffResult.SOLID_DEFENCE }) {
            BogrukEngineFixture fixture = kickoffFixture(event);
            JsonObject view = fixture.reply("away").get("state").asObject();
            assertEquals("away", view.get("kickoff").asObject().getString("actor", null), event.name());
            int selections = 0, moves = 0;
            boolean finished = false;
            for (int count = 0; count < 80; count++) {
                JsonObject outcome = choose(view, false, 0.99);
                JsonObject decision = outcome.get("decision").asObject();
                String id = decision.getString("actionId", "");
                JsonObject action = offered(view, id);
                assertNotNull(action, event + " uses an offered action");
                assertFalse(id.endsWith("decline-event"), event + " must participate");
                if (id.contains("event-pick:")) selections++;
                if ("kickoffMove".equals(action.getString("kind", null)) || "move".equals(action.getString("kind", null))) moves++;
                if (id.endsWith("event-confirm")) assertTrue(selections > 0, event + " cannot confirm an empty selection");
                JsonObject request = new JsonObject().add("version", 2).add("type", "setup")
                    .add("matchId", fixture.document.matchId).add("requestId", "kickoff-" + count)
                    .add("expectedRevision", view.get("revision")).add("operation", "action").add("actionId", id)
                    .add("computerDecision", new JsonObject().add("policyVersion", "bogruk-v1")
                        .add("reason", outcome.get("reason")).add("nextPolicyState", outcome.get("nextPolicyState")));
                JsonObject response = fixture.apply("away", request);
                assertEquals("ACCEPTED", response.getString("code", null), event + ": " + id);
                view = response.get("state").asObject();
                if (view.get("kickoff") == null || view.get("kickoff").isNull()) { finished = true; break; }
            }
            assertTrue(finished, event + " finishes within a bounded number of decisions");
            assertTrue(moves > 0, event + " takes an offered movement from a formation with a canonical empty target");
        }
    }

    @Test void resourceAcceptanceIsAlwaysBogrukAndHalfRandomRegardlessOfOfferCount() throws Exception {
        BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
        Game game = nativeState(fixture).getGame();
        Player<?> first = game.getTeamAway().getPlayers()[0], second = game.getTeamAway().getPlayers()[1];
        DialogArgueTheCallParameter argue = new DialogArgueTheCallParameter(game.getTeamAway().getId(), false, false, 0);
        argue.addPlayerIds(new String[] { first.getId(), second.getId() });
        DialogBribesParameter bribe = new DialogBribesParameter(game.getTeamAway().getId(), 1);
        bribe.addPlayerIds(new String[] { first.getId(), second.getId() });
        InducementType bribeType = ((InducementTypeFactory) game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE)).allTypes().stream()
            .filter(type -> type.hasUsage(Usage.AVOID_BAN)).findFirst().orElseThrow();
        game.getTurnDataAway().getInducementSet().addInducement(new Inducement(bribeType, 1));
        for (IDialogParameter dialog : new IDialogParameter[] {
            new DialogUseApothecaryParameter(first.getId(), new PlayerState(PlayerState.BADLY_HURT), null,
                Arrays.asList(ApothecaryType.TEAM, ApothecaryType.WANDERING, ApothecaryType.PLAGUE)), argue, bribe }) {
            JsonObject view = promptView(fixture, dialog);
            for (double draw : new double[] { 0, 0.49, 0.5, 0.99 }) {
                String bogruk = choose(view, false, draw).get("decision").asObject().getString("actionId", "");
                assertFalse(bogruk.endsWith(":no"), "Bogruk uses " + dialog.getId());
                String random = choose(view, true, draw).get("decision").asObject().getString("actionId", "");
                assertEquals(draw >= 0.5, random.endsWith(":no"), "Independent 50/50 acceptance: " + dialog.getId());
            }
        }
    }

    @Test void bothCoachesKeepTheLeastHarmfulNativeApothecaryResultInEitherOrder() throws Exception {
        BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
        Player<?> injured = nativeState(fixture).getGame().getTeamAway().getPlayers()[0];
        for (boolean oldBetter : new boolean[] { true, false }) {
            DialogApothecaryChoiceParameter dialog = new DialogApothecaryChoiceParameter(injured.getId(),
                new PlayerState(oldBetter ? PlayerState.BADLY_HURT : PlayerState.RIP), null,
                new PlayerState(oldBetter ? PlayerState.RIP : PlayerState.BADLY_HURT), null);
            JsonObject view = promptView(fixture, dialog);
            for (boolean random : new boolean[] { false, true }) for (double draw : new double[] { 0, 0.99 }) {
                assertTrue(choose(view, random, draw).get("decision").asObject().getString("actionId", "")
                    .endsWith(oldBetter ? "injury:old" : "injury:new"));
            }
        }
    }


    private BogrukEngineFixture kickoffFixture(KickoffResult event) throws Exception {
        BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
        GameState state = nativeState(fixture);
        Game game = state.getGame();
        for (Team team : new Team[] { game.getTeamHome(), game.getTeamAway() }) {
            int index = 0;
            for (Player<?> player : team.getPlayers()) {
                int homeX = index < 3 ? 12 : 8;
                game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(team == game.getTeamHome() ? homeX : 25 - homeX,
                    index == 6 ? 12 : index == 10 ? 14 : index < 3 ? 6 + index : index));
                game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true));
                index++;
            }
        }
        game.setHomePlaying(event == KickoffResult.QUICK_SNAP);
        game.setTurnMode(TurnMode.KICKOFF);
        game.setDialogParameter(null);
        Sequence sequence = new Sequence(state);
        sequence.add(StepId.APPLY_KICKOFF_RESULT,
            StepParameter.from(StepParameterKey.GOTO_LABEL_ON_END, "finished"),
            StepParameter.from(StepParameterKey.GOTO_LABEL_ON_BLITZ, "charge"));
        StepApplyKickoffResult kickoff = (StepApplyKickoffResult) sequence.getSequence().get(0);
        kickoff.setParameter(StepParameter.from(StepParameterKey.KICKOFF_RESULT, event));
        sequence.jump("finished");
        sequence.add(StepId.BLITZ_TURN, "charge");
        sequence.add(StepId.COIN_CHOICE, "finished");
        state.getStepStack().clear();
        state.getStepStack().push(sequence.getSequence());
        state.getDiceRoller().setRecoveryRoll(sides -> Math.min(3, sides));
        state.startNextStep();
        return fixture;
    }

    private JsonObject promptView(BogrukEngineFixture fixture, IDialogParameter dialog) throws Exception {
        Game game = nativeState(fixture).getGame();
        game.setDialogParameter(dialog);
        GameState state = mock(GameState.class);
        IStep step = mock(IStep.class);
        when(state.getGame()).thenReturn(game);
        when(state.getCurrentStep()).thenReturn(step);
        when(step.getId()).thenReturn(StepId.BRIBES);
        List<CoreTurnActions.Action> actions = new CorePromptActions(state).actions();
        assertTrue(actions.size() >= 2);
        JsonArray offered = new JsonArray();
        for (CoreTurnActions.Action action : actions) offered.add(new JsonObject().add("id", "1:" + action.id)
            .add("kind", action.kind).add("label", action.label).add("actor", action.role).add("target", JsonValue.NULL));
        JsonObject view = fixture.reply("away").get("state").asObject();
        return view.set("phase", "PLAY").set("actor", "away").set("prompt", JsonValue.NULL).set("actions", offered);
    }

    private JsonObject choose(JsonObject view, boolean randomCoach, double draw) throws Exception {
        Path root = Path.of("").toAbsolutePath();
        if (!root.resolve("computer-player").toFile().isDirectory()) root = root.getParent();
        String node = System.getenv().getOrDefault("FFB_COMPUTER_POLICY_NODE", "node");
        Process process = new ProcessBuilder(node,
            root.resolve("computer-player/test/native-decision.mjs").toString()).redirectError(ProcessBuilder.Redirect.INHERIT).start();
        try (var input = process.getOutputStream()) {
            input.write(new JsonObject().add("state", view).add("randomCoach", randomCoach).add("draw", draw)
                .toString().getBytes(StandardCharsets.UTF_8));
        }
        assertTrue(process.waitFor(10, TimeUnit.SECONDS), "Node policy completes");
        assertEquals(0, process.exitValue(), "Node policy exits successfully");
        return JsonObject.readFrom(new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
    }

    private JsonObject offered(JsonObject view, String id) {
        for (JsonValue action : view.get("actions").asArray()) if (id.equals(action.asObject().getString("id", null))) return action.asObject();
        return null;
    }

    private GameState nativeState(BogrukEngineFixture fixture) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        return (GameState) field.get(fixture.session);
    }
}
