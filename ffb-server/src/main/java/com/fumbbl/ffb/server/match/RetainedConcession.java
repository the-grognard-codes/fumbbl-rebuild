package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;

/** Administrative closure of an incompatible engine; the retained native checkpoint is never interpreted or changed. */
final class RetainedConcession {
    private final JsonObject payload;
    private final MatchDocument document;

    RetainedConcession(RecoveryRepository.Record record, MatchDocument document) {
        this.document = document;
        try {
            JsonObject envelope = JsonObject.readFrom(record.json);
            payload = envelope.get("payload").asObject();
            JsonObject encoded = new MatchJson().encode(document);
            JsonObject frozen = new JsonObject().add("home", encoded.get("home")).add("away", encoded.get("away"))
                .add("homeOwner", document.home.owner).add("awayOwner", document.away.owner);
            if (document.computer != null) frozen.add("computer", document.computer.json());
            if (envelope.size() != 2 || !digest(payload.toString()).equals(envelope.getString("sha256", null))
                || !document.matchId.equals(payload.getString("matchId", null))
                || !canonical(frozen).equals(canonical(payload.get("frozen").asObject())))
                throw new IllegalArgumentException();
        } catch (RuntimeException invalid) { throw new MatchService.Failure("RECOVERY_CORRUPT"); }
    }

    boolean closed() { return payload.get("concession") != null; }

    boolean unsupported() {
        int version = payload.getInt("recoveryVersion", -1);
        String runtime = payload.getString("runtimeVersion", "");
        boolean supported = version == 2 && (SetupSession.LEGACY_RUNTIME.equals(runtime) || SetupSession.DEFAULT_SETUP_RUNTIME.equals(runtime))
            || version == 3 && SetupSession.SAVE_RESUME_RUNTIME.equals(runtime)
            || version == 4 && SetupSession.TRANSCRIPT_RUNTIME.equals(runtime)
            || version == 5 && SetupSession.ROUTE_RUNTIME.equals(runtime)
            || version == 6 && SetupSession.CHAT_RUNTIME.equals(runtime);
        return !supported || !CompletedMatch.ENGINE_VERSION.equals(payload.getString("engineVersion", null))
            || payload.getInt("replayVersion", -1) != (version >= 4 ? 2 : 1);
    }

    JsonObject view(String role) {
        JsonObject view;
        if (closed()) {
            JsonArray events = JsonObject.readFrom(completed().json()).get("events").asArray();
            view = JsonObject.readFrom(events.get(events.size() - 1).asObject().get("state").toString());
        } else view = JsonObject.readFrom(payload.get("homeView").toString());
        view.set("callerRole", role).set("actions", new JsonArray()).set("prompt", JsonValue.NULL);
        view.remove("movementForecast");
        return view;
    }

    boolean close(String role, JsonObject request, long now) {
        if (closed()) return true;
        boolean accepted = false;
        for (JsonValue value : payload.get("history").asArray()) {
            JsonObject prior = value.asObject();
            if (!(role + "\n" + request.getString("requestId", "")).equals(prior.getString("key", null))) continue;
            if (!canonical(request).equals(prior.getString("fingerprint", null))) throw new MatchService.Failure("REQUEST_ID_REUSED");
            accepted = "ACCEPTED".equals(prior.getString("code", null)) && payload.getBoolean("pendingTerminal", false);
            if (!accepted) throw new MatchService.Failure("REQUEST_ID_REUSED");
        }
        int revision = payload.getInt("revision", -1);
        if (!accepted && request.getInt("expectedRevision", -1) != revision) throw new MatchService.Failure("STALE_REVISION");
        JsonArray events = JsonArray.readFrom(payload.get("eventsJson").asString());
        if (revision < 0 || revision > 8192 || !accepted && revision == 8192 || events.size() != revision + 1)
            throw new MatchService.Failure("RECOVERY_CORRUPT");
        JsonObject terminal = view("home");
        if (!accepted) {
          terminal.set("phase", "FULL_TIME").set("revision", revision + 1)
            .set("activePlayerId", JsonValue.NULL).set("homeScore", "home".equals(role) ? 0 : Math.max(2, view("home").getInt("homeScore", 0)))
            .set("awayScore", "away".equals(role) ? 0 : Math.max(2, view("home").getInt("awayScore", 0)));
          for (String field : Arrays.asList("passing", "blockPreview", "kickoff", "driveTracker", "playerActionMenu", "kickPreview", "activePlayerAction")) terminal.remove(field);
          events.add(new JsonObject().add("revision", revision + 1).add("kind", "FULL_TIME").add("state", terminal));
        }
        boolean transcript = payload.get("transcript") != null;
        boolean chat = transcript && payload.get("chat") != null;
        JsonObject result = new JsonObject().add("formatVersion", chat ? 3 : transcript ? 2 : 1)
            .add("engineVersion", CompletedMatch.ENGINE_VERSION).add("ruleset", document.home.team.ruleset)
            .add("catalogVersion", document.home.team.catalogVersion).add("presetId", document.home.team.presetId)
            .add("presetVersion", document.home.team.presetVersion).add("matchId", document.matchId)
            .add("homeScore", terminal.get("homeScore")).add("awayScore", terminal.get("awayScore"))
            .add("finalRevision", accepted ? revision : revision + 1).add("events", events);
        if (transcript) {
            MatchTranscript history = new MatchTranscript(payload.get("transcript").asObject());
            if (!accepted) history.append(revision + 1, "FULL_TIME", role, Math.max(now, history.lastTime()), request, new JsonArray(), terminal, history.nativeCursor());
            result.add("transcript", history.json());
        }
        if (chat) result.add("chat", payload.get("chat"));
        CompletedMatch completed = new CompletedMatch(result.toString());
        new MatchJson().validateCompletion(completed, document);
        payload.add("concession", new JsonObject().add("role", role).add("request", canonical(request)).add("completion", JsonObject.readFrom(completed.json())));
        return accepted;
    }

    boolean duplicate(String role, JsonObject request) {
        JsonObject closure = payload.get("concession").asObject();
        JsonObject original = JsonObject.readFrom(closure.getString("request", ""));
        if (role.equals(closure.getString("role", null)) && request.get("requestId").equals(original.get("requestId"))) {
            if (!canonical(request).equals(canonical(original))) throw new MatchService.Failure("REQUEST_ID_REUSED");
            return true;
        }
        throw new MatchService.Failure("MATCH_COMPLETED");
    }

    CompletedMatch completed() { return new CompletedMatch(payload.get("concession").asObject().get("completion").toString()); }
    String artifact() { return new JsonObject().add("payload", payload).add("sha256", digest(payload.toString())).toString(); }
    private String canonical(JsonObject value) { return new CompletedMatch(value.toString()).json(); }
    private String digest(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
}
