package com.fumbbl.ffb.server.team;

import java.sql.SQLException;
import java.util.List;

/** Immutable narrow JSON snapshots. Replacements compare versions atomically; account writes also reserve unique normalized team names atomically. */
public interface SavedTeamRepository {
	Record find(String owner, String teamId) throws SQLException;
	List<Record> list(String owner) throws SQLException;
	void insert(Record record) throws SQLException;
	boolean replace(Record record, int expectedVersion) throws SQLException;
	default boolean delete(String owner, String teamId, int expectedVersion) throws SQLException {
		throw new UnsupportedOperationException("Delete is unavailable");
	}

	/** A different team in the account already owns this normalized name. No write was committed. */
	final class NameTaken extends SQLException {
		public NameTaken() { super("Team name already used by this account", "23505"); }
	}

	/** COMMIT was attempted: a lost acknowledgement cannot establish whether it succeeded. */
	final class OutcomeUnknown extends SQLException {
		public final Record attempted;
		public OutcomeUnknown(Record attempted, SQLException cause) { super("Saved-team commit outcome unknown", cause); this.attempted = attempted; }
	}

	final class Record {
		public final String teamId, owner, catalogVersion, json;
		public final int documentVersion;
		public Record(String teamId, String owner, int documentVersion, String catalogVersion, String json) {
			this.teamId = teamId; this.owner = owner; this.documentVersion = documentVersion;
			this.catalogVersion = catalogVersion; this.json = json;
		}
	}
}
