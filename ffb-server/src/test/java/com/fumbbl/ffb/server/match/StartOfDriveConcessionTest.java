package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.GameState;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.LinkedHashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StartOfDriveConcessionTest {
    @Test void priorityCoachCanConcedeEveryStartOfDriveDecisionWithNativeReplayAndRecovery() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
        nativeState(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
        JsonObject view = fixture.session.spectatorView();
        Set<String> phases = new LinkedHashSet<>();
        for (int index = 0; index < 30; index++) {
            phases.add(view.getString("phase", null));
            SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            String role = view.getString("actor", null);
            JsonObject request = fixture.request("concede", "concede-" + index, view);
            JsonObject result = restored.apply(role, request);
            assertEquals("ACCEPTED", result.getString("code", null), view.toString());
            assertTrue(restored.isComplete(), view.toString());
            assertFalse(restored.isFailed());
            assertEquals("FULL_TIME", result.get("state").asObject().getString("phase", null));
            JsonObject terminal = result.get("state").asObject();
            assertEquals(0, terminal.getInt(role + "Score", -1));
            assertEquals(2, terminal.getInt("home".equals(role) ? "awayScore" : "homeScore", -1));
            for (String observer : new String[] {"home", "away", "spectator"}) {
                JsonObject finalView = "spectator".equals(observer) ? restored.spectatorView()
                    : restored.reply("load", "ACCEPTED", false, observer).get("state").asObject();
                assertEquals("FULL_TIME", finalView.getString("phase", null));
                assertTrue(finalView.get("actions").asArray().isEmpty());
                assertTrue(finalView.get("prompt").isNull());
            }
            new MatchJson().validateCompletion(restored.completedMatch(), fixture.document);
            JsonArray records = JsonObject.readFrom(restored.completedMatch().json()).get("transcript").asObject().get("records").asArray();
            JsonObject last = records.get(records.size() - 1).asObject();
            assertEquals("FULL_TIME", last.getString("kind", null));
            assertEquals("concede", last.get("decision").asObject().getString("operation", null));
            assertFalse(last.get("native").asArray().isEmpty(), "Native end-game reports must survive into replay");
            SetupSession recovered = new SetupSession(fixture.server, fixture.document, restored.recoveryArtifact());
            assertTrue(recovered.apply(role, request).getBoolean("duplicate", false));
            assertEquals(restored.completedMatch(), recovered.completedMatch());
            if ("REGULAR".equals(view.getString("turnMode", null))) break;
            JsonObject advance = fixture.request("action", "advance-" + index, view);
            if ("SETUP".equals(view.getString("phase", null))) advance.set("operation", "confirm");
            else if (!view.get("prompt").isNull()) {
                JsonObject prompt = view.get("prompt").asObject();
                advance.set("operation", "choice").add("promptId", prompt.get("id"))
                    .add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
            } else {
                assertFalse(view.get("actions").asArray().isEmpty(), view.toString());
                advance.add("actionId", view.get("actions").asArray().get(0).asObject().get("id"));
            }
            view = fixture.session.apply(role, advance).get("state").asObject();
        }
        assertTrue(phases.contains("PRE_MATCH"), phases.toString());
        assertTrue(phases.contains("SETUP"), phases.toString());
        assertTrue(phases.contains("READY_FOR_KICKOFF"), phases.toString());
        assertEquals("REGULAR", view.getString("turnMode", null), view.toString());
    }

    private GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state");
        field.setAccessible(true);
        return (GameState) field.get(session);
    }
}
