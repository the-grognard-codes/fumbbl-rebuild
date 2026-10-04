package com.fumbbl.ffb.server.match;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CompletedMatchTest {
	@Test void acceptsCanonicalArtifactsLargerThanTheFormerSixteenMiBBound() {
		StringBuilder json = new StringBuilder(17 * 1024 * 1024 + 32);
		json.append("{\"blob\":\"");
		for (int index = 0; index < 17 * 1024 * 1024; index++) json.append('x');
		json.append("\"}");
		CompletedMatch completed = new CompletedMatch(json.toString());
		assertTrue(completed.json().length() > 16 * 1024 * 1024);
		assertEquals(64 * 1024 * 1024, CompletedMatch.MAX_BYTES);
	}
}
