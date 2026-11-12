package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.BrowserConnection;
import com.fumbbl.ffb.server.local.BrowserSavedTeamJson;
import com.fumbbl.ffb.server.local.BrowserV2Adapter;
import com.fumbbl.ffb.server.local.CaptureLobbyLaneProbe;
import com.fumbbl.ffb.server.local.CaptureRequestProbe;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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
				lanes.add(new CaptureLobbyLaneProbe().measure(foreground, () -> {
					try { LobbyReadBudget budget = new LobbyReadBudget(); setup.browseDocuments(ids, budget); setup.browseStates(ids, budget); }
					catch (Exception failure) { throw new IllegalStateException(failure); }
				}, () -> fixture.session.reply("lane-gameplay", "ACCEPTED", false, "home")));
			}

			// Real SQL/driver regressions: all three invalid records preserve healthy neighboring entries.
			try (Connection connection = connections.open(); var update = connection.prepareStatement(
				"UPDATE ffb_match_recovery SET artifact_json=? WHERE matchid=?")) {
				update.setString(1, new RecoveryArtifactJson().encode(new JsonObject().add("matchId", ids.get(0)), 10000));
				update.setString(2, ids.get(0)); update.executeUpdate();
				update.setString(1, " ".repeat(LobbyReadBudget.RECORD_BYTES + 1));
				update.setString(2, ids.get(2)); update.executeUpdate();
				try (var tail = connection.prepareStatement("INSERT INTO ffb_match_recovery_journal(matchid,generation,record_json,decoded_bytes) VALUES (?,2,'{}',2)")) {
					tail.setString(1, ids.get(1)); tail.executeUpdate();
				}
				try (var generation = connection.prepareStatement("UPDATE ffb_match_recovery SET generation=2 WHERE matchid=?")) {
					generation.setString(1, ids.get(1)); generation.executeUpdate();
				}
			}
			Map<String, JsonObject> available = setup.browseStates(ids, new LobbyReadBudget());
			assertEquals(97, available.size());
			for (int index = 0; index < 3; index++) assertFalse(available.containsKey(ids.get(index)));
			assertEquals("PLAY", available.get(ids.get(3)).getString("phase", null));

			AuthenticatedPrincipal player = new AuthenticatedPrincipal("00000000-0000-0000-0000-000000000001",
				EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), Long.MAX_VALUE);
			V2MatchAccess access = mock(V2MatchAccess.class);
			when(access.currentMatches(player, null)).thenReturn(ids.stream().map(id -> new MatchMembership(id, player.accountId(), "home")).toList());
			when(access.browse(player)).thenReturn(ids);
			BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> player, access, setup, mock(MatchService.class),
				mock(V2PreparationService.class), mock(BrowserSavedTeamJson.class));
			List<String> replies = new ArrayList<>(); BrowserConnection browser = replies::add;
			adapter.receive(browser, new JsonObject().add("version", 2).add("type", "authenticate").add("requestId", "auth").add("bearer", "test").toString());
			adapter.receive(browser, new JsonObject().add("version", 2).add("type", "currentMatches").add("requestId", "mixed").add("after", JsonValue.NULL).toString());
			JsonObject page = JsonObject.readFrom(replies.get(1)); assertEquals("ACCEPTED", page.getString("code", null));
			JsonArray entries = page.get("matches").asArray(); assertEquals(100, entries.size());
			for (int index = 0; index < 3; index++) {
				assertEquals(ids.get(index), entries.get(index).asObject().getString("matchId", null));
				assertEquals("UNAVAILABLE", entries.get(index).asObject().getString("lifecycle", null));
			}
			assertEquals("PLAY", entries.get(3).asObject().getString("phase", null));
			adapter.receive(browser, new JsonObject().add("version", 2).add("type", "browse").add("requestId", "mixed-browse").add("includeDetails", true).toString());
			JsonObject browse = JsonObject.readFrom(replies.get(2)); assertEquals("ACCEPTED", browse.getString("code", null));
			assertEquals(100, browse.get("matches").asArray().size()); adapter.disconnect(browser);

			assertEquals(0, setup.lifecycleMetrics().getInt("residentSessions", -1));
		}
		String output = System.getenv("LOBBY_READ_TEST_OUTPUT");
		if (output != null) Files.writeString(Path.of(output), new JsonObject().add("samples", samples).add("laneComparison", lanes).toString());
	}
}
