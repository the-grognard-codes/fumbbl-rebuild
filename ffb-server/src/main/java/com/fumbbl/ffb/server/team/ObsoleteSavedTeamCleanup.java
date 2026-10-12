package com.fumbbl.ffb.server.team;

import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** One-off, explicit cleanup of the nameless saved-team scaffold. Never classifies by age or catalog alone. */
public final class ObsoleteSavedTeamCleanup {
	public enum Table {
		ACCOUNT("ffb_v2_saved_teams", 2), LOCAL("ffb_saved_teams", 1);
		public final String sqlName;
		private final int format;
		Table(String sqlName, int format) { this.sqlName = sqlName; this.format = format; }
	}

	public interface Store {
		int schemaVersion() throws SQLException;
		String databaseName() throws SQLException;
		List<Row> scan() throws SQLException;
		Result delete(List<Entry> entries, RowVerifier verifier) throws SQLException;
	}
	public interface RowVerifier { boolean matches(Entry entry, Row row); }

	public static final class Row {
		public final Table table;
		public final SavedTeamRepository.Record record;
		public Row(Table table, SavedTeamRepository.Record record) { this.table = table; this.record = record; }
	}
	public static final class Entry {
		public final Table table;
		public final String teamId, owner, fingerprint;
		public final int documentVersion;
		Entry(Table table, String teamId, String owner, int documentVersion, String fingerprint) {
			this.table = table; this.teamId = teamId; this.owner = owner;
			this.documentVersion = documentVersion; this.fingerprint = fingerprint;
		}
		JsonObject json() {
			return new JsonObject().add("table", table.name()).add("teamId", teamId).add("owner", owner)
				.add("documentVersion", documentVersion).add("fingerprint", fingerprint);
		}
	}
	public static final class Plan {
		public final String environment, database, endpointFingerprint;
		public final int accountScanned, localScanned, excluded;
		public final List<Entry> entries;
		Plan(String environment, String database, String endpointFingerprint, int accountScanned, int localScanned,
			int excluded, List<Entry> entries) {
			this.environment = environment; this.database = database; this.endpointFingerprint = endpointFingerprint;
			this.accountScanned = accountScanned; this.localScanned = localScanned; this.excluded = excluded;
			this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
		}
		public JsonObject json() {
			JsonArray selected = new JsonArray();
			for (Entry entry : entries) selected.add(entry.json());
			return new JsonObject().add("version", 1).add("environment", environment).add("database", database)
				.add("endpointFingerprint", endpointFingerprint).add("accountScanned", accountScanned)
				.add("localScanned", localScanned).add("excluded", excluded).add("entries", selected);
		}
		public static Plan parse(String text) {
			if (text == null || text.getBytes(StandardCharsets.UTF_8).length > 4 * 1024 * 1024) throw new IllegalArgumentException("PLAN_SIZE");
			JsonObject object = JsonObject.readFrom(text);
			exact(object, "version", "environment", "database", "endpointFingerprint", "accountScanned", "localScanned", "excluded", "entries");
			if (object.getInt("version", -1) != 1) throw new IllegalArgumentException("PLAN_VERSION");
			String environment = object.get("environment").asString();
			String database = object.get("database").asString();
			String endpoint = object.get("endpointFingerprint").asString();
			if (!safeLabel(environment) || !safeLabel(database) || !endpoint.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("PLAN_IDENTITY");
			int account = count(object, "accountScanned"), local = count(object, "localScanned"), excluded = count(object, "excluded");
			List<Entry> entries = new ArrayList<>();
			Set<String> seen = new HashSet<>();
			for (JsonValue value : object.get("entries").asArray()) {
				JsonObject entry = value.asObject();
				exact(entry, "table", "teamId", "owner", "documentVersion", "fingerprint");
				Table table = Table.valueOf(entry.get("table").asString());
				String teamId = entry.get("teamId").asString(), owner = entry.get("owner").asString();
				String fingerprint = entry.get("fingerprint").asString();
				int version = entry.get("documentVersion").asInt();
				if (!teamId.matches("[0-9a-f-]{36}") || !safeOwner(table, owner) || version < 1
					|| version > 2147483646
					|| !fingerprint.matches("[0-9a-f]{64}") || !seen.add(table + ":" + teamId)) throw new IllegalArgumentException("PLAN_ENTRY");
				entries.add(new Entry(table, teamId, owner, version, fingerprint));
			}
			if (entries.size() + excluded != account + local) throw new IllegalArgumentException("PLAN_COUNTS");
			return new Plan(environment, database, endpoint, account, local, excluded, entries);
		}
	}
	public static final class Result {
		public final int deleted, alreadyAbsent;
		public Result(int deleted, int alreadyAbsent) { this.deleted = deleted; this.alreadyAbsent = alreadyAbsent; }
	}

	private final SavedTeamJson json = new SavedTeamJson(new RosterCatalog());

	public Plan inventory(Store store, String environment, String endpoint) throws SQLException {
		if (!safeLabel(environment) || endpoint == null || !endpoint.startsWith("jdbc:mariadb:")) throw new IllegalArgumentException("ENVIRONMENT");
		if (store.schemaVersion() != 7) throw new IllegalArgumentException("SCHEMA_VERSION");
		String database = store.databaseName();
		if (!safeLabel(database)) throw new IllegalArgumentException("DATABASE");
		List<Entry> entries = new ArrayList<>();
		int account = 0, local = 0, excluded = 0;
		for (Row row : store.scan()) {
			if (row.table == Table.ACCOUNT) account++; else local++;
			if (isObsolete(row)) entries.add(entry(row)); else excluded++;
		}
		return new Plan(environment, database, sha256(endpoint), account, local, excluded, entries);
	}

	public Result execute(Store store, String endpoint, String environment, Plan plan) throws SQLException {
		if (!plan.environment.equals(environment) || !plan.endpointFingerprint.equals(sha256(endpoint))
			|| store.schemaVersion() != 7 || !plan.database.equals(store.databaseName())) throw new IllegalArgumentException("PLAN_TARGET_MISMATCH");
		return store.delete(plan.entries, (entry, row) -> row.table == entry.table
			&& row.record.teamId.equals(entry.teamId) && row.record.owner.equals(entry.owner)
			&& row.record.documentVersion == entry.documentVersion
			&& isObsolete(row) && fingerprint(row).equals(entry.fingerprint));
	}

	boolean isObsolete(Row row) {
		if (row == null || row.table == null || row.record == null || row.record.json == null) return false;
		try {
			JsonObject envelope = JsonObject.readFrom(row.record.json);
			if (envelope.getInt("formatVersion", -1) != row.table.format) return false;
			SavedTeamDocument document = json.decode(row.record.json);
			return document.draft.draftVersion == 1 && document.teamId.equals(row.record.teamId)
				&& document.owner.equals(row.record.owner) && document.documentVersion == row.record.documentVersion
				&& document.draft.catalogVersion.equals(row.record.catalogVersion)
				&& safeOwner(row.table, row.record.owner);
		} catch (RuntimeException malformed) { return false; }
	}

	private Entry entry(Row row) {
		return new Entry(row.table, row.record.teamId, row.record.owner, row.record.documentVersion, fingerprint(row));
	}
	private static String fingerprint(Row row) {
		SavedTeamRepository.Record record = row.record;
		return sha256(row.table.name() + "\n" + record.teamId + "\n" + record.owner + "\n"
			+ record.documentVersion + "\n" + record.catalogVersion + "\n" + record.json);
	}
	public static String sha256(String value) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
			StringBuilder hex = new StringBuilder(64);
			for (byte octet : digest) hex.append(String.format("%02x", octet & 255));
			return hex.toString();
		} catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
	}
	private static int count(JsonObject object, String field) {
		int value = object.get(field).asInt();
		if (value < 0 || value > 1000000) throw new IllegalArgumentException("PLAN_COUNT");
		return value;
	}
	private static boolean safeLabel(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,80}"); }
	private static boolean safeOwner(Table table, String owner) {
		return table == Table.LOCAL ? "home".equals(owner) || "away".equals(owner)
			: owner != null && owner.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}");
	}
	private static void exact(JsonObject object, String... fields) {
		if (object.size() != fields.length || !new HashSet<>(object.names()).equals(new HashSet<>(Arrays.asList(fields))))
			throw new IllegalArgumentException("PLAN_SHAPE");
	}
}
