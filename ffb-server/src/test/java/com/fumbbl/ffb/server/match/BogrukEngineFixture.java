package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ServerCommunication;
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
import static org.mockito.Mockito.framework;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;
/** Real BB2025 engine and synthetic exhibition rosters; only external server services are mocked. */
final class BogrukEngineFixture implements AutoCloseable {

	private static final String DEFAULT_TEAM_PREFIX = "Acceptance ";

	final FantasyFootballServer server;
	private final DebugLog debugLog;
	private final ServerCommunication communication;
	private final boolean simulation;
	final MatchDocument document;
	SetupSession session;
	private final Random dice;
	private GameState gameState;

	BogrukEngineFixture(String homeRoster, String awayRoster, long seed) throws Exception {
		this(homeRoster, awayRoster, seed, false);
	}

	BogrukEngineFixture(String homeRoster, String awayRoster, long seed, boolean simulation) throws Exception {
		this(homeRoster, awayRoster, seed, "00000000-0000-0000-0000-000000000021", DEFAULT_TEAM_PREFIX, simulation);
	}

	BogrukEngineFixture(String homeRoster, String awayRoster, long seed, String id) throws Exception {
		this(homeRoster, awayRoster, seed, id, DEFAULT_TEAM_PREFIX);
	}

	BogrukEngineFixture(String homeRoster, String awayRoster, long seed, String id, String teamPrefix) throws Exception {
		this(homeRoster, awayRoster, seed, id, teamPrefix, false);
	}

	private BogrukEngineFixture(String homeRoster, String awayRoster, long seed, String id, String teamPrefix,
		boolean simulation) throws Exception {
		this.simulation = simulation;
		server = mock(FantasyFootballServer.class, simulation ? withSettings().stubOnly() : withSettings());
		debugLog = mock(DebugLog.class, simulation ? withSettings().stubOnly() : withSettings());
		communication = mock(ServerCommunication.class, simulation ? withSettings().stubOnly() : withSettings());
		ComputerOpponentService computers = new ComputerOpponentService(null);
		FrozenTeam home = frozen(homeRoster, "home", "00000000-0000-0000-0000-000000000011", teamPrefix);
		FrozenTeam away = frozen(awayRoster, "away", "00000000-0000-0000-0000-000000000012", teamPrefix)
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
		when(server.getDebugLog()).thenReturn(debugLog);
		when(server.getCommunication()).thenReturn(communication);
		dice = new Random(seed);
		session = SetupSession.startRecoverable(server, document, -2, true, true);
		session.recordPlayerActivity("home", System.currentTimeMillis());
		pinDice();
	}

	@Override
	public void close() {
		if (simulation) {
			framework().clearInlineMock(communication);
			framework().clearInlineMock(debugLog);
			framework().clearInlineMock(server);
		}
		session = null;
		gameState = null;
	}

	void restore() throws Exception {
		session = new SetupSession(server, document, session.recoveryArtifact());
		pinDice();
	}

	/** Drives committed native decisions without adding staged placement requests. */
	JsonObject recordedDecision(JsonObject view, String requestId, int sequence) {
		JsonObject request = new JsonObject().add("version", 1).add("type", "setup").add("requestId", requestId)
			.add("matchId", document.matchId).add("expectedRevision", view.getInt("revision", -1));
		if (!view.get("prompt").isNull()) {
			JsonObject prompt = view.get("prompt").asObject();
			return request.add("operation", "choice").add("promptId", prompt.get("id"))
				.add("optionId", prompt.get("options").asArray().get(0));
		}
		if ("SETUP".equals(view.getString("phase", null))) return request.add("operation", "confirm");

		JsonObject action = view.get("actions").asArray().get(0).asObject();
		for (JsonValue option : view.get("actions").asArray()) {
			JsonObject candidate = option.asObject();
			String kind = candidate.getString("kind", "");
			String id = candidate.getString("id", "");
			if (id.endsWith(":decline-event") || id.endsWith(":end-event")
				|| id.endsWith(":confirm-solid-defence") || kind.equals("endTurn") && sequence % 16 == 0) {
				action = candidate;
				break;
			}
			JsonValue target = candidate.get("target");
			if (kind.equals("select") && target != null && target.isObject()
				&& !view.get("activePlayerId").equals(target.asObject().get("playerId"))) action = candidate;
		}
		return request.add("operation", "action").add("actionId", action.get("id"));
	}

	private void pinDice() throws Exception {
		Field field = SetupSession.class.getDeclaredField("state");
		field.setAccessible(true);
		gameState = (GameState) field.get(session);
		gameState.getDiceRoller().setRecoveryRoll(sides -> dice.nextInt(sides) + 1);
	}

	/** Same visible movement budget as the away computer projection, for the synthetic home coach. */
	JsonValue homeMovement() {
		Game game = gameState.getGame();
		Player<?> mover = game.getActingPlayer().getPlayer();
		if (mover != null && game.getTeamHome().hasPlayer(mover)
			&& FieldCoordinateBounds.FIELD.isInBounds(game.getFieldModel().getPlayerCoordinate(mover))
			&& !mover.hasSkillProperty(NamedProperties.movesRandomly)) return new RoutePlanner(gameState, true).budget();
		return JsonValue.NULL;
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

	private FrozenTeam frozen(String roster, String role, String id, String teamPrefix) {
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
		TeamDraft draft = new TeamDraft(TeamDraft.FORMAT_VERSION, teamPrefix + role, RosterCatalog.VERSION,
			"BB2025", catalog.getRosterId(), RosterCatalog.PRESET, "player1", players, resources);
		TeamValidation.Evaluation result = new TeamValidation(catalog).evaluate(draft);
		if (!result.isValid()) throw new IllegalArgumentException("Invalid acceptance roster");
		return new FrozenTeam(id, 1, role, draft, result.total, result.skillPoints, catalog);
	}
}
