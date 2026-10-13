package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepId;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.List;

/** BB2025 start-of-drive guidance derived only from the native sequence and accepted public reports. */
final class DriveTrackerPresentation {
    JsonObject project(GameState state, MatchTranscript transcript, int drive, String phase) {
        if ("PRE_MATCH".equals(phase) || "FULL_TIME".equals(phase)) return null;
        boolean setup = hasStep(state, StepId.SETUP);
        boolean kickTarget = hasStep(state, StepId.KICKOFF);
        boolean kickoff = hasStep(state, StepId.END_KICKOFF);
        if ("SETUP".equals(phase) ? !setup : "READY_FOR_KICKOFF".equals(phase) ? !kickTarget
            : !"PLAY".equals(phase) || setup || kickTarget || !kickoff) return null;

        Game game = state.getGame();
        String receivingRole = receivingRole(state, transcript, drive, setup);
        String currentPhase = setup ? game.isSetupOffense() ? "RECEIVING_SETUP" : "KICKING_SETUP"
            : kickTarget ? "KICK_TARGET" : "KICKOFF";
        Reports reports = new Reports();
        if (transcript != null) {
            JsonArray records = transcript.json().get("records").asArray();
            for (int index = records.size() - 1; index >= 0; index--) {
                JsonObject record = records.get(index).asObject();
                if (record.get("state").asObject().getInt("drive", -1) != drive) break;
                reports.readSyncs(record.get("native").asArray());
            }
            // The current public snapshot is built before its native outcomes join the transcript.
            List<JsonObject> pending = new NativeOutcomeCapture()
                .since(state.getGameLog(), transcript.nativeCursor()).modelSyncs;
            for (JsonObject sync : pending) reports.readSync(sync);
        }

        String event = reports.event;
        if (event == null && game.getDialogParameter() instanceof DialogPlayerChoiceParameter) {
            PlayerChoiceMode choice = ((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode();
            if (choice == PlayerChoiceMode.CHARGE || choice == PlayerChoiceMode.SOLID_DEFENCE) event = choice.name();
        }
        TurnMode mode = game.getTurnMode();
        if (event == null && (mode == TurnMode.HIGH_KICK || mode == TurnMode.SOLID_DEFENCE
            || mode == TurnMode.QUICK_SNAP || mode == TurnMode.BLITZ))
            event = mode == TurnMode.BLITZ ? "CHARGE" : mode.name();
        boolean eventActive = "KICKOFF".equals(currentPhase) && event != null
            && (mode == TurnMode.HIGH_KICK || mode == TurnMode.SOLID_DEFENCE
                || mode == TurnMode.QUICK_SNAP || mode == TurnMode.BLITZ
                || game.getDialogParameter() instanceof DialogPlayerChoiceParameter
                    && (((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.CHARGE
                        || ((DialogPlayerChoiceParameter) game.getDialogParameter()).getPlayerChoiceMode() == PlayerChoiceMode.SOLID_DEFENCE));
        return new JsonObject().add("version", 1).add("receivingRole", receivingRole)
            .add("phase", currentPhase).add("secretWeapons", reports.secretWeapons)
            .add("knockouts", reports.knockouts).add("event", event == null ? JsonValue.NULL : JsonValue.valueOf(event))
            .add("eventComplete", event != null && !eventActive);
    }

    private boolean hasStep(GameState state, StepId id) {
        IStep current = state.getCurrentStep();
        if (current != null && current.getId() == id) return true;
        for (IStep step : state.getStepStack().toArray()) if (step.getId() == id) return true;
        return false;
    }

    private String receivingRole(GameState state, MatchTranscript transcript, int drive, boolean setup) {
        String firstSetupActor = null;
        if (transcript != null) {
            JsonArray records = transcript.json().get("records").asArray();
            for (int index = records.size() - 1; index >= 0; index--) {
                JsonObject snapshot = records.get(index).asObject().get("state").asObject();
                if (snapshot.getInt("drive", -1) != drive) break;
                if ("SETUP".equals(snapshot.getString("phase", null))) firstSetupActor = snapshot.getString("actor", null);
            }
        }
        if ("home".equals(firstSetupActor)) return "away";
        if ("away".equals(firstSetupActor)) return "home";
        Game game = state.getGame();
        boolean homeReceiving = setup && game.isSetupOffense() ? game.isHomePlaying()
            : !game.isHomePlaying();
        if (!setup && (game.getTurnMode() == TurnMode.HIGH_KICK || game.getTurnMode() == TurnMode.QUICK_SNAP
            || game.getTurnMode() == TurnMode.KICKOFF_RETURN)) homeReceiving = game.isHomePlaying();
        return homeReceiving ? "home" : "away";
    }

    private static final class Reports {
        boolean secretWeapons;
        boolean knockouts;
        String event;

        void readSyncs(JsonArray syncs) {
            for (JsonValue value : syncs) readSync(value.asObject());
        }

        void readSync(JsonObject sync) {
            JsonValue reportList = sync.get("reportList");
            if (reportList == null || reportList.isNull()) return;
            for (JsonValue value : reportList.asObject().get("reports").asArray()) {
                JsonObject report = value.asObject();
                String id = report.getString("reportId", null);
                if ("secretWeaponBan".equals(id) && report.get("playerIds") != null
                    && report.get("playerIds").asArray().size() > 0) secretWeapons = true;
                if ("turnEnd".equals(id) && report.get("knockoutRecoveryArray") != null
                    && report.get("knockoutRecoveryArray").asArray().size() > 0) knockouts = true;
                if ("kickoffResult".equals(id)) {
                    String rolled = report.getString("kickoffResult", null);
                    if ("High Kick".equals(rolled)) event = "HIGH_KICK";
                    if ("Solid Defence".equals(rolled)) event = "SOLID_DEFENCE";
                    if ("Quick Snap".equals(rolled)) event = "QUICK_SNAP";
                    if ("Charge".equals(rolled)) event = "CHARGE";
                }
            }
        }
    }
}
