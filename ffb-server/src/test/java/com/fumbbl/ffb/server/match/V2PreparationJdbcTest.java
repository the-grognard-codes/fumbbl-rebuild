package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Opt-in target-only acceptance. It retains uniquely named synthetic rows for audit and never deletes storage. */
class V2PreparationJdbcTest {
	@Test
	void createsJoinsRetriesReleasesAndExpiresInvitationsOnIsolatedMarker6Target() throws Exception {
		String url = System.getenv("M6_TEST_JDBC_URL"), passwordFile = System.getenv("M6_TEST_PASSWORD_FILE");
		Assumptions.assumeTrue(url != null && passwordFile != null, "Set isolated M6_TEST_JDBC_URL and M6_TEST_PASSWORD_FILE to run MariaDB acceptance");
		Path passwordPath = Paths.get(passwordFile); if (!passwordPath.isAbsolute()) throw new IllegalArgumentException("M6_TEST_PASSWORD_FILE must be absolute");
		String password = new String(Files.readAllBytes(passwordPath)).trim();
		V2PreparationService.Connections connections = () -> DriverManager.getConnection(url, "root", password);
		RosterCatalog catalog = new RosterCatalog(); String home = UUID.randomUUID().toString(), away = UUID.randomUUID().toString(), other = UUID.randomUUID().toString();
		insertAccount(connections, home); insertAccount(connections, away); insertAccount(connections, other);
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		String homeTeam = teams.create(home, draft(catalog)).document.teamId, awayTeam = teams.create(away, draft(catalog)).document.teamId, otherTeam = teams.create(other, draft(catalog)).document.teamId;
		V2PreparationService service = new V2PreparationService(connections, teams, catalog, Clock.systemUTC());
		JsonObject created = accepted(service.handle(home, create("create_" + shortId(), homeTeam))); String matchId = created.get("document").asObject().getString("matchId", null), firstCode = created.getString("invitationCode", null);
		assertNoAccountIds(created, home, away, other); assertMembers(connections, matchId, 1);
		JsonObject reissued = accepted(service.handle(home, mutation("reissue", "reissue_" + shortId(), matchId))); String code = reissued.getString("invitationCode", null); assertFalse(firstCode.equals(code));
		assertEquals("INVITATION_INVALID", service.handle(away, join("old_" + shortId(), firstCode, awayTeam)).getString("code", null));
		assertEquals("INVITATION_INVALID", service.handle(home, join("creator_" + shortId(), code, homeTeam)).getString("code", null));
		String joinRequest = "join_" + shortId(); JsonObject joined = accepted(service.handle(away, join(joinRequest, code, awayTeam))); assertEquals("away", joined.getString("callerRole", null)); assertMembers(connections, matchId, 2); assertNoAccountIds(joined, home, away, other);
		JsonObject exactJoin = accepted(service.handle(away, join(joinRequest, code, awayTeam)));
		assertTrue(exactJoin.getBoolean("duplicate", false));
		assertEquals("INVITATION_INVALID", service.handle(away, join("second_" + shortId(), code, awayTeam)).getString("code", null));
		assertEquals("INVITATION_INVALID", service.handle(other, join("other_" + shortId(), code, otherTeam)).getString("code", null));
		JsonObject released = accepted(service.releaseAbandoned(home, matchId, "release_" + shortId(), true)); String releasedCode = released.getString("invitationCode", null); assertEquals(1, released.get("document").asObject().getInt("documentVersion", -1)); assertMembers(connections, matchId, 1);
		JsonObject releaseRetry = accepted(service.releaseAbandoned(home, matchId, released.getString("requestId", null), false)); assertTrue(releaseRetry.getBoolean("duplicate", false));
		assertEquals("INVITATION_INVALID", service.handle(away, join("released_old_" + shortId(), code, awayTeam)).getString("code", null));
		accepted(service.handle(home, mutation("revoke", "revoke_" + shortId(), matchId))); assertEquals("INVITATION_INVALID", service.handle(other, join("revoked_" + shortId(), releasedCode, otherTeam)).getString("code", null));
		JsonObject fresh = accepted(service.handle(home, mutation("reissue", "fresh_" + shortId(), matchId))); expire(connections, matchId, 5000L);
		V2PreparationService boundary = new V2PreparationService(connections, teams, catalog, Clock.fixed(java.time.Instant.ofEpochMilli(5000L), java.time.ZoneOffset.UTC));
		assertEquals("INVITATION_INVALID", boundary.handle(other, join("expired_" + shortId(), fresh.getString("invitationCode", null), otherTeam)).getString("code", null));
	}

	private JsonObject create(String request, String team) { return new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "create").add("requestId", request).add("teamId", team).add("expectedDocumentVersion", 1); }
	private JsonObject join(String request, String code, String team) { return new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "join").add("requestId", request).add("invitationCode", code).add("teamId", team).add("expectedDocumentVersion", 1); }
	private JsonObject mutation(String operation, String request, String match) { return new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", operation).add("requestId", request).add("matchId", match); }
	private JsonObject accepted(JsonObject response) { assertEquals("ACCEPTED", response.getString("code", null)); return response; }
	private void insertAccount(V2PreparationService.Connections connections, String id) throws Exception { try (Connection connection = connections.open(); PreparedStatement write = connection.prepareStatement("INSERT INTO ffb_v2_account(account_id,state) VALUES (?, 'ACTIVE')")) { write.setString(1, id); write.executeUpdate(); } }
	private void expire(V2PreparationService.Connections connections, String id, long at) throws Exception { try (Connection connection = connections.open(); PreparedStatement write = connection.prepareStatement("UPDATE ffb_v2_preparation_invites SET expires_at_epoch_ms=? WHERE matchid=?")) { write.setLong(1, at); write.setString(2, id); assertEquals(1, write.executeUpdate()); } }
	private void assertMembers(V2PreparationService.Connections connections, String id, int expected) throws Exception { try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement("SELECT COUNT(*) FROM ffb_v2_match_members WHERE matchid=?")) { query.setString(1, id); try (java.sql.ResultSet rows = query.executeQuery()) { rows.next(); assertEquals(expected, rows.getInt(1)); } } }
	private void assertNoAccountIds(JsonObject response, String... ids) { for (String id : ids) assertFalse(response.toString().contains(id)); }
	private String shortId() { return UUID.randomUUID().toString().replace("-", "").substring(0, 12); }
	private TeamDraft draft(RosterCatalog catalog) { List<TeamDraft.Player> players = new ArrayList<>(); for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player("p" + slot, slot, "lineman", Collections.emptyList())); Map<String, Integer> resources = new LinkedHashMap<>(); for (String resource : catalog.getResources().keySet()) resources.put(resource, 0); return new TeamDraft(RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, "p1", players, resources); }
}
