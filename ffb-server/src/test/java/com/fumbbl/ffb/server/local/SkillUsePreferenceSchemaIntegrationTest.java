package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.RecoveryRepository;
import com.fumbbl.ffb.server.skilluse.JdbcSkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Opt-in real MariaDB check; refuses every database except an empty dedicated test schema. */
class SkillUsePreferenceSchemaIntegrationTest {
	@Test void migrationPersistsIndependentAccountCasesAcrossConnectionsAndRejectsInvalidRows() throws Exception {
		String url = System.getenv("SKILL_USE_TEST_JDBC_URL"), password = System.getenv("SKILL_USE_TEST_PASSWORD");
		Assumptions.assumeTrue(url != null && password != null, "Opt-in empty skill use test database required");
		if (!url.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_skill_use_preferences_test"))
			throw new IllegalArgumentException("Only the isolated loopback skill use test database is allowed");
		try (Connection connection = DriverManager.getConnection(url, "root", password); Statement statement = connection.createStatement()) {
			try (ResultSet tables = statement.executeQuery("SHOW TABLES")) { assertFalse(tables.next(), "Test schema must be empty before any write"); }
			try {
				LocalAcceptanceBootstrap.executeResource(statement, "/local-schema/006-v2-membership.sql");
				LocalAcceptanceBootstrap.executeResource(statement, "/local-schema/006-v2-saved-teams.sql");
				LocalAcceptanceBootstrap.executeResource(statement, "/local-schema/005-match-recovery.sql");
				statement.execute("CREATE TABLE ffb_local_schema (version INT NOT NULL PRIMARY KEY)");
				statement.execute("INSERT INTO ffb_local_schema VALUES (7)");
				String first = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", second = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
				statement.execute("INSERT INTO ffb_v2_account VALUES ('" + first + "','ACTIVE'),('" + second + "','ACTIVE')");
				SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(
					() -> DriverManager.getConnection(url, "root", password), true), new RosterCatalog());
				String teamId = teams.create(first, "before_migration", draft("Before Migration")).document.teamId;
				JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(() -> DriverManager.getConnection(url, "root", password));
				String retained = "33333333-3333-3333-3333-333333333333", fresh = "44444444-4444-4444-4444-444444444444";
				assertTrue(recovery.save(new RecoveryRepository.Record(retained, 1, "{}"), 0));
				LocalAcceptanceBootstrap.executeResource(statement, "/local-schema/008-skill-use-preferences.sql");
				new Marker6Schema().verifySkillUsePreferences(connection);
				try (ResultSet marker = statement.executeQuery("SELECT version FROM ffb_local_schema")) { marker.next(); assertEquals(8, marker.getInt(1)); }
				assertTrue(recovery.save(new RecoveryRepository.Record(fresh, 1, "{}"), 0));
				assertTrue(recovery.save(new RecoveryRepository.Record(retained, 2, "{}"), 1));
				assertEquals(1, recovery.find(fresh).generation);
				assertEquals(2, recovery.find(retained).generation);
				assertEquals(2, teams.update(first, teamId, 1, draft("After Migration")).document.documentVersion);
				String created = teams.create(first, "after_migration", draft("Another Team")).document.teamId;
				assertEquals(created, teams.create(first, "after_migration", draft("Another Team")).document.teamId);
				assertEquals(2, teams.summaries(first).size());
				assertEquals(0, teams.summaries(second).size());
				assertEquals("TEAM_NAME_TAKEN", assertThrows(SavedTeamService.Failure.class,
					() -> teams.create(first, "duplicate_name", draft("AFTER MIGRATION"))).code);
				statement.execute("INSERT INTO ffb_v2_match_members VALUES ('11111111-1111-1111-1111-111111111111','" + first + "','home'),('22222222-2222-2222-2222-222222222222','" + first + "','away')");
				JdbcMatchMembershipRepository.Connections connections = () -> {
					Connection opened = DriverManager.getConnection(url, "root", password); opened.setAutoCommit(false); return opened;
				};
				JdbcSkillUsePreferenceRepository deviceOne = new JdbcSkillUsePreferenceRepository(connections);
				JdbcSkillUsePreferenceRepository deviceTwo = new JdbcSkillUsePreferenceRepository(connections);
				assertEquals(SkillUsePreferences.defaults().toJson(), deviceOne.load(first).toJson());
				ExecutorService executor = Executors.newFixedThreadPool(2);
				try {
					Future<?> movement = executor.submit(() -> { deviceOne.update(first, SkillUsePreferences.UseCase.DODGE_MOVEMENT, SkillUsePreferences.Mode.ALWAYS_ASK); return null; });
					Future<?> block = executor.submit(() -> { deviceTwo.update(first, SkillUsePreferences.UseCase.DODGE_BLOCK, SkillUsePreferences.Mode.ALWAYS_ASK); return null; });
					movement.get(); block.get();
				} finally { executor.shutdownNow(); }
				deviceTwo.update(first, SkillUsePreferences.UseCase.DODGE_BLOCK, SkillUsePreferences.Mode.ALWAYS_ASK);
				SkillUsePreferenceService service = new SkillUsePreferenceService(deviceOne, new JdbcMatchMembershipRepository(connections));
				for (SkillUsePreferences preferences : new SkillUsePreferences[] {deviceTwo.load(first),
					service.loadForMatch("11111111-1111-1111-1111-111111111111", "home"), service.loadForMatch("22222222-2222-2222-2222-222222222222", "away")}) {
					assertEquals(SkillUsePreferences.Mode.ALWAYS_ASK, preferences.mode(SkillUsePreferences.UseCase.DODGE_MOVEMENT));
					assertEquals(SkillUsePreferences.Mode.ALWAYS_ASK, preferences.mode(SkillUsePreferences.UseCase.DODGE_BLOCK));
				}
				assertEquals(SkillUsePreferences.defaults().toJson(), deviceTwo.load(second).toJson());
				assertEquals(SkillUsePreferences.defaults().toJson(), service.loadForMatch("11111111-1111-1111-1111-111111111111", "away").toJson());
				assertThrows(SQLException.class, () -> statement.execute("INSERT INTO ffb_v2_skill_use_preferences VALUES ('" + first + "','pro','always-use')"));
				assertThrows(SQLException.class, () -> statement.execute("INSERT INTO ffb_v2_skill_use_preferences VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','catch','always-use')"));
				assertThrows(SQLException.class, () -> statement.execute("INSERT INTO ffb_v2_skill_use_preferences VALUES ('" + first + "','catch','never')"));
			} finally {
				for (String table : new String[] {"ffb_match_recovery", "ffb_v2_saved_teams", "ffb_v2_skill_use_preferences", "ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_match_members", "ffb_v2_account", "ffb_local_schema"})
					statement.execute("DROP TABLE IF EXISTS " + table);
			}
		}
	}

	private TeamDraft draft(String name) {
		RosterCatalog catalog = new RosterCatalog();
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 11; slot++)
			players.add(new TeamDraft.Player("p" + slot, slot, slot, "Player " + slot, "lineman", Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>();
		for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
		return new TeamDraft(TeamDraft.FORMAT_VERSION, name, RosterCatalog.VERSION, "BB2025", "human",
			RosterCatalog.PRESET, "p1", players, resources);
	}
}
