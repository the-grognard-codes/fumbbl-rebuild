package com.fumbbl.ffb.server.match;

import java.sql.SQLException;

public interface RecoveryRepository {
	Record find(String matchId) throws SQLException;
	/** Current durable generation, or null when absent. Every legitimate replacement advances generation via CAS. */
	default Long generation(String matchId) throws SQLException {
		Record record = find(matchId);
		return record == null ? null : record.generation;
	}
	boolean save(Record record, long expectedGeneration) throws SQLException;
	default boolean supportsJournal() { return false; }
	default boolean append(Record record, long expectedGeneration) throws SQLException {
		throw new SQLException("Recovery journal is unavailable");
	}

	final class RetentionLimit extends SQLException {
		public RetentionLimit() { super("Recovery retention capacity reached", "54000"); }
	}

	/** Deterministic validation failure tied to the generation actually read, never a transient fetch failure. */
	final class CorruptRecord extends IllegalArgumentException {
		public final String matchId;
		public final long generation;
		CorruptRecord(String matchId, long generation) { super("RECOVERY_CORRUPT"); this.matchId = matchId; this.generation = generation; }
	}

	final class Record {
		public final String matchId, json;
		public final long generation;
		public final String journalHash;
		public final int journalEntries;
		public final long journalBytes;

		public Record(String matchId, long generation, String json) {
			this(matchId, generation, json, null, 0, 0);
		}

		Record(String matchId, long generation, String json, String journalHash, int journalEntries, long journalBytes) {
			this.matchId = matchId;
			this.generation = generation;
			this.json = json;
			this.journalHash = journalHash; this.journalEntries = journalEntries; this.journalBytes = journalBytes;
		}
	}

	final class OutcomeUnknown extends SQLException {
		public final Record attempted;

		public OutcomeUnknown(Record attempted, SQLException cause) {
			super("Recovery commit outcome unknown", cause);
			this.attempted = attempted;
		}
	}
}
