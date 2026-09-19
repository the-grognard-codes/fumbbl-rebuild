package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** V2 account membership and bearer-invitation preparation over immutable R2 match documents. */
public final class V2PreparationService {
	private static final long INVITATION_LIFETIME_MS = 60L * 60L * 1000L;
	public interface Connections { Connection open() throws SQLException; }
	private final Connections connections;
	private final SavedTeamService teams;
	private final RosterCatalog catalog;
	private final Clock clock;
	private final MatchJson json = new MatchJson();
	private final SecureRandom random = new SecureRandom();

	public V2PreparationService(Connections connections, SavedTeamService teams, RosterCatalog catalog, Clock clock) {
		this.connections = connections; this.teams = teams; this.catalog = catalog; this.clock = clock;
	}

	public JsonObject handle(String accountId, JsonObject request) {
		String requestId = request == null ? null : request.getString("requestId", null);
		try {
			account(accountId); header(request);
			String operation = request.getString("operation", null);
			if ("create".equals(operation)) return create(accountId, request);
			if ("join".equals(operation)) return join(accountId, request);
			if ("reissue".equals(operation)) return reissue(accountId, request);
			if ("revoke".equals(operation)) return revoke(accountId, request);
			throw new Failure("INVALID_REQUEST");
		} catch (CommitUnknown failure) { return response(requestId, "MATCH_OUTCOME_UNKNOWN", false, null, null, null); }
		catch (Failure failure) { return response(requestId, failure.code, false, null, null, null); }
		catch (SavedTeamService.Failure failure) { return response(requestId, failure.code, false, null, null, null); }
		// A JDBC close may fail after COMMIT; preparation callers must reconcile rather than assume rollback.
		catch (SQLException failure) { return response(requestId, "MATCH_OUTCOME_UNKNOWN", false, null, null, null); }
		catch (RuntimeException failure) { return response(requestId, "INVALID_REQUEST", false, null, null, null); }
	}

	/** A disconnect tracker must grant this permission; clients cannot express it through {@link #handle}. */
	public JsonObject releaseAbandoned(String creatorAccountId, String matchId, String requestId, boolean disconnectConfirmed) {
		try { return release(creatorAccountId, matchId, requestId, disconnectConfirmed); }
		catch (CommitUnknown failure) { return response(requestId, "MATCH_OUTCOME_UNKNOWN", false, null, null, null); }
		catch (Failure failure) { return response(requestId, failure.code, false, null, null, null); }
		catch (SQLException failure) { return response(requestId, "MATCH_OUTCOME_UNKNOWN", false, null, null, null); }
	}
	private JsonObject release(String creatorAccountId, String matchId, String requestId, boolean disconnectConfirmed) throws SQLException {
		account(creatorAccountId); uuid(matchId); requestId(requestId);
		String fingerprint = "release|" + matchId;
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				if (!member(connection, matchId, creatorAccountId, "home")) throw new Failure("NOT_FOUND");
				MatchDocument document = document(connection, matchId, true);
				if (document == null) throw new Failure("NOT_FOUND");
				Retry prior = retryOrNull(connection, matchId, creatorAccountId, requestId);
				if (prior != null) { if (!fingerprint.equals(prior.fingerprint)) throw new Failure("REQUEST_ID_REUSED"); commit(connection); return accepted(requestId, document, "home", prior, true); }
				if (!disconnectConfirmed) throw new Failure("RELEASE_NOT_PERMITTED");
				if (document.away == null || document.lifecycle != MatchDocument.Lifecycle.AWAITING_SETUP) throw new Failure("MATCH_NOT_CLAIMED");
				Map<String, MatchDocument.Request> createHistory = new LinkedHashMap<>();
				for (Map.Entry<String, MatchDocument.Request> entry : document.requests.entrySet()) if (entry.getKey().startsWith("home\n")) createHistory.put(entry.getKey(), entry.getValue());
				if (createHistory.size() != 1) throw new Failure("PERSISTENCE_FAILED");
				// An unjoined R2 WAITING snapshot is structurally revision one; v2 rows retain release audit history.
				MatchDocument released = new MatchDocument(matchId, 1, "away", MatchDocument.Lifecycle.WAITING_FOR_OPPONENT, document.home, null, createHistory);
				writeDocument(connection, released, document.documentVersion);
				try (PreparedStatement delete = connection.prepareStatement("DELETE FROM ffb_v2_match_members WHERE matchid=? AND role='away'")) {
					delete.setString(1, matchId); if (delete.executeUpdate() != 1) throw new SQLException("Missing claimed membership");
				}
				String code = token();
				try (PreparedStatement rotate = connection.prepareStatement("UPDATE ffb_v2_preparation_invites SET token_hash=?,expires_at_epoch_ms=?,generation=generation+1,state='ACTIVE',accepted_account_id=NULL WHERE matchid=?")) {
					rotate.setString(1, hash(code)); rotate.setLong(2, clock.millis() + INVITATION_LIFETIME_MS); rotate.setString(3, matchId); if (rotate.executeUpdate() != 1) throw new SQLException("Missing invitation");
				}
				insertRetry(connection, matchId, creatorAccountId, requestId, fingerprint); commit(connection);
				return accepted(requestId, released, "home", new Retry(code), false);
			} catch (SQLException | RuntimeException failure) { rollback(connection, failure); throw failure; }
		}
	}

	private JsonObject create(String accountId, JsonObject request) throws SQLException {
		exact(request, "version", "type", "operation", "requestId", "teamId", "expectedDocumentVersion");
		String requestId = request.getString("requestId", null), teamId = uuid(request.getString("teamId", null)); int version = positive(request.get("expectedDocumentVersion").asInt()); requestId(requestId);
		String matchId = UUID.nameUUIDFromBytes(("v2-prepared-match\n" + accountId + "\n" + requestId).getBytes(StandardCharsets.UTF_8)).toString();
		String fingerprint = "create|" + teamId + "|" + version + "|away";
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				boolean creatorMembership = member(connection, matchId, accountId, "home");
				MatchDocument existing = document(connection, matchId, true);
				if (existing != null) { if (!creatorMembership) throw new Failure("NOT_FOUND"); Retry retry = retry(connection, matchId, accountId, requestId, fingerprint); commit(connection); return accepted(requestId, existing, "home", retry, true); }
				FrozenTeam frozen = freeze(accountId, teamId, version, "home");
				Map<String, MatchDocument.Request> history = new LinkedHashMap<>(); history.put("home\n" + requestId, new MatchDocument.Request(fingerprint));
				MatchDocument created = new MatchDocument(matchId, 1, "away", MatchDocument.Lifecycle.WAITING_FOR_OPPONENT, new MatchDocument.Member("home", "home", frozen), null, history);
				String code = token();
				insertDocument(connection, created); insertMember(connection, matchId, accountId, "home"); insertInvite(connection, matchId, accountId, code);
				insertRetry(connection, matchId, accountId, requestId, fingerprint); commit(connection);
				return accepted(requestId, created, "home", new Retry(code), false);
			} catch (SQLException | RuntimeException failure) { rollback(connection, failure); throw failure; }
		}
	}

	private JsonObject join(String accountId, JsonObject request) throws SQLException {
		exact(request, "version", "type", "operation", "requestId", "invitationCode", "teamId", "expectedDocumentVersion");
		String requestId = request.getString("requestId", null), code = token(request.getString("invitationCode", null)), teamId = uuid(request.getString("teamId", null)); int version = positive(request.get("expectedDocumentVersion").asInt()); requestId(requestId);
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				Invite invite = invite(connection, code); if (invite == null || invite.expires <= clock.millis()) throw new Failure("INVITATION_INVALID");
				if ("ACCEPTED".equals(invite.state)) {
					if (!accountId.equals(invite.acceptedAccountId) || !member(connection, invite.matchId, accountId, "away")) throw new Failure("INVITATION_INVALID");
				} else {
					if (!"ACTIVE".equals(invite.state) || member(connection, invite.matchId, accountId, null)) throw new Failure("INVITATION_INVALID");
				}
				MatchDocument document = document(connection, invite.matchId, true); if (document == null) throw new Failure("INVITATION_INVALID");
				String fingerprint = "join|" + invite.matchId + "|1|" + teamId + "|" + version;
				Retry retry = retryOrNull(connection, invite.matchId, accountId, requestId);
				if (retry != null) { if (!fingerprint.equals(retry.fingerprint) || !"ACCEPTED".equals(invite.state) || !accountId.equals(invite.acceptedAccountId)) throw new Failure("REQUEST_ID_REUSED"); commit(connection); return accepted(requestId, document, "away", retry, true); }
				if (!"ACTIVE".equals(invite.state)) throw new Failure("INVITATION_INVALID");
				if (document.away != null || document.lifecycle != MatchDocument.Lifecycle.WAITING_FOR_OPPONENT) throw new Failure("SEAT_OCCUPIED");
				FrozenTeam frozen = freeze(accountId, teamId, version, "away");
				if (!compatible(document.home.team, frozen)) throw new Failure("INCOMPATIBLE_TEAM");
				MatchDocument joined = document.joined(new MatchDocument.Member("away", "away", frozen), "away\n" + requestId, fingerprint);
				writeDocument(connection, joined, document.documentVersion); insertMember(connection, invite.matchId, accountId, "away");
				try (PreparedStatement update = connection.prepareStatement("UPDATE ffb_v2_preparation_invites SET state='ACCEPTED',accepted_account_id=? WHERE matchid=? AND state='ACTIVE'")) {
					update.setString(1, accountId); update.setString(2, invite.matchId); if (update.executeUpdate() != 1) throw new Failure("CONFLICT");
				}
				insertRetry(connection, invite.matchId, accountId, requestId, fingerprint); commit(connection);
				return accepted(requestId, joined, "away", new Retry(null), false);
			} catch (SQLException | RuntimeException failure) { rollback(connection, failure); throw failure; }
		}
	}

	private JsonObject reissue(String accountId, JsonObject request) throws SQLException { return inviteMutation(accountId, request, false); }
	private JsonObject revoke(String accountId, JsonObject request) throws SQLException { return inviteMutation(accountId, request, true); }
	private JsonObject inviteMutation(String accountId, JsonObject request, boolean revoke) throws SQLException {
		exact(request, "version", "type", "operation", "requestId", "matchId"); String requestId = request.getString("requestId", null), matchId = uuid(request.getString("matchId", null)); requestId(requestId);
		String fingerprint = (revoke ? "revoke|" : "reissue|") + matchId;
		try (Connection connection = connections.open()) {
			connection.setAutoCommit(false);
			try {
				if (!member(connection, matchId, accountId, "home")) throw new Failure("NOT_FOUND");
				MatchDocument document = document(connection, matchId, true); if (document == null || document.lifecycle != MatchDocument.Lifecycle.WAITING_FOR_OPPONENT) throw new Failure("NOT_FOUND");
				Retry prior = retryOrNull(connection, matchId, accountId, requestId); if (prior != null) { if (!fingerprint.equals(prior.fingerprint)) throw new Failure("REQUEST_ID_REUSED"); commit(connection); return accepted(requestId, document, "home", prior, true); }
				String code = revoke ? null : token();
				try (PreparedStatement update = connection.prepareStatement(revoke ? "UPDATE ffb_v2_preparation_invites SET state='REVOKED',accepted_account_id=NULL WHERE matchid=?" : "UPDATE ffb_v2_preparation_invites SET token_hash=?,expires_at_epoch_ms=?,state='ACTIVE',accepted_account_id=NULL WHERE matchid=?")) {
					if (revoke) update.setString(1, matchId); else { update.setString(1, hash(code)); update.setLong(2, clock.millis() + INVITATION_LIFETIME_MS); update.setString(3, matchId); }
					if (update.executeUpdate() != 1) throw new SQLException("Missing invitation");
				}
				insertRetry(connection, matchId, accountId, requestId, fingerprint); commit(connection); return accepted(requestId, document, "home", new Retry(code), false);
			} catch (SQLException | RuntimeException failure) { rollback(connection, failure); throw failure; }
		}
	}

	private FrozenTeam freeze(String accountId, String teamId, int version, String role) throws SQLException {
		SavedTeamService.Loaded loaded = teams.load(accountId, teamId);
		if (!accountId.equals(loaded.document.owner)) throw new Failure("NOT_FOUND");
		if (loaded.document.documentVersion != version) throw new Failure("STALE_TEAM_REVISION");
		if (!"CURRENT".equals(loaded.versionStatus)) throw new Failure(loaded.versionStatus);
		if (!loaded.validation.isValid() || loaded.validation.total == null) throw new Failure("VALIDATION_FAILED");
		return new FrozenTeam(loaded.document.teamId, loaded.document.documentVersion, role, loaded.document.draft, loaded.validation.total, loaded.validation.skillPoints, catalog);
	}

	private MatchDocument document(Connection connection, String matchId, boolean lock) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement("SELECT document_version,document_json FROM ffb_prepared_matches WHERE match_id=?" + (lock ? " FOR UPDATE" : ""))) {
			query.setString(1, matchId); try (ResultSet rows = query.executeQuery()) { return rows.next() ? json.decode(rows.getString(2), rows.getInt(1)) : null; }
		}
	}
	private boolean member(Connection connection, String matchId, String accountId, String role) throws SQLException {
		String text = "SELECT 1 FROM ffb_v2_match_members WHERE matchid=? AND account_id=?" + (role == null ? "" : " AND role=?") + " LIMIT 1";
		try (PreparedStatement query = connection.prepareStatement(text)) { query.setString(1, matchId); query.setString(2, accountId); if (role != null) query.setString(3, role); try (ResultSet rows = query.executeQuery()) { return rows.next(); } }
	}
	private Invite invite(Connection connection, String code) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement("SELECT matchid,expires_at_epoch_ms,state,accepted_account_id FROM ffb_v2_preparation_invites WHERE token_hash=? FOR UPDATE")) {
			query.setString(1, hash(code)); try (ResultSet rows = query.executeQuery()) { return rows.next() ? new Invite(rows.getString(1), rows.getLong(2), rows.getString(3), rows.getString(4)) : null; }
		}
	}
	private Retry retry(Connection connection, String matchId, String accountId, String requestId, String fingerprint) throws SQLException {
		Retry found = retryOrNull(connection, matchId, accountId, requestId); if (found == null || !fingerprint.equals(found.fingerprint)) throw new Failure("REQUEST_ID_REUSED"); return found;
	}
	private Retry retryOrNull(Connection connection, String matchId, String accountId, String requestId) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement("SELECT fingerprint FROM ffb_v2_preparation_requests WHERE matchid=? AND account_id=? AND request_id=? FOR UPDATE")) {
			query.setString(1, matchId); query.setString(2, accountId); query.setString(3, requestId); try (ResultSet rows = query.executeQuery()) { return rows.next() ? new Retry(rows.getString(1), null) : null; }
		}
	}
	private void insertDocument(Connection connection, MatchDocument document) throws SQLException { writeDocument(connection, document, 0); }
	private void writeDocument(Connection connection, MatchDocument document, int expectedVersion) throws SQLException {
		String text = json.encode(document).toString(); json.decode(text, document.documentVersion);
		String statement = expectedVersion == 0 ? "INSERT INTO ffb_prepared_matches(match_id,document_version,document_json) VALUES (?,?,?)" : "UPDATE ffb_prepared_matches SET document_version=?,document_json=? WHERE match_id=? AND document_version=?";
		try (PreparedStatement write = connection.prepareStatement(statement)) {
			if (expectedVersion == 0) { write.setString(1, document.matchId); write.setInt(2, document.documentVersion); write.setString(3, text); }
			else { write.setInt(1, document.documentVersion); write.setString(2, text); write.setString(3, document.matchId); write.setInt(4, expectedVersion); }
			if (write.executeUpdate() != 1) throw new Failure("CONFLICT");
		}
	}
	private void insertMember(Connection connection, String matchId, String accountId, String role) throws SQLException { try (PreparedStatement write = connection.prepareStatement("INSERT INTO ffb_v2_match_members(matchid,account_id,role) VALUES (?,?,?)")) { write.setString(1, matchId); write.setString(2, accountId); write.setString(3, role); if (write.executeUpdate() != 1) throw new SQLException("Membership write failed"); } }
	private void insertInvite(Connection connection, String matchId, String accountId, String code) throws SQLException { try (PreparedStatement write = connection.prepareStatement("INSERT INTO ffb_v2_preparation_invites(matchid,token_hash,creator_account_id,expires_at_epoch_ms,generation,state,accepted_account_id) VALUES (?,?,?,?,1, 'ACTIVE',NULL)")) { write.setString(1, matchId); write.setString(2, hash(code)); write.setString(3, accountId); write.setLong(4, clock.millis() + INVITATION_LIFETIME_MS); if (write.executeUpdate() != 1) throw new SQLException("Invitation write failed"); } }
	/** Retry metadata deliberately stores no bearer value. A caller that lost a code must use reissue. */
	private void insertRetry(Connection connection, String matchId, String accountId, String requestId, String fingerprint) throws SQLException { try (PreparedStatement write = connection.prepareStatement("INSERT INTO ffb_v2_preparation_requests(matchid,account_id,request_id,fingerprint) VALUES (?,?,?,?)")) { write.setString(1, matchId); write.setString(2, accountId); write.setString(3, requestId); write.setString(4, fingerprint); if (write.executeUpdate() != 1) throw new SQLException("Retry metadata write failed"); } }
	private JsonObject accepted(String requestId, MatchDocument document, String role, Retry retry, boolean duplicate) { return response(requestId, "ACCEPTED", duplicate, role, json.publicDocument(document), retry.code); }
	private JsonObject response(String requestId, String code, boolean duplicate, String role, JsonObject document, String invitationCode) {
		JsonObject result = new JsonObject().add("version", 1).add("type", "preparedMatch").add("code", code).add("duplicate", duplicate)
			.add("document", document == null ? JsonValue.NULL : document).add("recoveryMatchId", JsonValue.NULL);
		result.add("requestId", requestId == null ? JsonValue.NULL : JsonValue.valueOf(requestId));
		result.add("callerRole", role == null ? JsonValue.NULL : JsonValue.valueOf(role));
		return result.add("invitationCode", invitationCode == null ? JsonValue.NULL : JsonValue.valueOf(invitationCode));
	}
	private boolean compatible(FrozenTeam home, FrozenTeam away) { return home.ruleset.equals(away.ruleset) && home.catalogVersion.equals(away.catalogVersion) && home.presetId.equals(away.presetId) && home.presetVersion.equals(away.presetVersion); }
	private void header(JsonObject request) { if (request == null || request.getInt("version", -1) != 1 || !"preparedMatch".equals(request.getString("type", null))) throw new Failure("INVALID_REQUEST"); }
	private void exact(JsonObject request, String... names) { if (request.size() != names.length || !new HashSet<String>(request.names()).equals(new HashSet<String>(Arrays.asList(names)))) throw new Failure("INVALID_REQUEST"); }
	private void account(String value) { uuid(value); }
	private String uuid(String value) { if (value == null || !value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new Failure("INVALID_REQUEST"); return value; }
	private int positive(int value) { if (value < 1 || value > 2147483646) throw new Failure("INVALID_REQUEST"); return value; }
	private void requestId(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{1,100}")) throw new Failure("INVALID_REQUEST"); }
	private String token() { byte[] bytes = new byte[16]; random.nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
	private String token(String value) { if (value == null || !value.matches("[A-Za-z0-9_-]{22}")) throw new Failure("INVITATION_INVALID"); return value; }
	private String hash(String value) { try { byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII)); StringBuilder out = new StringBuilder(64); for (byte b : bytes) out.append(String.format("%02x", b & 255)); return out.toString(); } catch (java.security.NoSuchAlgorithmException failure) { throw new IllegalStateException(failure); } }
	private void rollback(Connection connection, Exception failure) { try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); } }
	private void commit(Connection connection) throws SQLException { try { connection.commit(); } catch (SQLException failure) { throw new CommitUnknown(failure); } }
	private static final class Invite { final String matchId, state, acceptedAccountId; final long expires; Invite(String matchId, long expires, String state, String acceptedAccountId) { this.matchId=matchId; this.expires=expires; this.state=state; this.acceptedAccountId=acceptedAccountId; } }
	private static final class Retry { final String fingerprint, code; Retry(String code) { this(null, code); } Retry(String fingerprint, String code) { this.fingerprint=fingerprint; this.code=code; } }
	private static final class CommitUnknown extends SQLException { CommitUnknown(SQLException cause) { super("Commit outcome unknown", cause); } }
	public static final class Failure extends IllegalArgumentException { public final String code; Failure(String code) { super(code); this.code = code; } }
}
