package com.fumbbl.ffb.test;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.SetupSession;

import java.lang.reflect.Field;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DefaultSetupSessionTest {
	@Test void unavailablePlayersStayOffPitchAndAvailablePlayersKeepRosterOrder() throws Exception {
		MatchDocument document = document(12); TestServer server = new TestServer();
		SetupSession session = new SetupSession(server.getServer(), document, -3, true, true);
		choose(session);
		com.fumbbl.ffb.model.Game game = engine(session).getGame();
		for (com.fumbbl.ffb.model.Team team : new com.fumbbl.ffb.model.Team[] {game.getTeamHome(), game.getTeamAway()}) {
			for (com.fumbbl.ffb.model.Player<?> player : team.getPlayers()) if (player.getNr() == 2) {
				game.getFieldModel().setPlayerState(player, new com.fumbbl.ffb.PlayerState(com.fumbbl.ffb.PlayerState.BADLY_HURT));
				com.fumbbl.ffb.util.UtilBox.putPlayerIntoBox(game, player);
			}
		}
		choose(session);
		for (int side = 0; side < 2; side++) {
			JsonObject snapshot = view(session); String actor = snapshot.getString("actor", null);
			assertTrue(player(snapshot, actor, 2).get("x").isNull());
			assertEquals("home".equals(actor) ? 11 : 14, player(snapshot, actor, 12).getInt("x", -1));
			assertEquals("ACCEPTED", session.apply(actor, request(snapshot, "confirm")).getString("code", null));
		}
	}

	@Test void defaultFormationReturnsForBothSidesAtHalftimeWithoutAutoConfirming() throws Exception {
		MatchDocument document = document(12); TestServer server = new TestServer();
		SetupSession session = new SetupSession(server.getServer(), document, -3, true, true);
		choices(session); int setups = 0;
		for (int i = 0; i < 180 && !session.isComplete(); i++) {
			JsonObject snapshot = view(session);
			if ("SETUP".equals(snapshot.getString("phase", null))) {
				assertLayout(session); setups++;
				assertEquals("ACCEPTED", session.apply(snapshot.getString("actor", null), request(snapshot, "confirm")).getString("code", null));
				continue;
			}
			JsonObject action = null;
			if ("READY_FOR_KICKOFF".equals(snapshot.getString("phase", null))) {
				engine(session).getDiceRoller().clearTestRolls();
				TestRolls.on(engine(session)).general(1, 1, 3, 3, 3, 3, 3, 3);
				action = snapshot.get("actions").asArray().get(82).asObject();
			} else {
				for (JsonValue value : snapshot.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", null))) action = value.asObject();
				if (action == null) action = snapshot.get("actions").asArray().get(0).asObject();
			}
			assertEquals("ACCEPTED", session.apply(action.getString("actor", null), request(snapshot, "action").add("actionId", action.get("id"))).getString("code", null));
		}
		assertTrue(session.isComplete()); assertEquals(4, setups);
	}

	private com.fumbbl.ffb.server.GameState engine(SetupSession session) throws Exception {
		Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
		return (com.fumbbl.ffb.server.GameState) field.get(session);
	}
	@Test void bothSidesGetFirstElevenWithThreeOnLineEightBehindAndTwelfthInReserve() throws Exception {
		MatchDocument document = document(12);
		TestServer server = new TestServer();
		SetupSession session = new SetupSession(server.getServer(), document, -3, true, true);
		assertEquals(SetupSession.DEFAULT_SETUP_RUNTIME, payload(session).getString("runtimeVersion", null));
		choices(session);
		for (int side = 0; side < 2; side++) {
			assertLayout(session);
			String before = session.recoveryArtifact();
			session = new SetupSession(server.getServer(), document, before);
			assertEquals(before, session.recoveryArtifact(), "Restore must not redeploy or consume dice");
			JsonObject snapshot = view(session), confirm = request(snapshot, "confirm");
			assertEquals("ACCEPTED", session.apply(snapshot.getString("actor", null), confirm).getString("code", null));
			String after = session.recoveryArtifact();
			assertTrue(session.apply(snapshot.getString("actor", null), confirm).getBoolean("duplicate", false));
			assertEquals(after, session.recoveryArtifact(), "Exact retry must not redeploy either side");
		}
		assertEquals("READY_FOR_KICKOFF", view(session).getString("phase", null));
		assertEquals(4, view(session).getInt("revision", -1), "Template belongs to the triggering authoritative mutation");
	}

	@Test void manualAdjustmentAndRemovalSurviveReadsRecoveryAndTransitionRequestRetry() throws Exception {
		MatchDocument document = document(11); TestServer server = new TestServer();
		SetupSession session = new SetupSession(server.getServer(), document, -3, true, true);
		choose(session);
		JsonObject choiceView = view(session), choice = choice(choiceView);
		String chooser = choiceView.getString("actor", null);
		session.apply(chooser, choice);
		JsonObject snapshot = view(session); String actor = snapshot.getString("actor", null);
		JsonObject player = player(snapshot, actor, 4);
		session.apply(actor, request(snapshot, "place").add("playerId", player.get("id"))
			.add("to", new JsonObject().add("x", "home".equals(actor) ? 5 : 20).add("y", 7)));
		JsonObject remove = request(view(session), "place").add("playerId", player.get("id")).add("to", JsonValue.NULL);
		session.apply(actor, remove);
		String before = session.recoveryArtifact();
		view(session);
		assertTrue(session.apply(chooser, choice).getBoolean("duplicate", false));
		assertEquals(before, session.recoveryArtifact());
		SetupSession restored = new SetupSession(server.getServer(), document, before);
		assertEquals(before, restored.recoveryArtifact());
		assertTrue(player(view(restored), actor, 4).get("x").isNull());
		assertEquals("ILLEGAL_SETUP", restored.apply(actor, request(view(restored), "confirm")).getString("code", null));
	}

	@Test void legacyCheckpointRetainsManualSetupAndItsExactFormat() throws Exception {
		MatchDocument document = document(11); TestServer server = new TestServer();
		SetupSession original = new SetupSession(server.getServer(), document, -3, true);
		String before = original.recoveryArtifact();
		SetupSession restored = new SetupSession(server.getServer(), document, before);
		assertEquals(before, restored.recoveryArtifact());
		choices(restored);
		assertEquals(SetupSession.LEGACY_RUNTIME, payload(restored).getString("runtimeVersion", null));
		for (JsonValue player : view(restored).get("players").asArray()) assertTrue(player.asObject().get("x").isNull());
	}

	private void assertLayout(SetupSession session) {
		JsonObject snapshot = view(session); String actor = snapshot.getString("actor", null);
		assertEquals("SETUP", snapshot.getString("phase", null));
		int[] rows = {6, 7, 8, 3, 4, 5, 6, 8, 9, 10, 11};
		for (int slot = 1; slot <= 12; slot++) {
			JsonObject player = player(snapshot, actor, slot);
			if (slot == 12) { assertTrue(player.get("x").isNull()); continue; }
			int x = slot <= 3 ? 12 : 11;
			assertEquals("home".equals(actor) ? x : 25 - x, player.getInt("x", -1));
			assertEquals(rows[slot - 1], player.getInt("y", -1));
		}
	}
	private JsonObject player(JsonObject snapshot, String role, int slot) {
		for (JsonValue value : snapshot.get("players").asArray()) {
			JsonObject player = value.asObject();
			if (role.equals(player.getString("role", null)) && slot == player.getInt("slot", -1)) return player;
		}
		throw new AssertionError("Missing fixture player");
	}
	private MatchDocument document(int count) throws Exception {
		Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true);
		return (MatchDocument) field.get(new SetupSessionTest().session(count));
	}
	private JsonObject payload(SetupSession session) { return JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject(); }
	private JsonObject view(SetupSession session) { return session.reply("inspect", "ACCEPTED", false, "home").get("state").asObject(); }
	private JsonObject request(JsonObject view, String operation) { return new JsonObject().add("requestId", UUID.randomUUID().toString()).add("operation", operation).add("expectedRevision", view.get("revision")); }
	private JsonObject choice(JsonObject view) { return request(view, "choice").add("promptId", view.get("prompt").asObject().get("id")).add("optionId", view.get("prompt").asObject().get("options").asArray().get(0)); }
	private void choose(SetupSession session) { JsonObject view = view(session); assertEquals("ACCEPTED", session.apply(view.getString("actor", null), choice(view)).getString("code", null)); }
	private void choices(SetupSession session) { choose(session); choose(session); }
}
