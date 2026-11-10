package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/** Opt-in real-driver page capture. The runner owns an empty synthetic schema. */
class JdbcLobbyReadMariaDbTest {
	@Test void maximumNonresidentPageHasFixedQueriesAndPreservesPublicContent() throws Exception {
		String url = System.getenv("LOBBY_READ_TEST_URL"), password = System.getenv("LOBBY_READ_TEST_PASSWORD");
		Assumptions.assumeTrue(url != null && password != null, "Explicit synthetic lobby database required");
		if (!url.matches("jdbc:mariadb://127\\.0\\.0\\.1:[0-9]+/ffb_lobby_read_test")) throw new IllegalArgumentException("Synthetic schema only");
		url += "?connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1";
		try (Connection connection = DriverManager.getConnection(url, "root", password); var sql = connection.createStatement()) {
			try (var rows = sql.executeQuery("SHOW TABLES")) { assertFalse(rows.next()); }
			sql.execute("CREATE TABLE ffb_local_schema(version INT PRIMARY KEY)");
			sql.execute("INSERT INTO ffb_local_schema VALUES (8)");
			for (String name : List.of("003-prepared-matches", "005-match-recovery", "009-recovery-journal")) {
				try (var input = getClass().getResourceAsStream("/local-schema/" + name + ".sql")) {
					for (String statement : new String(input.readAllBytes(), StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*", "").split(";"))
						if (!statement.isBlank()) sql.execute(statement);
				}
			}
		}
		AtomicInteger opens = new AtomicInteger();
		JsonArray samples = new JsonArray();
		JsonArray lanes = new JsonArray();
		try (JdbcRequestConnections connections = new JdbcRequestConnections(url, "root", password)) {
			JdbcMatchRepository prepared = new JdbcMatchRepository(() -> { opens.incrementAndGet(); return connections.open(); });
			SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
			List<String> ids = new ArrayList<>();
			JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(() -> { opens.incrementAndGet(); return connections.open(); }, true);
			for (int index = 0; index < 100; index++) {
				String id = String.format("00000000-0000-0000-0001-%012d", index); ids.add(id);
				Map<String, MatchDocument.Request> history = new LinkedHashMap<>();
				history.put("home\ncreate", new MatchDocument.Request("create|00000000-0000-0000-0000-000000000011|1|away"));
				history.put("away\njoin", new MatchDocument.Request("join|" + id + "|1|00000000-0000-0000-0000-000000000012|1"));
				history.put("home\nactivate", new MatchDocument.Request("activate|" + id + "|2"));
				MatchDocument document = new MatchDocument(id, 3, "away", MatchDocument.Lifecycle.ACTIVATED, fixture.document.home, fixture.document.away, history);
				prepared.insert(new MatchRepository.Record(id, 3, new MatchJson().storageText(document)));
				JsonObject view = new JsonObject().add("matchId", id).add("callerRole", "home").add("phase", "PLAY").add("half", 1).add("turn", 3).add("homeScore", 0).add("awayScore", 1);
				String artifact = new RecoveryArtifactJson().encode(new JsonObject().add("matchId", id).add("failed", false).add("homeView", view), 10000);
				recovery.save(new RecoveryRepository.Record(id, 1, artifact), 0);
			}
			SetupApplication setup = new SetupApplication(fixture.server, new MatchService(prepared, null, new RosterCatalog()), recovery);
			for (int count : List.of(1, 100)) for (int repeat = -1; repeat < 20; repeat++) {
				int before = opens.get(); long started = System.nanoTime();
				final int iteration = repeat;
				JsonObject request = new JsonObject().add("version", 2).add("type", "browse").add("requestId", "read-" + count + "-" + (repeat + 1));
				new CaptureRequestProbe().measureChecked(request, () -> {
					LobbyReadBudget budget = new LobbyReadBudget();
					long documentsStart = System.nanoTime();
					Map<String, MatchDocument> documents = setup.browseDocuments(ids.subList(0, count), budget);
					long stateStart = System.nanoTime();
					Map<String, JsonObject> states = setup.browseStates(ids.subList(0, count), budget);
					long serializeStart = System.nanoTime();
					JsonArray entries = new JsonArray();
					for (String id : ids.subList(0, count)) {
						assertEquals(id, documents.get(id).matchId); assertEquals("PLAY", states.get(id).getString("phase", null));
						entries.add(new JsonObject().add("matchId", id).add("phase", states.get(id).get("phase")));
					}
					JsonObject response = new JsonObject().add("type", "browse").add("requestId", request.get("requestId")).add("code", "ACCEPTED").add("matches", entries);
					budget.response(response); String serialized = response.toString();
					samples.add(new JsonObject().add("entries", count).add("warmup", iteration < 0).add("documentMs", (stateStart - documentsStart) / 1e6)
						.add("recoveryParseMs", (serializeStart - stateStart) / 1e6).add("serializationMs", (System.nanoTime() - serializeStart) / 1e6)
						.add("responseBytes", serialized.getBytes(StandardCharsets.UTF_8).length).add("connections", opens.get() - before));
					return response;
				});
				assertEquals(2, opens.get() - before);
				samples.get(samples.size() - 1).asObject().add("executionMs", (System.nanoTime() - started) / 1e6).add("queries", 3);
			}
			for (boolean foreground : List.of(true, false)) {
				lanes.add(new com.fumbbl.ffb.server.local.CaptureLobbyLaneProbe().measure(foreground, () -> {
					try { LobbyReadBudget budget = new LobbyReadBudget(); setup.browseDocuments(ids, budget); setup.browseStates(ids, budget); }
					catch (Exception failure) { throw new IllegalStateException(failure); }
				}, () -> fixture.session.reply("lane-gameplay", "ACCEPTED", false, "home")));
			}

			assertEquals(0, setup.lifecycleMetrics().getInt("residentSessions", -1));
		}
		String output = System.getenv("LOBBY_READ_TEST_OUTPUT");
		if (output != null) Files.writeString(Path.of(output), new JsonObject().add("samples", samples).add("laneComparison", lanes).toString());
	}
}
