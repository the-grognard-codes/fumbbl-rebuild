package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcConnections.CommitNotStarted;
import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.LongConsumer;

/** Dedicated short transactions for recovery artifacts. */
public final class JdbcRecoveryRepository implements RecoveryRepository {
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	public interface Connections { Connection open() throws SQLException; }
	private final Connections connections;
	private final BoundedJsonStorageCodec codec;
	private final MatchMemoryBudget memoryBudget;
	private final MatchSafetyJournal safety;
	public static final int MAX_RETAINED_RECORDS = 1024;
	private final int retainedLimit;
	private final boolean journalEnabled;
	private final boolean computerScheduling;

	public JdbcRecoveryRepository(Connections connections) { this(connections, MAX_RETAINED_RECORDS); }
	public JdbcRecoveryRepository(Connections connections, boolean journalEnabled) {
		this(connections, journalEnabled, false);
	}

	public JdbcRecoveryRepository(Connections connections, boolean journalEnabled, boolean computerScheduling) {
		this(connections, journalEnabled, computerScheduling, new MatchMemoryBudget(),
			new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
	}

	public JdbcRecoveryRepository(Connections connections, boolean journalEnabled, MatchMemoryBudget memoryBudget) {
		this(connections, journalEnabled, false, memoryBudget, new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
	}

	public JdbcRecoveryRepository(Connections connections, boolean journalEnabled, boolean computerScheduling,
		MatchMemoryBudget memoryBudget, MatchSafetyJournal safety) {
		this(connections, MAX_RETAINED_RECORDS, new BoundedJsonStorageCodec(BoundedJsonStorageCodec.RECOVERY_ENCODED_LIMIT,
			BoundedJsonStorageCodec.RECOVERY_DECODED_LIMIT), journalEnabled, computerScheduling, memoryBudget, safety);
	}

	public JdbcRecoveryRepository(Connections connections, int retainedLimit) {
		this(connections, retainedLimit, new BoundedJsonStorageCodec(BoundedJsonStorageCodec.RECOVERY_ENCODED_LIMIT,
			BoundedJsonStorageCodec.RECOVERY_DECODED_LIMIT));
	}

	JdbcRecoveryRepository(Connections connections, int retainedLimit, BoundedJsonStorageCodec codec) {
		this(connections, retainedLimit, codec, false);
	}

	JdbcRecoveryRepository(Connections connections, int retainedLimit, BoundedJsonStorageCodec codec, boolean journalEnabled) {
		this(connections, retainedLimit, codec, journalEnabled, new MatchMemoryBudget());
	}

	JdbcRecoveryRepository(Connections connections, int retainedLimit, BoundedJsonStorageCodec codec, boolean journalEnabled,
		MatchMemoryBudget memoryBudget) {
		this(connections, retainedLimit, codec, journalEnabled, false, memoryBudget,
			new MatchSafetyJournal(MatchSafetyJournal.Tracking.DISABLED));
	}

	private JdbcRecoveryRepository(Connections connections, int retainedLimit, BoundedJsonStorageCodec codec,
		boolean journalEnabled, boolean computerScheduling, MatchMemoryBudget memoryBudget, MatchSafetyJournal safety) {
		if (retainedLimit < 1 || retainedLimit > MAX_RETAINED_RECORDS) throw new IllegalArgumentException("Invalid recovery retention limit");
		if (computerScheduling && !journalEnabled) throw new IllegalArgumentException("Computer scheduling requires recovery journals");
		this.connections = connections; this.retainedLimit = retainedLimit; this.codec = codec;
		this.memoryBudget = memoryBudget;
		this.safety = safety;
		this.journalEnabled = journalEnabled;
		this.computerScheduling = computerScheduling;
	}
	@Override public boolean supportsJournal() { return journalEnabled; }

	@Override
	public Record find(String matchId) throws SQLException {
		return findForRestore(matchId, bytes -> { });
	}

	@Override
	public Record findForRestore(String matchId, LongConsumer admitDecoded) throws SQLException {
		if (journalEnabled) return findJournal(matchId, admitDecoded);
		try (Connection connection = openConnection(); PreparedStatement query = connection.prepareStatement(
			"SELECT matchid,generation,artifact_json FROM ffb_match_recovery WHERE matchid=?")) {
			query.setString(1, matchId);
			try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) {
				if (!rows.next()) return null;
				String stored = rows.getString(3);
				long bytes = codec.decodedBytes(stored);
				memoryBudget.requireDecodedBytes(bytes);
				admitDecoded.accept(bytes);
				return new Record(rows.getString(1), rows.getLong(2), codec.decode(stored));
			}
		}
	}

	@Override
	public Map<String, Record> findAll(List<String> ids, LobbyReadBudget budget) throws SQLException {
		budget.entries(ids.size());
		Map<String, Record> result = new LinkedHashMap<>();
		if (ids.isEmpty()) return result;
		LobbyReadQuery batch = new LobbyReadQuery();
		Set<String> unavailable = new HashSet<>();
		try (Connection connection = openConnection()) {
			// A repeatable-read snapshot for checkpoints plus journals, without locks or engine activation.
			connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
			connection.setAutoCommit(false);
			try {
				Map<String, Long> checkpointGenerations = new LinkedHashMap<>();
				try (PreparedStatement query = connection.prepareStatement(
					"SELECT matchid,generation," + batch.columns("artifact_json", budget)
					+ (journalEnabled ? ",checkpoint_generation" : "")
					+ " FROM ffb_match_recovery WHERE matchid IN (" + batch.slots(ids) + ")")) {
					batch.bind(query, ids);
					try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) {
						int count = 0;
						while (rows.next()) {
							if (++count > ids.size()) throw new SQLException("Unexpected lobby recovery row count");
							String id = rows.getString(1);
							try { result.put(id, new Record(id, rows.getLong(2), budget.read(rows, 3, codec))); }
							catch (LobbyReadBudget.InvalidRecord invalid) { unavailable.add(id); }
							if (journalEnabled) checkpointGenerations.put(id, rows.getLong(5));
						}
					}
				}
				if (journalEnabled) {
					Map<String, List<Record>> journals = new LinkedHashMap<>();
					// One overflow row per match identifies corruption without starving other entries.
					int perMatchRows = RecoveryJournal.MAX_ENTRIES + 1;
					try (PreparedStatement query = connection.prepareStatement(
						"SELECT matchid,generation," + batch.columns("record_json", budget)
						+ " FROM (SELECT matchid,generation,record_json,ROW_NUMBER() OVER (PARTITION BY matchid ORDER BY generation) AS lobby_row"
						+ " FROM ffb_match_recovery_journal WHERE matchid IN (" + batch.slots(ids) + ")) AS journal"
						+ " WHERE lobby_row<=" + perMatchRows + " ORDER BY matchid,generation LIMIT " + ids.size() * perMatchRows)) {
						batch.bind(query, ids);
						try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) {
							int count = 0;
							while (rows.next()) {
								if (++count > ids.size() * perMatchRows) throw new SQLException("Unexpected lobby journal row count");
								String id = rows.getString(1);
								if (unavailable.contains(id) || !result.containsKey(id)) continue;
								List<Record> entries = journals.computeIfAbsent(id, ignored -> new ArrayList<>());
								try {
									if (entries.size() >= RecoveryJournal.MAX_ENTRIES) throw new LobbyReadBudget.InvalidRecord();
									entries.add(new Record(id, rows.getLong(2), budget.read(rows, 3, codec)));
								} catch (LobbyReadBudget.InvalidRecord invalid) { unavailable.add(id); }
							}
						}
					}
					for (String id : new ArrayList<>(result.keySet())) {
						budget.check();
						if (unavailable.contains(id)) { result.remove(id); continue; }
						Record base = result.get(id);
						List<Record> entries = journals.getOrDefault(id, List.of());
						long reassemblyBytes = base.json.length();
						for (Record entry : entries) reassemblyBytes += entry.json.length();
						budget.consumeCopyBytes(reassemblyBytes * (entries.size() + 1));
						try {
							Record restored = new RecoveryJournal().restore(id, base.generation, checkpointGenerations.get(id), base.json, entries);
							budget.admit(restored.json);
							result.put(id, restored);
						} catch (MatchService.Failure failure) {
							if (!"RECOVERY_CORRUPT".equals(failure.code)) throw failure;
							result.remove(id);
						} catch (LobbyReadBudget.InvalidRecord invalid) { result.remove(id); }
					}
				}
				commit(connection);
			} catch (SQLException | RuntimeException failure) {
				try { rollback(connection); } catch (SQLException cleanup) { failure.addSuppressed(cleanup); }
				throw failure;
			}
		}
		return result;
	}

	private Record findJournal(String id, LongConsumer admitDecoded) throws SQLException {
		long generation = 0;
		long checkpointGeneration;
		String checkpoint;
		List<Record> entries = new ArrayList<>();
		try {
			try (Connection connection = openConnection()) {
				connection.setAutoCommit(false);
				try {
					try (PreparedStatement query = connection.prepareStatement(
						"SELECT generation,checkpoint_generation,artifact_json FROM ffb_match_recovery WHERE matchid=? FOR UPDATE")) {
						query.setString(1, id);
						try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) {
							if (!rows.next()) { rollback(connection); return null; }
							generation = rows.getLong(1);
							checkpointGeneration = rows.getLong(2);
							checkpoint = rows.getString(3);
						}
					}
					try (PreparedStatement query = connection.prepareStatement(
						"SELECT generation,record_json FROM ffb_match_recovery_journal WHERE matchid=? ORDER BY generation")) {
						query.setString(1, id);
						try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) {
							while (rows.next()) {
								if (entries.size() >= RecoveryJournal.MAX_ENTRIES) throw new MatchService.Failure("RECOVERY_CORRUPT");
								entries.add(new Record(id, rows.getLong(1), rows.getString(2)));
							}
						}
					}
				} catch (SQLException | RuntimeException failure) {
					try { rollback(connection); } catch (SQLException cleanup) { failure.addSuppressed(cleanup); }
					throw failure;
				}
				rollback(connection);
			}
			// Finish the consistent SQL snapshot before decoding or reassembling the bounded records.
			BoundedJsonStorageCodec journalCodec = new BoundedJsonStorageCodec(RecoveryJournal.MAX_ENTRY_BYTES, RecoveryJournal.MAX_ENTRY_BYTES);
			long decodedBytes = codec.decodedBytes(checkpoint);
			for (Record entry : entries) decodedBytes += journalCodec.decodedBytes(entry.json);
			memoryBudget.requireDecodedBytes(decodedBytes);
			admitDecoded.accept(decodedBytes);
			for (int index = 0; index < entries.size(); index++) {
				Record entry = entries.get(index);
				entries.set(index, new Record(id, entry.generation, journalCodec.decode(entry.json)));
			}
			Record restored = new RecoveryJournal().restore(id, generation, checkpointGeneration, codec.decode(checkpoint), entries);
			memoryBudget.requireDecodedBytes(new Utf8Size().bytes(restored.json));
			return restored;
		} catch (IllegalArgumentException failure) {
			if (generation > 0 && (!(failure instanceof MatchService.Failure rejected) || "RECOVERY_CORRUPT".equals(rejected.code)))
				throw new CorruptRecord(id, generation);
			throw failure;
		}
	}

	@Override
	public Long generation(String matchId) throws SQLException {
		try (Connection connection = openConnection(); PreparedStatement query = connection.prepareStatement(
			"SELECT generation FROM ffb_match_recovery WHERE matchid=?")) {
			query.setString(1, matchId);
			try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) { return rows.next() ? rows.getLong(1) : null; }
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
			Connection connection = openConnection()) {
			connection.setAutoCommit(false);
			try {
				int count;
				if (expectedGeneration == 0) {
					reserveRetention(record.matchId, connection);
					try (PreparedStatement statement = connection.prepareStatement(
						computerScheduling ? "INSERT INTO ffb_match_recovery(matchid,generation,artifact_json,checkpoint_generation,computer_work_until_epoch_ms) VALUES (?,?,?,?,?)"
							: journalEnabled ? "INSERT INTO ffb_match_recovery(matchid,generation,artifact_json,checkpoint_generation) VALUES (?,?,?,?)"
							: "INSERT INTO ffb_match_recovery(matchid,generation,artifact_json) VALUES (?,?,?)")) {
						statement.setString(1, record.matchId); statement.setLong(2, 1); statement.setString(3, storedJson);
						if (journalEnabled) statement.setLong(4, 1);
						if (computerScheduling) bindComputerWork(statement, 5, record);
						count = executeWrite(statement);
					}
				} else {
					try (PreparedStatement statement = connection.prepareStatement(
						computerScheduling ? "UPDATE ffb_match_recovery SET generation=?,artifact_json=?,checkpoint_generation=?,computer_work_until_epoch_ms=? WHERE matchid=? AND generation=?"
							: journalEnabled ? "UPDATE ffb_match_recovery SET generation=?,artifact_json=?,checkpoint_generation=? WHERE matchid=? AND generation=?"
							: "UPDATE ffb_match_recovery SET generation=?,artifact_json=? WHERE matchid=? AND generation=?")) {
						statement.setLong(1, expectedGeneration + 1); statement.setString(2, storedJson);
						if (computerScheduling) {
							statement.setLong(3, record.generation); bindComputerWork(statement, 4, record);
							statement.setString(5, record.matchId); statement.setLong(6, expectedGeneration);
						} else if (journalEnabled) {
							statement.setLong(3, record.generation); statement.setString(4, record.matchId); statement.setLong(5, expectedGeneration);
						} else { statement.setString(3, record.matchId); statement.setLong(4, expectedGeneration); }
						count = executeWrite(statement);
					}
				}
				if (count == 0) { rollback(connection); return false; }
				if (count != 1) throw new SQLException("Unexpected recovery write count");
				if (journalEnabled) try (PreparedStatement clear = connection.prepareStatement(
					"DELETE FROM ffb_match_recovery_journal WHERE matchid=?")) {
					clear.setString(1, record.matchId); executeWrite(clear);
				}
				commitAttempted = true;
				commit(connection);
				return true;
			} catch (SQLException failure) {
				try { rollback(connection); } catch (SQLException rollbackFailure) { failure.addSuppressed(rollbackFailure); }
				if (expectedGeneration == 0 && duplicateKey(failure)) return false;
				throw failure;
			}
		} catch (SQLException failure) {
			if (commitAttempted && !(failure instanceof CommitNotStarted)) throw new OutcomeUnknown(record, failure);
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
			Connection connection = openConnection()) {
			connection.setAutoCommit(false);
			try {
				try (PreparedStatement update = connection.prepareStatement("UPDATE ffb_match_recovery SET generation=?"
					+ (computerScheduling ? ",computer_work_until_epoch_ms=?" : "")
					+ " WHERE matchid=? AND generation=? AND generation-checkpoint_generation<32")) {
					update.setLong(1, record.generation);
					if (computerScheduling) {
						bindComputerWork(update, 2, record); update.setString(3, record.matchId); update.setLong(4, expectedGeneration);
					} else { update.setString(2, record.matchId); update.setLong(3, expectedGeneration); }
					int count = executeWrite(update);
					if (count == 0) { rollback(connection); return false; }
					if (count != 1) throw new SQLException("Unexpected recovery journal write count");
				}
				try (PreparedStatement budget = connection.prepareStatement(
					"SELECT COALESCE(SUM(decoded_bytes),0) FROM ffb_match_recovery_journal WHERE matchid=?")) {
					budget.setString(1, record.matchId);
					try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = budget.executeQuery()) {
						if (!rows.next() || rows.getLong(1) + bytes > RecoveryJournal.COMPACT_BYTES) throw new SQLException("Recovery journal byte limit");
					}
				}
				try (PreparedStatement insert = connection.prepareStatement(
					"INSERT INTO ffb_match_recovery_journal(matchid,generation,record_json,decoded_bytes) VALUES (?,?,?,?)")) {
					insert.setString(1, record.matchId); insert.setLong(2, record.generation); insert.setString(3, stored); insert.setInt(4, bytes);
					if (executeWrite(insert) != 1) throw new SQLException("Unexpected recovery journal insert count");
				}
				commitAttempted = true; commit(connection); return true;
			} catch (SQLException | RuntimeException failure) {
				try { rollback(connection); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
				throw failure;
			}
		} catch (SQLException failure) { if (commitAttempted && !(failure instanceof CommitNotStarted)) throw new OutcomeUnknown(record, failure); throw failure; }
	}

	private void bindComputerWork(PreparedStatement statement, int index, Record record) throws SQLException {
		if (record.computerWorkUntil == null) statement.setNull(index, Types.BIGINT);
		else statement.setLong(index, record.computerWorkUntil);
	}

	record LegacyComputerWork(String matchId, long generation, long workUntil) { }

	void beginLegacyComputerClassification(String matchId) {
		safety.requireAutomaticAvailable(matchId);
		safety.beginTask(matchId);
	}

	String decodeLegacyComputerDocument(BoundedJsonStorageCodec documentCodec, String stored) {
		return documentCodec.decodeForActivation(stored, memoryBudget);
	}

	/** Reads a single pre-migration head. A scheduled load still validates the full history. */
	LegacyComputerWork readLegacyComputerWork(String matchId) throws SQLException {
		safety.requireAutomaticAvailable(matchId);
		long generation;
		boolean journalHead;
		String stored;
		try (Connection connection = openConnection(); PreparedStatement query = connection.prepareStatement(
			"SELECT r.generation,r.checkpoint_generation,CASE WHEN r.generation=r.checkpoint_generation "
				+ "THEN r.artifact_json ELSE j.record_json END "
				+ "FROM ffb_match_recovery r LEFT JOIN ffb_match_recovery_journal j ON j.matchid=r.matchid AND j.generation=r.generation "
				+ "WHERE r.matchid=? AND r.computer_work_until_epoch_ms IS NULL")) {
			query.setString(1, matchId);
			try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = query.executeQuery()) {
				if (!rows.next()) return null;
				generation = rows.getLong(1);
				journalHead = generation != rows.getLong(2);
				stored = rows.getString(3);
			}
		}
		BoundedJsonStorageCodec decoder = journalHead
			? new BoundedJsonStorageCodec(RecoveryJournal.MAX_ENTRY_BYTES, RecoveryJournal.MAX_ENTRY_BYTES) : codec;
		RecoveryCheckpoint checkpoints = new RecoveryCheckpoint();
		String json = decoder.decodeForActivation(stored, memoryBudget);
		JsonObject payload;
		if (journalHead) {
			payload = new RecoveryJournal().readHeadState(json, matchId, generation);
			checkpoints.requireSupported(payload);
		} else payload = checkpoints.validate(json).payload();
		if (!matchId.equals(payload.getString("matchId", null))) throw new IllegalArgumentException("Invalid checkpoint match");
		JsonValue saved = payload.get("saveResume");
		long workUntil = saved == null || saved.isNull() || payload.getBoolean("pendingTerminal", false)
			? Long.MAX_VALUE : new SetupSession.SaveResumeState(saved.asObject()).computerWorkUntil();
		return new LegacyComputerWork(matchId, generation, workUntil);
	}

	boolean backfillComputerWork(LegacyComputerWork work) throws SQLException {
		try (Connection connection = openConnection()) {
			connection.setAutoCommit(false);
			try (PreparedStatement update = connection.prepareStatement(
				"UPDATE ffb_match_recovery SET computer_work_until_epoch_ms=? WHERE matchid=? AND generation=? "
					+ "AND computer_work_until_epoch_ms IS NULL")) {
				update.setLong(1, work.workUntil()); update.setString(2, work.matchId()); update.setLong(3, work.generation());
				boolean updated = executeWrite(update) == 1;
				commit(connection);
				return updated;
			} catch (SQLException | RuntimeException failure) {
				try { rollback(connection); } catch (SQLException cleanup) { failure.addSuppressed(cleanup); }
				throw failure;
			}
		}
	}

	private void reserveRetention(String matchId, Connection connection) throws SQLException {
		// Serialize only new-record admission, including across JVMs. Existing checkpoints
		// must remain writable even when all retained slots are occupied.
		try (PreparedStatement lock = connection.prepareStatement("SELECT version FROM ffb_local_schema FOR UPDATE");
			BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = lock.executeQuery()) {
			if (!rows.next()) throw new SQLException("Recovery schema unavailable");
			int version = rows.getInt(1);
			if (version < 5 || version > 10 || journalEnabled && version < 9 || computerScheduling && version != 10)
				throw new SQLException("Recovery schema unavailable");
		}
		try (PreparedStatement count = connection.prepareStatement(
			"SELECT COUNT(*),COUNT(CASE WHEN matchid=? THEN 1 END) FROM ffb_match_recovery")) {
			count.setString(1, matchId);
			try (BrowserRequestTiming.Scope read = timing.span(BrowserRequestTiming.Phase.DB_READ); ResultSet rows = count.executeQuery()) {
				if (!rows.next()) throw new SQLException("Recovery retention count unavailable");
				// An existing ID still takes the ordinary duplicate/CAS path at capacity.
				if (rows.getLong(1) >= retainedLimit && rows.getLong(2) == 0) throw new RecoveryRepository.RetentionLimit();
			}
		}
	}

	private Connection openConnection() throws SQLException {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.DB_CONNECT)) { return connections.open(); }
	}
	private int executeWrite(PreparedStatement statement) throws SQLException {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.DB_WRITE)) { return statement.executeUpdate(); }
	}
	private void commit(Connection connection) throws SQLException {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.DB_COMMIT)) { connection.commit(); }
	}
	private void rollback(Connection connection) throws SQLException {
		try (BrowserRequestTiming.Scope ignored = timing.span(BrowserRequestTiming.Phase.DB_ROLLBACK)) { connection.rollback(); }
	}

	private boolean duplicateKey(SQLException failure) {
		return "23000".equals(failure.getSQLState()) && failure.getErrorCode() == 1062;
	}
}
