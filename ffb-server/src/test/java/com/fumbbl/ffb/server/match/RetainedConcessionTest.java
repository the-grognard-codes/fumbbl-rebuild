package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class RetainedConcessionTest {
    @Test void closedStatusRejectsDigestValidArtifactsBeyondTheNestingLimit() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject payload = JsonObject.readFrom(fixture.session.recoveryArtifact()).get("payload").asObject();
        JsonValue nested = JsonValue.NULL;
        for (int index = 0; index < 65; index++) nested = new JsonArray().add(nested);
        payload.add("concession", new JsonObject().add("completion", new JsonObject().add("nested", nested)));
        String artifact = new JsonObject().add("payload", payload).add("sha256", new JsonDigest().sha256(payload)).toString();
        RetainedConcession retained = new RetainedConcession(new RecoveryRepository.Record(fixture.document.matchId, 1, artifact), fixture.document);
        assertThrows(IllegalArgumentException.class, () -> retained.view("home"));
    }

    @Test void acceptedTerminalConcessionAtMaximumRevisionRetainsItsExistingFullTimeRecord() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject payload = JsonObject.readFrom(fixture.session.recoveryArtifact()).get("payload").asObject();
        JsonObject base = new JsonObject();
        for (String field : Arrays.asList("half", "drive", "homeScore", "awayScore", "homeTurn", "awayTurn", "actions", "turn", "turnMode",
            "activePlayerId", "ball", "matchId", "revision", "callerRole", "phase", "actor", "prompt", "players", "weather", "homeRerolls", "awayRerolls"))
            base.add(field, payload.get("homeView").asObject().get(field));
        base.set("players", new JsonArray()).set("actions", new JsonArray()).set("prompt", JsonValue.NULL);
        JsonArray events = new JsonArray();
        JsonObject terminal = null;
        for (int revision = 0; revision <= 8192; revision++) {
            terminal = JsonObject.readFrom(base.toString()).set("revision", revision)
                .set("phase", revision == 8192 ? "FULL_TIME" : revision == 0 ? "PRE_MATCH" : "PLAY")
                .set("homeScore", revision == 8192 ? 2 : 0);
            events.add(new JsonObject().add("revision", revision).add("kind", revision == 8192 ? "FULL_TIME" : revision == 0 ? "START" : "ACTION")
                .add("state", terminal));
        }
        JsonObject request = fixture.request("concede", "terminal-limit", new JsonObject().add("revision", 8191));
        payload.set("revision", 8192).set("pendingTerminal", true).set("runtimeVersion", "retired-runtime")
            .set("eventsJson", events.toString()).set("homeView", terminal)
            .set("history", new JsonArray().add(new JsonObject().add("key", "away\nterminal-limit")
                .add("fingerprint", new CompletedMatch(request.toString()).json()).add("code", "ACCEPTED")));
        payload.remove("transcript"); payload.remove("chat");
        String artifact = new JsonObject().add("payload", payload).add("sha256", digest(payload.toString())).toString();
        RetainedConcession retained = new RetainedConcession(new RecoveryRepository.Record(fixture.document.matchId, 1, artifact), fixture.document);
        assertTrue(retained.close("away", request, 100L));
        JsonObject result = JsonObject.readFrom(retained.completed().json());
        assertEquals(8192, result.getInt("finalRevision", -1));
        assertEquals(8193, result.get("events").asArray().size());
        assertEquals(new CompletedMatch(terminal.toString()).json(),
            new CompletedMatch(result.get("events").asArray().get(8192).asObject().get("state").toString()).json());
    }

    @Test void eitherParticipantCanConcedeUnsupportedRuntimeAndRetryAfterRestart() throws Exception {
        for (String role : new String[] { "home", "away" }) {
          for (int commitFailure : new int[] { 0, 1, 2, 3 }) {
            final int failureMode = commitFailure;
            SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
            JsonObject initial = fixture.session.spectatorView();
            String historicalRole = initial.getString("actor", null);
            JsonObject prompt = initial.get("prompt").asObject();
            fixture.session.apply(historicalRole, fixture.request("choice", "historical-choice", initial)
                .add("promptId", prompt.get("id")).add("optionId", "heads"));
            JsonObject request = fixture.request("concede", "old-concession", fixture.session.spectatorView());
            int originalRevision = request.getInt("expectedRevision", -1);
            if (failureMode == 3) fixture.session.apply(role, request);
            JsonObject envelope = JsonObject.readFrom(fixture.session.recoveryArtifact());
            JsonObject payload = envelope.get("payload").asObject().set("runtimeVersion", "retired-runtime")
                .set("engineVersion", "retired-engine").set("replayVersion", 99);
            envelope.set("sha256", digest(payload.toString()));
            AtomicReference<RecoveryRepository.Record> stored = new AtomicReference<>(new RecoveryRepository.Record(fixture.document.matchId, 1, envelope.toString()));
            AtomicReference<MatchDocument> document = new AtomicReference<>(fixture.document);
            RecoveryRepository recovery = mock(RecoveryRepository.class);
            when(recovery.find(fixture.document.matchId)).thenAnswer(call -> stored.get());
            org.mockito.stubbing.Answer<Boolean> save = call -> {
                RecoveryRepository.Record next = call.getArgument(0);
                if (stored.get().generation != (long) call.getArgument(1)) return false;
                stored.set(next); return true;
            };
            when(recovery.save(any(), anyLong())).thenAnswer(save);
            MatchService matches = mock(MatchService.class);
            when(matches.load(anyString(), anyString())).thenAnswer(call -> {
                if (!"home".equals(call.getArgument(0)) && !"away".equals(call.getArgument(0))) throw new MatchService.Failure("NOT_FOUND");
                return new MatchService.Result(document.get(), false);
            });
            when(matches.result(anyString(), anyString())).thenAnswer(call -> document.get().completion);
            AtomicInteger commits = new AtomicInteger();
            doAnswer(call -> {
                CompletedMatch completed = call.getArgument(2);
                new MatchJson().validateCompletion(completed, fixture.document);
                boolean fail = commits.getAndIncrement() == 0;
                if (fail && failureMode == 1) throw new MatchService.OutcomeUnknown(fixture.document.matchId);
                document.set(fixture.document.completed(completed));
                if (fail && failureMode == 2) throw new MatchService.OutcomeUnknown(fixture.document.matchId);
                return null;
            }).when(matches).complete(anyString(), anyString(), any());
            clearInvocations(fixture.server);
            SetupApplication application = new SetupApplication(fixture.server, matches, recovery);
            JsonObject status = JsonObject.readFrom(request.toString()).set("operation", "concessionStatus").set("requestId", "status");
            status.remove("expectedRevision");
            assertEquals("ACCEPTED", application.handle(role, status).getString("code", null));
            RecoveryRepository.Record original = stored.get();
            stored.set(new RecoveryRepository.Record(original.matchId, original.generation,
                JsonObject.readFrom(original.json).set("sha256", "corrupt").toString()));
            assertEquals("RECOVERY_CORRUPT", application.handle(role, request).getString("code", null));
            stored.set(original);
            assertEquals("NOT_FOUND", application.handle("outsider", request).getString("code", null));
            if (failureMode != 3) assertEquals("STALE_REVISION", application.handle(role, JsonObject.readFrom(request.toString()).set("expectedRevision", originalRevision + 1)).getString("code", null));
            assertEquals("REQUEST_ID_REUSED", application.handle(historicalRole, JsonObject.readFrom(request.toString())
                .set("requestId", "historical-choice")).getString("code", null));
            when(recovery.save(any(), anyLong())).thenReturn(false);
            assertEquals("RECOVERY_CONFLICT", application.handle(role, request).getString("code", null));
            assertEquals(MatchDocument.Lifecycle.ACTIVATED, document.get().lifecycle);
            assertEquals(1, stored.get().generation);
            when(recovery.save(any(), anyLong())).thenAnswer(save);
            JsonObject response = application.handle(role, request);
            if (failureMode == 1 || failureMode == 2) {
                assertEquals("MATCH_OUTCOME_UNKNOWN", response.getString("code", null));
                response = new SetupApplication(fixture.server, matches, recovery).handle(role, request);
                assertTrue(response.getBoolean("duplicate", false));
            }
            assertEquals("ACCEPTED", response.getString("code", null));
            assertEquals("FULL_TIME", response.get("state").asObject().getString("phase", null));
            assertEquals(payload.get("native"), JsonObject.readFrom(stored.get().json).get("payload").asObject().get("native"));
            long generation = stored.get().generation;
            SetupApplication restarted = new SetupApplication(fixture.server, matches, recovery);
            assertTrue(restarted.handle(role, request).getBoolean("duplicate", false));
            assertEquals(generation, stored.get().generation);
            assertEquals("REQUEST_ID_REUSED", restarted.handle(role, JsonObject.readFrom(request.toString()).set("expectedRevision", originalRevision + 1)).getString("code", null));
            assertEquals("ACCEPTED", restarted.handle(role, new JsonObject().add("version", 1).add("type", "setup")
                .add("operation", "load").add("requestId", "reload").add("matchId", fixture.document.matchId)).getString("code", null));
            verifyNoInteractions(fixture.server);
          }
        }
    }

    private String digest(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
