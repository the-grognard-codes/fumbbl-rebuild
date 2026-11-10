package com.fumbbl.ffb.server.match;

import java.sql.SQLException;

public interface MatchRepository {
	Record find(String matchId) throws SQLException;
	/** In-memory implementations may use find; JDBC must override with one batch. */
	default java.util.Map<String, Record> findAll(java.util.List<String> ids, LobbyReadBudget budget) throws SQLException {
		budget.entries(ids.size());
		java.util.Map<String, Record> result = new java.util.LinkedHashMap<>();
		for (String id : ids) { budget.check(); Record record = find(id); if (record != null) { budget.admit(record.json); result.put(id, record); } }
		return result;
	}
	void insert(Record record) throws SQLException;
	boolean replace(Record record, int expectedVersion) throws SQLException;
	final class Record {
		public final String matchId, json; public final int documentVersion;
		public Record(String matchId, int documentVersion, String json) { this.matchId=matchId; this.documentVersion=documentVersion; this.json=json; }
	}
	final class OutcomeUnknown extends SQLException { public final Record attempted; public OutcomeUnknown(Record r, SQLException cause) { super("Match commit outcome unknown", cause); attempted=r; } }
}
