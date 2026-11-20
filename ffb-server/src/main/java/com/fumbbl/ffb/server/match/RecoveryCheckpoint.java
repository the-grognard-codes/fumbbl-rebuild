package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Optional;

/** Read-only inspection of a checkpoint before native engine restoration. */
final class RecoveryCheckpoint {
	private final MatchPersistenceLog persistenceLog = new MatchPersistenceLog();

	static final class Validated {
		private final JsonObject payload;

		private Validated(JsonObject payload) { this.payload = payload; }

		JsonObject payload() { return payload; }
	}

	Validated validate(String artifact) {
		try {
			JsonObject envelope = new MatchJson().parse(artifact, RecoveryArtifactJson.MAX_CHECKPOINT_BYTES, 128);
			JsonObject payload = envelope.get("payload").asObject();
			if (envelope.size() != 2 || !new JsonDigest().sha256(payload).equals(envelope.getString("sha256", null)))
				throw new IllegalArgumentException("Recovery checksum mismatch");
			requireSupported(payload);
			return new Validated(payload);
		} catch (MatchService.Failure failure) {
			throw failure;
		} catch (RuntimeException invalid) {
			throw new MatchService.Failure("RECOVERY_CORRUPT");
		}
	}

	void requireSupported(JsonObject payload) {
		if (payload.getInt("recoveryVersion", -1) != SetupSession.STAGED_RECOVERY_VERSION
			|| !SetupSession.STAGED_RUNTIME.equals(payload.getString("runtimeVersion", null))
			|| !"ffb-3.4.0-bb2025-m3d.1".equals(payload.getString("engineVersion", null))
			|| payload.getInt("replayVersion", -1) != 2)
			throw new MatchService.Failure("RECOVERY_UNSUPPORTED");
	}

	record ComputerReply(String code, JsonValue view) { }

	Optional<ComputerReply> computerReply(Validated checkpoint, MatchDocument document, String computerRole, long now) {
		try {
			JsonObject payload = checkpoint.payload();
			String humanRole = "home".equals(computerRole) ? "away" : "home";
			String matchId = document.matchId;
			if (!matchId.equals(payload.getString("matchId", null)) || payload.getBoolean("failed", true)
				|| payload.getBoolean("pendingTerminal", true))
				return Optional.empty();
			JsonObject view = new JsonObject(payload.get(computerRole + "View").asObject());
			if (!matchId.equals(view.getString("matchId", null)) || !computerRole.equals(view.getString("callerRole", null))
				|| "FULL_TIME".equals(view.getString("phase", null))
				|| view.getInt("revision", -1) != payload.get("revision").asInt()) return Optional.empty();
			JsonValue save = payload.get("saveResume");
			if (save != null && !save.isNull()) {
				SetupSession.SaveResumeState retained = new SetupSession.SaveResumeState(save.asObject());
				if (retained.abandoned) return Optional.of(new ComputerReply("MATCH_ABANDONED", JsonValue.NULL));
				if (retained.suspended() || retained.proposal != null || retained.inactive(true, now)) return Optional.empty();
				view.add("saveResume", retained.publicJson());
				// A pre-clock checkpoint needs a fresh, durable start when the human owes the decision.
				if (retained.humanDecisionSince < 0) return Optional.empty();
			}
			if (payload.get("reactiveDecision") != null || !humanRole.equals(view.getString("actor", null)))
				return Optional.empty();
			JsonValue prompt = view.get("prompt");
			if (!prompt.isNull() && !humanRole.equals(prompt.asObject().getString("actor", null))) return Optional.empty();
			return Optional.of(new ComputerReply("ACCEPTED", view));
		} catch (RuntimeException invalid) {
			persistenceLog.coldComputerLoadFallback("waiting-view", document.matchId, invalid);
			return Optional.empty();
		}
	}
}
