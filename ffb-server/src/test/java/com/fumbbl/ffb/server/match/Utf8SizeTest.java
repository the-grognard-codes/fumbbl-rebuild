package com.fumbbl.ffb.server.match;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;

class Utf8SizeTest {
	@Test void matchesTheStandardEncoderForAsciiUnicodeAndUnpairedSurrogates() {
		Utf8Size size = new Utf8Size();
		for (String text : new String[] { "", "plain ASCII", "\u00e9\u20ac", "\ud83c\udfc8", "\ud83c", "\udfc8", "\ud83c\ud83c\udfc8x\udfc8" }) {
			assertEquals(text.getBytes(StandardCharsets.UTF_8).length, size.bytes(text));
		}
	}
}
