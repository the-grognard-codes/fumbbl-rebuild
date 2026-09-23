package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.CompletedMatch;
import com.fumbbl.ffb.server.match.JdbcMatchRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchJson;
import com.fumbbl.ffb.server.match.MatchRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.RecoveryRepository;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.match.V2PreparationService;
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
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Opt-in R5 evidence generator. It operates only on the explicitly named current-dev database while
 * its application writer is quiesced. It creates a separate match by using the production preparation,
 * checkpoint and authoritative-engine paths; it never edits a match or recovery row directly.
 */
class R5CompletedFixtureGeneratorTest {
	private static final String CONFIRMATION = "CREATE_CURRENT_COMPLETED_FIXTURE";
	private static final String CURRENT_DATABASE = "jdbc:mariadb://127.0.0.1:23316/ffb_local";
	private static final String CREATE_REQUEST = "r5_current_completed_v1";
	private static final String JOIN_REQUEST = "r5_current_completed_join_v1";
	private static final String ACTIVATE_REQUEST = "r5_current_completed_activate_v1";
	private static final String RUNTIME = SetupSession.SAVE_RESUME_RUNTIME;
	private static final int SCHEMA = 6;
	private static final int RECOVERY_FORMAT = 3;
	private static final int REPLAY_FORMAT = 1;
	private final MatchJson matchJson = new MatchJson();

	@Test void createsCurrentCompletedFixtureWithoutChangingPausedFixture() throws Exception {
		String confirmation = System.getenv("R5_FIXTURE_CONFIRM");
		assumeTrue(confirmation != null, "Opt-in current-dev fixture generation only");
		assertEquals(CONFIRMATION, confirmation, "Explicit fixture-generation confirmation differs");
		String url = System.getenv("R5_FIXTURE_JDBC_URL");
		assertEquals(CURRENT_DATABASE, url, "Fixture generation is bound to the loopback current-dev database");
		String passwordFile = System.getenv("R5_FIXTURE_PASSWORD_FILE");
		assertNotNull(passwordFile, "Password-file configuration reference is required");
		Path passwordPath = Paths.get(passwordFile).toAbsolutePath().normalize();
		assertTrue(Files.isRegularFile(passwordPath), "Password-file configuration reference is unavailable");
		String password = new String(Files.readAllBytes(passwordPath), StandardCharsets.UTF_8).trim();
		assertFalse(password.isEmpty(), "Password-file configuration is empty");
		Connections connections = new Connections(url, password);
		assertSchema(connections);

		PausedSnapshot paused = findCurrentPausedFixture(connections);
		Map<String, String> accounts = memberships(connections, paused.matchId);
		MatchDocument pausedDocument = matchJson.decode(paused.documentJson, paused.documentVersion);
		assertEquals(MatchDocument.Lifecycle.ACTIVATED, pausedDocument.lifecycle);
		assertNotNull(pausedDocument.away);

		RosterCatalog catalog = new RosterCatalog();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		assertCurrentSource(teams, accounts.get("home"), pausedDocument.home.team.sourceTeamId,
			pausedDocument.home.team.sourceDocumentVersion);
		assertCurrentSource(teams, accounts.get("away"), pausedDocument.away.team.sourceTeamId,
			pausedDocument.away.team.sourceDocumentVersion);
		MatchRepository matchRepository = new JdbcMatchRepository(connections::open);
		MatchService matches = new MatchService(matchRepository, teams, catalog);
		JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(connections::open);
		SetupApplication setup = new SetupApplication(new TestServer().getServer(), matches, recovery, true, true);
		V2PreparationService preparation = new V2PreparationService(connections::open, teams, catalog, Clock.systemUTC());

		String fixtureId = deterministicFixtureId(accounts.get("home"));
		MatchRepository.Record existing = matchRepository.find(fixtureId);
		JsonObject lastRequest = null;
		String lastActor = null;
		if (existing == null) {
			JsonObject created = accepted(preparation.handle(accounts.get("home"), preparationRequest(CREATE_REQUEST, "create")
				.add("teamId", pausedDocument.home.team.sourceTeamId)
				.add("expectedDocumentVersion", pausedDocument.home.team.sourceDocumentVersion)));
			assertEquals(fixtureId, created.get("document").asObject().getString("matchId", null));
			String invitation = created.getString("invitationCode", null);
			assertNotNull(invitation, "A newly created fixture must return its private invitation in memory");
			accepted(preparation.handle(accounts.get("away"), preparationRequest(JOIN_REQUEST, "join")
				.add("invitationCode", invitation)
				.add("teamId", pausedDocument.away.team.sourceTeamId)
				.add("expectedDocumentVersion", pausedDocument.away.team.sourceDocumentVersion)));
			accepted(setup.activate("home", new JsonObject().add("version", 1).add("type", "preparedMatch")
				.add("operation", "activate").add("requestId", ACTIVATE_REQUEST).add("matchId", fixtureId)
				.add("expectedRevision", 2).toString()));

			JsonObject state = state(accepted(setup.handle("home", setupRequest("r5_fixture_load", "load", fixtureId))));
			for (int command = 0; command < 600 && !"FULL_TIME".equals(state.getString("phase", null)); command++) {
				String requestId = String.format("r5_fixture_%03d", command);
				JsonObject prompt = state.get("prompt").isNull() ? null : state.get("prompt").asObject();
				if (prompt != null) {
					lastActor = prompt.getString("actor", null);
					lastRequest = setupRequest(requestId, "choice", fixtureId)
						.add("expectedRevision", state.getInt("revision", -1))
						.add("promptId", prompt.get("id"))
						.add("optionId", prompt.get("options").asArray().get(0));
				} else if ("SETUP".equals(state.getString("phase", null))) {
					lastActor = state.getString("actor", null);
					lastRequest = setupRequest(requestId, "confirm", fixtureId)
						.add("expectedRevision", state.getInt("revision", -1));
				} else {
					JsonObject action = selectAction(state);
					assertNotNull(action, "Authoritative state exposed no supported legal action");
					lastActor = action.getString("actor", null);
					lastRequest = setupRequest(requestId, "action", fixtureId)
						.add("expectedRevision", state.getInt("revision", -1)).add("actionId", action.get("id"));
				}
				int beforeRevision = state.getInt("revision", -1);
				JsonObject response = accepted(setup.handle(lastActor, lastRequest));
				state = state(response);
				assertTrue(state.getInt("revision", -1) > beforeRevision, "Accepted engine command must advance revision");
			}
			assertEquals("FULL_TIME", state.getString("phase", null), "Fixture did not complete within the command bound");
		} else {
			MatchDocument document = matchJson.decode(existing.json, existing.documentVersion);
			assertEquals(MatchDocument.Lifecycle.COMPLETED, document.lifecycle,
				"A deterministic fixture destination already exists but is incomplete");
		}

		MatchDocument completed = matches.load("home", fixtureId).document;
		assertCompletedFixture(completed, recovery.find(fixtureId));
		assertMemberships(connections, fixtureId, accounts);
		if (lastRequest != null) {
			RecoveryRepository.Record beforeRetry = recovery.find(fixtureId);
			JsonObject duplicate = accepted(setup.handle(lastActor, lastRequest));
			assertTrue(duplicate.getBoolean("duplicate", false), "Terminal exact retry must reconcile without execution");
			RecoveryRepository.Record afterRetry = recovery.find(fixtureId);
			assertTrue(beforeRetry.json.equals(afterRetry.json) && beforeRetry.generation == afterRetry.generation,
				"Terminal exact retry changed durable recovery state");
		}
		assertPlayerParity(setup, fixtureId);

		PausedSnapshot after = loadPausedSnapshot(connections, paused.matchId);
		assertTrue(paused.same(after), "Completed fixture generation changed the retained paused fixture");
		JsonObject replay = JsonObject.readFrom(completed.completion.json());
		System.out.println("R5 completed fixture PASS: runtime=" + RUNTIME + ", engine=" + CompletedMatch.ENGINE_VERSION
			+ ", finalRevision=" + replay.getInt("finalRevision", -1) + ", events=" + replay.get("events").asArray().size()
			+ ", pausedUnchanged=true");
	}

	private void assertSchema(Connections connections) throws SQLException {
		try (Connection connection = connections.open(); Statement statement = connection.createStatement();
			ResultSet rows = statement.executeQuery("SELECT version FROM ffb_local_schema")) {
			assertTrue(rows.next(), "Schema marker is absent");
			assertEquals(SCHEMA, rows.getInt(1), "Unsupported current-dev schema marker");
			assertFalse(rows.next(), "Schema marker is ambiguous");
		}
	}

	private PausedSnapshot findCurrentPausedFixture(Connections connections) throws SQLException {
		PausedSnapshot selected = null;
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT p.match_id,p.document_version,p.document_json,r.generation,r.artifact_json "
				+ "FROM ffb_prepared_matches p JOIN ffb_match_recovery r ON r.matchid=p.match_id "
				+ "WHERE p.document_version=3"); ResultSet rows = query.executeQuery()) {
			while (rows.next()) {
				PausedSnapshot candidate = new PausedSnapshot(rows.getString(1), rows.getInt(2), rows.getString(3),
					rows.getLong(4), rows.getString(5));
				MatchDocument document = matchJson.decode(candidate.documentJson, candidate.documentVersion);
				JsonObject payload = JsonObject.readFrom(candidate.recoveryJson).get("payload").asObject();
				if (document.lifecycle == MatchDocument.Lifecycle.ACTIVATED
					&& RUNTIME.equals(payload.getString("runtimeVersion", null))) {
					if (selected != null) fail("More than one current-runtime paused fixture is present");
					assertEquals(RECOVERY_FORMAT, payload.getInt("recoveryVersion", -1));
					assertEquals(REPLAY_FORMAT, payload.getInt("replayVersion", -1));
					assertEquals(CompletedMatch.ENGINE_VERSION, payload.getString("engineVersion", null));
					selected = candidate;
				}
			}
		}
		assertNotNull(selected, "Exactly one current-runtime paused fixture is required");
		return selected;
	}

	private PausedSnapshot loadPausedSnapshot(Connections connections, String matchId) throws SQLException {
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT p.match_id,p.document_version,p.document_json,r.generation,r.artifact_json "
				+ "FROM ffb_prepared_matches p JOIN ffb_match_recovery r ON r.matchid=p.match_id WHERE p.match_id=?")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) {
				assertTrue(rows.next(), "Paused fixture disappeared");
				PausedSnapshot result = new PausedSnapshot(rows.getString(1), rows.getInt(2), rows.getString(3),
					rows.getLong(4), rows.getString(5));
				assertFalse(rows.next(), "Paused fixture identity is ambiguous");
				return result;
			}
		}
	}

	private Map<String, String> memberships(Connections connections, String matchId) throws SQLException {
		Map<String, String> result = new LinkedHashMap<>();
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(
			"SELECT role,account_id FROM ffb_v2_match_members WHERE matchid=? ORDER BY role")) {
			query.setString(1, matchId);
			try (ResultSet rows = query.executeQuery()) {
				while (rows.next()) assertTrue(result.put(rows.getString(1), rows.getString(2)) == null,
					"Duplicate fixture role membership");
			}
		}
		assertEquals(2, result.size(), "Paused fixture must have exactly two account memberships");
		assertNotNull(result.get("home"));
		assertNotNull(result.get("away"));
		assertFalse(result.get("home").equals(result.get("away")), "Both fixture roles must use independent accounts");
		return result;
	}

	private void assertMemberships(Connections connections, String matchId, Map<String, String> expected) throws SQLException {
		Map<String, String> actual = memberships(connections, matchId);
		assertTrue(expected.equals(actual), "Completed fixture account-role membership differs from the paused fixture");
	}

	private void assertCurrentSource(SavedTeamService teams, String account, String teamId, int version) throws SQLException {
		SavedTeamService.Loaded source = teams.load(account, teamId);
		assertEquals(version, source.document.documentVersion, "Frozen source team is no longer the current document");
		assertEquals("CURRENT", source.versionStatus, "Frozen source team is not selectable by the current catalog");
		assertTrue(source.validation.isValid(), "Frozen source team is no longer valid under the carried-forward catalog");
	}

	private void assertCompletedFixture(MatchDocument document, RecoveryRepository.Record recovery) {
		assertEquals(4, document.documentVersion);
		assertEquals(MatchDocument.Lifecycle.COMPLETED, document.lifecycle);
		assertNotNull(document.completion);
		assertNotNull(recovery);
		JsonObject payload = JsonObject.readFrom(recovery.json).get("payload").asObject();
		assertEquals(RECOVERY_FORMAT, payload.getInt("recoveryVersion", -1));
		assertEquals(RUNTIME, payload.getString("runtimeVersion", null));
		assertEquals(CompletedMatch.ENGINE_VERSION, payload.getString("engineVersion", null));
		assertEquals(REPLAY_FORMAT, payload.getInt("replayVersion", -1));
		JsonObject replay = JsonObject.readFrom(document.completion.json());
		assertEquals(REPLAY_FORMAT, replay.getInt("formatVersion", -1));
		assertEquals(CompletedMatch.ENGINE_VERSION, replay.getString("engineVersion", null));
		assertEquals("BB2025", replay.getString("ruleset", null));
		JsonArray events = replay.get("events").asArray();
		assertEquals(replay.getInt("finalRevision", -1) + 1, events.size());
		assertEquals("FULL_TIME", events.get(events.size() - 1).asObject().get("state").asObject().getString("phase", null));
	}

	private void assertPlayerParity(SetupApplication setup, String matchId) {
		JsonObject home = state(accepted(setup.handle("home", setupRequest("r5_fixture_home_load", "load", matchId))));
		JsonObject away = state(accepted(setup.handle("away", setupRequest("r5_fixture_away_load", "load", matchId))));
		assertEquals("home", home.getString("callerRole", null));
		assertEquals("away", away.getString("callerRole", null));
		home.set("callerRole", "member");
		away.set("callerRole", "member");
		assertTrue(home.equals(away), "Completed fixture projections differ between the two members");
	}

	private JsonObject selectAction(JsonObject state) {
		JsonArray actions = state.get("actions").asArray();
		if ("READY_FOR_KICKOFF".equals(state.getString("phase", null))) {
			JsonObject kick = ending(actions, "home".equals(state.getString("actor", null)) ? "kick-17-7" : "kick-8-7");
			if (kick != null) return kick;
			JsonObject byKind = kind(actions, "kick");
			if (byKind != null) return byKind;
		}
		for (String suffix : new String[] { ":decline-event", ":end-event", ":reroll:team", ":skill:true" }) {
			JsonObject action = ending(actions, suffix);
			if (action != null) return action;
		}
		JsonObject action = kind(actions, "endAction");
		if (action != null) return action;
		action = kind(actions, "endTurn");
		if (action != null) return action;
		for (JsonValue value : actions) {
			JsonObject candidate = value.asObject();
			if ("reroll".equals(candidate.getString("kind", null))
				&& candidate.getString("label", "").startsWith("Do not")) return candidate;
		}
		return actions.size() == 0 ? null : actions.get(0).asObject();
	}

	private JsonObject ending(JsonArray actions, String suffix) {
		for (JsonValue value : actions) {
			JsonObject action = value.asObject();
			if (action.getString("id", "").endsWith(suffix)) return action;
		}
		return null;
	}

	private JsonObject kind(JsonArray actions, String kind) {
		for (JsonValue value : actions) {
			JsonObject action = value.asObject();
			if (kind.equals(action.getString("kind", null))) return action;
		}
		return null;
	}

	private JsonObject preparationRequest(String requestId, String operation) {
		return new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", operation)
			.add("requestId", requestId);
	}

	private JsonObject setupRequest(String requestId, String operation, String matchId) {
		return new JsonObject().add("version", 1).add("type", "setup").add("operation", operation)
			.add("requestId", requestId).add("matchId", matchId);
	}

	private JsonObject accepted(JsonObject response) {
		assertEquals("ACCEPTED", response.getString("code", null), "Authoritative operation was rejected");
		return response;
	}

	private JsonObject state(JsonObject response) {
		assertFalse(response.get("state").isNull(), "Accepted setup response omitted state");
		return response.get("state").asObject();
	}

	private String deterministicFixtureId(String homeAccount) {
		return UUID.nameUUIDFromBytes(("v2-prepared-match\n" + homeAccount + "\n" + CREATE_REQUEST)
			.getBytes(StandardCharsets.UTF_8)).toString();
	}

	private static final class Connections {
		private final String url;
		private final String password;
		Connections(String url, String password) { this.url = url; this.password = password; }
		Connection open() throws SQLException { return DriverManager.getConnection(url, "root", password); }
	}

	private static final class PausedSnapshot {
		final String matchId;
		final int documentVersion;
		final String documentJson;
		final long recoveryGeneration;
		final String recoveryJson;
		PausedSnapshot(String matchId, int documentVersion, String documentJson, long recoveryGeneration, String recoveryJson) {
			this.matchId = matchId;
			this.documentVersion = documentVersion;
			this.documentJson = documentJson;
			this.recoveryGeneration = recoveryGeneration;
			this.recoveryJson = recoveryJson;
		}
		boolean same(PausedSnapshot other) {
			return matchId.equals(other.matchId) && documentVersion == other.documentVersion
				&& documentJson.equals(other.documentJson) && recoveryGeneration == other.recoveryGeneration
				&& recoveryJson.equals(other.recoveryJson);
		}
	}
}
