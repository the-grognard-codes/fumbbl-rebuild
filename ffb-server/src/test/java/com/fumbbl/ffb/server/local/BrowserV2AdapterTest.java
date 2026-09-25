package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.CompletedMatch;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BrowserV2AdapterTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private static final String FIRST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private static final String SECOND = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

	@Test void completedParticipantResultUsesV2EnvelopeAndSpectatorScopeCannotRead() throws Exception {
		AuthenticatedPrincipal player = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(player, ApplicationScope.PLAYER)).thenReturn(player);
		when(access.require(spectator, ApplicationScope.PLAYER)).thenThrow(new MatchService.Failure("AUTHORIZATION"));
		MatchService matches = mock(MatchService.class);
		when(matches.result(FIRST, MATCH)).thenReturn(new CompletedMatch(new JsonObject().add("matchId", MATCH)
			.add("events", new com.eclipsesource.json.JsonArray().add(new JsonObject().add("revision", 0).add("kind", "FULL_TIME"))).toString()));
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> "player".equals(bearer) ? player : spectator,
			access, mock(SetupApplication.class), matches, mock(V2PreparationService.class), mock(BrowserSavedTeamJson.class));
		Connection participant = new Connection(), viewer = new Connection();
		adapter.receive(participant, authenticate("auth-1", "player").toString());
		adapter.receive(viewer, authenticate("auth-2", "spectator").toString());
		adapter.receive(participant, request("matchResult", "load").add("operation", "load").add("matchId", MATCH).toString());
		JsonObject loaded = JsonObject.readFrom(participant.messages.get(1));
		assertEquals(2, loaded.getInt("version", -1));
		assertEquals("ACCEPTED", loaded.getString("code", null));
		assertEquals(1, loaded.get("result").asObject().getInt("eventCount", -1));
		adapter.receive(participant, request("matchResult", "replay").add("operation", "replay").add("matchId", MATCH).add("index", 0).toString());
		assertEquals("FULL_TIME", JsonObject.readFrom(participant.messages.get(2)).get("event").asObject().getString("kind", null));
		adapter.receive(viewer, request("matchResult", "denied").add("operation", "load").add("matchId", MATCH).toString());
		assertEquals("AUTHORIZATION", code(viewer, 1));
		verify(matches, times(2)).result(FIRST, MATCH);
	}

	@Test void rejectedAuthenticationDoesNotEchoOrLogProviderOrPrivatePayloads() throws Exception {
		String privatePayload = "sentinel-token sentinel-uid sentinel@example.invalid private-account private-team";
		Connection connection = new Connection();
		BrowserV2Adapter adapter = adapter(bearer -> { throw new IllegalStateException(privatePayload); }, mock(V2MatchAccess.class), mock(SetupApplication.class));
		ByteArrayOutputStream captured = new ByteArrayOutputStream();
		PrintStream originalOut = System.out, originalError = System.err;
		try (PrintStream capture = new PrintStream(captured, true, "UTF-8")) {
			System.setOut(capture); System.setErr(capture);
			adapter.receive(connection, authenticate("rejected", privatePayload).toString());
		} finally { System.setOut(originalOut); System.setErr(originalError); }
		for (String sentinel : privatePayload.split(" ")) {
			assertFalse(captured.toString("UTF-8").contains(sentinel));
			assertFalse(connection.messages.toString().contains(sentinel));
		}
	}

	@Test void unauthenticatedBrowseAndWatchAreDeniedBeforeAnyStateRead() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.browse(isNull())).thenThrow(new MatchService.Failure("AUTHENTICATION_REQUIRED"));
		doThrow(new MatchService.Failure("AUTHENTICATION_REQUIRED")).when(access).spectatorSnapshot(isNull(), eq(MATCH));
		SetupApplication setup = mock(SetupApplication.class);
		Connection connection = new Connection();
		BrowserV2Adapter adapter = adapter(bearer -> principal(FIRST, ApplicationScope.SPECTATOR), access, setup);

		adapter.receive(connection, request("browse", "browse").toString());
		adapter.receive(connection, request("watch", "watch").add("matchId", MATCH).toString());

		assertEquals("AUTHENTICATION_REQUIRED", code(connection, 0));
		assertEquals("AUTHENTICATION_REQUIRED", code(connection, 1));
		verify(setup, never()).spectatorView(any(String.class));
	}

	@Test void scopedPrincipalWithoutPersistedMembershipCannotReachSetupEvenOnRetry() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal principal = new AuthenticatedPrincipal(FIRST, EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), Long.MAX_VALUE);
		when(access.require(eq(principal), eq(ApplicationScope.PLAYER))).thenReturn(principal);
		when(access.playerRole(eq(principal), eq(MATCH))).thenThrow(new MatchService.Failure("NOT_FOUND"));
		SetupApplication setup = mock(SetupApplication.class);
		Connection connection = new Connection();
		BrowserV2Adapter adapter = adapter(bearer -> principal, access, setup);

		adapter.receive(connection, authenticate("auth", "first").toString());
		adapter.receive(connection, setup("setup-1").toString());
		adapter.receive(connection, setup("setup-2").toString());

		assertEquals("NOT_FOUND", code(connection, 1));
		assertEquals("NOT_FOUND", code(connection, 2));
		verify(setup, never()).handleWithOutcome(any(String.class), any(JsonObject.class));
	}

	@Test void replacedConnectionCannotReauthenticateOrProcessQueuedMessages() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		BrowserV2Adapter adapter = adapter(bearer -> principal(FIRST, ApplicationScope.SPECTATOR), access, mock(SetupApplication.class));
		Connection older = new Connection(), newer = new Connection();

		adapter.receive(older, authenticate("old", "same-account").toString());
		adapter.receive(newer, authenticate("new", "same-account").toString());
		int replacedMessages = older.messages.size();
		adapter.receive(older, authenticate("stale-auth", "same-account").toString());
		adapter.receive(older, request("browse", "after-replacement").toString());

		assertEquals("CONNECTION_REPLACED", code(older, 1));
		assertEquals(replacedMessages, older.messages.size());
		assertEquals(1008, older.closeStatusCode);
		assertEquals("ACCEPTED", code(newer, 0));
	}

	@Test void replacingAConnectionRemovesItsLiveMatchSubscription() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal actor = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		when(access.require(eq(actor), eq(ApplicationScope.PLAYER))).thenReturn(actor);
		when(access.playerRole(actor, MATCH)).thenReturn("home");
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.spectatorView(MATCH)).thenReturn(new JsonObject().add("matchId", MATCH).add("phase", "PLAY"));
		SetupApplication.HandleOutcome change = outcome(new JsonObject().add("code", "ACCEPTED")
			.add("state", new JsonObject().add("matchId", MATCH).add("phase", "PLAY")), true);
		when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenReturn(change);
		BrowserV2Adapter adapter = adapter(bearer -> "actor".equals(bearer) ? actor : spectator, access, setup);
		Connection player = new Connection(), older = new Connection(), newer = new Connection();
		adapter.receive(player, authenticate("a", "actor").toString());
		adapter.receive(older, authenticate("old", "viewer").toString());
		adapter.receive(older, request("watch", "watch").add("matchId", MATCH).toString());
		adapter.receive(newer, authenticate("new", "viewer").toString());
		assertEquals("CONNECTION_REPLACED", code(older, 2));
		adapter.receive(player, setup("change").set("operation", "saveRequest").toString());
		assertEquals(3, older.messages.size());
		assertEquals(1, newer.messages.size());
		assertEquals(2, player.messages.size());
		verify(access, never()).require(spectator, ApplicationScope.SPECTATOR);
	}

	@Test void broadcastRechecksRecipientAccessAndWithholdsStateWhenItIsNoLongerAuthorized() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal source = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal recipient = principal(SECOND, ApplicationScope.PLAYER);
		when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER))).thenAnswer(call -> call.getArgument(0));
		when(access.playerRole(eq(source), eq(MATCH))).thenReturn("home");
		when(access.playerRole(eq(recipient), eq(MATCH))).thenReturn("away").thenThrow(new MatchService.Failure("AUTHENTICATION_REQUIRED"));
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenAnswer(call ->
			outcome(new JsonObject().add("code", "ACCEPTED")
				.add("state", new JsonObject().add("matchId", MATCH).add("phase", "PLAY")),
				!"load".equals(((JsonObject) call.getArgument(1)).getString("operation", ""))));
		BrowserV2Adapter adapter = adapter(bearer -> "first".equals(bearer) ? source : recipient, access, setup);
		Connection first = new Connection(), second = new Connection();

		adapter.receive(first, authenticate("a", "first").toString());
		adapter.receive(second, authenticate("b", "second").toString());
		adapter.receive(second, setup("recipient-load").toString());
		adapter.receive(first, setup("source-update").set("operation", "submit").toString());

		verify(access, times(2)).playerRole(eq(recipient), eq(MATCH));
		assertEquals("VIEW_UNAVAILABLE", code(second, 2));
		assertEquals(3, second.messages.size());
	}

	private BrowserV2Adapter adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup) {
		return adapter(authenticator, access, setup, mock(V2PreparationService.class));
	}

	@Test void reconciledCompletionNotifiesAuthorizedOpponentOnceEvenOnDuplicateLoad() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal home = principal(FIRST, ApplicationScope.PLAYER), away = principal(SECOND, ApplicationScope.PLAYER);
		when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER))).thenAnswer(call -> call.getArgument(0));
		when(access.playerRole(home, MATCH)).thenReturn("home"); when(access.playerRole(away, MATCH)).thenReturn("away");
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenAnswer(call -> {
			JsonObject request = call.getArgument(1);
			return outcome(new JsonObject().add("code", "ACCEPTED").add("duplicate", true)
				.add("state", new JsonObject().add("matchId", MATCH).add("phase", "FULL_TIME")),
				"reconcile".equals(request.getString("requestId", "")));
		});
		when(setup.handle(any(String.class), any(JsonObject.class))).thenAnswer(call -> new JsonObject().add("code", "ACCEPTED")
			.add("duplicate", false).add("state", new JsonObject().add("matchId", MATCH).add("phase", "FULL_TIME")));
		BrowserV2Adapter adapter = adapter(bearer -> "home".equals(bearer) ? home : away, access, setup);
		Connection first = new Connection(), second = new Connection();
		adapter.receive(first, authenticate("a", "home").toString()); adapter.receive(second, authenticate("b", "away").toString());
		adapter.receive(second, setup("subscribe").toString());
		adapter.receive(first, setup("reconcile").toString());
		assertEquals(3, second.messages.size());
		assertEquals("FULL_TIME", JsonObject.readFrom(second.messages.get(2)).get("state").asObject().getString("phase", null));
		adapter.receive(first, setup("again").toString());
		assertEquals(3, second.messages.size());
		verify(access, times(2)).playerRole(away, MATCH);
	}

	@Test void creatorIsNotifiedOfOpponentJoinAndActivationIncludingExactRetry() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal home = principal(FIRST, ApplicationScope.PLAYER), away = principal(SECOND, ApplicationScope.PLAYER);
		when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER))).thenAnswer(call -> call.getArgument(0));
		when(access.playerRole(home, MATCH)).thenReturn("home"); when(access.playerRole(away, MATCH)).thenReturn("away");
		V2PreparationService preparation = mock(V2PreparationService.class);
		when(preparation.handle(any(String.class), any(JsonObject.class))).thenAnswer(call -> preparedResponse());
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.activate(eq("away"), any(String.class))).thenAnswer(call -> preparedResponse().add("duplicate", true));
		BrowserV2Adapter adapter = adapter(bearer -> "home".equals(bearer) ? home : away, access, setup, preparation);
		Connection creator = new Connection(), opponent = new Connection();
		adapter.receive(creator, authenticate("a", "home").toString()); adapter.receive(opponent, authenticate("b", "away").toString());
		adapter.receive(creator, request("preparedMatch", "create").add("operation", "create").toString());
		adapter.receive(opponent, request("preparedMatch", "join").add("operation", "join").toString());
		adapter.receive(opponent, request("preparedMatch", "activate").add("operation", "activate").add("matchId", MATCH).toString());
		assertEquals(4, creator.messages.size());
		for (int index = 2; index < 4; index++) {
			JsonObject notice = JsonObject.readFrom(creator.messages.get(index));
			assertEquals("preparationChanged", notice.getString("type", null));
			assertEquals(MATCH, notice.getString("matchId", null));
			assertTrue(notice.get("requestId").isNull()); assertEquals(5, notice.size());
		}
		verify(access, times(2)).playerRole(home, MATCH);
		adapter.disconnect(creator);
		adapter.receive(opponent, request("preparedMatch", "again").add("operation", "activate").add("matchId", MATCH).toString());
		assertEquals(4, creator.messages.size());
	}

	@Test void revokedPreparationRecipientGetsNoMatchNotificationOrState() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal home = principal(FIRST, ApplicationScope.PLAYER), away = principal(SECOND, ApplicationScope.PLAYER);
		when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER))).thenAnswer(call -> call.getArgument(0));
		when(access.playerRole(home, MATCH)).thenThrow(new MatchService.Failure("AUTHENTICATION_REQUIRED"));
		V2PreparationService preparation = mock(V2PreparationService.class);
		when(preparation.handle(any(String.class), any(JsonObject.class))).thenAnswer(call -> preparedResponse());
		BrowserV2Adapter adapter = adapter(bearer -> "home".equals(bearer) ? home : away, access, mock(SetupApplication.class), preparation);
		Connection creator = new Connection(), opponent = new Connection();
		adapter.receive(creator, authenticate("a", "home").toString()); adapter.receive(opponent, authenticate("b", "away").toString());
		adapter.receive(creator, request("preparedMatch", "create").add("operation", "create").toString());
		adapter.receive(opponent, request("preparedMatch", "join").add("operation", "join").toString());
		assertEquals("VIEW_UNAVAILABLE", code(creator, 2));
		assertFalse(creator.messages.get(2).contains(MATCH));
		adapter.receive(opponent, request("preparedMatch", "retry").add("operation", "join").toString());
		assertEquals(3, creator.messages.size());
	}

	private SetupApplication.HandleOutcome outcome(JsonObject response, boolean publish) {
		SetupApplication.HandleOutcome outcome = mock(SetupApplication.HandleOutcome.class);
		when(outcome.response()).thenReturn(response);
		when(outcome.publish()).thenReturn(publish);
		return outcome;
	}

	@Test void authorizedSpectatorReceivesFinalPublicFrameThenLeavesLiveViewerSet() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal actor = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		when(access.require(eq(actor), eq(ApplicationScope.PLAYER))).thenReturn(actor);
		when(access.require(eq(spectator), eq(ApplicationScope.SPECTATOR))).thenReturn(spectator);
		when(access.playerRole(actor, MATCH)).thenReturn("home");
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.spectatorView(MATCH)).thenReturn(new JsonObject().add("matchId", MATCH).add("phase", "PLAY"));
		when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenAnswer(call ->
			outcome(new JsonObject().add("code", "ACCEPTED").add("duplicate", false)
				.add("state", new JsonObject().add("matchId", MATCH).add("phase", "FULL_TIME").add("callerRole", "home")), true));
		BrowserV2Adapter adapter = adapter(bearer -> "actor".equals(bearer) ? actor : spectator, access, setup);
		Connection player = new Connection(), viewer = new Connection();
		adapter.receive(player, authenticate("actor-auth", "actor").toString());
		adapter.receive(viewer, authenticate("viewer-auth", "viewer").toString());
		adapter.receive(viewer, request("watch", "watch").add("matchId", MATCH).toString());
		adapter.receive(player, setup("finish").set("operation", "confirm").toString());

		assertEquals(3, viewer.messages.size());
		JsonObject finalFrame = JsonObject.readFrom(viewer.messages.get(2));
		assertEquals("spectator", finalFrame.get("state").asObject().getString("callerRole", null));
		assertTrue(finalFrame.get("requestId").isNull());
		adapter.receive(player, setup("retry").set("operation", "confirm").toString());
		assertEquals(3, viewer.messages.size());
		verify(access, times(1)).spectatorSnapshot(spectator, MATCH);
		verify(access, times(1)).require(spectator, ApplicationScope.SPECTATOR);
	}

	@Test void revokedSpectatorIsRemovedWithoutPreventingAuthorizedPeerUpdate() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal actor = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal peer = principal(SECOND, ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal("cccccccc-cccc-cccc-cccc-cccccccccccc", ApplicationScope.SPECTATOR);
		when(access.require(eq(actor), eq(ApplicationScope.PLAYER))).thenReturn(actor);
		when(access.require(eq(peer), eq(ApplicationScope.PLAYER))).thenReturn(peer);
		when(access.require(eq(spectator), eq(ApplicationScope.SPECTATOR))).thenThrow(new MatchService.Failure("AUTHORIZATION"));
		when(access.playerRole(actor, MATCH)).thenReturn("home");
		when(access.playerRole(peer, MATCH)).thenReturn("away");
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.spectatorView(MATCH)).thenReturn(new JsonObject().add("matchId", MATCH).add("phase", "PLAY"));
		when(setup.handleWithOutcome(any(String.class), any(JsonObject.class))).thenAnswer(call -> {
			JsonObject request = call.getArgument(1);
			return outcome(new JsonObject().add("code", "ACCEPTED").add("duplicate", false)
				.add("state", new JsonObject().add("matchId", MATCH).add("phase", "PLAY")),
				!"load".equals(request.getString("operation", "")));
		});
		when(setup.handle(any(String.class), any(JsonObject.class))).thenReturn(new JsonObject().add("code", "ACCEPTED")
			.add("state", new JsonObject().add("matchId", MATCH).add("phase", "PLAY")));
		BrowserV2Adapter adapter = adapter(bearer -> "actor".equals(bearer) ? actor : "peer".equals(bearer) ? peer : spectator, access, setup);
		Connection player = new Connection(), other = new Connection(), viewer = new Connection();
		adapter.receive(player, authenticate("a", "actor").toString());
		adapter.receive(other, authenticate("b", "peer").toString());
		adapter.receive(viewer, authenticate("c", "viewer").toString());
		adapter.receive(other, setup("subscribe").toString());
		adapter.receive(viewer, request("watch", "watch").add("matchId", MATCH).toString());
		adapter.receive(player, setup("change").set("operation", "saveRequest").toString());

		assertEquals("VIEW_UNAVAILABLE", code(viewer, 2));
		assertFalse(viewer.messages.get(2).contains(MATCH));
		assertEquals("ACCEPTED", code(other, 2));
		adapter.receive(player, setup("again").set("operation", "saveCancel").toString());
		assertEquals(3, viewer.messages.size());
		assertEquals(4, other.messages.size());
	}

	private JsonObject preparedResponse() { return new JsonObject().add("type", "preparedMatch").add("code", "ACCEPTED").add("document", new JsonObject().add("matchId", MATCH)); }
	private BrowserV2Adapter adapter(V2PrincipalAuthenticator authenticator, V2MatchAccess access, SetupApplication setup, V2PreparationService preparation) {
		return new BrowserV2Adapter(authenticator, access, setup, mock(MatchService.class), preparation, mock(BrowserSavedTeamJson.class));
	}

	private AuthenticatedPrincipal principal(String account, ApplicationScope scope) {
		return new AuthenticatedPrincipal(account, EnumSet.of(scope), Long.MAX_VALUE);
	}

	private JsonObject authenticate(String requestId, String bearer) { return request("authenticate", requestId).add("bearer", bearer); }
	private JsonObject setup(String requestId) { return request("setup", requestId).add("operation", "load").add("matchId", MATCH); }
	private JsonObject request(String type, String requestId) { return new JsonObject().add("version", 2).add("type", type).add("requestId", requestId); }
	private String code(Connection connection, int index) { return JsonObject.readFrom(connection.messages.get(index)).getString("code", null); }

	private static final class Connection implements BrowserMatchAdapter.Connection {
		private final List<String> messages = new ArrayList<>();
		private int closeStatusCode;
		@Override public void send(String message) { messages.add(message); }
		@Override public void close(int statusCode, String reason) { closeStatusCode = statusCode; }
	}
}
