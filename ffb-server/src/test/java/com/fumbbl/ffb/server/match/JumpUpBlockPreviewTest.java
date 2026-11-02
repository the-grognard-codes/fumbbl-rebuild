package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.util.ServerUtilBlock;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JumpUpBlockPreviewTest {
    @Test void forecastsBothLegalTargetsWithoutMutatingThePronePlayerOrConsumingDice() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = scenario();
        String before = scenario.fixture.session.recoveryArtifact();
        JsonObject ready = scenario.view();
        JsonObject preview = ready.get("blockPreview") == null ? null : ready.get("blockPreview").asObject();
        assertNotNull(preview, "Legal Jump Up blocks must offer native block dice and assist guidance");
        assertEquals(2, preview.get("rolls").asArray().values().stream().map(JsonValue::asObject)
            .filter(roll -> scenario.attacker.getId().equals(roll.getString("playerId", null))).count(),
            "Both Jump Up targets must have their own forecast");
        JsonObject first = roll(ready, scenario.attacker.getId(), scenario.defender.getId());
        JsonObject second = roll(ready, scenario.attacker.getId(), scenario.defender.getTeam().getPlayers()[1].getId());
        assertNotEquals(first.getInt("dice", 0), second.getInt("dice", 0));
        assertFalse(first.get("highlight").asObject().get("offensiveAssists").asArray().isEmpty());
        assertFalse(first.get("highlight").asObject().get("defensiveAssists").asArray().isEmpty());
        assertNotEquals(first.get("highlight"), second.get("highlight"));
        assertEquals(PlayerState.PRONE, scenario.game.getFieldModel().getPlayerState(scenario.attacker).getBase());
        assertEquals(before, scenario.fixture.session.recoveryArtifact(), "Projection must not change native state, reports, or dice queues");
        String other = "home".equals(scenario.role) ? "away" : "home";
        assertNull(scenario.fixture.session.reply("load", "ACCEPTED", false, other).get("state").asObject().get("blockPreview"));
        JsonObject spectator = scenario.fixture.session.spectatorView();
        assertNull(spectator.get("blockPreview"));
        String destination = System.getenv("FFB_JUMP_UP_PREVIEW_FIXTURE");
        if (destination != null) Files.writeString(Path.of(destination), new JsonObject().add("ready", ready).add("spectator", spectator).toString());
    }

    @Test void forecastsMatchSuccessfulNativeJumpUpBlocksForEitherTarget() throws Exception {
        for (int targetIndex : new int[] {0, 1}) {
            Roundup5NativeActionsTest.Scenario scenario = scenario();
            Player<?> target = scenario.defender.getTeam().getPlayers()[targetIndex];
            JsonObject ready = scenario.view();
            assertNotNull(ready.get("blockPreview"), "Jump Up forecast missing");
            JsonObject expected = roll(ready, scenario.attacker.getId(), target.getId());
            JsonObject declaration = ready.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "jumpUpBlock".equals(action.getString("kind", null))
                    && target.getId().equals(action.get("target").asObject().getString("playerId", null))).findFirst().orElseThrow();
            scenario.state.getDiceRoller().setRecoveryRoll(sides -> 6); scenario.blockRoll("push");
            JsonObject committed = scenario.apply(ready, declaration);
            JsonObject keep = committed.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> action.getString("id", "").endsWith("block-reroll:none")).findFirst().orElse(null);
            if (keep != null) committed = scenario.apply(committed, keep);
            assertTrue(Roundup5NativeActionsTest.has(committed, "blockDie"), committed.toString());
            assertEquals(expected.getInt("dice", 0), ServerUtilBlock.findNrOfBlockDice(scenario.state, scenario.attacker, target, false, false));
            assertEquals(Math.abs(expected.getInt("dice", 0)), committed.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "blockDie".equals(action.getString("kind", null))).count());
            assertEquals(expected.get("highlight"), new BlockHighlightProjection().project(scenario.game, scenario.attacker.getId(), target.getId(), false));
            String chooser = expected.getInt("dice", 0) < 0 ? ("home".equals(scenario.role) ? "away" : "home") : scenario.role;
            assertTrue(committed.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(action -> "blockDie".equals(action.getString("kind", null)))
                .allMatch(action -> chooser.equals(action.getString("actor", null))));
            assertFalse(scenario.game.getActingPlayer().isStandingUp());
            assertTrue(scenario.game.getFieldModel().getPlayerState(scenario.attacker).hasTacklezones());
        }
    }

    private Roundup5NativeActionsTest.Scenario scenario() throws Exception {
        Roundup5NativeActionsTest.Scenario scenario = new Roundup5NativeActionsTest.Scenario(PlayerState.PRONE);
        scenario.skill(scenario.attacker, "Jump Up");
        Player<?> second = scenario.defender.getTeam().getPlayers()[1];
        scenario.place(second, 7, 6, PlayerState.STANDING); second.setStrength(4);
        scenario.place(scenario.attacker.getTeam().getPlayers()[1], 9, 8, PlayerState.STANDING);
        scenario.state.removeAdditionalAssist(scenario.game.getTeamHome().getId());
        scenario.state.removeAdditionalAssist(scenario.game.getTeamAway().getId());
        scenario.game.getTurnDataHome().setCheeringFansBlockAssist(0); scenario.game.getTurnDataAway().setCheeringFansBlockAssist(0);
        return scenario;
    }

    private JsonObject roll(JsonObject view, String attackerId, String targetId) {
        return view.get("blockPreview").asObject().get("rolls").asArray().values().stream().map(JsonValue::asObject)
            .filter(roll -> attackerId.equals(roll.getString("playerId", null))
                && targetId.equals(roll.getString("targetPlayerId", null))).findFirst().orElseThrow();
    }
}
