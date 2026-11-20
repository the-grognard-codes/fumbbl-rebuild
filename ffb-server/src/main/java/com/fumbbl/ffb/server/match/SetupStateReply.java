package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Common setup response envelope for live and retained projections. */
final class SetupStateReply {
	JsonObject create(String requestId, String code, boolean duplicate, JsonValue state) {
		return new JsonObject().add("version", 1).add("type", "setupState").add("requestId", requestId)
			.add("code", code).add("duplicate", duplicate).add("state", state);
	}
}
