package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameCache;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.net.SessionManager;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;
import com.fumbbl.ffb.server.team.bb2025.TeamValidation;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Real BB2025 engine and synthetic exhibition rosters; only external server services are mocked. */
final class BogrukEngineFixture {

	final FantasyFootballServer server = mock(FantasyFootballServer.class);
	final MatchDocument document;
	SetupSession session;
	private final Random dice;

	BogrukEngineFixture(String homeRoster, String awayRoster, long seed) throws Exception {
		ComputerOpponentService computers = new ComputerOpponentService(null);
		String id = "00000000-0000-0000-0000-000000000021";
		FrozenTeam home = frozen(homeRoster, "home", "00000000-0000-0000-0000-000000000011");
		FrozenTeam away = frozen(awayRoster, "away", "00000000-0000-0000-0000-000000000012")
			.copyForMatch(computers.cloneTeamId(id, ComputerOpponentService.BOGRUK_ID), "away", ComputerOpponentService.BOGRUK_TEAM_NAME);
		Map<String, MatchDocument.Request> history = new LinkedHashMap<>();
		history.put("home\ncreate", new MatchDocument.Request("create|" + home.sourceTeamId + "|1|away"));
		history.put("away\ncomputer", new MatchDocument.Request("join|" + id + "|1|" + away.sourceTeamId + "|1"));
		history.put("home\nactivate", new MatchDocument.Request("activate|" + id + "|2"));
		document = new MatchDocument(id, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
			new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away), history)
			.withComputer(new ComputerCoach(ComputerOpponentService.BOGRUK_ID, "bogruk-v1", seed));
		FactoryManager manager = new FactoryManager();
		when(server.getFactoryManager()).thenReturn(manager);
		when(server.getFactorySource()).thenReturn(server);
		when(server.forContext(any())).thenReturn(server);
		Map<FactoryType.Factory, INamedObjectFactory> factories = manager.getFactoriesForContext(FactoryType.FactoryContext.APPLICATION, server);
		when(server.getFactory(any())).thenAnswer(invocation -> factories.get(invocation.getArgument(0)));
		when(server.getDebugLog()).thenReturn(mock(DebugLog.class));
		when(server.getGameCache()).thenReturn(mock(GameCache.class));
		when(server.getCommunication()).thenReturn(mock(ServerCommunication.class));
		when(server.getSessionManager()).thenReturn(new SessionManager());
		dice = new Random(seed);
		session = new SetupSession(server, document, -2, true, true, true, true, true, true);
		session.recordPlayerActivity(System.currentTimeMillis());
		pinDice();
	}

	void restore() throws Exception {
		session = new SetupSession(server, document, session.recoveryArtifact());
		pinDice();
	}

	private void pinDice() throws Exception {
		Field field = SetupSession.class.getDeclaredField("state");
		field.setAccessible(true);
		((GameState) field.get(session)).getDiceRoller().setRecoveryRoll(sides -> dice.nextInt(sides) + 1);
	}

	JsonObject reply(String role) {
		return decorate(session.decorateSaveResume(session.reply("load", "ACCEPTED", false, role)), role);
	}

	JsonObject apply(String role, JsonObject request) {
		if ("away".equals(role)) session.validateComputerDecision(request);
		JsonObject response = session.apply(role, request);
		if ("away".equals(role) && "ACCEPTED".equals(response.getString("code", null)) && !response.getBoolean("duplicate", false))
			session.acceptComputerDecision(request);
		return decorate(session.decorateSaveResume(response), role);
	}

	JsonObject decorate(JsonObject response, String role) {
		JsonValue view = response.get("state");
		if ("away".equals(role) && view != null && view.isObject()) view.asObject().add("computer", session.computerProjection());
		return response.set("version", 2);
	}

	private FrozenTeam frozen(String roster, String role, String id) {
		RosterCatalog catalog = new RosterCatalog(roster.toLowerCase(java.util.Locale.ROOT));
		List<String> positions = "orc".equals(catalog.getRosterId())
			? java.util.Arrays.asList("orc-lineman", "orc-lineman", "orc-lineman", "orc-lineman", "orc-lineman",
				"orc-blitzer", "orc-blitzer", "big-un-blocker", "big-un-blocker", "troll", "orc-thrower")
			: java.util.Arrays.asList("lineman", "lineman", "lineman", "lineman", "catcher", "catcher",
				"blitzer", "blitzer", "thrower", "ogre", "halfling");
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= positions.size(); slot++) players.add(new TeamDraft.Player("player" + slot, slot, slot,
			"Player " + slot, positions.get(slot - 1), Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>();
		for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
		resources.put("rerolls", 2);
		TeamDraft draft = new TeamDraft(TeamDraft.FORMAT_VERSION, "Acceptance " + role, RosterCatalog.VERSION,
			"BB2025", catalog.getRosterId(), RosterCatalog.PRESET, "player1", players, resources);
		TeamValidation.Evaluation result = new TeamValidation(catalog).evaluate(draft);
		if (!result.isValid()) throw new IllegalArgumentException("Invalid acceptance roster");
		return new FrozenTeam(id, 1, role, draft, result.total, result.skillPoints, catalog);
	}
}
