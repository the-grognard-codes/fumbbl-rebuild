package com.fumbbl.ffb.server.match;

/** Frozen JSON size on the server JDK with its default compact strings and compressed references. */
final class FrozenJsonSize {
	private static final int STRING_BYTES = 24;
	private static final int ARRAY_HEADER_BYTES = 16;
	private static final int LIST_SLOT_BYTES = 8; // Includes spare capacity in the backing array.

	long retainedBytes(String json) {
		long payloadBytes = json.length();
		// Compact strings use Latin-1 when all UTF-16 code units fit in one byte.
		for (int index = 0; index < json.length(); index++) {
			if (json.charAt(index) > 0xff) {
				payloadBytes *= 2;
				break;
			}
		}
		return STRING_BYTES + ARRAY_HEADER_BYTES + ((payloadBytes + 7) & ~7L) + LIST_SLOT_BYTES;
	}
}
