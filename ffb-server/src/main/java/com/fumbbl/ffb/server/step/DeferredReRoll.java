package com.fumbbl.ffb.server.step;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** A ruleset-owned reroll test waiting for input or consumption by the original action. */
public final class DeferredReRoll {

	private final String playerId;
	private final Boolean successful;

	public DeferredReRoll(String playerId, Boolean successful) {
		if (playerId == null || playerId.isEmpty()) throw new IllegalArgumentException("Missing reroll player");
		this.playerId = playerId;
		this.successful = successful;
	}

	public String getPlayerId() { return playerId; }
	public Boolean getSuccessful() { return successful; }

	JsonObject toJsonValue() {
		return new JsonObject().add("playerId", playerId)
			.add("successful", successful == null ? JsonValue.NULL : JsonValue.valueOf(successful));
	}

	static DeferredReRoll fromJsonValue(JsonValue value) {
		JsonObject object = value.asObject();
		if (object.size() != 2 || object.get("playerId") == null || object.get("successful") == null)
			throw new IllegalArgumentException("Invalid deferred reroll");
		JsonValue successful = object.get("successful");
		return new DeferredReRoll(object.get("playerId").asString(), successful.isNull() ? null : successful.asBoolean());
	}
}
