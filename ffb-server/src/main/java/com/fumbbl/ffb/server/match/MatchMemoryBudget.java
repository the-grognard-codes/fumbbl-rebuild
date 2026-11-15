package com.fumbbl.ffb.server.match;

/** Heap admission policy, independent of the compatible on-disk format ceilings. */
public final class MatchMemoryBudget {
	private static final long MIB = 1024 * 1024;
	private static final int MAX_SESSIONS = 32;
	private static final int MAX_DECODED_BYTES = 32 * 1024 * 1024;
	// Includes resident JSON/native graphs, journal reassembly and serialization copies.
	private static final int EXPANSION_FACTOR = 12;
	private final int residentLimit;
	private final int decodedLimit;

	public MatchMemoryBudget() { this(Runtime.getRuntime().maxMemory()); }

	public MatchMemoryBudget(long heapBytes) {
		if (heapBytes < 64 * MIB) throw new IllegalArgumentException("Match server requires at least 64 MiB heap");
		long available = heapBytes - Math.max(32 * MIB, heapBytes / 3);
		residentLimit = (int) Math.max(1, Math.min(MAX_SESSIONS, available / (MAX_DECODED_BYTES * (long) EXPANSION_FACTOR)));
		decodedLimit = (int) Math.min(MAX_DECODED_BYTES, available / residentLimit / EXPANSION_FACTOR);
	}

	public int residentLimit() { return residentLimit; }
	public int decodedLimit() { return decodedLimit; }
	int appendLimit() { return Math.max(1, decodedLimit - 1024 * 1024); }

	void requireDecodedBytes(long bytes) {
		if (bytes > decodedLimit) throw new MatchService.Failure("MATCH_SIZE_LIMIT");
	}
}
