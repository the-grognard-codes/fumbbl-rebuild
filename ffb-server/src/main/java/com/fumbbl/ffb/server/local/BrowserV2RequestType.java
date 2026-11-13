package com.fumbbl.ffb.server.local;

import java.util.HashMap;
import java.util.Map;

/** Wire names shared by protocol dispatch and the transport's fatal log context. */
enum BrowserV2RequestType {
	AUTHENTICATE("authenticate"),
	AUTHENTICATE_COMPUTER("authenticateComputer"),
	BROWSE("browse"),
	CATALOG("catalog"),
	COMPUTER("computer"),
	CURRENT_MATCHES("currentMatches"),
	DIAGNOSTICS("diagnostics"),
	MATCH_CHAT("matchChat"),
	MATCH_RESULT("matchResult"),
	MATCH_TRANSCRIPT("matchTranscript"),
	MOVEMENT_PREVIEW("movementPreview"),
	MOVEMENT_RANGE("movementRange"),
	PREPARED_MATCH("preparedMatch"),
	ROUTE_PREVIEW("routePreview"),
	SAVED_TEAM("savedTeam"),
	SETUP("setup"),
	SKILL_USE_PREFERENCES("skillUsePreferences"),
	VALIDATE_TEAM("validateTeam"),
	WATCH("watch"),
	UNKNOWN("INGRESS");

	private static final Map<String, BrowserV2RequestType> BY_WIRE_NAME;
	static {
		Map<String, BrowserV2RequestType> types = new HashMap<>();
		for (BrowserV2RequestType type : values()) {
			if (type != UNKNOWN) types.put(type.wireName, type);
		}
		BY_WIRE_NAME = Map.copyOf(types);
	}

	private final String wireName;

	BrowserV2RequestType(String wireName) { this.wireName = wireName; }

	static BrowserV2RequestType fromWireName(String wireName) {
		return BY_WIRE_NAME.getOrDefault(wireName, UNKNOWN);
	}

	String wireName() { return wireName; }
}
