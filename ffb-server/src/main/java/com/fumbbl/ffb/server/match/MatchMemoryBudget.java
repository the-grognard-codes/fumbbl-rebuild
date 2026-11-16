package com.fumbbl.ffb.server.match;

import java.util.function.BiConsumer;

/** Heap policy: the activation ceiling is fixed; actual histories determine cache admission. */
public final class MatchMemoryBudget {
	private static final long MIB = 1024 * 1024;
	private static final int ACTIVATION_LIMIT = 32;
	private static final int RETAINED_FACTOR = 4;
	private static final int WORKING_FACTOR = 11;
	private final long availableBytes;
	private final int decodedLimit;
	private BiConsumer<String, Long> admission = (id, bytes) -> { };

	public MatchMemoryBudget() { this(Runtime.getRuntime().maxMemory()); }

	/** @throws IllegalArgumentException if the heap cannot support the baseline activation allocation. */
	public MatchMemoryBudget(long heapBytes) {
		if (heapBytes < 64 * MIB) throw new IllegalArgumentException("Match server requires at least 64 MiB heap");
		availableBytes = heapBytes - heapBytes / 4;
		long workingBytes = availableBytes - ACTIVATION_LIMIT * MIB;
		decodedLimit = (int) Math.min(CompletedMatch.MAX_BYTES, workingBytes / WORKING_FACTOR);
	}

	public int residentLimit() { return ACTIVATION_LIMIT; }
	public int decodedLimit() { return decodedLimit; }
	int appendLimit() { return decodedLimit - appendReserve(); }
	int appendReserve() { return Math.min(RecoveryJournal.MAX_ENTRY_BYTES, decodedLimit / 8); }
	long residentBytes(long decodedBytes) { return Math.max(MIB, decodedBytes * RETAINED_FACTOR); }
	/** One workspace shared by the serial engine worker, sized for the largest admitted history. */
	long sharedWorkingBytes(long largestDecodedBytes) { return largestDecodedBytes * (WORKING_FACTOR - RETAINED_FACTOR); }
	boolean admitsResidents(long residentBytes, long largestDecodedBytes) {
		return residentBytes + sharedWorkingBytes(largestDecodedBytes) <= availableBytes;
	}
	void configureAdmission(BiConsumer<String, Long> admission) { this.admission = admission; }
	/** @throws MatchService.Failure for over-budget records or exhausted resident admission. */
	void beforeLoad(String id, long decodedBytes) { requireDecodedBytes(decodedBytes); admission.accept(id, decodedBytes); }

	/** @throws MatchService.Failure with MATCH_SIZE_LIMIT before any oversized decoded allocation. */
	void requireDecodedBytes(long bytes) {
		if (bytes > decodedLimit) throw new MatchService.Failure("MATCH_SIZE_LIMIT");
	}
}
