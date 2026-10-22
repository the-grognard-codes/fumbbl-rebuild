package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Dedicated short transactions for recovery artifacts. */
public final class JdbcRecoveryRepository implements RecoveryRepository {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	public interface Connections { Connection open() throws SQLException; }
	private final Connections connections;
	private final BoundedJsonStorageCodec codec;
	public static final int MAX_RETAINED_RECORDS = 1024;
	private final int retainedLimit;
	private final boolean journalEnabled;

	public JdbcRecoveryRepository(Connections connections) { this(connections, MAX_RETAINED_RECORDS); }
	public JdbcRecoveryRepository(Connections connections, boolean journalEnabled) {
		this(connections, MAX_RETAINED_RECORDS, new BoundedJsonStorageCodec(BoundedJsonStorageCodec.RECOVERY_ENCODED_LIMIT,
			BoundedJsonStorageCodec.RECOVERY_DECODED_LIMIT), journalEnabled);
	}

	public JdbcRecoveryRepository(Connections connections, int retainedLimit) {
		this(connections, retainedLimit, new BoundedJsonStorageCodec(BoundedJsonStorageCodec.RECOVERY_ENCODED_LIMIT,
			BoundedJsonStorageCodec.RECOVERY_DECODED_LIMIT));
	}

	JdbcRecoveryRepository(Connections connections, int retainedLimit, BoundedJsonStorageCodec codec) {
		this(connections, retainedLimit, codec, false);
	}

	JdbcRecoveryRepository(Connections connections, int retainedLimit, BoundedJsonStorageCodec codec, boolean journalEnabled) {
		if (retainedLimit < 1 || retainedLimit > MAX_RETAINED_RECORDS) throw new IllegalArgumentException("Invalid recovery retention limit");
		this.connections = connections; this.retainedLimit = retainedLimit; this.codec = codec;
		this.journalEnabled = journalEnabled;
	}
	@Override public boolean supportsJournal() { return journalEnabled; }

	@Override
	public Record find(String matchId) throws SQLException {
		if (journalEnabled) return findJournal(matchId);
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT matchid,generation,artifact_json FROM ffb_match_recovery WHERE matchid=?")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) {
				return rows.next() ? new Record(rows.getString(1), rows.getLong(2), codec.decode(rows.getString(3))) : null;
			}
		}
	}

	private Record findJournal(String id) throws SQLException {
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			long generation = 0, checkpointGeneration; String checkpoint;
			try {
				try (PreparedStatement query = connection.prepareStatement(
					"SELECT generation,checkpoint_generation,artifact_json FROM ffb_match_recovery WHERE matchid=? FOR UPDATE")) {
					query.setString(1, id);
					try (ResultSet rows = query.executeQuery()) {
						if (!rows.next()) { connection.commit(); return null; }
						generation = rows.getLong(1); checkpointGeneration = rows.getLong(2); checkpoint = codec.decode(rows.getString(3));
					}
				}
				List<Record> entries = new ArrayList<>();
				BoundedJsonStorageCodec journalCodec = new BoundedJsonStorageCodec(RecoveryJournal.MAX_ENTRY_BYTES, RecoveryJournal.MAX_ENTRY_BYTES);
				try (PreparedStatement query = connection.prepareStatement(
					"SELECT generation,record_json FROM ffb_match_recovery_journal WHERE matchid=? ORDER BY generation")) {
					query.setString(1, id);
					try (ResultSet rows = query.executeQuery()) {
						while (rows.next()) {
							if (entries.size() >= RecoveryJournal.MAX_ENTRIES) throw new MatchService.Failure("RECOVERY_CORRUPT");
							entries.add(new Record(id, rows.getLong(1), journalCodec.decode(rows.getString(2))));
						}
					}
				}
				connection.commit();
				return new RecoveryJournal().restore(id, generation, checkpointGeneration, checkpoint, entries);
			} catch (SQLException | RuntimeException failure) {
				try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
				if (generation > 0 && failure instanceof IllegalArgumentException
					&& (!(failure instanceof MatchService.Failure) || "RECOVERY_CORRUPT".equals(((MatchService.Failure) failure).code)))
					throw new CorruptRecord(id, generation);
				throw failure;
			}
		}
	}

	@Override
	public Long generation(String matchId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT generation FROM ffb_match_recovery WHERE matchid=?")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) { return rows.next() ? rows.getLong(1) : null; }
		}
	}

	@Override
	public boolean save(Record record, long expectedGeneration) throws SQLException {
		if (expectedGeneration < 0 || expectedGeneration == Long.MAX_VALUE || record.generation != expectedGeneration + 1)
			throw new SQLException("Invalid recovery generation");
		String storedJson;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.STORAGE_ENCODE)) {
			storedJson = codec.encode(record.json);
		}
		boolean commitAttempted = false;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.CHECKPOINT_SQL);
			Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				int count;
				if (expectedGeneration == 0) {
					reserveRetention(record.matchId, connection);
					try (PreparedStatement statement = connection.prepareStatement(
						journalEnabled ? "INSERT INTO ffb_match_recovery(matchid,generation,artifact_json,checkpoint_generation) VALUES (?,?,?,?)"
							: "INSERT INTO ffb_match_recovery(matchid,generation,artifact_json) VALUES (?,?,?)")) {
						statement.setString(1, record.matchId); statement.setLong(2, 1); statement.setString(3, storedJson);
						if (journalEnabled) statement.setLong(4, 1);
						count = statement.executeUpdate();
					}
				} else {
					try (PreparedStatement statement = connection.prepareStatement(
						journalEnabled ? "UPDATE ffb_match_recovery SET generation=?,artifact_json=?,checkpoint_generation=? WHERE matchid=? AND generation=?"
							: "UPDATE ffb_match_recovery SET generation=?,artifact_json=? WHERE matchid=? AND generation=?")) {
						statement.setLong(1, expectedGeneration + 1); statement.setString(2, storedJson);
						if (journalEnabled) {
							statement.setLong(3, record.generation); statement.setString(4, record.matchId); statement.setLong(5, expectedGeneration);
						} else { statement.setString(3, record.matchId); statement.setLong(4, expectedGeneration); }
						count = statement.executeUpdate();
					}
				}
				if (count == 0) { connection.rollback(); return false; }
				if (count != 1) throw new SQLException("Unexpected recovery write count");
				if (journalEnabled) try (PreparedStatement clear = connection.prepareStatement(
					"DELETE FROM ffb_match_recovery_journal WHERE matchid=?")) {
					clear.setString(1, record.matchId); clear.executeUpdate();
				}
				commitAttempted = true;
				connection.commit();
				return true;
			} catch (SQLException failure) {
				try { connection.rollback(); } catch (SQLException rollbackFailure) { failure.addSuppressed(rollbackFailure); }
				if (expectedGeneration == 0 && duplicateKey(failure)) return false;
				throw failure;
			}
		} catch (SQLException failure) {
			if (commitAttempted) throw new OutcomeUnknown(record, failure);
			throw failure;
		}
	}

	@Override public boolean append(Record record, long expectedGeneration) throws SQLException {
		if (!journalEnabled || expectedGeneration < 1 || expectedGeneration == Long.MAX_VALUE || record.generation != expectedGeneration + 1)
			throw new SQLException("Invalid recovery journal generation");
		int bytes = record.json.getBytes(StandardCharsets.UTF_8).length;
		String stored;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.STORAGE_ENCODE)) {
			stored = new BoundedJsonStorageCodec(RecoveryJournal.MAX_ENTRY_BYTES, RecoveryJournal.MAX_ENTRY_BYTES).encode(record.json);
		}
		boolean commitAttempted = false;
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.CHECKPOINT_SQL);
			Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				try (PreparedStatement update = connection.prepareStatement(
					"UPDATE ffb_match_recovery SET generation=? WHERE matchid=? AND generation=? AND generation-checkpoint_generation<32")) {
					update.setLong(1, record.generation); update.setString(2, record.matchId); update.setLong(3, expectedGeneration);
					int count = update.executeUpdate();
					if (count == 0) { connection.rollback(); return false; }
					if (count != 1) throw new SQLException("Unexpected recovery journal write count");
				}
				try (PreparedStatement budget = connection.prepareStatement(
					"SELECT COALESCE(SUM(decoded_bytes),0) FROM ffb_match_recovery_journal WHERE matchid=?")) {
					budget.setString(1, record.matchId);
					try (ResultSet rows = budget.executeQuery()) {
						if (!rows.next() || rows.getLong(1) + bytes > RecoveryJournal.COMPACT_BYTES) throw new SQLException("Recovery journal byte limit");
					}
				}
				try (PreparedStatement insert = connection.prepareStatement(
					"INSERT INTO ffb_match_recovery_journal(matchid,generation,record_json,decoded_bytes) VALUES (?,?,?,?)")) {
					insert.setString(1, record.matchId); insert.setLong(2, record.generation); insert.setString(3, stored); insert.setInt(4, bytes);
					if (insert.executeUpdate() != 1) throw new SQLException("Unexpected recovery journal insert count");
				}
				commitAttempted = true; connection.commit(); return true;
			} catch (SQLException | RuntimeException failure) {
				try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
				throw failure;
			}
		} catch (SQLException failure) { if (commitAttempted) throw new OutcomeUnknown(record, failure); throw failure; }
	}

	private void reserveRetention(String matchId, Connection connection) throws SQLException {
		// Serialize only new-record admission, including across JVMs. Existing checkpoints
		// must remain writable even when all retained slots are occupied.
		try (PreparedStatement lock = connection.prepareStatement("SELECT version FROM ffb_local_schema FOR UPDATE");
			ResultSet rows = lock.executeQuery()) {
			if (!rows.next()) throw new SQLException("Recovery schema unavailable");
			int version = rows.getInt(1);
			if (version < 5 || version > 9 || journalEnabled && version != 9) throw new SQLException("Recovery schema unavailable");
		}
		try (PreparedStatement count = connection.prepareStatement(
			"SELECT COUNT(*),COUNT(CASE WHEN matchid=? THEN 1 END) FROM ffb_match_recovery")) {
			count.setString(1, matchId);
			try (ResultSet rows = count.executeQuery()) {
				if (!rows.next()) throw new SQLException("Recovery retention count unavailable");
				// An existing ID still takes the ordinary duplicate/CAS path at capacity.
				if (rows.getLong(1) >= retainedLimit && rows.getLong(2) == 0) throw new RecoveryRepository.RetentionLimit();
			}
		}
	}

	private boolean duplicateKey(SQLException failure) {
		return "23000".equals(failure.getSQLState()) && failure.getErrorCode() == 1062;
	}
}
