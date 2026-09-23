package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.CompletedMatch;
import com.fumbbl.ffb.server.match.JdbcMatchRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchJson;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.RecoveryRepository;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Opt-in post-parity acceptance against the separately restored current-r4.1 database. */
class R5RestoredContinuationTest {
	private static final String CONFIRMATION = "CONTINUE_RESTORED_CURRENT_FIXTURE";
	private static final String RESTORED_DATABASE = "jdbc:mariadb://127.0.0.1:23316/ffb_local";
	private static final String CONTINUE_REQUEST = "r5_restore_continue_v1";
	private final MatchJson matchJson = new MatchJson();

	@Test void reconcilesRetainedRequestThenContinuesPausedDecisionForBothMembers() throws Exception {
		String confirmation = System.getenv("R5_RESTORE_CONTINUE_CONFIRM");
		assumeTrue(confirmation != null, "Opt-in restored-fixture continuation only");
		assertEquals(CONFIRMATION, confirmation);
		assertEquals(RESTORED_DATABASE, System.getenv("R5_RESTORE_CONTINUE_JDBC_URL"));
		String passwordFile = System.getenv("R5_RESTORE_CONTINUE_PASSWORD_FILE");
		assertNotNull(passwordFile, "Password-file configuration reference is required");
		Path passwordPath = Paths.get(passwordFile).toAbsolutePath().normalize();
		assertTrue(Files.isRegularFile(passwordPath));
		String password = new String(Files.readAllBytes(passwordPath), StandardCharsets.UTF_8).trim();
		assertFalse(password.isEmpty());
		Connections connections = new Connections(RESTORED_DATABASE, password);
		assertSchema(connections);

		Snapshot before = currentPaused(connections);
		MatchDocument document = matchJson.decode(before.documentJson, before.documentVersion);
		assertEquals(MatchDocument.Lifecycle.ACTIVATED, document.lifecycle);
		assertTwoMembers(connections, before.matchId);
		JsonObject payload = JsonObject.readFrom(before.recoveryJson).get("payload").asObject();
		assertEquals(SetupSession.SAVE_RESUME_RUNTIME, payload.getString("runtimeVersion", null));
		assertEquals(CompletedMatch.ENGINE_VERSION, payload.getString("engineVersion", null));
		assertEquals(3, payload.getInt("recoveryVersion", -1));
		assertEquals(1, payload.getInt("replayVersion", -1));
		int initialRevision = payload.getInt("revision", -1);

		RosterCatalog catalog = new RosterCatalog();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		MatchService matches = new MatchService(new JdbcMatchRepository(connections::open), teams, catalog);
		JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(connections::open);
		SetupApplication setup = new SetupApplication(new TestServer().getServer(), matches, recovery, true, true);

		JsonArray history = payload.get("history").asArray();
		assertTrue(history.size() > 0, "Retained exact request history is absent");
		JsonObject retained = history.get(history.size() - 1).asObject();
		String key = retained.getString("key", null);
		int separator = key == null ? -1 : key.indexOf('\n');
		assertTrue(separator > 0, "Retained request key is invalid");
		String retainedRole = key.substring(0, separator);
		String retainedRequestId = key.substring(separator + 1);
		JsonObject retainedRequest = JsonObject.readFrom(retained.getString("fingerprint", null));
		assertEquals(retainedRequestId, retainedRequest.getString("requestId", null));
		assertEquals(before.matchId, retainedRequest.getString("matchId", null));
		assertEquals("ACCEPTED", retained.getString("code", null));

		RecoveryRepository.Record retryBefore = recovery.find(before.matchId);
		JsonObject reconciled = accepted(setup.handle(retainedRole, retainedRequest));
		assertTrue(reconciled.getBoolean("duplicate", false), "Retained request executed again");
		RecoveryRepository.Record retryAfter = recovery.find(before.matchId);
		assertUnchanged(retryBefore, retryAfter, "Retained exact retry changed durable recovery state");
		assertTrue(before.same(currentPaused(connections)), "Retained exact retry changed the paused document or checkpoint");

		JsonObject homeBefore = state(accepted(setup.handle("home", load("r5_restore_home_before", before.matchId))));
		JsonObject awayBefore = state(accepted(setup.handle("away", load("r5_restore_away_before", before.matchId))));
		assertMemberParity(homeBefore, awayBefore);
		assertEquals(initialRevision, homeBefore.getInt("revision", -1));
		JsonObject action = pendingAction(homeBefore);
		String actor = action.getString("actor", null);
		assertTrue("home".equals(actor) || "away".equals(actor));
		String other = "home".equals(actor) ? "away" : "home";
		JsonObject continuation = new JsonObject().add("version", 1).add("type", "setup").add("operation", "action")
			.add("requestId", CONTINUE_REQUEST).add("matchId", before.matchId)
			.add("expectedRevision", initialRevision).add("actionId", action.get("id"));

		RecoveryRepository.Record unauthorizedBefore = recovery.find(before.matchId);
		assertEquals("WRONG_ACTOR", setup.handle(other, continuation).getString("code", null));
		assertEquals("AUTHENTICATION_REQUIRED", setup.handle("viewer", load("r5_restore_unauthorized_read", before.matchId)).getString("code", null));
		assertUnchanged(unauthorizedBefore, recovery.find(before.matchId), "Unauthorized probe changed durable state");

		JsonObject continued = state(accepted(setup.handle(actor, continuation)));
		assertFalse("FULL_TIME".equals(continued.getString("phase", null)), "Single restored decision unexpectedly completed the match");
		assertEquals(initialRevision + 1, continued.getInt("revision", -1));
		RecoveryRepository.Record continuedRecord = recovery.find(before.matchId);
		assertEquals(before.recoveryGeneration + 1, continuedRecord.generation);
		assertNotEquals(before.recoveryJson, continuedRecord.json);
		Snapshot after = currentPaused(connections);
		assertEquals(before.documentJson, after.documentJson, "Intentional engine continuation changed the frozen match document");
		assertEquals(before.documentVersion, after.documentVersion);

		JsonObject duplicate = accepted(setup.handle(actor, continuation));
		assertTrue(duplicate.getBoolean("duplicate", false));
		assertUnchanged(continuedRecord, recovery.find(before.matchId), "Continuation exact retry changed durable state");
		JsonObject homeAfter = state(accepted(setup.handle("home", load("r5_restore_home_after", before.matchId))));
		JsonObject awayAfter = state(accepted(setup.handle("away", load("r5_restore_away_after", before.matchId))));
		assertMemberParity(homeAfter, awayAfter);
		assertEquals(initialRevision + 1, homeAfter.getInt("revision", -1));
		System.out.println("R5 restored continuation PASS: runtime=" + SetupSession.SAVE_RESUME_RUNTIME
			+ ", revision=" + initialRevision + "->" + (initialRevision + 1)
			+ ", generation=" + before.recoveryGeneration + "->" + continuedRecord.generation
			+ ", exactRetryUnchanged=true, unauthorizedUnchanged=true, memberParity=true");
	}

	private void assertSchema(Connections connections) throws SQLException {
		try (Connection connection = connections.open(); Statement statement = connection.createStatement();
			ResultSet rows = statement.executeQuery("SELECT version FROM ffb_local_schema")) {
			assertTrue(rows.next());
			assertEquals(6, rows.getInt(1));
			assertFalse(rows.next());
		}
	}

	private Snapshot currentPaused(Connections connections) throws SQLException {
		Snapshot found = null;
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT p.match_id,p.document_version,p.document_json,r.generation,r.artifact_json "
				+ "FROM ffb_prepared_matches p JOIN ffb_match_recovery r ON r.matchid=p.match_id WHERE p.document_version=3");
			ResultSet rows = query.executeQuery()) {
			while (rows.next()) {
				Snapshot candidate = new Snapshot(rows.getString(1), rows.getInt(2), rows.getString(3), rows.getLong(4), rows.getString(5));
				JsonObject payload = JsonObject.readFrom(candidate.recoveryJson).get("payload").asObject();
				if (SetupSession.SAVE_RESUME_RUNTIME.equals(payload.getString("runtimeVersion", null))) {
					assertTrue(found == null, "More than one restored current-runtime paused fixture exists");
					found = candidate;
				}
			}
		}
		assertNotNull(found, "Restored current-runtime paused fixture is absent");
		return found;
	}

	private void assertTwoMembers(Connections connections, String matchId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT COUNT(*),SUM(role='home'),SUM(role='away'),COUNT(DISTINCT account_id) "
				+ "FROM ffb_v2_match_members WHERE matchid=?")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) {
				assertTrue(rows.next());
				assertEquals(2, rows.getInt(1));
				assertEquals(1, rows.getInt(2));
				assertEquals(1, rows.getInt(3));
				assertEquals(2, rows.getInt(4));
				assertFalse(rows.next());
			}
		}
	}

	private JsonObject pendingAction(JsonObject state) {
		JsonObject selected = null;
		for (JsonValue value : state.get("actions").asArray()) {
			JsonObject action = value.asObject();
			if ("push".equals(action.getString("kind", null))) {
				assertTrue(selected == null, "Restored fixture has more than one pending push target");
				selected = action;
			}
		}
		assertNotNull(selected, "Restored fixture is not paused at the expected push-target decision");
		return selected;
	}

	private JsonObject load(String requestId, String matchId) {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load")
			.add("requestId", requestId).add("matchId", matchId);
	}

	private JsonObject accepted(JsonObject response) {
		assertEquals("ACCEPTED", response.getString("code", null));
		return response;
	}

	private JsonObject state(JsonObject response) {
		assertFalse(response.get("state").isNull());
		return response.get("state").asObject();
	}

	private void assertMemberParity(JsonObject home, JsonObject away) {
		assertEquals("home", home.getString("callerRole", null));
		assertEquals("away", away.getString("callerRole", null));
		home.set("callerRole", "member");
		away.set("callerRole", "member");
		assertTrue(home.equals(away), "Home and away restored projections differ");
	}

	private void assertUnchanged(RecoveryRepository.Record before, RecoveryRepository.Record after, String message) {
		assertNotNull(before); assertNotNull(after);
		assertTrue(before.generation == after.generation && before.json.equals(after.json), message);
	}

	private static final class Connections {
		private final String url;
		private final String password;
		Connections(String url, String password) { this.url = url; this.password = password; }
		Connection open() throws SQLException { return DriverManager.getConnection(url, "root", password); }
	}

	private static final class Snapshot {
		final String matchId;
		final int documentVersion;
		final String documentJson;
		final long recoveryGeneration;
		final String recoveryJson;
		Snapshot(String matchId, int documentVersion, String documentJson, long recoveryGeneration, String recoveryJson) {
			this.matchId = matchId; this.documentVersion = documentVersion; this.documentJson = documentJson;
			this.recoveryGeneration = recoveryGeneration; this.recoveryJson = recoveryJson;
		}
		boolean same(Snapshot other) {
			return matchId.equals(other.matchId) && documentVersion == other.documentVersion
				&& documentJson.equals(other.documentJson) && recoveryGeneration == other.recoveryGeneration
				&& recoveryJson.equals(other.recoveryJson);
		}
	}
}
