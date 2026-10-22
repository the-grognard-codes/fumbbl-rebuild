package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BrowserV2LiveTranscriptTest {

	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";

	@Test void negotiatedMutationDeliversPublicHistoryBeforeSourcePeerAndSpectatorState() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		AuthenticatedPrincipal home = principal("home", ApplicationScope.PLAYER);
		AuthenticatedPrincipal away = principal("away", ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal("spectator", ApplicationScope.SPECTATOR);
		AuthenticatedPrincipal legacy = principal("legacy", ApplicationScope.SPECTATOR);
		when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER)))
			.thenAnswer(call -> call.getArgument(0));
		when(access.playerRole(home, MATCH)).thenReturn("home");
		when(access.playerRole(away, MATCH)).thenReturn("away");
		when(setup.spectatorView(MATCH)).thenReturn(state(9));
		when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenAnswer(call -> {
			JsonObject request = call.getArgument(1);
			boolean mutation = !"load".equals(request.getString("operation", ""));
			return outcome(request.getString("requestId", ""), mutation ? 10 : 9, mutation);
		});
		when(setup.handle(eq("away"), any(JsonObject.class))).thenAnswer(call -> outcome("broadcast", 10, false).response());
		when(setup.liveTranscriptPage(MATCH, 9)).thenReturn(page(9));
		when(setup.liveTranscriptPage(MATCH, 10)).thenReturn(page(10));
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> "home".equals(bearer) ? home
			: "away".equals(bearer) ? away : "legacy".equals(bearer) ? legacy : spectator,
			access, setup, mock(MatchService.class), mock(V2PreparationService.class), mock(BrowserSavedTeamJson.class));
		Connection source = new Connection(), peer = new Connection(), viewer = new Connection(), oldViewer = new Connection();
		authenticate(adapter, source, "home", true);
		authenticate(adapter, peer, "away", true);
		authenticate(adapter, viewer, "spectator", true);
		authenticate(adapter, oldViewer, "legacy", false);
		adapter.receive(peer, request("setup", "load").add("operation", "load").add("matchId", MATCH).toString());
		adapter.receive(viewer, request("watch", "watch").add("matchId", MATCH).toString());
		adapter.receive(oldViewer, request("watch", "old-watch").add("matchId", MATCH).toString());
		assertEquals(page(9), peer.messages.get(1).get("page"));
		assertEquals("setupState", peer.messages.get(2).getString("type", ""));
		assertEquals(page(9), viewer.messages.get(1).get("page"));
		assertEquals("setupState", viewer.messages.get(2).getString("type", ""));
		source.messages.clear(); peer.messages.clear(); viewer.messages.clear(); oldViewer.messages.clear();

		adapter.receive(source, request("setup", "move").add("operation", "move").add("matchId", MATCH)
			.add("expectedRevision", 9).toString());

		assertHistoryBeforeState(source, 10);
		assertHistoryBeforeState(peer, 10);
		assertHistoryBeforeState(viewer, 10);
		assertEquals(1, oldViewer.messages.size());
		assertEquals("setupState", oldViewer.messages.get(0).getString("type", ""));
		verify(setup).liveTranscriptPage(MATCH, 10);
	}

	@Test void capabilityIsStrictlyBooleanAndEchoedOnlyWhenEnabled() throws Exception {
		Fixture fixture = new Fixture();
		for (JsonValue invalid : new JsonValue[] { JsonValue.NULL, JsonValue.valueOf("true"), JsonValue.valueOf(1) }) {
			Connection connection = new Connection();
			fixture.adapter.receive(connection, request("authenticate", "auth").add("bearer", "home")
				.add("liveTranscript", invalid).toString());
			assertEquals("MALFORMED_MESSAGE", connection.messages.get(0).getString("code", ""));
		}
		for (Boolean enabled : new Boolean[] { null, false, true }) {
			Connection connection = new Connection();
			JsonObject auth = request("authenticate", "auth").add("bearer", "home").add("purpose", "play");
			if (enabled != null) auth.add("liveTranscript", enabled);
			fixture.adapter.receive(connection, auth.toString());
			JsonObject response = connection.messages.get(0);
			assertEquals("ACCEPTED", response.getString("code", ""));
			if (Boolean.TRUE.equals(enabled)) assertEquals(JsonValue.TRUE, response.get("liveTranscript"));
			else assertNull(response.get("liveTranscript"));
		}
	}

	@Test void historyFailureOrInvalidBoundedPageCannotMaskDurableAcknowledgementOrPeerState() throws Exception {
		for (int failure = 0; failure < 7; failure++) {
			Fixture fixture = new Fixture();
			Connection source = fixture.connect("home", true), peer = fixture.connect("away", true);
			fixture.load(peer);
			source.messages.clear(); peer.messages.clear();
			if (failure == 0) when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenThrow(new java.sql.SQLException("unavailable"));
			if (failure == 1) when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenThrow(new MatchService.Failure("REPLAY_UNSUPPORTED"));
			if (failure == 2) when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(page(9));
			if (failure == 3) when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(page(10).set("records", new JsonArray()));
			if (failure == 4) when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(page(10).set("total", 12));
			if (failure == 5) when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(new JsonObject());
			if (failure == 6) {
				JsonObject oversized = page(10);
				oversized.get("records").asArray().get(0).asObject().add("padding", repeat('\u263a', 180000));
				when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(oversized);
			}

			fixture.mutate(source);

			assertStateOnly(source, "move"); assertStateOnly(peer, null);
			verify(fixture.setup).liveTranscriptPage(MATCH, 10);
			// Existing paged reads are still the recovery path after a missing live delivery.
			when(fixture.setup.transcriptPage(MATCH, 0, 1)).thenReturn(page(0));
			fixture.adapter.receive(source, request("matchTranscript", "catch-up").add("matchId", MATCH)
				.add("from", 0).add("limit", 1).toString());
			assertEquals(page(0), source.messages.get(1).get("page"));
		}
	}

	@Test void failedCheckpointHasNoHistoryOrPublication() throws Exception {
		Fixture fixture = new Fixture();
		Connection source = fixture.connect("home", true), peer = fixture.connect("away", true);
		fixture.load(peer);
		source.messages.clear(); peer.messages.clear();
		SetupApplication.HandleOutcome rejected = mock(SetupApplication.HandleOutcome.class);
		when(rejected.response()).thenReturn(new JsonObject().add("type", "error").add("requestId", "move")
			.add("code", "PERSISTENCE_FAILED"));
		when(fixture.setup.handleWithOutcome(eq("home"), any(JsonObject.class))).thenReturn(rejected);

		fixture.mutate(source);

		assertEquals(1, source.messages.size());
		assertEquals("PERSISTENCE_FAILED", source.messages.get(0).getString("code", ""));
		assertTrue(peer.messages.isEmpty());
		verify(fixture.setup, never()).liveTranscriptPage(MATCH, 10);
	}

	@Test void revokedRecipientsReceiveNeitherHistoryNorStateWhileAuthorizedSourceCompletes() throws Exception {
		Fixture fixture = new Fixture();
		Connection source = fixture.connect("home", true), peer = fixture.connect("away", true), viewer = fixture.connect("spectator", true);
		fixture.load(peer); fixture.watch(viewer);
		source.messages.clear(); peer.messages.clear(); viewer.messages.clear();
		when(fixture.access.playerRole(fixture.away, MATCH)).thenThrow(new MatchService.Failure("AUTHENTICATION_REQUIRED"));
		doThrow(new MatchService.Failure("AUTHORIZATION")).when(fixture.access).require(fixture.spectator, ApplicationScope.SPECTATOR);

		fixture.mutate(source);

		assertHistoryBeforeState(source, 10);
		for (Connection recipient : new Connection[] { peer, viewer }) {
			assertEquals(1, recipient.messages.size());
			assertEquals("VIEW_UNAVAILABLE", recipient.messages.get(0).getString("code", ""));
			assertNull(recipient.messages.get(0).get("matchId"));
		}
		verify(fixture.access, times(2)).playerRole(fixture.away, MATCH);
	}

	@Test void duplicateAndReconnectLoadsSendOnlyCurrentRevisionAndPreservePagedGapRecovery() throws Exception {
		Fixture fixture = new Fixture();
		Connection original = fixture.connect("home", true);
		SetupApplication.HandleOutcome duplicate = outcome("retry", 10, false);
		duplicate.response().set("duplicate", true);
		when(fixture.setup.handleWithOutcome(eq("home"), any(JsonObject.class))).thenReturn(duplicate);
		original.messages.clear();
		fixture.load(original);
		assertHistoryBeforeState(original, 10);
		assertTrue(original.messages.get(1).getBoolean("duplicate", false));
		Connection reconnect = fixture.connect("home", true);
		reconnect.messages.clear();
		fixture.load(reconnect);
		assertHistoryBeforeState(reconnect, 10);
		when(fixture.setup.transcriptPage(MATCH, 0, 1)).thenReturn(page(0));
		fixture.adapter.receive(reconnect, request("matchTranscript", "gap").add("matchId", MATCH)
			.add("from", 0).add("limit", 1).toString());
		assertEquals("gap", reconnect.messages.get(2).getString("requestId", ""));
		assertEquals(page(0), reconnect.messages.get(2).get("page"));
	}

	@Test void failedReauthenticationAndDisconnectClearNegotiation() throws Exception {
		Fixture fixture = new Fixture();
		Connection source = fixture.connect("home", true);
		assertEquals(JsonValue.TRUE, source.messages.get(0).get("liveTranscript"));
		authenticate(fixture.adapter, source, "home", true);
		assertEquals("IDENTITY_REBINDING_FORBIDDEN", source.messages.get(1).getString("code", ""));
		source.messages.clear();
		fixture.load(source);
		assertStateOnly(source, "load");
		fixture.adapter.disconnect(source);
		authenticate(fixture.adapter, source, "home", true);
		fixture.adapter.disconnect(source);
		authenticate(fixture.adapter, source, "home", false);
		source.messages.clear();
		fixture.load(source);
		assertStateOnly(source, "load");
		verify(fixture.setup, never()).liveTranscriptPage(MATCH, 9);
	}

	@Test void timerPublishesHistoryBeforeHumanState() throws Exception {
		Fixture fixture = new Fixture();
		Connection peer = fixture.connect("away", true), viewer = fixture.connect("spectator", true);
		fixture.load(peer); fixture.watch(viewer);
		peer.messages.clear(); viewer.messages.clear();
		when(fixture.setup.expireReactiveDecisions()).thenReturn(Collections.singletonMap(MATCH, state(10)));

		fixture.adapter.expireDecisions();

		assertHistoryBeforeState(peer, 10); assertHistoryBeforeState(viewer, 10);
		verify(fixture.setup).liveTranscriptPage(MATCH, 10);
	}

	@Test void finalSpectatorDeliveryIncludesHistoryAndThenRemovesSubscription() throws Exception {
		Fixture fixture = new Fixture();
		Connection source = fixture.connect("home", true), viewer = fixture.connect("spectator", true);
		fixture.watch(viewer);
		SetupApplication.HandleOutcome terminal = outcome("move", 10, true);
		terminal.response().get("state").asObject().set("phase", "FULL_TIME");
		when(fixture.setup.handleWithOutcome(eq("home"), any(JsonObject.class))).thenReturn(terminal);
		viewer.messages.clear();

		fixture.mutate(source);

		assertHistoryBeforeState(viewer, 10);
		assertEquals("FULL_TIME", viewer.messages.get(1).get("state").asObject().getString("phase", ""));
		fixture.mutate(source);
		assertEquals(2, viewer.messages.size());
	}

	@Test void computerMutationAcknowledgementIsUnchangedWhileNegotiatedHumanGetsHistory() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		V2PreparationService preparation = mock(V2PreparationService.class);
		when(preparation.isComputerMatch(MATCH)).thenReturn(true);
		when(setup.spectatorView(MATCH)).thenReturn(state(9));
		when(setup.liveTranscriptPage(MATCH, 9)).thenReturn(page(9));
		when(setup.liveTranscriptPage(MATCH, 10)).thenReturn(page(10));
		when(setup.handleComputerWithOutcome(any(JsonObject.class))).thenAnswer(call -> outcome("computer-move", 10, true));
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> principal("viewer", ApplicationScope.SPECTATOR),
			access, setup, mock(MatchService.class), preparation, mock(BrowserSavedTeamJson.class),
			new ComputerOpponentService("66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0"));
		Connection computer = new Connection(), viewer = new Connection();
		adapter.receive(computer, request("authenticateComputer", "computer-auth")
			.add("serviceToken", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").toString());
		assertNull(computer.messages.get(0).get("liveTranscript"));
		authenticate(adapter, viewer, "viewer", true);
		adapter.receive(viewer, request("watch", "watch").add("matchId", MATCH).toString());
		computer.messages.clear(); viewer.messages.clear();

		adapter.receive(computer, request("setup", "computer-move").add("matchId", MATCH).add("operation", "action").toString());

		assertStateOnly(computer, "computer-move");
		assertHistoryBeforeState(viewer, 10);
	}

	@Test void boundedUtf8HistoryRemainsASeparateFrameBeforeUnmodifiedStateAcknowledgement() throws Exception {
		Fixture fixture = new Fixture();
		Connection source = fixture.connect("home", true);
		JsonObject bounded = page(10);
		bounded.get("records").asArray().get(0).asObject().add("padding", repeat('\u263a', 80000));
		when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(bounded);
		source.messages.clear();

		fixture.mutate(source);

		assertEquals(2, source.messages.size());
		JsonObject history = source.messages.get(0);
		assertEquals(bounded, history.get("page"));
		assertTrue(history.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 768 * 1024);
		assertEquals("move", source.messages.get(1).getString("requestId", ""));
		assertEquals(state(10), source.messages.get(1).get("state"));
	}

	@Test void realDeliveryDropsLiveHistoryWhenItWouldPreventMandatoryStateAcknowledgement() throws Exception {
		for (int scenario = 0; scenario < 4; scenario++) {
			Fixture fixture = new Fixture();
			QueueConnection connection = new QueueConnection();
			authenticate(fixture.adapter, connection, "home", true);
			connection.sink.drain(); connection.sink.messages.clear();
			int historyBytes = scenario == 0 ? 240 * 1024 : scenario == 1 ? 300 * 1024 : 60 * 1024;
			JsonObject history = page(10);
			history.get("records").asArray().get(0).asObject().add("padding", repeat('h', historyBytes));
			when(fixture.setup.liveTranscriptPage(MATCH, 10)).thenReturn(history);
			SetupApplication.HandleOutcome mutation = outcome("move", 10, true);
			mutation.response().get("state").asObject().add("padding", repeat('s', 30 * 1024));
			when(fixture.setup.handleWithOutcome(eq("home"), any(JsonObject.class))).thenReturn(mutation);
			if (scenario == 2) connection.send(repeat('q', 200 * 1024));
			if (scenario == 3) for (int index = 0; index < 63; index++) connection.send("queued");

			fixture.adapter.receive(connection, request("setup", "move").add("operation", "move").add("matchId", MATCH)
				.add("expectedRevision", 9).toString());
			connection.sink.drain();

			assertEquals(0, connection.sink.closeCode, "Optional history must never cause a disconnect: scenario " + scenario);
			JsonObject acknowledgement = JsonObject.readFrom(connection.sink.messages.get(connection.sink.messages.size() - 1));
			assertEquals("setupState", acknowledgement.getString("type", ""));
			assertEquals("move", acknowledgement.getString("requestId", ""));
			assertEquals("ACCEPTED", acknowledgement.getString("code", ""));
			assertEquals(scenario == 2 ? 2 : scenario == 3 ? 64 : 1, connection.sink.messages.size());
			assertEquals(0, connection.metrics.toJson().getLong("deliveryQueueBytes", -1));
			assertEquals(0, connection.metrics.toJson().getLong("outboundOverload", -1));
		}
	}

	@Test void connectionWithoutAtomicOptionalDeliveryPreservesTheMandatoryState() throws Exception {
		Fixture fixture = new Fixture();
		List<JsonObject> messages = new ArrayList<>();
		BrowserMatchAdapter.Connection connection = message -> messages.add(JsonObject.readFrom(message));
		authenticate(fixture.adapter, connection, "home", true);
		messages.clear();
		fixture.adapter.receive(connection, request("setup", "move").add("operation", "move").add("matchId", MATCH)
			.add("expectedRevision", 9).toString());
		assertEquals(1, messages.size());
		assertEquals("setupState", messages.get(0).getString("type", ""));
		assertEquals("move", messages.get(0).getString("requestId", ""));
	}

	private static String repeat(char value, int count) {
		char[] characters = new char[count];
		java.util.Arrays.fill(characters, value);
		return new String(characters);
	}

	private static void assertStateOnly(Connection connection, String requestId) {
		assertEquals(1, connection.messages.size());
		JsonObject response = connection.messages.get(0);
		assertEquals("setupState", response.getString("type", ""));
		assertEquals("ACCEPTED", response.getString("code", ""));
		assertEquals(requestId == null ? JsonValue.NULL : JsonValue.valueOf(requestId), response.get("requestId"));
	}

	private static void assertHistoryBeforeState(Connection connection, int revision) {
		assertEquals(2, connection.messages.size(), "Expected durable public history followed by state");
		JsonObject history = connection.messages.get(0);
		assertEquals("matchTranscript", history.getString("type", ""));
		assertTrue(history.get("requestId").isNull());
		assertEquals(MATCH, history.getString("matchId", ""));
		assertEquals(page(revision), history.get("page"));
		assertEquals("setupState", connection.messages.get(1).getString("type", ""));
		assertEquals(revision, connection.messages.get(1).get("state").asObject().getInt("revision", -1));
	}

	private static JsonObject page(int revision) {
		return new JsonObject().add("formatVersion", 2).add("from", revision).add("next", revision + 1)
			.add("total", revision + 1).add("records", new JsonArray().add(new JsonObject()
				.add("index", revision).add("revision", revision).add("state", state(revision))));
	}

	private static JsonObject state(int revision) {
		return new JsonObject().add("matchId", MATCH).add("revision", revision).add("phase", "PLAY");
	}

	private static SetupApplication.HandleOutcome outcome(String requestId, int revision, boolean publish) {
		SetupApplication.HandleOutcome outcome = mock(SetupApplication.HandleOutcome.class);
		when(outcome.response()).thenReturn(new JsonObject().add("type", "setupState").add("requestId", requestId)
			.add("code", "ACCEPTED").add("duplicate", false).add("state", state(revision)));
		when(outcome.publish()).thenReturn(publish);
		return outcome;
	}

	private static AuthenticatedPrincipal principal(String account, ApplicationScope scope) {
		return new AuthenticatedPrincipal(java.util.UUID.nameUUIDFromBytes(
			account.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString(), EnumSet.of(scope), Long.MAX_VALUE);
	}

	private static void authenticate(BrowserV2Adapter adapter, BrowserMatchAdapter.Connection connection, String bearer, boolean live) {
		JsonObject request = request("authenticate", "auth").add("bearer", bearer);
		if (live) request.add("liveTranscript", true);
		adapter.receive(connection, request.toString());
	}

	private static JsonObject request(String type, String id) {
		return new JsonObject().add("version", 2).add("type", type).add("requestId", id);
	}

	private static final class Connection implements BrowserMatchAdapter.Connection {
		final List<JsonObject> messages = new ArrayList<>();
		@Override public void send(String message) { messages.add(JsonObject.readFrom(message)); }
		@Override public void sendWithOptionalPredecessor(String optional, String mandatory) { send(optional); send(mandatory); }
	}

	private static final class QueueConnection implements BrowserMatchAdapter.Connection {
		final DelayedSink sink = new DelayedSink();
		final BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		final BrowserMatchDelivery delivery = new BrowserMatchDelivery(sink, metrics,
			BrowserMatchTransport.MAX_OUTBOUND_MESSAGES, BrowserMatchTransport.MAX_OUTBOUND_BYTES);
		@Override public void send(String message) { delivery.send(message); }
		@Override public void sendWithOptionalPredecessor(String optional, String mandatory) {
			delivery.sendWithOptionalPredecessor(optional, mandatory);
		}
	}

	private static final class DelayedSink implements BrowserMatchDelivery.Sink {
		final List<String> messages = new ArrayList<>();
		final java.util.Deque<BrowserMatchDelivery.Completion> completions = new java.util.ArrayDeque<>();
		int closeCode;
		@Override public boolean isOpen() { return closeCode == 0; }
		@Override public void close(int statusCode, String reason) { closeCode = statusCode; }
		@Override public void send(String message, BrowserMatchDelivery.Completion completion) {
			messages.add(message); completions.addLast(completion);
		}
		void drain() { while (!completions.isEmpty()) completions.removeFirst().succeeded(); }
	}

	private static final class Fixture {
		final V2MatchAccess access = mock(V2MatchAccess.class);
		final SetupApplication setup = mock(SetupApplication.class);
		final AuthenticatedPrincipal home = principal("home", ApplicationScope.PLAYER);
		final AuthenticatedPrincipal away = principal("away", ApplicationScope.PLAYER);
		final AuthenticatedPrincipal spectator = principal("spectator", ApplicationScope.SPECTATOR);
		final BrowserV2Adapter adapter;

		Fixture() throws Exception {
			when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER))).thenAnswer(call -> call.getArgument(0));
			when(access.playerRole(home, MATCH)).thenReturn("home");
			when(access.playerRole(away, MATCH)).thenReturn("away");
			when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenAnswer(call -> {
				JsonObject request = call.getArgument(1);
				boolean mutation = !"load".equals(request.getString("operation", ""));
				return outcome(request.getString("requestId", ""), mutation ? 10 : 9, mutation);
			});
			when(setup.handle(eq("away"), any(JsonObject.class))).thenAnswer(call -> outcome("broadcast", 10, false).response());
			when(setup.spectatorView(MATCH)).thenReturn(state(9));
			when(setup.liveTranscriptPage(MATCH, 9)).thenReturn(page(9));
			when(setup.liveTranscriptPage(MATCH, 10)).thenReturn(page(10));
			adapter = new BrowserV2Adapter(bearer -> "home".equals(bearer) ? home : "away".equals(bearer) ? away : spectator,
				access, setup, mock(MatchService.class), mock(V2PreparationService.class), mock(BrowserSavedTeamJson.class));
		}

		Connection connect(String bearer, boolean live) {
			Connection connection = new Connection();
			authenticate(adapter, connection, bearer, live);
			return connection;
		}
		void load(Connection connection) {
			adapter.receive(connection, request("setup", "load").add("operation", "load").add("matchId", MATCH).toString());
		}
		void watch(Connection connection) {
			adapter.receive(connection, request("watch", "watch").add("matchId", MATCH).toString());
		}
		void mutate(Connection connection) {
			adapter.receive(connection, request("setup", "move").add("operation", "move").add("matchId", MATCH)
				.add("expectedRevision", 9).toString());
		}
	}
}
