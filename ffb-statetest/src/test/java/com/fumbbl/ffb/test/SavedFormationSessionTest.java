package com.fumbbl.ffb.test;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.ComputerCoach;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.FrozenTeam;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchJson;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;
import com.fumbbl.ffb.server.team.bb2025.TeamFormations;
import com.fumbbl.ffb.util.UtilBox;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SavedFormationSessionTest {
	@Test void automaticFormationUsesReceivingRoleActualJerseysAndTeamPerspectiveOnBothSides() throws Exception {
		SetupSession session = session(null, false);
		choices(session);
		for (int side = 0; side < 2; side++) {
			String actor = view(session).getString("actor", null);
			boolean receiving = engine(session).getGame().isSetupOffense();
			TeamFormations.Formation expected = templates().forReceiving(receiving).getFirst();
			JsonObject projected = session.reply("inspect", "ACCEPTED", false, actor).get("state").asObject();
			assertEquals(expected.name(), projected.get("savedFormations").asArray().get(0).asObject().getString("name", null));
			assertTrue(session.spectatorView().get("savedFormations") == null);
			for (TeamFormations.Assignment assignment : expected.players()) {
				JsonObject player = player(projected, actor, assignment.jerseyNumber());
				assertEquals("home".equals(actor) ? 12 - assignment.depth() : 13 + assignment.depth(), player.getInt("x", -1));
				assertEquals("home".equals(actor) ? assignment.column() : 14 - assignment.column(), player.getInt("y", -1));
			}
			assertTrue(player(projected, actor, 31).get("x").isNull());
			assertEquals("ACCEPTED", session.apply(actor, request(session, "confirm")).getString("code", null));
		}
		assertEquals("READY_FOR_KICKOFF", view(session).getString("phase", null));
		assertTrue(view(session).get("savedFormations") == null);
	}

	@Test void loadReplacesManualSetupIsIdempotentAndRecoveryDoesNotRedeploy() throws Exception {
		SetupSession session = session(null, false); choices(session);
		String actor = view(session).getString("actor", null);
		JsonObject player = player(view(session), actor, 20);
		session.apply(actor, request(session, "place").add("playerId", player.get("id")).add("to", JsonValue.NULL));
		JsonObject load = request(session, "formation").add("formationIndex", 0);
		assertEquals("ACCEPTED", session.apply(actor, load).getString("code", null));
		assertFalse(player(view(session), actor, 20).get("x").isNull());
		String before = session.recoveryArtifact();
		JsonArray replayEvents = JsonArray.readFrom(JsonObject.readFrom(before).get("payload").asObject().getString("eventsJson", null));
		JsonObject replayState = replayEvents.get(replayEvents.size() - 1).asObject().get("state").asObject();
		assertEquals(view(session).get("players"), replayState.get("players"));
		assertTrue(replayState.get("savedFormations") == null, "Interactive controls must not enter replay snapshots");
		assertTrue(session.apply(actor, load).getBoolean("duplicate", false));
		assertEquals(before, session.recoveryArtifact());
		session.apply(actor, request(session, "place").add("playerId", player.get("id")).add("to", JsonValue.NULL));
		String edited = session.recoveryArtifact();
		SetupSession restored = new SetupSession(new TestServer().getServer(), document(session), edited);
		assertEquals(edited, restored.recoveryArtifact());
		assertTrue(player(view(restored), actor, 20).get("x").isNull());
		assertEquals("ILLEGAL_SETUP", restored.apply(actor, request(restored, "confirm")).getString("code", null));
	}

	@Test void unavailableNumbersLeaveHolesAndNeverRecruitTheTwelfthPlayerForHumans() throws Exception {
		SetupSession session = session(null, false);
		choose(session);
		for (com.fumbbl.ffb.model.Team team : List.of(engine(session).getGame().getTeamHome(), engine(session).getGame().getTeamAway())) {
			com.fumbbl.ffb.model.Player<?> player = team.getPlayers()[7];
			engine(session).getGame().getFieldModel().setPlayerState(player, new PlayerState(PlayerState.KNOCKED_OUT));
			UtilBox.putPlayerIntoBox(engine(session).getGame(), player);
		}
		choose(session);
		String actor = view(session).getString("actor", null);
		assertTrue(player(view(session), actor, 27).get("x").isNull());
		assertTrue(player(view(session), actor, 31).get("x").isNull());
		assertEquals("ACCEPTED", session.apply(actor, request(session, "formation").add("formationIndex", 0)).getString("code", null));
		assertTrue(player(view(session), actor, 27).get("x").isNull());
		assertEquals("ILLEGAL_SETUP", session.apply(actor, request(session, "confirm")).getString("code", null));
	}

	@Test void explicitEmptyGroupsStayInReservesAndDoNotOfferControls() throws Exception {
		SetupSession session = session(new TeamFormations.FormationSet(List.of(), List.of()), false); choices(session);
		String actor = view(session).getString("actor", null);
		assertTrue(view(session).get("savedFormations") == null);
		for (JsonValue value : view(session).get("players").asArray()) assertTrue(value.asObject().get("x").isNull());
		assertThrows(MatchService.Failure.class, () -> session.apply(actor, request(session, "formation").add("formationIndex", 0)));
	}

	@Test void formationMutationsRejectOtherActorsInvalidIndicesAndWrongPhases() throws Exception {
		SetupSession session = session(null, false);
		assertThrows(MatchService.Failure.class, () -> session.apply(view(session).getString("actor", null), request(session, "formation").add("formationIndex", 0)));
		choices(session);
		String actor = view(session).getString("actor", null);
		assertThrows(MatchService.Failure.class, () -> session.apply("home".equals(actor) ? "away" : "home", request(session, "formation").add("formationIndex", 0)));
		assertThrows(MatchService.Failure.class, () -> session.apply(actor, request(session, "formation").add("formationIndex", 2)));
	}

	@Test void computerCompletesDepletedFormationAndCanSetUpWithoutSavedTemplates() throws Exception {
		for (TeamFormations.FormationSet formations : List.of(templates(), new TeamFormations.FormationSet(List.of(), List.of()))) {
			SetupSession session = session(formations, true); choose(session);
			// Leave only two players on each side; both must be on the LoS, including the captain.
			for (com.fumbbl.ffb.model.Team team : List.of(engine(session).getGame().getTeamHome(), engine(session).getGame().getTeamAway())) {
				for (int index = 2; index < team.getPlayers().length; index++) {
					com.fumbbl.ffb.model.Player<?> player = team.getPlayers()[index];
					engine(session).getGame().getFieldModel().setPlayerState(player, new PlayerState(PlayerState.BADLY_HURT));
					UtilBox.putPlayerIntoBox(engine(session).getGame(), player);
				}
			}
			choose(session);
			if ("home".equals(view(session).getString("actor", null))) {
				for (int number : List.of(20, 21)) {
					JsonObject player = player(view(session), "home", number);
					session.apply("home", request(session, "place").add("playerId", player.get("id")).add("to", new JsonObject().add("x", 12).add("y", number - 14)));
				}
				assertEquals("ACCEPTED", session.apply("home", request(session, "confirm")).getString("code", null));
			}
			assertEquals("away", view(session).getString("actor", null));
			assertEquals(13, player(view(session), "away", 20).getInt("x", -1));
			assertEquals(13, player(view(session), "away", 21).getInt("x", -1));
			assertEquals("ACCEPTED", session.apply("away", request(session, "confirm")).getString("code", null));
		}
	}

	@Test void frozenMatchSerializationRetainsTemplatesAndDoesNotExposeThemInPreparation() throws Exception {
		MatchDocument original = document(session(null, false));
		MatchJson json = new MatchJson();
		MatchDocument decoded = json.decode(json.encode(original).toString(), original.documentVersion);
		assertEquals(original.home.team.formations, decoded.home.team.formations);
		assertEquals(original.away.team.formations, decoded.away.team.formations);
		assertTrue(json.publicDocument(original).get("home").asObject().get("formations") == null);
	}

	@Test void computerFillsMissingLosWithAReserveWithoutMovingOtherSavedPlayers() throws Exception {
		TeamFormations.FormationSet selected = new TeamFormations.FormationSet(templates().offense(), List.of(templates().defense().getFirst()));
		SetupSession session = session(selected, true); choose(session);
		com.fumbbl.ffb.model.Player<?> missing = engine(session).getGame().getTeamAway().getPlayers()[0];
		engine(session).getGame().getFieldModel().setPlayerState(missing, new PlayerState(PlayerState.KNOCKED_OUT));
		UtilBox.putPlayerIntoBox(engine(session).getGame(), missing);
		JsonObject choice = view(session);
		String chooser = choice.getString("actor", null);
		assertEquals("ACCEPTED", session.apply(chooser, request(session, "choice").add("promptId", choice.get("prompt").asObject().get("id"))
			.add("optionId", "home".equals(chooser) ? "receive" : "kick")).getString("code", null));
		assertEquals("away", view(session).getString("actor", null));
		for (TeamFormations.Assignment assignment : selected.defense().getFirst().players()) {
			if (assignment.jerseyNumber() == 20) continue;
			JsonObject deployed = player(view(session), "away", assignment.jerseyNumber());
			assertEquals(13 + assignment.depth(), deployed.getInt("x", -1));
			assertEquals(14 - assignment.column(), deployed.getInt("y", -1));
		}
		assertEquals(13, player(view(session), "away", 31).getInt("x", -1));
		assertEquals("ACCEPTED", session.apply("away", request(session, "confirm")).getString("code", null));
	}

	private SetupSession session(TeamFormations.FormationSet formations, boolean computer) throws Exception {
		RosterCatalog catalog = new RosterCatalog();
		TeamDraft draft = new TeamDraft(2, "Formation Team", RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, "p1", roster(),
			Map.of("rerolls", 2, "assistantCoaches", 0, "cheerleaders", 0, "apothecary", 0, "dedicatedFans", 0), null, formations);
		FrozenTeam home = new FrozenTeam(UUID.randomUUID().toString(), 1, "home", draft, 700000, 0, catalog);
		FrozenTeam away = new FrozenTeam(UUID.randomUUID().toString(), 1, "away", draft, 700000, 0, catalog);
		String matchId = UUID.randomUUID().toString();
		Map<String, MatchDocument.Request> history = new LinkedHashMap<>();
		history.put("home\ncreate", new MatchDocument.Request("create|" + home.sourceTeamId + "|1|away"));
		history.put("away\njoin", new MatchDocument.Request("join|" + matchId + "|1|" + away.sourceTeamId + "|1"));
		history.put("home\nactivate", new MatchDocument.Request("activate|" + matchId + "|2"));
		MatchDocument document = new MatchDocument(matchId, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
			new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away), history);
		if (computer) document = document.withComputer(new ComputerCoach(ComputerOpponentService.BUGMAN_ID, "random-v1", 17));
		SetupSession session = new SetupSession(new TestServer().getServer(), document, -7, true, true);
		engine(session).getGame().getFieldModel().setWeather(Weather.NICE);
		return session;
	}
	private List<TeamDraft.Player> roster() {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 12; slot++) players.add(new TeamDraft.Player("p" + slot, slot, slot + 19, "Player " + slot, "lineman", List.of()));
		return players;
	}
	private TeamFormations.FormationSet templates() { return new TeamFormations().defaults(roster()); }
	private GameState engine(SetupSession session) throws Exception { Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session); }
	private MatchDocument document(SetupSession session) throws Exception { Field field = SetupSession.class.getDeclaredField("document"); field.setAccessible(true); return (MatchDocument) field.get(session); }
	private JsonObject view(SetupSession session) { return session.reply("inspect", "ACCEPTED", false, "home").get("state").asObject(); }
	private JsonObject request(SetupSession session, String operation) { return new JsonObject().add("requestId", UUID.randomUUID().toString()).add("expectedRevision", view(session).get("revision")).add("operation", operation); }
	private void choices(SetupSession session) { choose(session); choose(session); }
	private void choose(SetupSession session) { JsonObject view = view(session); assertEquals("ACCEPTED", session.apply(view.getString("actor", null), request(session, "choice").add("promptId", view.get("prompt").asObject().get("id")).add("optionId", view.get("prompt").asObject().get("options").asArray().get(0))).getString("code", null)); }
	private JsonObject player(JsonObject view, String role, int number) { for (JsonValue value : view.get("players").asArray()) { JsonObject player = value.asObject(); if (role.equals(player.getString("role", null)) && number == player.getInt("number", -1)) return player; } throw new AssertionError("Missing number " + number); }
}
