package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.Json;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.factory.InducementTypeFactory;
import com.fumbbl.ffb.inducement.Inducement;
import com.fumbbl.ffb.inducement.InducementType;
import com.fumbbl.ffb.inducement.Usage;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.bb2025.kickoff.StepApplyKickoffResult;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;
import com.fumbbl.ffb.server.util.UtilServerInducementUse;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
class SetupSessionPlacementTest {
	@Test
	void getTheRefBribesAppearForBothTeamsAndSurviveUseAndRecovery() throws Exception {
		Fixture fixture = new Fixture();
		Field field = SetupSession.class.getDeclaredField("state");
		field.setAccessible(true);
		GameState nativeState = (GameState) field.get(fixture.session);
		Game game = nativeState.getGame();
		InducementType type = ((InducementTypeFactory) game.getFactory(FactoryType.Factory.INDUCEMENT_TYPE))
			.allTypes().stream().filter(candidate -> candidate.hasUsage(Usage.AVOID_BAN)).findFirst().get();
		game.getTurnDataHome().getInducementSet().addInducement(new Inducement(type, 2));
		game.getTurnDataAway().getInducementSet().addInducement(new Inducement(type, 1));
		StepApplyKickoffResult kickoff = new StepApplyKickoffResult(nativeState);
		kickoff.setParameter(StepParameter.from(StepParameterKey.KICKOFF_RESULT, KickoffResult.GET_THE_REF));
		kickoff.start();
		assertEquals(3, game.getTurnDataHome().getInducementSet().get(type).getUsesLeft());
		assertEquals(2, game.getTurnDataAway().getInducementSet().get(type).getUsesLeft());
		for (String role : new String[] { "home", "away", "spectator" }) {
			JsonObject view = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
			assertEquals(3, view.get("homeResources").asObject().getInt("bribes", -1));
			assertEquals(2, view.get("awayResources").asObject().getInt("bribes", -1));
		}
		assertTrue(UtilServerInducementUse.useInducement(nativeState, game.getTeamHome(), type, 1));
		assertEquals(2, fixture.session.spectatorView().get("homeResources").asObject().getInt("bribes", -1));
		SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
		assertEquals(2, restored.spectatorView().get("homeResources").asObject().getInt("bribes", -1));
		assertEquals(2, restored.spectatorView().get("awayResources").asObject().getInt("bribes", -1));
		JsonObject legacy = JsonObject.readFrom(fixture.session.recoveryArtifact());
		removeField(legacy.get("payload"), "bribes");
		StringBuilder checksum = new StringBuilder();
		for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(legacy.get("payload").toString()
			.getBytes(java.nio.charset.StandardCharsets.UTF_8))) checksum.append(String.format("%02x", value & 255));
		legacy.set("sha256", checksum.toString());
		SetupSession oldCheckpoint = new SetupSession(fixture.server, fixture.document, legacy.toString());
		assertEquals(2, oldCheckpoint.spectatorView().get("homeResources").asObject().getInt("bribes", -1));
		assertEquals(2, oldCheckpoint.spectatorView().get("awayResources").asObject().getInt("bribes", -1));
	}
    @Test
    void driveTrackerFollowsBothNativeSetupDecisionsAndRestoresOlderCheckpoint() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject initial = fixture.session.spectatorView();
        assertTrue(initial.get("driveTracker") == null);
        JsonObject kicking = fixture.setup();
        JsonObject first = kicking.get("driveTracker").asObject();
        assertEquals("KICKING_SETUP", first.getString("phase", null));
        String receiving = "home".equals(kicking.getString("actor", null)) ? "away" : "home";
        assertEquals(receiving, first.getString("receivingRole", null));
        assertEquals(first, fixture.session.spectatorView().get("driveTracker"));

        SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        assertEquals(first, recovered.spectatorView().get("driveTracker"));
        JsonObject legacy = JsonObject.readFrom(fixture.session.recoveryArtifact());
        removeField(legacy.get("payload"), "driveTracker");
        StringBuilder checksum = new StringBuilder();
        for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(legacy.get("payload").toString()
            .getBytes(java.nio.charset.StandardCharsets.UTF_8))) checksum.append(String.format("%02x", value & 255));
        legacy.set("sha256", checksum.toString());
        assertEquals(first, new SetupSession(fixture.server, fixture.document, legacy.toString())
            .spectatorView().get("driveTracker"));

        JsonObject receivingSetup = fixture.session.apply(kicking.getString("actor", null),
            fixture.request("confirm", "first-setup", kicking)).get("state").asObject();
        assertEquals("RECEIVING_SETUP", receivingSetup.get("driveTracker").asObject().getString("phase", null));
        assertEquals(receiving, receivingSetup.get("driveTracker").asObject().getString("receivingRole", null));
        JsonObject kickTarget = fixture.session.apply(receivingSetup.getString("actor", null),
            fixture.request("confirm", "second-setup", receivingSetup)).get("state").asObject();
        assertEquals("KICK_TARGET", kickTarget.get("driveTracker").asObject().getString("phase", null));
        assertEquals(receiving, kickTarget.get("driveTracker").asObject().getString("receivingRole", null));
    }

    private void removeField(JsonValue value, String field) {
        if (value.isObject()) {
            JsonObject object = value.asObject();
            object.remove(field);
            for (JsonObject.Member member : object) removeField(member.getValue(), field);
        } else if (value.isArray()) for (JsonValue child : value.asArray()) removeField(child, field);
    }

    @Test
    void projectsFrozenTeamArtAndRestoresLegacyCheckpointsWithoutPresentationFields() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject view = fixture.setup();
        assertEquals("Old World Classic", view.get("homeTeamArt").asObject().getString("league", null));
        assertEquals("human", view.get("awayTeamArt").asObject().getString("rosterId", null));
        JsonObject legacy = JsonObject.readFrom(fixture.session.recoveryArtifact());
        removeTeamArt(legacy);
        StringBuilder checksum = new StringBuilder();
        for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(legacy.get("payload").toString()
            .getBytes(java.nio.charset.StandardCharsets.UTF_8))) checksum.append(String.format("%02x", value & 255));
        legacy.set("sha256", checksum.toString());
        SetupSession restored = new SetupSession(fixture.server, fixture.document, legacy.toString());
        JsonObject restoredView = restored.reply("load", "ACCEPTED", false, "away").get("state").asObject();
        assertEquals(view.get("homeTeamArt"), restoredView.get("homeTeamArt"));
        assertEquals(view.get("awayTeamArt"), restoredView.get("awayTeamArt"));
    }

    @Test
    void preservesBothHostingIdentitiesAcrossEmptyPositionsRecipientsAndRecovery() {
        for (String homeRoster : new String[] { "human", "orc" }) {
            String awayRoster = "human".equals(homeRoster) ? "orc" : "human";
            Fixture fixture = new Fixture(homeRoster, awayRoster);
            JsonObject initial = fixture.session.reply("initial", "ACCEPTED", false, "home").get("state").asObject();
            for (JsonValue item : initial.get("players").asArray()) assertTrue(item.asObject().get("x").isNull());
            JsonObject expectedHome = initial.get("homeTeamArt").asObject();
            JsonObject expectedAway = initial.get("awayTeamArt").asObject();
            assertEquals(homeRoster, expectedHome.getString("rosterId", null));
            assertEquals("human".equals(homeRoster) ? "Old World Classic" : "Badlands Brawl", expectedHome.getString("league", null));
            assertEquals(awayRoster, expectedAway.getString("rosterId", null));
            assertEquals("human".equals(awayRoster) ? "Old World Classic" : "Badlands Brawl", expectedAway.getString("league", null));
            fixture.setup();
            SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            for (String role : new String[] { "home", "away", "spectator" }) {
                JsonObject state = restored.reply("restored-" + role, "ACCEPTED", false, role).get("state").asObject();
                assertEquals(expectedHome, state.get("homeTeamArt"));
                assertEquals(expectedAway, state.get("awayTeamArt"));
            }
        }
    }

    private void removeTeamArt(JsonValue value) {
        if (value.isObject()) {
            JsonObject object = value.asObject();
            object.remove("homeTeamArt"); object.remove("awayTeamArt");
            for (JsonObject.Member member : object) removeTeamArt(member.getValue());
        } else if (value.isArray()) for (JsonValue child : value.asArray()) removeTeamArt(child);
    }

    @Test
    void swapsOnlyTwoOwnOnPitchPlayersInOneStagedAdjustment() {
        Fixture fixture = new Fixture();
        JsonObject before = fixture.setup();
        String actor = before.getString("actor", null);
        JsonObject first = fixture.pitchPlayer(before, actor, 0);
        JsonObject second = fixture.pitchPlayer(before, actor, 1);
        int originalX = first.getInt("x", -1), originalY = first.getInt("y", -1);
        JsonObject request = fixture.place("swap", before, first.getString("id", null),
            second.getInt("x", -1), second.getInt("y", -1));

        JsonObject swapped = fixture.session.apply(actor, request);
        assertEquals("ACCEPTED", swapped.getString("code", null));
        JsonObject state = swapped.get("state").asObject();
        assertEquals(second.getInt("x", -1), fixture.player(state, first.getString("id", null)).getInt("x", -1));
        assertEquals(second.getInt("y", -1), fixture.player(state, first.getString("id", null)).getInt("y", -1));
        assertEquals(originalX, fixture.player(state, second.getString("id", null)).getInt("x", -1));
        assertEquals(originalY, fixture.player(state, second.getString("id", null)).getInt("y", -1));
        assertEquals(before.getInt("revision", -1), state.getInt("revision", -1));
        assertTrue(fixture.session.apply(actor, request).getBoolean("duplicate", false));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        assertEquals(false, restored.apply(actor, request).getBoolean("duplicate", false));

        JsonObject third = fixture.pitchPlayer(state, actor, 2);
        state = fixture.session.apply(actor, fixture.request("place", "to-reserve", state)
            .add("playerId", third.get("id")).add("to", JsonValue.NULL)).get("state").asObject();
        JsonObject occupied = fixture.place("reserve-occupied", state, third.getString("id", null),
            originalX, originalY);
        assertEquals("ILLEGAL_PLACEMENT", fixture.failure(actor, occupied));
        assertEquals("ILLEGAL_PLACEMENT", fixture.failure(actor, fixture.place("opponent-half", state,
            first.getString("id", null), actor.equals("home") ? 13 : 12, 7)));
    }

    @Test
    void reportsConsistentSetupErrorsUntilRestoreDiscardsTheIllegalStage() {
        Fixture fixture = new Fixture();
        JsonObject state = fixture.setup();
        String actor = state.getString("actor", null);
        JsonObject first = fixture.pitchPlayer(state, actor, 0);
        JsonObject second = fixture.pitchPlayer(state, actor, 1);
        int x = actor.equals("home") ? 9 : 16;
        state = fixture.session.apply(actor, fixture.place("wide-1", state, first.getString("id", null), x, 1)).get("state").asObject();
        state = fixture.session.apply(actor, fixture.place("wide-2", state, second.getString("id", null), x, 2)).get("state").asObject();
        JsonObject confirm = fixture.request("confirm", "confirm", state);

        JsonObject rejected = fixture.session.apply(actor, confirm);
        assertEquals("ILLEGAL_SETUP", rejected.getString("code", null));
        JsonArray errors = rejected.get("setupErrors").asArray();
        assertTrue(errors.size() > 0);
        assertTrue(errors.toString().contains("wide zone"));
        assertTrue(errors.toString().contains("Line of Scrimmage"));
        assertEquals(state.getInt("revision", -1), rejected.get("state").asObject().getInt("revision", -1));
        JsonObject retry = fixture.session.apply(actor, confirm);
        assertTrue(!retry.getBoolean("duplicate", false));
        assertEquals(errors, retry.get("setupErrors"));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        JsonObject recoveredRetry = restored.apply(actor, confirm);
        assertEquals("ACCEPTED", recoveredRetry.getString("code", null));
    }

    @Test void kickoffBatchSelectionIsValidatedAndConfirmedGroupSurvivesRecovery() throws Exception {
        for (KickoffResult event : new KickoffResult[] { KickoffResult.QUICK_SNAP, KickoffResult.SOLID_DEFENCE }) {
            Fixture fixture = new Fixture();
            fixture.setup();
            Field field = SetupSession.class.getDeclaredField("state");
            field.setAccessible(true);
            GameState nativeState = (GameState) field.get(fixture.session);
            Game game = nativeState.getGame();
            for (Team team : new Team[] { game.getTeamHome(), game.getTeamAway() }) {
                int row = 0;
                for (Player<?> player : team.getPlayers()) {
                    game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(team == game.getTeamHome() ? 5 : 20, row++));
                    game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true));
                }
            }
            game.setTurnMode(TurnMode.KICKOFF);
            game.setDialogParameter(null);
            StepApplyKickoffResult kickoff = new StepApplyKickoffResult(nativeState);
            kickoff.setParameter(StepParameter.from(StepParameterKey.KICKOFF_RESULT, event));
            nativeState.getStepStack().clear();
            nativeState.getStepStack().push(kickoff);
            nativeState.startNextStep();
            DialogPlayerChoiceParameter dialog =
                (DialogPlayerChoiceParameter) game.getDialogParameter();
            assertTrue(dialog.getPlayerIds().length >= 2);
            String actor = game.isHomePlaying() ? "home" : "away";
            JsonObject before = fixture.session.reply("load", "ACCEPTED", false, actor).get("state").asObject();
            String first = dialog.getPlayerIds()[0], second = dialog.getPlayerIds()[1];
            String actionId = before.getInt("revision", -1) + ":event-confirm";
            JsonObject invalid = fixture.request("action", "invalid", before).add("actionId", actionId)
                .add("playerIds", new JsonArray().add(first).add(first));
            assertEquals("INVALID_OPTION", fixture.failure(actor, invalid));
            assertEquals(before, fixture.session.reply("load", "ACCEPTED", false, actor).get("state"));
            JsonObject request = fixture.request("action", "choose-group", before).add("actionId", actionId)
                .add("playerIds", new JsonArray().add(first).add(second));
            JsonObject accepted = fixture.session.apply(actor, request);
            assertEquals("ACCEPTED", accepted.getString("code", null));
            JsonObject view = accepted.get("state").asObject();
            assertEquals("movement", view.get("kickoff").asObject().getString("stage", null));
            assertEquals(2, view.get("kickoff").asObject().getInt("selected", -1));
            assertTrue(fixture.session.apply(actor, request).getBoolean("duplicate", false));
            SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            assertEquals(view, restored.reply("load", "ACCEPTED", false, actor).get("state"));
            JsonObject legacy = JsonObject.readFrom(fixture.session.recoveryArtifact());
            removeField(legacy.get("payload"), "participantIds");
            StringBuilder checksum = new StringBuilder();
            for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(legacy.get("payload").toString()
                .getBytes(java.nio.charset.StandardCharsets.UTF_8))) checksum.append(String.format("%02x", value & 255));
            legacy.set("sha256", checksum.toString());
            assertEquals(view, new SetupSession(fixture.server, fixture.document, legacy.toString())
                .reply("load", "ACCEPTED", false, actor).get("state"));
            for (JsonValue item : view.get("actions").asArray()) {
                JsonObject action = item.asObject();
                if ("kickoffMove".equals(action.getString("kind", null))) {
                    String source = action.getString("sourcePlayerId", null);
                    assertTrue(first.equals(source) || second.equals(source));
                }
            }
            assertEquals(fixture.player(before, first).get("x"), fixture.player(view, first).get("x"));
            assertEquals(fixture.player(before, first).get("y"), fixture.player(view, first).get("y"));
            if (event == KickoffResult.QUICK_SNAP) {
                JsonObject move = null;
                for (JsonValue item : view.get("actions").asArray())
                    if ("kickoffMove".equals(item.asObject().getString("kind", null))
                        && first.equals(item.asObject().getString("sourcePlayerId", null))) { move = item.asObject(); break; }
                assertTrue(move != null);
                JsonObject moved = restored.apply(actor, fixture.request("action", "move-once", view)
                    .add("actionId", move.get("id"))).get("state").asObject();
                assertEquals(2, moved.get("kickoff").asObject().get("participantIds").asArray().size());
                assertEquals(1, moved.get("kickoff").asObject().getInt("completed", -1));
                for (JsonValue item : moved.get("actions").asArray())
                    assertTrue(!Json.value(first).equals(item.asObject().get("sourcePlayerId")), "A moved player cannot move twice");
                SetupSession afterMove = new SetupSession(fixture.server, fixture.document, restored.recoveryArtifact());
                assertEquals(view, afterMove.reply("load", "ACCEPTED", false, actor).get("state"));
            }
        }
    }


    @Test void unrelatedCommandPreservesStagedBoardAndConcessionRestoresBasePositionsForAllViewers() {
        Fixture fixture = new Fixture();
        JsonObject base = fixture.setup();
        String actor = base.getString("actor", null);
        String opponent = "home".equals(actor) ? "away" : "home";
        JsonObject first = fixture.pitchPlayer(base, actor, 0);
        JsonObject second = fixture.pitchPlayer(base, actor, 1);
        String player = first.getString("id", null);
        JsonObject swap = fixture.place("swap", base, player, second.getInt("x", -1), second.getInt("y", -1));
        String checkpoint = fixture.session.recoveryArtifact();
        fixture.session.apply(actor, swap);

        JsonObject choice = fixture.request("choice", "unrelated", base).add("promptId", "prematch").add("optionId", "heads");
        assertEquals("INVALID_OPTION", fixture.failure(actor, choice));
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        assertTrue(fixture.session.apply(actor, swap).getBoolean("duplicate", false));
        JsonObject live = fixture.session.spectatorView();
        assertEquals(1, live.getInt("stageSeq", 0));
        assertEquals(second.get("x"), fixture.player(live, player).get("x"));
        assertEquals(second.get("y"), fixture.player(live, player).get("y"));

        assertEquals("WRONG_ACTOR", fixture.failure(opponent, choice));
        JsonObject proposal = fixture.session.saveResume(opponent, fixture.request("saveRequest", "opponent-save", base), 1000);
        assertEquals("ACCEPTED", proposal.getString("code", null));
        assertEquals(1, proposal.get("state").asObject().getInt("stageSeq", 0));
        assertEquals(second.get("x"), fixture.player(fixture.session.spectatorView(), player).get("x"));

        fixture.session.apply(opponent, fixture.request("concede", "concession", base));
        for (String viewer : new String[] {actor, opponent, "spectator"}) {
            JsonObject terminal = fixture.session.reply("load", "ACCEPTED", false, viewer).get("state").asObject();
            assertEquals("FULL_TIME", terminal.getString("phase", null));
            assertEquals(0, terminal.getInt("stageSeq", 0));
            assertEquals(first.get("x"), fixture.player(terminal, player).get("x"));
            assertEquals(first.get("y"), fixture.player(terminal, player).get("y"));
        }
    }

    @Test void stagedSetupKeepsOnlyOneDurableConfirmationAfterOneHundredAdjustments() {
        Fixture fixture = new Fixture();
        JsonObject base = fixture.setup();
        String actor = base.getString("actor", null);
        String opponent = "home".equals(actor) ? "away" : "home";
        JsonObject first = fixture.pitchPlayer(base, actor, 0);
        JsonObject second = fixture.pitchPlayer(base, actor, 1);
        String playerId = first.getString("id", null);
        String checkpoint = fixture.session.recoveryArtifact();
        int[] cursors = fixture.session.recoveryJournalCounts();
        JsonObject lastRequest = null;
        for (int index = 1; index <= SetupStaging.SETUP_ADJUSTMENT_LIMIT; index++) {
            JsonObject target = index % 2 == 1 ? second : first;
            lastRequest = fixture.place("stage-" + index, base, playerId, target.getInt("x", -1), target.getInt("y", -1));
            JsonObject live = fixture.session.apply(actor, lastRequest).get("state").asObject();
            assertEquals(base.get("revision"), live.get("revision"));
            assertEquals(index, live.getInt("stageSeq", -1));
            assertEquals(target.get("x"), fixture.player(live, playerId).get("x"));
            assertEquals(target.get("y"), fixture.player(fixture.session.spectatorView(), playerId).get("y"));
            assertEquals(target.get("y"), fixture.player(fixture.session.reply("reconnect", "ACCEPTED", false, opponent)
                .get("state").asObject(), playerId).get("y"));
            if (index == 1) {
                SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
                assertEquals(base.get("players"), restored.spectatorView().get("players"));
                assertTrue(!restored.apply(actor, lastRequest).getBoolean("duplicate", true));
            }
        }
        assertTrue(fixture.session.apply(actor, lastRequest).getBoolean("duplicate", false));
        for (int index = SetupStaging.SETUP_ADJUSTMENT_LIMIT + 1; index <= 1000; index++)
            assertEquals("INVALID_OPTION", fixture.failure(actor,
                fixture.place("over-limit-" + index, base, playerId, second.getInt("x", -1), second.getInt("y", -1))));
        assertTrue(fixture.session.spectatorView().getBoolean("setupAdjustmentsExhausted", false));
        assertEquals(checkpoint, fixture.session.recoveryArtifact());
        org.junit.jupiter.api.Assertions.assertArrayEquals(cursors, fixture.session.recoveryJournalCounts());

        JsonObject confirmed = fixture.session.apply(actor, fixture.request("confirm", "confirm-staged", base)).get("state").asObject();
        assertEquals(base.getInt("revision", -1) + 1, confirmed.getInt("revision", -1));
        int[] after = fixture.session.recoveryJournalCounts();
        assertEquals(cursors[0] + 1, after[0]);
        assertEquals(cursors[1] + 1, after[1]);
        assertEquals(cursors[3] + 1, after[3]);
        assertEquals(confirmed.get("players"), new SetupSession(fixture.server, fixture.document,
            fixture.session.recoveryArtifact()).spectatorView().get("players"));
        System.out.printf("STAGED_SETUP_CHECKPOINT_BYTES before=%d after=%d accepted=%d attempted=1000%n",
            checkpoint.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
            fixture.session.recoveryArtifact().getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
            SetupStaging.SETUP_ADJUSTMENT_LIMIT);
    }

    @Test void forcedSetupRecoversLegalDeploymentForOneThroughTenPlayers() {
        for (int players = 1; players <= 10; players++) {
            Fixture fixture = new Fixture("human", "human", players);
            JsonObject base = fixture.setup();
            String actor = base.getString("actor", null);
            JsonObject first = fixture.pitchPlayer(base, actor, 0);
            JsonObject reserve = fixture.request("place", "to-reserves", base).add("playerId", first.get("id")).add("to", JsonValue.NULL);
            assertEquals("ACCEPTED", fixture.session.apply(actor, reserve).getString("code", null));
            assertEquals("ILLEGAL_SETUP", fixture.session.apply(actor, fixture.request("confirm", "illegal", base)).getString("code", null));
            JsonObject result = fixture.session.forceConfirmStage(System.currentTimeMillis());
            assertEquals("ACCEPTED", result.getString("code", null), "Available players: " + players);
            JsonObject confirmed = result.get("state").asObject();
            int fielderCount = 0;
            for (JsonValue value : confirmed.get("players").asArray()) {
                JsonObject player = value.asObject();
                if (!actor.equals(player.getString("role", null)) || player.get("x").isNull()) continue;
                fielderCount++;
                if (players <= 3) {
                    assertEquals("home".equals(actor) ? 12 : 13, player.getInt("x", -1));
                    assertTrue(player.getInt("y", -1) >= 4 && player.getInt("y", -1) <= 10);
                }
            }
            assertEquals(players, fielderCount);
        }
    }


    @Test void stagedKickoffSelectionDoesNotSpendTheDurableDecisionBudget() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject selection = fixture.kick(2, 2);
        assertEquals("SOLID_DEFENCE", selection.get("kickoff").asObject().getString("event", null));

        Field field = SetupSession.class.getDeclaredField("decisionLimit");
        field.setAccessible(true);
        DecisionLimit limit = (DecisionLimit) field.get(fixture.session);
        limit.restore(new JsonArray().add(new JsonObject().add("kind", "START").add("state", selection)));
        for (int i = 0; i < DecisionLimit.MAX_DECISIONS - 2; i++) limit.recorded(DecisionLimit.ACTION, selection);

        JsonObject staged = fixture.submit(selection, "pick", fixture.action(selection, "event-pick:"));
        assertEquals(selection.get("revision"), staged.get("revision"));
        JsonObject confirmed = fixture.submit(staged, "confirm-selection", fixture.action(staged, "event-confirm"));
        assertEquals("movement", confirmed.get("kickoff").asObject().getString("stage", null));
    }

    @Test void allKickoffSelectionStagesPublishTheCompleteSelectionAndRestoreOnlyTheBase() throws Exception {
        List<String> events = List.of("SOLID_DEFENCE", "QUICK_SNAP", "CHARGE");
        int[][] dice = {{2, 2}, {4, 5}, {5, 5}};
        for (int index = 0; index < events.size(); index++) {
            Fixture fixture = new Fixture();
            JsonObject base = fixture.kick(dice[index][0], dice[index][1]);
            assertEquals(events.get(index), base.get("kickoff").asObject().getString("event", null));
            String actor = base.getString("actor", null);
            String other = "home".equals(actor) ? "away" : "home";
            JsonObject choice = fixture.action(base, "event-pick:");
            String player = choice.get("target").asObject().getString("playerId", null);
            JsonArray selectedIds = new JsonArray().add(player);
            String checkpoint = fixture.session.recoveryArtifact();

            JsonObject selected = fixture.submit(base, "select", choice);
            JsonObject frame = fixture.session.stagedPlacement();
            assertEquals(base.get("revision"), frame.get("baseRevision"));
            assertEquals(1, frame.getInt("stageSeq", -1));
            assertEquals(new JsonArray(), frame.get("players"));
            assertEquals(selectedIds, frame.get("selectedPlayerIds"));
            assertEquals(selectedIds, selected.get("kickoff").asObject().get("participantIds"));
            assertEquals(selectedIds, fixture.session.spectatorView().get("kickoff").asObject().get("participantIds"));
            JsonObject reconnect = fixture.session.reply("reconnect", "ACCEPTED", false, other).get("state").asObject();
            assertEquals(selectedIds, reconnect.get("kickoff").asObject().get("participantIds"));

            fixture.submit(selected, "deselect", fixture.action(selected, "event-pick:" + player));
            assertEquals(2, fixture.session.stagedPlacement().getInt("stageSeq", -1));
            assertEquals(new JsonArray(), fixture.session.stagedPlacement().get("selectedPlayerIds"));
            assertEquals(checkpoint, fixture.session.recoveryArtifact());
            SetupSession restored = new SetupSession(fixture.server, fixture.document, checkpoint);
            assertEquals(base.get("kickoff"), restored.spectatorView().get("kickoff"));
        }
    }

    @Test void solidDefenceStagesSelectionsAndRevertsAnIllegalFiftiethPlacement() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject selection = fixture.kick(2, 2);
        assertEquals("SOLID_DEFENCE", selection.get("kickoff").asObject().getString("event", null));
        String actor = selection.getString("actor", null);
        JsonObject eligible = fixture.action(selection, "event-pick:");
        String playerId = eligible.get("target").asObject().getString("playerId", null);

        String beforeSelection = fixture.session.recoveryArtifact();
        JsonObject selected = fixture.submit(selection, "pick", eligible);
        assertEquals(selection.get("revision"), selected.get("revision"));
        assertEquals(1, selected.getInt("stageSeq", -1));
        assertEquals(1, selected.get("kickoff").asObject().getInt("selected", -1));
        assertEquals(beforeSelection, fixture.session.recoveryArtifact());

        JsonObject base = fixture.submit(selected, "confirm-selection", fixture.action(selected, "event-confirm"));
        assertEquals(selection.getInt("revision", -1) + 1, base.getInt("revision", -1));
        String beforeMoves = fixture.session.recoveryArtifact();
        JsonObject initial = fixture.player(base, playerId);
        int x = initial.getInt("x", -1);
        List<Integer> openRows = new ArrayList<>();
        for (int row = 4; row <= 10; row++) {
            if (fixture.actionOrNull(base, "solid-place:" + playerId + ":" + x + ":" + row) != null) openRows.add(row);
        }
        int first = openRows.get(0), second = openRows.get(1);
        JsonObject live = base;
        for (int i = 1; i <= 49; i++) {
            live = fixture.submit(live, "move-" + i, fixture.action(live,
                "solid-place:" + playerId + ":" + x + ":" + (i % 2 == 1 ? first : second)));
            assertEquals(base.get("revision"), live.get("revision"));
        }
        JsonObject illegal = null;
        for (JsonValue value : live.get("actions").asArray()) {
            JsonObject option = value.asObject();
            if (!"kickoffMove".equals(option.getString("kind", ""))
                || !playerId.equals(option.get("sourcePlayerId").asString())) continue;
            JsonObject square = option.get("target").asObject();
            int targetY = square.getInt("y", -1);
            int originalY = initial.getInt("y", -1);
            int rowStart = targetY < 4 ? 0 : 11;
            if (targetY >= 4 && targetY <= 10 || originalY >= rowStart && originalY < rowStart + 4) continue;
            int wideCount = 0;
            for (JsonValue player : live.get("players").asArray()) {
                JsonObject item = player.asObject();
                int row = item.getInt("y", -1);
                if (actor.equals(item.getString("role", null)) && row >= rowStart && row < rowStart + 4) wideCount++;
            }
            if (wideCount >= 2) { illegal = option; break; }
        }
        assertTrue(illegal != null);
        live = fixture.submit(live, "move-50", illegal);
        assertEquals(50, live.getInt("stageSeq", -1));
        assertEquals(initial.get("x"), fixture.player(live, playerId).get("x"));
        assertEquals(initial.get("y"), fixture.player(live, playerId).get("y"));
        assertEquals("INVALID_OPTION", fixture.failure(actor,
            fixture.request("action", "over-50", live).add("actionId", illegal.get("id"))));
        assertEquals(beforeMoves, fixture.session.recoveryArtifact());
        int[] before = fixture.session.recoveryJournalCounts();
        JsonObject confirmed = fixture.submit(live, "confirm-placements", fixture.action(live, "confirm-solid-defence"));
        assertEquals(base.getInt("revision", -1) + 1, confirmed.getInt("revision", -1));
        assertEquals(before[1] + 1, fixture.session.recoveryJournalCounts()[1]);
        assertEquals(before[3] + 1, fixture.session.recoveryJournalCounts()[3]);
    }

    @Test void quickSnapAndHighKickStayOpenUntilFinish() throws Exception {
        for (String event : List.of("QUICK_SNAP", "HIGH_KICK")) {
            Fixture fixture = new Fixture();
            boolean quick = "QUICK_SNAP".equals(event);
            JsonObject base = fixture.kick(quick ? 4 : 2, quick ? 5 : 3);
            assertEquals(event, base.get("kickoff").asObject().getString("event", null));
            if (quick) {
                base = fixture.submit(base, "pick", fixture.action(base, "event-pick:"));
                base = fixture.submit(base, "confirm-choice", fixture.action(base, "event-confirm"));
            }
            String artifact = fixture.session.recoveryArtifact();
            JsonObject move = fixture.action(base, "event-");
            String player = move.getString("sourcePlayerId", null);
            JsonObject live = fixture.submit(base, "kickoff-move", move);
            assertEquals(base.get("revision"), live.get("revision"));
            assertEquals(base.get("turnMode"), live.get("turnMode"));
            assertEquals(1, live.getInt("stageSeq", -1));
            assertEquals(move.get("target").asObject().get("x"), fixture.player(live, player).get("x"));
            assertEquals(move.get("target").asObject().get("y"), fixture.player(live, player).get("y"));
            assertEquals(artifact, fixture.session.recoveryArtifact());
            assertEquals(null, fixture.actionOrNull(live, "event-"));
            JsonObject confirmed = fixture.submit(live, "end-event", fixture.action(live, "end-event"));
            assertEquals(base.getInt("revision", -1) + 1, confirmed.getInt("revision", -1));
            assertEquals(fixture.player(live, player).get("x"), fixture.player(confirmed, player).get("x"));
            assertEquals(fixture.player(live, player).get("y"), fixture.player(confirmed, player).get("y"));
        }
    }

    @Test void currentRuntimeRejectsRetiredPlacementCheckpoints() {
        Fixture fixture = new Fixture();
        fixture.setup();
        JsonObject envelope = JsonObject.readFrom(fixture.session.recoveryArtifact());
        JsonObject payload = envelope.get("payload").asObject();
        payload.set("recoveryVersion", 6).set("runtimeVersion", SetupSession.CHAT_RUNTIME);
        envelope.set("sha256", new JsonDigest().sha256(payload));
        MatchService.Failure failure = org.junit.jupiter.api.Assertions.assertThrows(MatchService.Failure.class,
            () -> new SetupSession(fixture.server, fixture.document, envelope.toString()));
        assertEquals("RECOVERY_UNSUPPORTED", failure.code);
    }

    private static final class Fixture {
        final FantasyFootballServer server = mock(FantasyFootballServer.class);
        final MatchDocument document;
        final SetupSession session;
        private int sequence;

        Fixture() {
            this("human", "human");
        }

        Fixture(String homeRoster, String awayRoster) {
            this(homeRoster, awayRoster, 11);
        }

        Fixture(String homeRoster, String awayRoster, int players) {
            FrozenTeam home = frozen("00000000-0000-0000-0000-000000000011", "home", homeRoster, players);
            FrozenTeam away = frozen("00000000-0000-0000-0000-000000000012", "away", awayRoster, players);
            document = new MatchDocument("00000000-0000-0000-0000-000000000021", 3, "away", MatchDocument.Lifecycle.ACTIVATED,
                new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away));
            FactoryManager manager = new FactoryManager();
            when(server.getFactoryManager()).thenReturn(manager);
            when(server.getFactorySource()).thenReturn(server);
            when(server.forContext(any())).thenReturn(server);
            Map<FactoryType.Factory, INamedObjectFactory> factories = manager.getFactoriesForContext(FactoryType.FactoryContext.APPLICATION, server);
            when(server.getFactory(any())).thenAnswer(invocation -> factories.get(invocation.getArgument(0)));
            when(server.getDebugLog()).thenReturn(mock(DebugLog.class));
            when(server.getCommunication()).thenReturn(mock(ServerCommunication.class));
            session = SetupSession.startRecoverable(server, document, -2, true, true);
        }

        private FrozenTeam frozen(String id, String role, String roster, int playerCount) {
            RosterCatalog catalog = new RosterCatalog(roster);
            List<TeamDraft.Player> players = new ArrayList<>();
            for (int slot = 1; slot <= playerCount; slot++)
                players.add(new TeamDraft.Player("player" + slot, slot, "orc".equals(roster) ? "orc-lineman" : "lineman", Collections.emptyList()));
            Map<String, Integer> resources = new LinkedHashMap<>();
            for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
            TeamDraft draft = new TeamDraft(RosterCatalog.VERSION, "BB2025", roster, RosterCatalog.PRESET,
                "player1", players, resources);
            return new FrozenTeam(id, 1, role, draft, 550000, 0, catalog);
        }

        JsonObject setup() {
            JsonObject state = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
            while (!"SETUP".equals(state.getString("phase", null))) {
                JsonObject prompt = state.get("prompt").asObject();
                JsonObject choice = request("choice", "choice-" + ++sequence, state)
                    .add("promptId", prompt.get("id"))
                    .add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
                state = session.apply(state.getString("actor", null), choice).get("state").asObject();
            }
            return state;
        }


        JsonObject kick(int first, int second) throws Exception {
            JsonObject view = setup();
            for (int index = 0; index < 2; index++) {
                view = session.apply(view.getString("actor", null), request("confirm", "setup-" + index, view))
                    .get("state").asObject();
            }
            Field engine = SetupSession.class.getDeclaredField("state");
            engine.setAccessible(true);
            GameState nativeState = (GameState) engine.get(session);
            Game game = nativeState.getGame();
            List<DiceCategory> dice = new ArrayList<>();
            for (int value : new int[] { 1, 1, first, second, 1, 6, 6 }) {
                DiceCategory roll = new DiceCategory();
                roll.parseCommand(Integer.toString(value), game, game.getTeamHome());
                dice.add(roll);
            }
            nativeState.getDiceRoller().getTestRolls().put("General", dice);
            return submit(view, "kick", action(view, game.isHomePlaying() ? "kick-22-8" : "kick-3-8"));
        }

        JsonObject actionOrNull(JsonObject view, String prefix) {
            for (JsonValue option : view.get("actions").asArray()) {
                JsonObject action = option.asObject();
                if (action.getString("id", "").split(":", 2)[1].startsWith(prefix)) return action;
            }
            return null;
        }

        JsonObject action(JsonObject view, String prefix) {
            JsonObject action = actionOrNull(view, prefix);
            if (action == null) throw new AssertionError("Missing " + prefix + " in " + view.get("turnMode"));
            return action;
        }

        JsonObject submit(JsonObject view, String id, JsonObject action) {
            JsonObject result = session.apply(view.getString("actor", null), request("action", id, view).add("actionId", action.get("id")));
            assertEquals("ACCEPTED", result.getString("code", null), id);
            return result.get("state").asObject();
        }

        JsonObject request(String operation, String id, JsonObject state) {
            return new JsonObject().add("version", 1).add("type", "setup").add("operation", operation)
                .add("requestId", id).add("matchId", document.matchId).add("expectedRevision", state.getInt("revision", -1));
        }

        JsonObject place(String id, JsonObject state, String playerId, int x, int y) {
            return request("place", id, state).add("playerId", playerId)
                .add("to", new JsonObject().add("x", x).add("y", y));
        }

        JsonObject pitchPlayer(JsonObject state, String role, int index) {
            int found = 0;
            for (JsonValue item : state.get("players").asArray()) {
                JsonObject player = item.asObject();
                if (role.equals(player.getString("role", null)) && "pitch".equals(player.getString("offPitch", null))) {
                    if (found++ == index) return player;
                }
            }
            throw new AssertionError("Missing pitch player " + index);
        }

        JsonObject player(JsonObject state, String id) {
            for (JsonValue item : state.get("players").asArray()) {
                JsonObject player = item.asObject();
                if (id.equals(player.getString("id", null))) return player;
            }
            throw new AssertionError("Missing player " + id);
        }

        String failure(String role, JsonObject request) {
            try {
                session.apply(role, request);
            } catch (MatchService.Failure failure) {
                return failure.code;
            }
            throw new AssertionError("Expected rejection");
        }
    }
}
