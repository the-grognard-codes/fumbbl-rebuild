package com.fumbbl.ffb.server.match;

/** Stable coach-facing reasons; tracking-storage failures are advisory and never match stops. */
public enum MatchStopReason {
	MATCH_SIZE_LIMIT,
	MATCH_QUARANTINED
}
