package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcFaultProxy;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;
import com.fumbbl.ffb.server.match.JdbcV2PrincipalDirectory;
import com.fumbbl.ffb.server.match.MatchMembership;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;
import com.fumbbl.ffb.server.match.VerifiedIdentity;
import com.fumbbl.ffb.server.skilluse.JdbcSkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Explicit opt-in, empty synthetic loopback schema. Never accesses review or application databases. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JdbcBoundsMariaDbTest {
	private String base, password;
	private int port;
	private boolean initialized;
	private static final String ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private final CaptureRequestProbe requests = new CaptureRequestProbe();
	@BeforeAll void schema() throws Exception {
		base = System.getenv("JDBC_BOUNDS_TEST_URL"); password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit synthetic JDBC bounds database required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		port = URI.create(base.substring(5)).getPort();
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next(), "Schema must start empty"); }
			initialized = true;
			sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (7)");
			resource(sql, "/local-schema/006-v2-membership.sql"); resource(sql, "/local-schema/008-skill-use-preferences.sql");
			sql.executeUpdate("INSERT INTO ffb_v2_account VALUES ('" + ACCOUNT + "','ACTIVE')");
			sql.execute("CREATE TABLE budget_lock(id INT PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB");
			sql.executeUpdate("INSERT INTO budget_lock VALUES (1,0)");
		}
	}
	@AfterAll void clean() throws Exception {
		if (!initialized) return;
		try (Connection connection = direct(); Statement sql = connection.createStatement()) {
			for (String table : new String[] {"budget_lock", "ffb_v2_skill_use_preferences", "ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members", "ffb_local_schema"}) sql.execute("DROP TABLE IF EXISTS " + table);
		}
	}
	@Test void everyFreshSessionUsesConfiguredLockPolicyAndOrdinaryLockErrorsDoNotTripBreaker() throws Exception {
		try (JdbcRequestConnections connections = bounded(port); Connection blocker = direct(); Statement lock = blocker.createStatement()) {
			blocker.setAutoCommit(false); lock.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1");
			for (int repeat = 0; repeat < 4; repeat++) requests.within(() -> {
				try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
					try (var row = sql.executeQuery("SELECT @@session.innodb_lock_wait_timeout")) { assertTrue(row.next()); assertEquals(1, row.getInt(1)); }
					SQLException failure = assertThrows(SQLException.class, () -> sql.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1"));
					assertEquals(1205, failure.getErrorCode());
				}
				return null;
			});
			assertEquals(4, connections.connectionAttempts()); blocker.rollback();
			requests.within(() -> { try (Connection connection = connections.open(); Statement sql = connection.createStatement()) { assertEquals(1, sql.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1")); } return null; });
		}
	}
	@Test void lateProviderDoubleLeavesLessThanOneSecondForActualLockWaitAndWorkerReturns() throws Exception {
		try (JdbcRequestConnections connections = bounded(port); Connection blocker = direct(); Statement lock = blocker.createStatement()) {
			blocker.setAutoCommit(false); lock.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1");
			long started = System.nanoTime();
			requests.within(() -> {
				Thread.sleep(1100); // Declared bounded cold-provider double, not production Firebase enforcement.
				try (Connection connection = connections.open(); Statement sql = connection.createStatement()) {
					assertTrue(connection.getNetworkTimeout() < 850);
					long waited = System.nanoTime();
					assertThrows(SQLException.class, () -> sql.executeUpdate("UPDATE budget_lock SET value=value+1 WHERE id=1"));
					assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - waited) < 1000);
				} catch (SQLException cleanup) { /* Timed-out transport cleanup retains the primary failure. */ }
				return null;
			});
			assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 2000);
			blocker.rollback();
			requests.within(() -> { try (Connection connection = connections.open(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT 1")) { assertTrue(row.next()); } return null; });
		}
	}
	@Test void membershipAutocommitAcknowledgementLossReconcilesOrRetriesWithoutConflictingOverwrite() throws Exception {
		for (JdbcFaultProxy.Fault fault : new JdbcFaultProxy.Fault[] {JdbcFaultProxy.Fault.WRITE_COMMITTED, JdbcFaultProxy.Fault.WRITE_UNCOMMITTED}) {
			try (JdbcFaultProxy relay = new JdbcFaultProxy(port, fault); JdbcRequestConnections connections = bounded(relay.port())) {
				JdbcMatchMembershipRepository repository = new JdbcMatchMembershipRepository(connections);
				MatchMembership member = new MatchMembership(UUID.randomUUID().toString(), ACCOUNT, "home");
				if (fault == JdbcFaultProxy.Fault.WRITE_COMMITTED) requests.within(() -> { repository.insert(member); return null; });
				else assertThrows(MatchMembershipRepository.OutcomeUnknown.class, () -> requests.within(() -> { repository.insert(member); return null; }));
				assertTrue(relay.injected());
				requests.within(() -> { repository.insert(member); assertEquals("home", repository.find(member.matchId, member.accountId).role); return null; });
				assertThrows(SQLException.class, () -> requests.within(() -> { repository.insert(new MatchMembership(member.matchId, member.accountId, "away")); return null; }));
			}
		}
	}
	@Test void preferenceAcknowledgementLossConfirmsOnlyTheRequestedDurableMode() throws Exception {
		for (JdbcFaultProxy.Fault fault : new JdbcFaultProxy.Fault[] {JdbcFaultProxy.Fault.WRITE_COMMITTED, JdbcFaultProxy.Fault.WRITE_UNCOMMITTED}) {
			try (JdbcRequestConnections seed = bounded(port)) { new JdbcSkillUsePreferenceRepository(seed).update(ACCOUNT, SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_USE); }
			try (JdbcFaultProxy relay = new JdbcFaultProxy(port, fault); JdbcRequestConnections connections = bounded(relay.port())) {
				JdbcSkillUsePreferenceRepository repository = new JdbcSkillUsePreferenceRepository(connections);
				if (fault == JdbcFaultProxy.Fault.WRITE_COMMITTED) requests.within(() -> { repository.update(ACCOUNT, SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK); return null; });
				else assertThrows(SkillUsePreferenceRepository.OutcomeUnknown.class, () -> requests.within(() -> { repository.update(ACCOUNT, SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK); return null; }));
				assertTrue(relay.injected());
				requests.within(() -> { repository.update(ACCOUNT, SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK); assertEquals(SkillUsePreferences.Mode.ALWAYS_ASK, repository.load(ACCOUNT).mode(SkillUsePreferences.UseCase.CATCH)); return null; });
			}
		}
	}
	@Test void principalCreationCommitLossReconcilesBindingAndNeverCreatesDuplicateAccounts() throws Exception {
		for (JdbcFaultProxy.Fault fault : new JdbcFaultProxy.Fault[] {JdbcFaultProxy.Fault.COMMIT_COMMITTED, JdbcFaultProxy.Fault.COMMIT_UNCOMMITTED}) {
			int before = accounts();
			try (JdbcFaultProxy relay = new JdbcFaultProxy(port, fault); JdbcRequestConnections connections = bounded(relay.port())) {
				JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections::open, Clock.systemUTC());
				VerifiedIdentity identity = new VerifiedIdentity("synthetic", UUID.randomUUID().toString(), System.currentTimeMillis() + 60_000, System.currentTimeMillis());
				if (fault == JdbcFaultProxy.Fault.COMMIT_COMMITTED) requests.within(() -> directory.authenticate(identity));
				else assertThrows(V2PrincipalDirectory.CreationOutcomeUnknown.class, () -> requests.within(() -> directory.authenticate(identity)));
				assertTrue(relay.injected());
				AuthenticatedPrincipal first = requests.within(() -> directory.authenticate(identity));
				assertEquals(first.accountId(), requests.within(() -> directory.authenticate(identity)).accountId());
				assertEquals(before + 1, accounts());
			}
		}
	}
	@Test void lostCloseAcknowledgementsAreReadBackForMembershipPrincipalAndPreferences() throws Exception {
		try (JdbcRequestConnections connections = bounded(port)) {
			MatchMembership member = new MatchMembership(UUID.randomUUID().toString(), ACCOUNT, "home");
			JdbcMatchMembershipRepository memberships = new JdbcMatchMembershipRepository(firstCloseFails(connections));
			requests.within(() -> { memberships.insert(member); return null; });
			assertEquals("home", memberships.find(member.matchId, member.accountId).role);
			JdbcSkillUsePreferenceRepository preferences = new JdbcSkillUsePreferenceRepository(firstCloseFails(connections));
			requests.within(() -> { preferences.update(ACCOUNT, SkillUsePreferences.UseCase.FEND, SkillUsePreferences.Mode.ALWAYS_ASK); return null; });
			assertEquals(SkillUsePreferences.Mode.ALWAYS_ASK, preferences.load(ACCOUNT).mode(SkillUsePreferences.UseCase.FEND));
			JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(firstCloseFails(connections)::open, Clock.systemUTC());
			VerifiedIdentity identity = new VerifiedIdentity("synthetic", UUID.randomUUID().toString(), System.currentTimeMillis() + 60_000, System.currentTimeMillis());
			AuthenticatedPrincipal principal = requests.within(() -> directory.authenticate(identity));
			assertEquals(principal.accountId(), directory.authenticate(identity).accountId());
		}
	}
	@Test void transactionalMembershipAndPreferenceCommitsReconcileBothActualOutcomes() throws Exception {
		for (JdbcFaultProxy.Fault fault : new JdbcFaultProxy.Fault[] {JdbcFaultProxy.Fault.COMMIT_COMMITTED, JdbcFaultProxy.Fault.COMMIT_UNCOMMITTED}) {
			try (JdbcFaultProxy relay = new JdbcFaultProxy(port, fault); JdbcRequestConnections connections = bounded(relay.port(), false)) {
				JdbcMatchMembershipRepository repository = new JdbcMatchMembershipRepository(connections);
				MatchMembership member = new MatchMembership(UUID.randomUUID().toString(), ACCOUNT, "home");
				if (fault == JdbcFaultProxy.Fault.COMMIT_COMMITTED) requests.within(() -> { repository.insert(member); return null; });
				else assertThrows(MatchMembershipRepository.OutcomeUnknown.class, () -> requests.within(() -> { repository.insert(member); return null; }));
				requests.within(() -> { repository.insert(member); return null; }); assertTrue(relay.injected());
			}
			try (JdbcRequestConnections seed = bounded(port)) { new JdbcSkillUsePreferenceRepository(seed).update(ACCOUNT, SkillUsePreferences.UseCase.GRAB, SkillUsePreferences.Mode.ALWAYS_USE); }
			try (JdbcFaultProxy relay = new JdbcFaultProxy(port, fault); JdbcRequestConnections connections = bounded(relay.port(), false)) {
				JdbcSkillUsePreferenceRepository repository = new JdbcSkillUsePreferenceRepository(connections);
				if (fault == JdbcFaultProxy.Fault.COMMIT_COMMITTED) requests.within(() -> { repository.update(ACCOUNT, SkillUsePreferences.UseCase.GRAB, SkillUsePreferences.Mode.ALWAYS_ASK); return null; });
				else assertThrows(SkillUsePreferenceRepository.OutcomeUnknown.class, () -> requests.within(() -> { repository.update(ACCOUNT, SkillUsePreferences.UseCase.GRAB, SkillUsePreferences.Mode.ALWAYS_ASK); return null; }));
				requests.within(() -> { repository.update(ACCOUNT, SkillUsePreferences.UseCase.GRAB, SkillUsePreferences.Mode.ALWAYS_ASK); return null; }); assertTrue(relay.injected());
			}
		}
	}
	private JdbcMatchMembershipRepository.Connections firstCloseFails(JdbcRequestConnections source) {
		AtomicBoolean first = new AtomicBoolean(true);
		return () -> {
			Connection raw = source.open();
			return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class}, (self, method, arguments) -> {
				try {
					Object result = method.invoke(raw, arguments);
					if (method.getName().equals("close") && first.compareAndSet(true, false)) throw new SQLException("Synthetic post-close acknowledgement loss", "08000");
					return result;
				} catch (InvocationTargetException failure) { throw failure.getCause(); }
			});
		};
	}
	private int accounts() throws SQLException { try (Connection connection = direct(); Statement sql = connection.createStatement(); var row = sql.executeQuery("SELECT COUNT(*) FROM ffb_v2_account")) { row.next(); return row.getInt(1); } }
	private Connection direct() throws SQLException { return DriverManager.getConnection(base + "?connectTimeout=500&socketTimeout=1500", "root", password); }
	private JdbcRequestConnections bounded(int targetPort) {
		return bounded(targetPort, true);
	}
	private JdbcRequestConnections bounded(int targetPort, boolean autoCommit) {
		return new JdbcRequestConnections("jdbc:mariadb://127.0.0.1:" + targetPort + "/ffb_jdbc_bounds_test?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1&autocommit=" + autoCommit, "root", password, Boolean.parseBoolean(System.getenv("JDBC_BOUNDS_POOL")));
	}
	private void resource(Statement sql, String name) throws Exception {
		try (InputStream input = getClass().getResourceAsStream(name)) {
			String text = new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "");
			for (String statement : text.split(";")) if (!statement.isBlank()) sql.execute(statement);
		}
	}
}
