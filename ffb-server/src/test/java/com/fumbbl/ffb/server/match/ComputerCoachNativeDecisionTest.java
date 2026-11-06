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
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepApplyKickoffResult;
import com.fumbbl.ffb.server.step.generator.Sequence;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Cross-runtime regression: server offers -> shipped Node policy -> accepted native action. Requires Node 26. */
class ComputerCoachNativeDecisionTest {
    @Test void bogrukParticipatesInEveryOfferedKickoffEventAndFinishesLegally() throws Exception {
        for (KickoffResult event : new KickoffResult[] { KickoffResult.CHARGE, KickoffResult.QUICK_SNAP, KickoffResult.SOLID_DEFENCE }) {
            BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 42);
            GameState state = nativeState(fixture);
            Game game = state.getGame();
            for (Team team : new Team[] { game.getTeamHome(), game.getTeamAway() }) {
                int index = 0;
                for (Player<?> player : team.getPlayers()) {
                    int homeX = index < 3 ? 12 : 8;
                    game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(team == game.getTeamHome() ? homeX : 25 - homeX,
                        index < 3 ? 6 + index : index));
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
            state.startNextStep();
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
            assertTrue(moves > 0, event + " takes an offered movement");
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
