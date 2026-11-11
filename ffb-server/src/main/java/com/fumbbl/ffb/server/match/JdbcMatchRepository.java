package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcConnections.CommitNotStarted;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Dedicated short transactions. Membership, frozen rosters and retry metadata share one row. */
public final class JdbcMatchRepository implements MatchRepository {
	public interface Connections { Connection open() throws SQLException; }
	private final Connections connections;
	private final BoundedJsonStorageCodec codec;

	public JdbcMatchRepository(Connections connections) {
		this(connections, new BoundedJsonStorageCodec(BoundedJsonStorageCodec.PREPARED_ENCODED_LIMIT,
			BoundedJsonStorageCodec.PREPARED_DECODED_LIMIT));
	}

	JdbcMatchRepository(Connections connections, BoundedJsonStorageCodec codec) {
		this.connections = connections; this.codec = codec;
	}

	@Override
	public Record find(String id) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT match_id,document_version,document_json FROM ffb_prepared_matches WHERE match_id=?")) {
			query.setString(1, id);
			try (ResultSet rows = query.executeQuery()) {
				return rows.next() ? new Record(rows.getString(1), rows.getInt(2), codec.decode(rows.getString(3))) : null;
			}
		}
	}

	@Override
	public Map<String, Record> findAll(List<String> ids, LobbyReadBudget budget) throws SQLException {
		budget.entries(ids.size());
		Map<String, Record> result = new LinkedHashMap<>();
		if (ids.isEmpty()) return result;
		LobbyReadQuery batch = new LobbyReadQuery();
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT match_id,document_version," + batch.columns("document_json", budget)
			+ " FROM ffb_prepared_matches WHERE match_id IN (" + batch.slots(ids) + ")")) {
			batch.bind(query, ids);
			try (ResultSet rows = query.executeQuery()) {
				while (rows.next()) {
					if (result.size() >= ids.size()) throw new SQLException("Unexpected lobby row count");
					String id = rows.getString(1);
					try { result.put(id, new Record(id, rows.getInt(2), budget.read(rows, 3, codec))); }
					catch (LobbyReadBudget.InvalidRecord unavailable) { /* Preserve membership with unavailable facts. */ }
				}
			}
		}
		return result;
	}

	@Override
	public void insert(Record record) throws SQLException { write(record, 0, true); }

	@Override
	public boolean replace(Record record, int expectedVersion) throws SQLException { return write(record, expectedVersion, false); }

	private boolean write(Record record, int expectedVersion, boolean insert) throws SQLException {
		String storedJson = codec.encode(record.json);
		boolean commitAttempted = false;
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				int count;
				if (insert) {
					try (PreparedStatement statement = connection.prepareStatement(
						"INSERT INTO ffb_prepared_matches(match_id,document_version,document_json) VALUES (?,?,?)")) {
						statement.setString(1, record.matchId); statement.setInt(2, record.documentVersion);
						statement.setString(3, storedJson); count = statement.executeUpdate();
					}
				} else {
					try (PreparedStatement statement = connection.prepareStatement(
						"UPDATE ffb_prepared_matches SET document_version=?,document_json=? WHERE match_id=? AND document_version=?")) {
						statement.setInt(1, record.documentVersion); statement.setString(2, storedJson);
						statement.setString(3, record.matchId); statement.setInt(4, expectedVersion);
						count = statement.executeUpdate();
					}
				}
				if (count == 0) { connection.rollback(); return false; }
				if (count != 1) throw new SQLException("Unexpected match write count");
				commitAttempted = true;
				connection.commit();
				return true;
			} catch (SQLException failure) {
				try { connection.rollback(); } catch (SQLException rollbackFailure) { failure.addSuppressed(rollbackFailure); }
				throw failure;
			}
		} catch (SQLException failure) {
			// Even a connection-close failure after COMMIT is conservatively unknown.
			// Before COMMIT no transaction can commit: failed rollback is completed on connection termination.
			if (commitAttempted && !(failure instanceof CommitNotStarted)) throw new OutcomeUnknown(record, failure);
			throw failure;
		}
	}
}
