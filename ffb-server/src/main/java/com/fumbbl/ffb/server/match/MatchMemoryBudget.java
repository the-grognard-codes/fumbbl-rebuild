package com.fumbbl.ffb.server.match;

import java.util.Collection;

/** Heap policy: the activation ceiling is fixed; actual histories determine cache admission. */
public final class MatchMemoryBudget {
	private static final long MIB = 1024 * 1024;
	// Staged placements cap the setup history that drove the earlier 46.8 MB runaway.
	private static final long STAGED_DECODED_LIMIT = 44 * MIB;
	private static final int ACTIVATION_LIMIT = 32;
	private static final int RETAINED_FACTOR = 4;
	// Peak model includes both the resident and the memory used to materialize its history.
	private static final int WORKING_FACTOR = 11;
	private final long availableBytes;
	private final int decodedLimit;

	public MatchMemoryBudget() { this(Runtime.getRuntime().maxMemory()); }

	/** @throws IllegalArgumentException if the heap cannot support the baseline activation allocation. */
	public MatchMemoryBudget(long heapBytes) {
		if (heapBytes < 64 * MIB) throw new IllegalArgumentException("Match server requires at least 64 MiB heap");
		availableBytes = heapBytes - heapBytes / 4;
		long workingBytes = availableBytes - ACTIVATION_LIMIT * MIB;
		decodedLimit = (int) Math.min(STAGED_DECODED_LIMIT, workingBytes / WORKING_FACTOR);
	}

	public int residentLimit() { return ACTIVATION_LIMIT; }
	public int decodedLimit() { return decodedLimit; }
	public int appendLimit() { return decodedLimit - appendReserve(); }
	int appendReserve() { return Math.min(RecoveryJournal.MAX_ENTRY_BYTES, decodedLimit / 8); }
	record ResidentSize(long decodedBytes, long retainedBytes) {
		long workingBytes() { return Math.max(0, decodedBytes * WORKING_FACTOR - retainedBytes); }

		boolean growsFrom(ResidentSize previous) {
			return previous == null || decodedBytes > previous.decodedBytes || retainedBytes > previous.retainedBytes;
		}
	}

	ResidentSize residentSize(long decodedBytes, long frozenDecodedBytes, long frozenRetainedBytes) {
		long expandedBytes = Math.max(0, decodedBytes - frozenDecodedBytes);
		return new ResidentSize(decodedBytes, Math.max(MIB, expandedBytes * RETAINED_FACTOR + frozenRetainedBytes));
	}
	/** The serial engine worker can materialize one history at a time. */
	long sharedWorkingBytes(Collection<ResidentSize> residents) {
		return residents.stream().mapToLong(ResidentSize::workingBytes).max().orElse(0);
	}

	long retainedBytes(Collection<ResidentSize> residents, long detachedSlots) {
		return residents.stream().mapToLong(ResidentSize::retainedBytes).sum() + detachedSlots * MIB;
	}

	boolean admitsResidents(Collection<ResidentSize> residents, long detachedSlots) {
		return retainedBytes(residents, detachedSlots) + sharedWorkingBytes(residents) <= availableBytes;
	}
	/** @throws MatchService.Failure with MATCH_SIZE_LIMIT before any oversized decoded allocation. */
	void requireDecodedBytes(long bytes) {
		if (bytes > decodedLimit) throw new MatchService.Failure("MATCH_SIZE_LIMIT");
	}
}
