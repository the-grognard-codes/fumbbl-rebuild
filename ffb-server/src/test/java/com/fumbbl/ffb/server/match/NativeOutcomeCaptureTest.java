package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.net.commands.ServerCommand;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.ReportGoForItRoll;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.server.GameLog;
import com.fumbbl.ffb.server.GameState;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NativeOutcomeCaptureTest {
    @Test void capturesPublicModelSyncAndRawRollOnceAcrossCursorUpdates() {
        GameLog log = new GameLog(mock(GameState.class));
        ReportList reports = new ReportList();
        reports.add(new ReportGoForItRoll("runner", true, 3, 2, false, null));
        ServerCommandModelSync first = new ServerCommandModelSync(new ModelChangeList(), reports, null, null, 0, 0);
        first.setCommandNr(2);
        log.add(first);
        ServerCommand unrelated = mock(ServerCommand.class);
        when(unrelated.isReplayable()).thenReturn(true);
        when(unrelated.getCommandNr()).thenReturn(3);
        log.add(unrelated);
        ServerCommandModelSync second = new ServerCommandModelSync(new ModelChangeList(), new ReportList(), null, null, 0, 0);
        second.setCommandNr(4);
        log.add(second);

        NativeOutcomeCapture capture = new NativeOutcomeCapture();
        NativeOutcomeCapture.Capture initial = capture.since(log, 0);
        assertEquals(4, initial.lastCommandNr);
        assertEquals(2, initial.modelSyncs.size());
        JsonObject rush = initial.modelSyncs.get(0).get("reportList").asObject().get("reports").asArray().get(0).asObject();
        assertEquals("runner", rush.getString("playerId", null));
        assertEquals(3, rush.getInt("roll", -1));
        assertEquals(2, rush.getInt("minimumRoll", -1));
        assertTrue(rush.getBoolean("successful", false));
        assertEquals(1, capture.since(log, 2).modelSyncs.size());
        assertTrue(capture.since(log, initial.lastCommandNr).modelSyncs.isEmpty());
    }

    @Test void rejectsDuplicateNativeModelSyncNumbers() {
        GameLog log = new GameLog(mock(GameState.class));
        for (int ignored = 0; ignored < 2; ignored++) {
            ServerCommandModelSync command = new ServerCommandModelSync(new ModelChangeList(), new ReportList(), null, null, 0, 0);
            command.setCommandNr(1);
            log.add(command);
        }
        assertThrows(IllegalStateException.class, () -> new NativeOutcomeCapture().since(log, 0));
    }
}
