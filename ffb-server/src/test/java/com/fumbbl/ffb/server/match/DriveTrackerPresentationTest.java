package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.server.GameLog;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepStack;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DriveTrackerPresentationTest {
    private final GameState state = mock(GameState.class);
    private final Game game = mock(Game.class);
    private final StepStack stack = new StepStack(state);
    private final GameLog log = new GameLog(state);
    private final DriveTrackerPresentation presentation = new DriveTrackerPresentation();

    DriveTrackerPresentationTest() {
        when(state.getGame()).thenReturn(game);
        when(state.getStepStack()).thenReturn(stack);
        when(state.getGameLog()).thenReturn(log);
        when(game.getTurnMode()).thenReturn(TurnMode.SETUP);
    }

    @Test void followsBothSetupSidesKickTargetAndKickoffThroughAnInterruption() {
        current(StepId.SETUP);
        when(game.isHomePlaying()).thenReturn(true);
        assertEquals("away", project(null, 1, "SETUP").getString("receivingRole", null));
        assertEquals("KICKING_SETUP", project(null, 1, "SETUP").getString("phase", null));
        when(game.isSetupOffense()).thenReturn(true);
        when(game.isHomePlaying()).thenReturn(false);
        assertEquals("away", project(null, 1, "SETUP").getString("receivingRole", null));
        assertEquals("RECEIVING_SETUP", project(null, 1, "SETUP").getString("phase", null));
        when(game.isHomePlaying()).thenReturn(true);
        current(StepId.KICKOFF);
        assertEquals("KICK_TARGET", project(null, 1, "READY_FOR_KICKOFF").getString("phase", null));
        stack.push(step(StepId.END_KICKOFF));
        current(StepId.APOTHECARY);
        when(game.getTurnMode()).thenReturn(TurnMode.KICKOFF);
        assertEquals("KICKOFF", project(null, 1, "PLAY").getString("phase", null));
        assertEquals("away", project(null, 1, "PLAY").getString("receivingRole", null));
        stack.clear();
        assertNull(project(null, 1, "PLAY"));
    }

    @Test void usesCurrentDriveReportsIncludingFailedRecoveryAndHandledWeaponChecks() {
        current(StepId.SETUP);
        MatchTranscript transcript = transcript(1, "home", new JsonArray());
        JsonArray prior = syncs(report("secretWeaponBan", "playerIds", new JsonArray().add("old")));
        transcript.append(1, "ACTION", "home", 1, new JsonObject(), prior, snapshot(1, "PLAY", "home", 1), 1);
        JsonArray current = syncs(report("turnEnd", "knockoutRecoveryArray", new JsonArray().add(
            new JsonObject().add("playerId", "failed").add("successful", false))),
            report("secretWeaponBan", "playerIds", new JsonArray().add("handled")));
        current.get(0).asObject().set("commandNr", 2);
        transcript.append(2, "TOUCHDOWN", "home", 2, new JsonObject(), current,
            snapshot(2, "SETUP", "away", 2), 2);
        JsonObject result = project(transcript, 2, "SETUP");
        assertTrue(result.getBoolean("secretWeapons", false));
        assertTrue(result.getBoolean("knockouts", false));
        assertEquals("home", result.getString("receivingRole", null));
        assertFalse(project(transcript, 3, "SETUP").getBoolean("secretWeapons", true));
        assertFalse(project(transcript, 3, "SETUP").getBoolean("knockouts", true));
    }

    @Test void retainsRolledEventsAndKeepsChargeBlitzWithinKickoff() {
        current(StepId.APPLY_KICKOFF_RESULT);
        stack.push(step(StepId.END_KICKOFF));
        for (String[] event : new String[][] { { "High Kick", "HIGH_KICK", "HIGH_KICK" },
            { "Solid Defence", "SOLID_DEFENCE", "SOLID_DEFENCE" },
            { "Quick Snap", "QUICK_SNAP", "QUICK_SNAP" }, { "Charge", "CHARGE", "BLITZ" } }) {
            when(game.getTurnMode()).thenReturn(TurnMode.valueOf(event[2]));
            MatchTranscript transcript = transcript(1, "home", syncs(report("kickoffResult", "kickoffResult", JsonValue.valueOf(event[0]))));
            JsonObject active = project(transcript, 1, "PLAY");
            assertEquals(event[1], active.getString("event", null));
            assertFalse(active.getBoolean("eventComplete", true));
            when(game.getTurnMode()).thenReturn(TurnMode.KICKOFF);
            assertTrue(project(transcript, 1, "PLAY").getBoolean("eventComplete", false));
        }
    }

    @Test void readsPendingNativeReportsBeforeTheCurrentDecisionIsAppended() {
        current(StepId.SETUP);
        MatchTranscript transcript = transcript(1, "home", new JsonArray());
        JsonObject sync = syncs(report("turnEnd", "knockoutRecoveryArray", new JsonArray().add(new JsonObject())))
            .get(0).asObject();
        ServerCommandModelSync command = mock(ServerCommandModelSync.class);
        when(command.getCommandNr()).thenReturn(1);
        when(command.isReplayable()).thenReturn(true);
        when(command.toJsonValue()).thenReturn(sync);
        log.add(command);
        assertTrue(project(transcript, 1, "SETUP").getBoolean("knockouts", false));
        assertEquals(0, transcript.nativeCursor());
    }

    @Test void omitsPreMatchFullTimeAndOlderUnknownOptionalHistory() {
        current(StepId.SETUP);
        assertNull(project(null, 1, "PRE_MATCH"));
        assertNull(project(null, 1, "FULL_TIME"));
        JsonObject shown = project(null, 1, "SETUP");
        assertFalse(shown.getBoolean("secretWeapons", true));
        assertFalse(shown.getBoolean("knockouts", true));
        assertTrue(shown.get("event").isNull());
        current(StepId.END_TURN);
        stack.push(step(StepId.SETUP));
        stack.push(step(StepId.END_KICKOFF));
        assertNull(project(null, 1, "PLAY"));
    }

    private JsonObject project(MatchTranscript transcript, int drive, String phase) {
        return presentation.project(state, transcript, drive, phase);
    }

    private void current(StepId id) {
        IStep current = step(id);
        when(state.getCurrentStep()).thenReturn(current);
    }

    private IStep step(StepId id) {
        IStep step = mock(IStep.class);
        when(step.getId()).thenReturn(id);
        return step;
    }

    private MatchTranscript transcript(int drive, String actor, JsonArray reports) {
        MatchTranscript transcript = new MatchTranscript();
        transcript.append(0, "START", "system", 0, JsonValue.NULL, reports,
            snapshot(0, "SETUP", actor, drive), reports.size() == 0 ? 0 : 1);
        return transcript;
    }

    private JsonObject snapshot(int revision, String phase, String actor, int drive) {
        return new JsonObject().add("revision", revision).add("phase", phase).add("actor", actor).add("drive", drive);
    }

    private JsonArray syncs(JsonObject... reports) {
        JsonArray list = new JsonArray();
        for (JsonObject report : reports) list.add(report);
        return new JsonArray().add(new JsonObject().add("commandNr", 1)
            .add("reportList", new JsonObject().add("reports", list)));
    }

    private JsonObject report(String id, String name, JsonValue value) {
        return new JsonObject().add("reportId", id).add(name, value);
    }
}
