package com.fumbbl.ffb.server.db;

import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcProbeMariaDbTest {
	@Test void preparedCreateRecoversThroughNestedTeamLoadWithinTheSingleProbeTask() throws Exception {
		String base = System.getenv("JDBC_BOUNDS_TEST_URL"), password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit synthetic JDBC bounds database required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		String url = base + "?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1";
		boolean owned = false;
		try {
			try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
				try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next()); }
				owned = true;
				sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (5)");
				for (String migration : new String[] {"003-prepared-matches", "006-v2-membership", "006-v2-saved-teams", "006-v2-invitations"}) resource(sql, migration);
				sql.execute("UPDATE ffb_local_schema SET version=9");
				sql.executeUpdate("INSERT INTO ffb_v2_account VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','ACTIVE')");
			}
			AtomicLong nanos = new AtomicLong();
			JdbcAvailabilityBreaker breaker = new JdbcAvailabilityBreaker(nanos::get);
			try (JdbcRequestConnections source = new JdbcRequestConnections(new JdbcRequestConfiguration(url, "root", password), breaker, true)) {
				String account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
				RosterCatalog catalog = new RosterCatalog();
				SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(source::open, true), catalog);
				List<TeamDraft.Player> players = new ArrayList<>();
				for (int slot = 1; slot <= 11; slot++) players.add(new TeamDraft.Player("p" + slot, slot, slot, "Player " + slot, "lineman", List.of()));
				Map<String, Integer> resources = new LinkedHashMap<>();
				for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
				TeamDraft draft = new TeamDraft(TeamDraft.FORMAT_VERSION, "Recovery Probe", RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, "p1", players, resources);
				String team = teams.create(account, "probe_seed", draft).document.teamId;
				V2PreparationService service = new V2PreparationService(source::open, teams, catalog, Clock.systemUTC());
				for (int index = 0; index < 3; index++) breaker.acquire().failure(new SQLException("synthetic outage", "08000"));
				nanos.set(5_000_000_000L);
				JsonObject request = new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "create")
					.add("requestId", "recovered_create").add("teamId", team).add("expectedDocumentVersion", 1);
				CaptureRequestProbe scope = new CaptureRequestProbe();
				JsonObject response = scope.within(() -> service.handle(account, request));
				assertEquals("ACCEPTED", response.getString("code", null));
				JsonObject retry = scope.within(() -> service.handle(account, request));
				assertEquals("ACCEPTED", retry.getString("code", null)); assertTrue(retry.getBoolean("duplicate", false));
			}
		} finally {
			if (owned) try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
				for (String table : new String[] {"ffb_v2_preparation_requests", "ffb_v2_preparation_invites", "ffb_v2_saved_teams", "ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members", "ffb_prepared_matches", "ffb_local_schema"}) sql.execute("DROP TABLE IF EXISTS " + table);
			}
		}
	}
	private void resource(Statement sql, String migration) throws Exception {
		try (InputStream input = getClass().getResourceAsStream("/local-schema/" + migration + ".sql")) {
			for (String statement : new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";")) if (!statement.isBlank()) sql.execute(statement);
		}
	}
}
