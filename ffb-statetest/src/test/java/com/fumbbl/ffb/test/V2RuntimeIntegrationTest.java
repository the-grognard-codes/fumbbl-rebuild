package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.local.BrowserMatchAdapter;
import com.fumbbl.ffb.server.local.BrowserSavedTeamJson;
import com.fumbbl.ffb.server.local.BrowserV2Adapter;
import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;
import com.fumbbl.ffb.server.match.JdbcMatchRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.JdbcV2PrincipalDirectory;
import com.fumbbl.ffb.server.match.MatchRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.VerifiedIdentity;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/** Real marker-6 MariaDB and native R2 engine; provider authentication is an explicit test double. */
class V2RuntimeIntegrationTest {
	@Test void twoAccountsAndViewerShareNativeStateAndRecoverWithoutReexecuting() throws Exception {
		String url = System.getenv("M6_TEST_JDBC_URL");
		assumeTrue(url != null, "Opt-in isolated marker-6 database required");
		assertTrue(url.startsWith("jdbc:mariadb://127.0.0.1:"));
		String password = new String(Files.readAllBytes(Paths.get(System.getenv("M6_TEST_PASSWORD_FILE"))), StandardCharsets.UTF_8).trim();
		JdbcMatchMembershipRepository.Connections connections = () -> DriverManager.getConnection(url, "root", password);
		try (Connection connection = connections.open(); java.sql.Statement statement = connection.createStatement(); java.sql.ResultSet rows = statement.executeQuery("SELECT version FROM ffb_local_schema")) {
			assertTrue(rows.next()); assertEquals(6, rows.getInt(1));
		}
		String run = UUID.randomUUID().toString();
		BrowserV2Adapter adapter = runtime(connections, run);
		Peer home = new Peer(), away = new Peer(), viewer = new Peer();
		authenticate(adapter, home, "home"); authenticate(adapter, away, "away"); authenticate(adapter, viewer, "viewer");
		String homeTeam = saved(adapter, home), awayTeam = saved(adapter, away);
		JsonObject created = send(adapter, home, request("preparedMatch").add("operation", "create").add("teamId", homeTeam).add("expectedDocumentVersion", 1));
		accepted(created);
		String match = created.get("document").asObject().getString("matchId", null);
		JsonObject join = request("preparedMatch").add("operation", "join").add("invitationCode", created.get("invitationCode"))
			.add("teamId", awayTeam).add("expectedDocumentVersion", 1);
		accepted(send(adapter, away, join)); assertTrue(send(adapter, away, join).getBoolean("duplicate", false));
		assertEquals("preparationChanged", home.last.getString("type", null));
		accepted(send(adapter, away, request("preparedMatch").add("operation", "activate").add("matchId", match).add("expectedRevision", 2)));
		assertEquals("preparationChanged", home.last.getString("type", null));
		JsonObject initial = send(adapter, home, load(match)).get("state").asObject();
		accepted(send(adapter, away, load(match)));
		JsonObject watched = send(adapter, viewer, request("watch").add("matchId", match)); accepted(watched);
		assertEquals(initial.set("callerRole", "spectator"), watched.get("state"));
		JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(connections::open);
		String before = recovery.find(match).json;
		JsonObject choice = request("setup").add("operation", "choice").add("matchId", match)
			.add("expectedRevision", initial.get("revision")).add("promptId", initial.get("prompt").asObject().get("id"))
			.add("optionId", "heads");
		assertEquals("NOT_FOUND", send(adapter, viewer, choice).getString("code", null));
		assertEquals(before, recovery.find(match).json);
		Peer actor = "home".equals(initial.getString("actor", null)) ? home : away;
		JsonObject changed = send(adapter, actor, choice); accepted(changed);
		JsonObject state = changed.get("state").asObject();
		assertEquals(JsonObject.readFrom(state.toString()).set("callerRole", "spectator"), viewer.last.get("state"));
		String after = recovery.find(match).json;
		BrowserV2Adapter recreated = runtime(connections, run);
		Peer restoredViewer = new Peer(), restoredActor = new Peer();
		authenticate(recreated, restoredViewer, "viewer");
		JsonObject restored = send(recreated, restoredViewer, request("watch").add("matchId", match)); accepted(restored);
		assertEquals(viewer.last.get("state"), restored.get("state"));
		authenticate(recreated, restoredActor, actor == home ? "home" : "away");
		JsonObject repeated = send(recreated, restoredActor, choice); accepted(repeated); assertTrue(repeated.getBoolean("duplicate", false));
		assertEquals(after, recovery.find(match).json);
		// Reach actual setup, persist the default formation, then reconstruct a fresh runtime.
		Peer restoredOther = new Peer(); authenticate(recreated, restoredOther, actor == home ? "away" : "home");
		JsonObject receive = request("setup").add("operation", "choice").add("matchId", match)
			.add("expectedRevision", state.get("revision")).add("promptId", state.get("prompt").asObject().get("id")).add("optionId", "receive");
		Peer receiver = state.getString("actor", null).equals(initial.getString("actor", null)) ? restoredActor : restoredOther;
		JsonObject deployed = send(recreated, receiver, receive); accepted(deployed);
		JsonObject deployedState = deployed.get("state").asObject();
		assertEquals("SETUP", deployedState.getString("phase", null));
		int placed = 0;
		for (com.eclipsesource.json.JsonValue player : deployedState.get("players").asArray()) if (!player.asObject().get("x").isNull()) placed++;
		assertEquals(11, placed);
		String deployedArtifact = recovery.find(match).json;
		BrowserV2Adapter finalRuntime = runtime(connections, run); Peer finalViewer = new Peer(); authenticate(finalRuntime, finalViewer, "viewer");
		JsonObject finalState = send(finalRuntime, finalViewer, request("watch").add("matchId", match)); accepted(finalState);
		assertEquals(JsonObject.readFrom(deployedState.toString()).set("callerRole", "spectator"), finalState.get("state"));
		assertEquals(deployedArtifact, recovery.find(match).json);
		System.out.println("V2 native integration PASS: match=" + match + ", revision=" + deployedState.getInt("revision", -1) + ", preparation-notification/default-setup/recovery/exact-retry=true");
	}

	@Test void uncertainTerminalCommitPublishesOneFinalFrameAfterExactRetry() throws Exception {
		String url = System.getenv("M6_TEST_JDBC_URL");
		assumeTrue(url != null, "Opt-in isolated marker-6 database required");
		assertTrue(url.startsWith("jdbc:mariadb://127.0.0.1:"));
		String password = new String(Files.readAllBytes(Paths.get(System.getenv("M6_TEST_PASSWORD_FILE"))), StandardCharsets.UTF_8).trim();
		JdbcMatchMembershipRepository.Connections connections = () -> DriverManager.getConnection(url, "root", password);
		try (Connection connection = connections.open(); java.sql.Statement statement = connection.createStatement();
			java.sql.ResultSet rows = statement.executeQuery("SELECT version FROM ffb_local_schema")) {
			assertTrue(rows.next()); assertEquals(6, rows.getInt(1));
		}
		String run = UUID.randomUUID().toString();
		RosterCatalog catalog = new RosterCatalog(); Clock clock = Clock.systemUTC();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		MatchRepository durable = new JdbcMatchRepository(connections::open);
		boolean[] loseAcknowledgement = {false}; int[] completionWrites = {0};
		MatchRepository faulting = new MatchRepository() {
			public Record find(String id) throws SQLException { return durable.find(id); }
			public void insert(Record record) throws SQLException { durable.insert(record); }
			public boolean replace(Record record, int expected) throws SQLException {
				boolean replaced = durable.replace(record, expected);
				if (record.documentVersion == 4 && replaced) {
					completionWrites[0]++;
					if (loseAcknowledgement[0]) {
						loseAcknowledgement[0] = false;
						throw new OutcomeUnknown(record, new SQLException("simulated lost acknowledgement after real commit"));
					}
				}
				return replaced;
			}
		};
		MatchService matches = new MatchService(faulting, teams, catalog);
		JdbcRecoveryRepository recovery = new JdbcRecoveryRepository(connections::open);
		SetupApplication setup = new SetupApplication(new TestServer().getServer(), matches, recovery, true, true);
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections::open, clock);
		V2PrincipalAuthenticator verifier = bearer -> {
			try { return directory.authenticate(new VerifiedIdentity("local-test-issuer", run + "-" + bearer, clock.millis() + 3600000)); }
			catch (SQLException failure) { throw new V2PrincipalAuthenticator.Rejected(); }
		};
		BrowserV2Adapter adapter = new BrowserV2Adapter(verifier,
			new V2MatchAccess(new JdbcMatchMembershipRepository(connections::open), directory, clock), setup, matches,
			new V2PreparationService(connections::open, teams, catalog, clock), new BrowserSavedTeamJson(teams, true));
		Peer home = new Peer(), away = new Peer(), viewer = new Peer();
		authenticate(adapter, home, "home"); authenticate(adapter, away, "away"); authenticate(adapter, viewer, "viewer");
		String homeTeam = saved(adapter, home), awayTeam = saved(adapter, away);
		JsonObject created = send(adapter, home, request("preparedMatch").add("operation", "create")
			.add("teamId", homeTeam).add("expectedDocumentVersion", 1)); accepted(created);
		String match = created.get("document").asObject().getString("matchId", null);
		accepted(send(adapter, away, request("preparedMatch").add("operation", "join")
			.add("invitationCode", created.get("invitationCode")).add("teamId", awayTeam).add("expectedDocumentVersion", 1)));
		accepted(send(adapter, away, request("preparedMatch").add("operation", "activate")
			.add("matchId", match).add("expectedRevision", 2)));
		JsonObject initial = send(adapter, home, load(match)).get("state").asObject();
		accepted(send(adapter, away, load(match)));
		accepted(send(adapter, viewer, request("watch").add("matchId", match)));
		SetupSession session = (SetupSession) ((Map<?, ?>) field(setup, "sessions")).get(match);
		GameState engine = (GameState) field(session, "state");
		JsonObject view = initial, terminalRequest = null;
		Peer terminalActor = null, opponent = null;
		int peerFrames = -1, viewerFrames = -1;
		loseAcknowledgement[0] = true;
		for (int index = 0; index < 160 && !session.isComplete(); index++) {
			JsonObject next = request("setup").add("matchId", match);
			String role = view.getString("actor", null);
			if (!view.get("prompt").isNull()) {
				JsonObject prompt = view.get("prompt").asObject();
				next.add("operation", "choice").add("expectedRevision", view.get("revision"))
					.add("promptId", prompt.get("id")).add("optionId", prompt.get("options").asArray().get(0));
			} else if ("SETUP".equals(view.getString("phase", null))) {
				next.add("operation", "confirm").add("expectedRevision", view.get("revision"));
			} else {
				JsonObject action = view.get("actions").asArray().get(0).asObject();
				if ("READY_FOR_KICKOFF".equals(view.getString("phase", null))) {
					engine.getDiceRoller().clearTestRolls();
					TestRolls.on(engine).general(1, 1, 3, 3, 3, 3, 3, 3);
					action = view.get("actions").asArray().get(82).asObject();
				} else for (com.eclipsesource.json.JsonValue candidate : view.get("actions").asArray())
					if ("endTurn".equals(candidate.asObject().getString("kind", null))) action = candidate.asObject();
				role = action.getString("actor", null);
				next.add("operation", "action").add("expectedRevision", view.get("revision"))
					.add("actionId", action.get("id"));
			}
			Peer acting = "home".equals(role) ? home : away;
			Peer other = acting == home ? away : home;
			int beforePeer = other.unsolicited.size(), beforeViewer = viewer.unsolicited.size();
			JsonObject response = send(adapter, acting, next);
			if ("MATCH_OUTCOME_UNKNOWN".equals(response.getString("code", null))) {
				terminalRequest = next; terminalActor = acting; opponent = other;
				peerFrames = beforePeer; viewerFrames = beforeViewer;
				assertEquals(beforePeer, other.unsolicited.size());
				assertEquals(beforeViewer, viewer.unsolicited.size());
				break;
			}
			accepted(response);
			view = response.get("state").asObject();
		}
		assertTrue(session.isComplete(), "Native match did not reach full time");
		assertTrue(terminalRequest != null, "The terminal commit did not lose its acknowledgement");
		String committedCheckpoint = recovery.find(match).json;
		JsonObject retry = send(adapter, terminalActor, terminalRequest); accepted(retry);
		assertTrue(retry.getBoolean("duplicate", false));
		assertEquals(1, completionWrites[0]);
		assertEquals(committedCheckpoint, recovery.find(match).json);
		assertEquals(peerFrames + 1, opponent.unsolicited.size());
		assertEquals("FULL_TIME", opponent.unsolicited.get(peerFrames).get("state").asObject().getString("phase", null));
		assertEquals(viewerFrames + 1, viewer.unsolicited.size());
		JsonObject finalSpectator = viewer.unsolicited.get(viewerFrames).get("state").asObject();
		assertEquals("FULL_TIME", finalSpectator.getString("phase", null));
		assertEquals("spectator", finalSpectator.getString("callerRole", null));
		accepted(send(adapter, terminalActor, terminalRequest));
		assertEquals(peerFrames + 1, opponent.unsolicited.size());
		assertEquals(viewerFrames + 1, viewer.unsolicited.size());
		assertEquals(1, completionWrites[0]);
		JsonObject metadata = send(adapter, home, request("matchResult").add("operation", "load").add("matchId", match));
		accepted(metadata);
		assertEquals(2, metadata.getInt("version", -1));
		int last = metadata.get("result").asObject().getInt("eventCount", 0) - 1;
		JsonObject replay = send(adapter, away, request("matchResult").add("operation", "replay").add("matchId", match).add("index", last));
		accepted(replay);
		assertEquals("FULL_TIME", replay.get("event").asObject().getString("kind", null));
		assertEquals("NOT_FOUND", send(adapter, viewer, request("matchResult").add("operation", "load").add("matchId", match)).getString("code", null));
	}

	private Object field(Object target, String name) throws Exception {
		Field field = target.getClass().getDeclaredField(name);
		field.setAccessible(true);
		return field.get(target);
	}

	private BrowserV2Adapter runtime(JdbcMatchMembershipRepository.Connections connections, String run) throws Exception {
		RosterCatalog catalog = new RosterCatalog(); Clock clock = Clock.systemUTC();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		MatchService matches = new MatchService(new JdbcMatchRepository(connections::open), teams, catalog);
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections::open, clock);
		V2PrincipalAuthenticator verifier = bearer -> {
			try { return directory.authenticate(new VerifiedIdentity("local-test-issuer", run + "-" + bearer, clock.millis() + 3600000)); }
			catch (SQLException failure) { throw new V2PrincipalAuthenticator.Rejected(); }
		};
		return new BrowserV2Adapter(verifier, new V2MatchAccess(new JdbcMatchMembershipRepository(connections::open), directory, clock),
			new SetupApplication(new TestServer().getServer(), matches, new JdbcRecoveryRepository(connections::open), true, true), matches,
			new V2PreparationService(connections::open, teams, catalog, clock), new BrowserSavedTeamJson(teams, true));
	}

	private void authenticate(BrowserV2Adapter adapter, Peer peer, String identity) { accepted(send(adapter, peer, request("authenticate").add("bearer", identity))); }
	private JsonObject request(String type) { return new JsonObject().add("version", 2).add("type", type).add("requestId", UUID.randomUUID().toString()); }
	private JsonObject load(String match) { return request("setup").add("operation", "load").add("matchId", match); }
	private JsonObject send(BrowserV2Adapter adapter, Peer peer, JsonObject request) {
		adapter.receive(peer, request.toString()); return peer.responses.get(request.getString("requestId", null));
	}
	private void accepted(JsonObject response) { assertEquals("ACCEPTED", response.getString("code", null)); }
	private String saved(BrowserV2Adapter adapter, Peer peer) {
		JsonArray players = new JsonArray();
		for (int slot = 1; slot <= 11; slot++) players.add(new JsonObject().add("id", "p" + slot).add("slot", slot).add("positionId", "lineman").add("skillIds", new JsonArray()));
		JsonObject draft = new JsonObject().add("catalogVersion", RosterCatalog.VERSION).add("ruleset", "BB2025")
			.add("rosterId", "human").add("presetId", RosterCatalog.PRESET).add("captainId", "p1").add("players", players)
			.add("resources", new JsonObject().add("rerolls", 2).add("assistantCoaches", 0).add("cheerleaders", 0).add("apothecary", 1).add("dedicatedFans", 0));
		JsonObject response = send(adapter, peer, request("savedTeam").add("operation", "create").add("draft", draft));
		assertEquals("OK", response.getString("code", null)); return response.get("document").asObject().getString("teamId", null);
	}
	private static final class Peer implements BrowserMatchAdapter.Connection {
		final Map<String, JsonObject> responses = new LinkedHashMap<>();
		final List<JsonObject> unsolicited = new ArrayList<>(); JsonObject last;
		@Override public void send(String text) {
			last = JsonObject.readFrom(text);
			if (!last.get("requestId").isNull()) responses.put(last.getString("requestId", null), last);
			else unsolicited.add(last);
		}
	}
}
