package com.fumbbl.ffb.server.match;

/** Counts the standard UTF-8 encoding without allocating an artifact-sized byte array. */
final class Utf8Size {
	long bytes(String text) {
		long bytes = 0;
		for (int index = 0; index < text.length(); index++) {
			char ch = text.charAt(index);
			if (Character.isHighSurrogate(ch) && index + 1 < text.length() && Character.isLowSurrogate(text.charAt(index + 1))) { bytes += 4; index++; }
			else bytes += ch < 0x80 ? 1 : ch < 0x800 ? 2 : Character.isSurrogate(ch) ? 1 : 3;
		}
		return bytes;
	}
}
