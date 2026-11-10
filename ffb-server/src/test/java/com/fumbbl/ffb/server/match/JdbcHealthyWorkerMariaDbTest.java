package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.ServerMode;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.skilluse.JdbcSkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Clock;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Real authorization/membership/native/checkpoint/publication path; bounded provider and delivery doubles. */
class JdbcHealthyWorkerMariaDbTest {
	@TempDir Path logs;
	private static final String HOME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", AWAY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
	@Test void successfulHealthyAndColdProviderPathsMeasureFreshConnectionsAndFullWorkerOccupancy() throws Exception {
		String base = System.getenv("JDBC_BOUNDS_TEST_URL"), password = System.getenv("JDBC_BOUNDS_TEST_PASSWORD");
		Assumptions.assumeTrue(base != null && password != null, "Explicit synthetic JDBC bounds database required");
		if (!base.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_jdbc_bounds_test")) throw new IllegalArgumentException("Only synthetic JDBC bounds schema allowed");
		String url = base + "?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1";
		try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next()); }
		}
		JsonArray loads = new JsonArray(), actions = new JsonArray(), cold = new JsonArray(), warmup = new JsonArray(), warmupLoads = new JsonArray(), fixtureDigests = new JsonArray();
		FantasyFootballServer nativeServer = new FantasyFootballServer(ServerMode.STANDALONE, new Properties());
		nativeServer.setDebugLog(new DebugLog(nativeServer, logs.resolve("synthetic-worker.log").toFile(), logs.toFile(), 1));
		nativeServer.setCommunication(new ServerCommunication(nativeServer));
		try {
		try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
			sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)"); sql.execute("INSERT INTO ffb_local_schema VALUES (7)");
			for (String name : new String[] {"003-prepared-matches", "005-match-recovery", "006-v2-membership", "008-skill-use-preferences", "009-recovery-journal"}) resource(sql, name);
			sql.executeUpdate("INSERT INTO ffb_v2_account VALUES ('" + HOME + "','ACTIVE'),('" + AWAY + "','ACTIVE')");
			sql.executeUpdate("INSERT INTO ffb_v2_identity VALUES ('synthetic','home','" + HOME + "','ACTIVE'),('synthetic','away','" + AWAY + "','ACTIVE')");
			sql.executeUpdate("INSERT INTO ffb_v2_account_scope VALUES ('" + HOME + "','PLAYER'),('" + HOME + "','SPECTATOR'),('" + AWAY + "','PLAYER'),('" + AWAY + "','SPECTATOR')");
		}
		// Record a separate complete native warmup; do not disguise JVM/class warmup as steady-state p99.
		for (int repeat = -1; repeat < 20; repeat++) {
			SetupSessionMovementTest.Fixture engine = new SetupSessionMovementTest.Fixture(0, true);
			engine.advanceToTurn(); engine.session.startSaveResumeRetention(System.currentTimeMillis());
			String initial = engine.session.recoveryArtifact();
			String fixtureDirectory = System.getenv("JDBC_BOUNDS_FIXTURE_DIRECTORY");
			if (fixtureDirectory != null) {
				Path directory = Path.of(fixtureDirectory); if (!directory.isAbsolute()) throw new IllegalArgumentException("Fixture directory must be absolute");
				Files.createDirectories(directory); Path fixture = directory.resolve("synthetic-" + Math.max(0, repeat) % 3 + ".json");
				if (Files.exists(fixture)) initial = Files.readString(fixture); else Files.writeString(fixture, initial);
			}
			if (repeat >= 0) fixtureDigests.add(java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(initial.getBytes(StandardCharsets.UTF_8))));
			try (JdbcRequestConnections connections = new JdbcRequestConnections(url, "root", password, Boolean.parseBoolean(System.getenv("JDBC_BOUNDS_POOL")))) {
				JdbcMatchRepository prepared = new JdbcMatchRepository(connections::open);
				java.util.Map<String, MatchDocument.Request> history = new java.util.LinkedHashMap<>();
				history.put("home\nsynthetic-create", new MatchDocument.Request("create|00000000-0000-0000-0000-000000000011|1|away"));
				history.put("away\nsynthetic-join", new MatchDocument.Request("join|" + engine.document.matchId + "|1|00000000-0000-0000-0000-000000000012|1"));
				history.put("home\nsynthetic-activate", new MatchDocument.Request("activate|" + engine.document.matchId + "|2"));
				MatchDocument persisted = new MatchDocument(engine.document.matchId, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
					engine.document.home, engine.document.away, history);
				prepared.insert(new MatchRepository.Record(persisted.matchId, 3, new MatchJson().storageText(persisted)));
				JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(connections::open, true);
				assertTrue(recovery.save(new RecoveryRepository.Record(engine.document.matchId, 1, initial), 0));
				JdbcMatchMembershipRepository membership = new JdbcMatchMembershipRepository(connections);
				membership.insert(new MatchMembership(engine.document.matchId, HOME, "home")); membership.insert(new MatchMembership(engine.document.matchId, AWAY, "away"));
				SetupApplication application = new SetupApplication(nativeServer, new MatchService(prepared, null, new RosterCatalog()), recovery, true, true);
				application.configureStorageAdmission(connections::requireAvailable);
				application.configureSkillUsePreferences(new SkillUsePreferenceService(new JdbcSkillUsePreferenceRepository(connections), membership));
				AtomicInteger providerCalls = new AtomicInteger(), nextProviderDelay = new AtomicInteger();
				JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections::open, Clock.systemUTC());
				V2PrincipalDirectory boundedProviderDouble = new V2PrincipalDirectory() {
					public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected { return directory.authenticate(identity); }
					public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws java.sql.SQLException, V2PrincipalAuthenticator.Rejected {
						providerCalls.incrementAndGet();
						try { int delay = nextProviderDelay.getAndSet(0); if (delay > 0) Thread.sleep(delay); }
						catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new java.sql.SQLException("Synthetic provider interrupted", failure); }
						return directory.reauthorize(principal);
					}
				};
				V2MatchAccess access = new V2MatchAccess(membership, boundedProviderDouble, Clock.systemUTC());
				long expires = System.currentTimeMillis() + 3_600_000;
				AuthenticatedPrincipal home = new AuthenticatedPrincipal(HOME, EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), expires, "synthetic", "home");
				AuthenticatedPrincipal away = new AuthenticatedPrincipal(AWAY, EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), expires, "synthetic", "away");
				CaptureRequestProbe requestScope = new CaptureRequestProbe();
				CaptureRequestProbe.Publication publication = requestScope.publication(access, application, home, engine.document.matchId, 15);
				JsonObject[] current = {engine.session.reply("load", "ACCEPTED", false, "home").get("state").asObject()};
				for (int index = 0; index < 43; index++) {
					JsonObject request = load(engine.document.matchId, "healthy-load-" + index);
					JsonObject sample = measure(connections, providerCalls, publication, requestScope, access, application, home, request, current);
					if (index >= 3 && repeat >= 0) loads.add(sample);
					else warmupLoads.add(sample);
				}
				for (int index = 0; index < 10; index++) {
					JsonObject request = action(engine.document.matchId, "healthy-action-" + index, current[0]);
					AuthenticatedPrincipal principal = "home".equals(current[0].getString("actor", null)) ? home : away;
					JsonObject sample = measure(connections, providerCalls, publication, requestScope, access, application, principal, request, current);
					assertEquals(15, sample.getInt("deliveries", -1));
					if (repeat < 0) warmup.add(sample); else actions.add(sample);
				}
				nextProviderDelay.set(1000);
				JsonObject request = action(engine.document.matchId, "cold-provider-action", current[0]);
				AuthenticatedPrincipal principal = "home".equals(current[0].getString("actor", null)) ? home : away;
				JsonObject sample = measure(connections, providerCalls, publication, requestScope, access, application, principal, request, current);
				assertTrue(sample.getDouble("executionMs", 0) < 2000); cold.add(sample);
			}
			try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
				for (String table : new String[] {"ffb_match_recovery", "ffb_prepared_matches", "ffb_v2_match_members"}) sql.executeUpdate("DELETE FROM " + table);
			}
		}
		JsonObject report = new JsonObject().add("providerDouble", "zero-ms healthy/cache-hit; one 1000-ms cold operation; no production Firebase controls")
			.add("recipients", 16).add("loads", loads).add("actions", actions).add("cold", cold)
			.add("fixtureDigests", fixtureDigests)
			.add("warmupActions", warmup)
			.add("warmupLoads", warmupLoads)
			.add("loadP99Ms", p99(loads)).add("actionP99Ms", p99(actions));
		String output = System.getenv("JDBC_BOUNDS_MEASUREMENT_OUTPUT");
		if (output != null) { Path path = Path.of(output); if (!path.isAbsolute()) throw new IllegalArgumentException("Measurement output must be absolute"); Files.writeString(path, report.toString()); }
		System.out.println("JDBC_BOUNDS_HEALTHY " + new JsonObject().add("loadP99Ms", p99(loads)).add("actionP99Ms", p99(actions)).add("actionConnections", actions.get(0).asObject().getInt("connections", -1)));
		} finally {
			nativeServer.shutdownResources();
			try (Connection connection = DriverManager.getConnection(url, "root", password); Statement sql = connection.createStatement()) {
				for (String table : new String[] {"ffb_match_recovery_journal", "ffb_match_recovery", "ffb_prepared_matches", "ffb_v2_skill_use_preferences", "ffb_v2_account_scope", "ffb_v2_identity", "ffb_v2_account", "ffb_v2_match_members", "ffb_local_schema"}) sql.execute("DROP TABLE IF EXISTS " + table);
			}
		}
	}
	private JsonObject measure(JdbcRequestConnections connections, AtomicInteger providerCalls, CaptureRequestProbe.Publication publication,
		CaptureRequestProbe scope, V2MatchAccess access, SetupApplication application, AuthenticatedPrincipal principal, JsonObject request, JsonObject[] current) throws Exception {
		long opened = connections.connectionAttempts(), leases = connections.connectionAcquisitions(), acquisition = connections.acquisitionNanos(), started = System.nanoTime();
		long[] phases = new long[4];
		int calls = providerCalls.get(), deliveries = publication.accepted().getAsInt();
		scope.within(() -> {
			String role = access.playerRole(principal, request.getString("matchId", null));
			phases[0] = System.nanoTime();
			SetupApplication.HandleOutcome outcome = application.handleWithOutcome(role, request);
			phases[1] = System.nanoTime();
			assertEquals("ACCEPTED", outcome.response().getString("code", null));
			assertTrue(outcome.response().toString().length() > 0); // Include requester serialization.
			phases[2] = System.nanoTime();
			current[0] = outcome.response().get("state").asObject();
			if (outcome.publish()) publication.publish().accept(current[0]);
			phases[3] = System.nanoTime();
			return null;
		});
		double elapsed = (System.nanoTime() - started) / 1_000_000.0;
		assertTrue(elapsed < 2000, "Actual worker execution exceeded its ceiling: " + elapsed);
		return new JsonObject().add("executionMs", elapsed)
			.add("accessMs", (phases[0] - started) / 1_000_000.0).add("handleMs", (phases[1] - phases[0]) / 1_000_000.0)
			.add("serializeMs", (phases[2] - phases[1]) / 1_000_000.0).add("publicationMs", (phases[3] - phases[2]) / 1_000_000.0)
			.add("connections", connections.connectionAttempts() - opened).add("acquisitionMs", (connections.acquisitionNanos() - acquisition) / 1_000_000.0)
			.add("leases", connections.connectionAcquisitions() - leases)
			.add("providerCalls", providerCalls.get() - calls).add("deliveries", publication.accepted().getAsInt() - deliveries);
	}
	private double p99(JsonArray samples) { double[] values = new double[samples.size()]; for (int index = 0; index < values.length; index++) values[index] = samples.get(index).asObject().getDouble("executionMs", 0); Arrays.sort(values); return values[(int) Math.ceil(values.length * .99) - 1]; }
	private JsonObject load(String id, String requestId) { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "load").add("requestId", requestId).add("matchId", id); }
	private JsonObject action(String id, String requestId, JsonObject state) {
		for (JsonValue value : state.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", null)))
			return load(id, requestId).set("operation", "action").add("expectedRevision", state.getInt("revision", -1)).add("actionId", value.asObject().get("id"));
		throw new AssertionError("Expected regular end turn");
	}
	private void resource(Statement sql, String name) throws Exception { try (InputStream input = getClass().getResourceAsStream("/local-schema/" + name + ".sql")) { for (String statement : new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";")) if (!statement.isBlank()) sql.execute(statement); } }
}
