package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.team.SavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class V2PreparationServiceTest {
	@Test
	void rejectsMalformedAccountBeforeOpeningDatabase() {
		V2PreparationService service = new V2PreparationService(() -> { throw new AssertionError("database must not be opened"); }, null, null, Clock.systemUTC());
		JsonObject response = service.handle("not-an-account", new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "create").add("requestId", "create_1").add("teamId", "00000000-0000-0000-0000-000000000001").add("expectedDocumentVersion", 1));
		assertEquals("INVALID_REQUEST", response.getString("code", null));
		assertTrue(response.get("document").isNull());
		assertTrue(response.get("invitationCode").isNull());
	}

	@Test
	void failureResponseNeverProjectsAccountIdentifiers() {
		V2PreparationService service = new V2PreparationService(() -> { throw new AssertionError("database must not be opened"); }, null, null, Clock.systemUTC());
		JsonObject response = service.handle("00000000-0000-0000-0000-000000000001", new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "join").add("requestId", "join_1").add("invitationCode", "not-a-valid-bearer-code").add("teamId", "00000000-0000-0000-0000-000000000002").add("expectedDocumentVersion", 1));
		assertEquals("INVITATION_INVALID", response.getString("code", null));
		assertEquals(JsonValue.NULL, response.get("callerRole"));
		assertTrue(!response.toString().contains("00000000-0000-0000-0000-000000000001"));
	}

	@Test
	void createsDocumentMembershipInviteAndRetryMetadataInOneTransaction() throws Exception {
		Connection connection = connection(false); RosterCatalog catalog = new RosterCatalog(); String account = "00000000-0000-0000-0000-000000000001";
		SavedTeamService teams = teamService(catalog, account);
		V2PreparationService service = new V2PreparationService(() -> connection, teams, catalog, Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC));
		String teamId = teams.list(account).get(0).teamId;
		JsonObject response = service.handle(account, create("create_1", teamId));
		assertEquals("ACCEPTED", response.getString("code", null));
		assertEquals("home", response.getString("callerRole", null));
		assertEquals(3, response.get("document").asObject().getInt("formatVersion", -1));
		assertEquals("The Moles", response.get("document").asObject().get("home").asObject().getString("teamName", null));
		assertEquals(1, response.get("document").asObject().get("home").asObject().get("roster").asObject().get("players").asArray().get(0).asObject().getInt("jerseyNumber", -1));
		assertTrue(response.getString("invitationCode", "").matches("[A-Za-z0-9_-]{22}"));
		assertEquals("away", response.get("document").asObject().get("invitation").asObject().getString("intendedOpponent", null));
		verify(connection).commit(); verify(connection, never()).rollback();
	}
	@Test
	void accountOwnedOrcTeamFreezesWithItsRosterAndTrollParameter() throws Exception {
		Connection connection = connection(false); RosterCatalog catalog = new RosterCatalog();
		String account = "00000000-0000-0000-0000-000000000001";
		SavedTeamService teams = new SavedTeamService(new MemoryTeams(), catalog);
		SavedTeamService.Loaded saved = teams.create(account, "orc-seed", namedOrcDraft(catalog));
		assertEquals("CURRENT", teams.load(account, saved.document.teamId).versionStatus);
		V2PreparationService service = new V2PreparationService(() -> connection, teams, catalog, Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC));
		JsonObject response = service.handle(account, create("orc-create", saved.document.teamId));
		assertEquals("ACCEPTED", response.getString("code", null));
		JsonObject home = response.get("document").asObject().get("home").asObject();
		assertEquals("orc", home.getString("rosterId", null));
		assertEquals(4, home.get("roster").asObject().get("players").asArray().get(10).asObject()
			.get("position").asObject().get("parameters").asObject().getInt("loner", -1));
	}

	@Test
	void rollsBackAllCreateWritesWhenAnInviteWriteFails() throws Exception {
		Connection connection = connection(true); RosterCatalog catalog = new RosterCatalog(); String account = "00000000-0000-0000-0000-000000000001";
		SavedTeamService teams = teamService(catalog, account);
		V2PreparationService service = new V2PreparationService(() -> connection, teams, catalog, Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC));
		JsonObject response = service.handle(account, create("create_2", teams.list(account).get(0).teamId));
		assertEquals("MATCH_OUTCOME_UNKNOWN", response.getString("code", null));
		verify(connection).rollback(); verify(connection, never()).commit();
	}

	@Test
	void persistsJoinedAndReleasedDocumentsWithDecodableUpdatePayloads() throws Exception {
		RosterCatalog catalog = new RosterCatalog(); TeamDraft draft = draft(catalog);
		FrozenTeam home = new FrozenTeam("00000000-0000-0000-0000-000000000011", 1, "home", draft, 550000, 0, catalog);
		FrozenTeam away = new FrozenTeam("00000000-0000-0000-0000-000000000012", 1, "away", draft, 550000, 0, catalog);
		String matchId = "00000000-0000-0000-0000-000000000021";
		Map<String, MatchDocument.Request> history = new LinkedHashMap<>(); history.put("home\ncreate_1", new MatchDocument.Request("create|00000000-0000-0000-0000-000000000011|1|away"));
		MatchDocument waiting = new MatchDocument(matchId, 1, "away", MatchDocument.Lifecycle.WAITING_FOR_OPPONENT, new MatchDocument.Member("home", "home", home), null, history);
		MatchDocument joined = waiting.joined(new MatchDocument.Member("away", "away", away), "away\njoin_1", "join|" + matchId + "|1|00000000-0000-0000-0000-000000000012|1");
		Map<String, MatchDocument.Request> releasedHistory = new LinkedHashMap<>(); releasedHistory.put("home\ncreate_1", history.get("home\ncreate_1"));
		MatchDocument released = new MatchDocument(matchId, 1, "away", MatchDocument.Lifecycle.WAITING_FOR_OPPONENT, waiting.home, null, releasedHistory);
		assertUpdateDecodes(joined, 1, 2); assertUpdateDecodes(released, 2, 1);
	}

	private void assertUpdateDecodes(MatchDocument document, int expectedPriorVersion, int expectedNewVersion) throws Exception {
		Connection connection = mock(Connection.class); PreparedStatement statement = mock(PreparedStatement.class); when(connection.prepareStatement(anyString())).thenReturn(statement); when(statement.executeUpdate()).thenReturn(1);
		V2PreparationService service = new V2PreparationService(() -> connection, null, null, Clock.systemUTC());
		Method write = V2PreparationService.class.getDeclaredMethod("writeDocument", Connection.class, MatchDocument.class, int.class); write.setAccessible(true); write.invoke(service, connection, document, expectedPriorVersion);
		ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class); verify(statement).setInt(eq(1), eq(expectedNewVersion)); verify(statement).setString(eq(2), json.capture()); verify(statement).setString(eq(3), eq(document.matchId)); verify(statement).setInt(eq(4), eq(expectedPriorVersion));
		MatchDocument decoded = new MatchJson().decode(json.getValue(), expectedNewVersion); assertEquals(document.lifecycle, decoded.lifecycle); assertEquals(document.away == null, decoded.away == null);
	}

	private Connection connection(boolean failThirdWrite) throws Exception {
		Connection connection = mock(Connection.class); ResultSet empty = mock(ResultSet.class); when(empty.next()).thenReturn(false);
		AtomicInteger writes = new AtomicInteger();
		when(connection.prepareStatement(anyString())).thenAnswer(call -> {
			PreparedStatement statement = mock(PreparedStatement.class); when(statement.executeQuery()).thenReturn(empty);
			when(statement.executeUpdate()).thenAnswer(write -> {
				if (failThirdWrite && writes.incrementAndGet() == 3) throw new SQLException("injected invite failure");
				return 1;
			});
			return statement;
		});
		return connection;
	}

	private SavedTeamService teamService(RosterCatalog catalog, String account) throws SQLException {
		MemoryTeams repository = new MemoryTeams(); SavedTeamService service = new SavedTeamService(repository, catalog);
		service.create(account, "seed", namedDraft(catalog)); return service;
	}

	private JsonObject create(String requestId, String teamId) { return new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "create").add("requestId", requestId).add("teamId", teamId).add("expectedDocumentVersion", 1); }
	private TeamDraft draft(RosterCatalog catalog) {
		List<TeamDraft.Player> players = new ArrayList<>(); for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player("player" + slot, slot, "lineman", Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>(); for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
		return new TeamDraft(RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, "player1", players, resources);
	}
	@Test
	void namedFrozenMatchRoundTripsWithoutReadingSourceTeam() {
		RosterCatalog catalog = new RosterCatalog(); TeamDraft draft = namedDraft(catalog);
		FrozenTeam home = new FrozenTeam("00000000-0000-0000-0000-000000000011", 1, "home", draft, 550000, 0, catalog);
		FrozenTeam away = new FrozenTeam("00000000-0000-0000-0000-000000000012", 1, "away", draft, 550000, 0, catalog);
		String matchId = "00000000-0000-0000-0000-000000000021";
		Map<String, MatchDocument.Request> history = new LinkedHashMap<>();
		history.put("home\ncreate_1", new MatchDocument.Request("create|00000000-0000-0000-0000-000000000011|1|away"));
		MatchDocument waiting = new MatchDocument(matchId, 1, "away", MatchDocument.Lifecycle.WAITING_FOR_OPPONENT,
			new MatchDocument.Member("home", "home", home), null, history);
		MatchDocument joined = waiting.joined(new MatchDocument.Member("away", "away", away), "away\njoin_1",
			"join|" + matchId + "|1|00000000-0000-0000-0000-000000000012|1");
		MatchJson json = new MatchJson(); MatchDocument reloaded = json.decode(json.encode(joined).toString(), 2);
		assertEquals("The Moles", reloaded.home.team.teamName);
		assertEquals("Player 1", reloaded.away.team.players.get(0).playerName);
		assertEquals(1, reloaded.away.team.players.get(0).jerseyNumber);
		assertEquals(3, json.publicDocument(reloaded).getInt("formatVersion", -1));
	}
	private TeamDraft namedDraft(RosterCatalog catalog) {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player("player" + slot, slot, slot, "Player " + slot, "lineman", Collections.emptyList()));
		return new TeamDraft(TeamDraft.FORMAT_VERSION, "The Moles", RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET,
			"player1", players, draft(catalog).resources);
	}
	private TeamDraft namedOrcDraft(RosterCatalog catalog) {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player("player" + slot, slot, slot, "Orc " + slot,
			slot == 11 ? "troll" : "orc-lineman", Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>(); for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
		resources.put("rerolls", 2);
		return new TeamDraft(TeamDraft.FORMAT_VERSION, "The Orcs", RosterCatalog.VERSION, "BB2025", "orc", RosterCatalog.PRESET,
			"player1", players, resources);
	}

	private static final class MemoryTeams implements SavedTeamRepository {
		private final Map<String, Record> teams = new LinkedHashMap<>();
		@Override public Record find(String owner, String teamId) { Record found = teams.get(teamId); return found != null && owner.equals(found.owner) ? found : null; }
		@Override public List<Record> list(String owner) { List<Record> found = new ArrayList<>(); for (Record team : teams.values()) if (owner.equals(team.owner)) found.add(team); return found; }
		@Override public void insert(Record record) { teams.put(record.teamId, record); }
		@Override public boolean replace(Record record, int expectedVersion) { teams.put(record.teamId, record); return true; }
	}
}
