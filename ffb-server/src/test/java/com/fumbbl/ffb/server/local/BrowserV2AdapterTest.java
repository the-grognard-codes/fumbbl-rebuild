package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.CompletedMatch;
import com.fumbbl.ffb.server.match.FrozenTeam;
import com.fumbbl.ffb.server.match.MatchDocument;
import com.fumbbl.ffb.server.match.MatchMembership;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BrowserV2AdapterTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private static final String FIRST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private static final String SECOND = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
	private static final String SERVICE_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	private static final String SERVICE_HASH = "66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0";

	@Test void freshSameAccountResumesAndReplacesOldSocketWhileMissingMembershipStaysNotFound() throws Exception {
		MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
		when(memberships.find(MATCH, FIRST)).thenReturn(new MatchMembership(MATCH, FIRST, "home"));
		V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
		when(directory.reauthorize(any(AuthenticatedPrincipal.class))).thenAnswer(call -> call.getArgument(0));
		V2MatchAccess access = new V2MatchAccess(memberships, directory, Clock.systemUTC());
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.handleWithOutcome(eq("home"), any(JsonObject.class))).thenAnswer(call -> outcome(new JsonObject()
			.add("code", "ACCEPTED").add("duplicate", false).add("state", new JsonObject()
				.add("matchId", MATCH).add("revision", 42).add("phase", "PLAY")), false));
		BrowserV2Adapter adapter = adapter(bearer -> principal("outsider".equals(bearer) ? SECOND : FIRST,
			ApplicationScope.PLAYER), access, setup);
		Connection original = new Connection(), fresh = new Connection(), outsider = new Connection();
		adapter.receive(original, authenticate("original-auth", "same-account").toString());
		adapter.receive(original, setup("original-load").toString());
		adapter.receive(fresh, authenticate("fresh-auth", "same-account").toString());
		adapter.receive(fresh, setup("fresh-load").toString());
		assertEquals("CONNECTION_REPLACED", code(original, 2));
		assertEquals(1008, original.closeStatusCode);
		assertEquals(JsonObject.readFrom(original.messages.get(1)).get("state"),
			JsonObject.readFrom(fresh.messages.get(1)).get("state"));
		adapter.receive(original, setup("queued-old-action").set("operation", "concede").add("expectedRevision", 42).toString());
		adapter.receive(outsider, authenticate("outsider-auth", "outsider").toString());
		adapter.receive(outsider, setup("foreign-load").toString());
		adapter.receive(fresh, setup("unknown-load").set("matchId", SECOND).toString());
		assertEquals("NOT_FOUND", code(outsider, 1));
		assertEquals("NOT_FOUND", code(fresh, 2));
		verify(setup, times(2)).handleWithOutcome(eq("home"), any(JsonObject.class));
		verify(setup, never()).handleWithOutcome(eq(FIRST), any(JsonObject.class));
		verify(setup, never()).handleWithOutcome(eq("away"), any(JsonObject.class));
	}

	@Test void currentMatchesExposeOnlyOwnedPublicFactsIncludingUnactivatedAndUnavailableGames() throws Exception {
		AuthenticatedPrincipal player = principal(FIRST, ApplicationScope.PLAYER);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.currentMatches(player, null)).thenReturn(java.util.Arrays.asList(
			new MatchMembership(MATCH, FIRST, "home"), new MatchMembership(SECOND, FIRST, "away")));
		SetupApplication setup = mock(SetupApplication.class);
		MatchDocument waiting = new MatchDocument(MATCH, 1, "away", MatchDocument.Lifecycle.WAITING_FOR_OPPONENT,
			new MatchDocument.Member("home", "home", frozenTeam("The Reavers", "human", 1000000)), null);
		when(setup.browseDocument(MATCH)).thenReturn(waiting);
		when(setup.browseDocument(SECOND)).thenThrow(new SQLException("storage unavailable"));
		BrowserV2Adapter adapter = adapter(bearer -> player, access, setup);
		Connection connection = new Connection();
		adapter.receive(connection, authenticate("auth", "player").toString());
		adapter.receive(connection, request("currentMatches", "list").add("after", JsonValue.NULL).toString());
		JsonObject response = JsonObject.readFrom(connection.messages.get(1));
		JsonArray entries = response.get("matches").asArray();
		assertEquals("ACCEPTED", response.getString("code", null)); assertEquals(2, entries.size());
		assertEquals(6, entries.get(0).asObject().size());
		assertEquals("The Reavers", entries.get(0).asObject().getString("homeTeamName", null));
		assertEquals("WAITING_FOR_OPPONENT", entries.get(0).asObject().getString("lifecycle", null));
		assertTrue(entries.get(0).asObject().get("awayTeamName").isNull());
		assertEquals("UNAVAILABLE", entries.get(1).asObject().getString("lifecycle", null));
		assertTrue(response.get("next").isNull());
		verify(setup, never()).browseState(any(String.class));
		verify(setup, never()).handleWithOutcome(any(String.class), any(JsonObject.class));
		adapter.receive(connection, request("currentMatches", "foreign").add("after", JsonValue.NULL).add("accountId", SECOND).toString());
		assertEquals("MALFORMED_MESSAGE", code(connection, 2));
	}

	@Test void activatedInventoryRequiresAReadableCheckpointBeforeOfferingResume() throws Exception {
		AuthenticatedPrincipal player = principal(FIRST, ApplicationScope.PLAYER);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.currentMatches(player, null)).thenReturn(Collections.singletonList(new MatchMembership(MATCH, FIRST, "home")));
		SetupApplication setup = mock(SetupApplication.class);
		FrozenTeam team = frozenTeam("The Reavers", "human", 1000000);
		when(setup.browseDocument(MATCH)).thenReturn(new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
			new MatchDocument.Member("home", "home", team), new MatchDocument.Member("away", "away", team)));
		BrowserV2Adapter adapter = adapter(bearer -> player, access, setup);
		Connection connection = new Connection();
		adapter.receive(connection, authenticate("auth", "player").toString());
		for (int attempt = 0; attempt < 3; attempt++) {
			if (attempt == 1) when(setup.browseState(MATCH)).thenThrow(new SQLException("unavailable"));
			if (attempt == 2) doReturn(new JsonObject().add("phase", "PRE_MATCH")).when(setup).browseState(MATCH);
			adapter.receive(connection, request("currentMatches", "list" + attempt).add("after", JsonValue.NULL).toString());
			JsonObject entry = JsonObject.readFrom(connection.messages.get(attempt + 1)).get("matches").asArray().get(0).asObject();
			assertEquals(attempt == 2 ? "ACTIVATED" : "UNAVAILABLE", entry.getString("lifecycle", null));
		}
		verify(setup, never()).handleWithOutcome(any(String.class), any(JsonObject.class));
	}

	@Test void currentMatchesRequireAuthorizationAndReturnAPagingCursorWithoutRestoringEngines() throws Exception {
		AuthenticatedPrincipal player = principal(FIRST, ApplicationScope.PLAYER);
		V2MatchAccess access = mock(V2MatchAccess.class);
		List<MatchMembership> memberships = new ArrayList<>();
		for (int index = 1; index <= 101; index++) memberships.add(new MatchMembership(
			String.format("%08x-1234-1234-1234-123456789abc", index), FIRST, "home"));
		when(access.currentMatches(player, null)).thenReturn(memberships);
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.browseDocument(any(String.class))).thenThrow(new MatchService.Failure("NOT_FOUND"));
		BrowserV2Adapter adapter = adapter(bearer -> player, access, setup);
		Connection connection = new Connection();
		adapter.receive(connection, authenticate("auth", "player").toString());
		adapter.receive(connection, request("currentMatches", "page").add("after", JsonValue.NULL).toString());
		JsonObject response = JsonObject.readFrom(connection.messages.get(1));
		assertEquals(100, response.get("matches").asArray().size());
		assertEquals(memberships.get(99).matchId, response.getString("next", null));
		when(access.currentMatches(player, MATCH)).thenThrow(new MatchService.Failure("AUTHORIZATION"));
		adapter.receive(connection, request("currentMatches", "denied").add("after", MATCH).toString());
		assertEquals("AUTHORIZATION", code(connection, 2));
		verify(setup, times(100)).browseDocument(any(String.class));
		verify(setup, never()).handleWithOutcome(any(String.class), any(JsonObject.class));
	}

	@Test void routePreviewRequiresCoachMembershipAndKeepsTheEngineReadOnly() throws Exception {
		AuthenticatedPrincipal player = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(player, ApplicationScope.PLAYER)).thenReturn(player);
		when(access.require(spectator, ApplicationScope.PLAYER)).thenThrow(new MatchService.Failure("AUTHORIZATION"));
		when(access.playerRole(player, MATCH)).thenReturn("home");
		SetupApplication setup = mock(SetupApplication.class);
		JsonArray points = new JsonArray().add(new JsonObject().add("x", 6).add("y", 7));
		when(setup.routePreview("home", MATCH, 9, points)).thenReturn(new JsonObject().add("routeVersion", 1)
			.add("revision", 9).add("playerId", "p1").add("steps", new JsonArray()));
		BrowserV2Adapter adapter = adapter(bearer -> "player".equals(bearer) ? player : spectator, access, setup);
		Connection coach = new Connection(), viewer = new Connection();
		adapter.receive(coach, authenticate("auth-coach", "player").toString());
		adapter.receive(viewer, authenticate("auth-viewer", "spectator").toString());
		JsonObject request = request("routePreview", "route").add("matchId", MATCH)
			.add("expectedRevision", 9).add("waypoints", points);
		adapter.receive(coach, request.toString());
		assertEquals("ACCEPTED", code(coach, 1));
		assertEquals(1, JsonObject.readFrom(coach.messages.get(1)).get("route").asObject().getInt("routeVersion", -1));
		adapter.receive(viewer, request.toString());
		assertEquals("AUTHORIZATION", code(viewer, 1));
		verify(setup, times(1)).routePreview("home", MATCH, 9, points);
	}

	@Test void authorizedSpectatorReadsBoundedTranscriptWithoutPlayerScope() throws Exception {
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.playerRole(spectator, MATCH)).thenThrow(new MatchService.Failure("AUTHORIZATION"));
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.transcriptPage(MATCH, 0, 4)).thenReturn(new JsonObject().add("formatVersion", 2)
			.add("from", 0).add("next", 0).add("total", 0).add("records", new com.eclipsesource.json.JsonArray()));
		BrowserV2Adapter adapter = adapter(bearer -> spectator, access, setup);
		Connection connection = new Connection();
		adapter.receive(connection, authenticate("auth", "viewer").toString());
		adapter.receive(connection, request("matchTranscript", "page").add("matchId", MATCH).add("from", 0).add("limit", 4).toString());
		JsonObject page = JsonObject.readFrom(connection.messages.get(1));
		assertEquals("ACCEPTED", page.getString("code", null));
		assertEquals(2, page.get("page").asObject().getInt("formatVersion", -1));
		verify(access).spectatorTranscript(spectator, MATCH);
		verify(setup).transcriptPage(MATCH, 0, 4);
		doThrow(new MatchService.Failure("NOT_FOUND")).when(access).spectatorTranscript(spectator, MATCH);
		adapter.receive(connection, request("matchTranscript", "denied").add("matchId", MATCH).add("from", 0).add("limit", 4).toString());
		assertEquals("NOT_FOUND", code(connection, 2));
		verify(setup, times(1)).transcriptPage(MATCH, 0, 4);
	}

	@Test void computerServiceHasSeparateAuthenticationAndCanServeConcurrentMatches() throws Exception {
		AuthenticatedPrincipal home = principal(FIRST, ApplicationScope.PLAYER);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(home, ApplicationScope.PLAYER)).thenReturn(home);
		V2PreparationService preparation = mock(V2PreparationService.class);
		when(preparation.activeComputerMatches()).thenReturn(java.util.Collections.singletonList(MATCH));
		when(preparation.isComputerMatch(MATCH)).thenReturn(true);
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.handleWithOutcome(eq("away"), any(JsonObject.class))).thenAnswer(call -> {
			JsonObject request = call.getArgument(1);
			return outcome(new JsonObject().add("type", "setupState").add("requestId", request.getString("requestId", null))
				.add("code", "ACCEPTED").add("duplicate", false)
				.add("state", new JsonObject().add("matchId", MATCH).add("callerRole", "away")), false);
		});
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> home, access, setup,
			mock(MatchService.class), preparation, mock(BrowserSavedTeamJson.class),
			new com.fumbbl.ffb.server.match.ComputerOpponentService(SERVICE_HASH));
		Connection player = new Connection(), dispatcher = new Connection(), workerOne = new Connection(), workerTwo = new Connection();
		adapter.receive(player, authenticate("player-auth", "human").toString());
		adapter.receive(player, request("computer", "early").add("operation", "status").toString());
		adapter.receive(player, request("computer", "human-register").add("operation", "register").toString());
		adapter.receive(dispatcher, request("authenticateComputer", "bad").add("serviceToken", "invalid").toString());
		adapter.receive(dispatcher, request("authenticateComputer", "auth").add("serviceToken", SERVICE_TOKEN).toString());
		adapter.receive(dispatcher, request("computer", "register").add("operation", "register").toString());
		adapter.receive(player, request("computer", "ready").add("operation", "status").toString());
		adapter.receive(workerOne, request("authenticateComputer", "worker-1").add("serviceToken", SERVICE_TOKEN).toString());
		adapter.receive(workerTwo, request("authenticateComputer", "worker-2").add("serviceToken", SERVICE_TOKEN).toString());
		adapter.receive(workerOne, setup("load-1").toString());
		adapter.receive(workerTwo, setup("load-2").toString());
		adapter.receive(workerOne, setup("human-match").set("matchId", SECOND).toString());
		assertEquals("UNAVAILABLE", code(player, 1));
		assertEquals("MALFORMED_MESSAGE", code(player, 2));
		assertEquals("AUTHENTICATION_FAILED", code(dispatcher, 0));
		assertEquals("ACCEPTED", code(dispatcher, 1));
		assertEquals("READY", code(dispatcher, 2));
		assertEquals("computerJobs", JsonObject.readFrom(dispatcher.messages.get(3)).getString("type", null));
		assertEquals(MATCH, JsonObject.readFrom(dispatcher.messages.get(3)).get("matches").asArray().get(0).asString());
		assertEquals("READY", code(player, 3));
		assertEquals("ACCEPTED", code(workerOne, 1));
		assertEquals("NOT_FOUND", code(workerOne, 2));
		assertEquals("ACCEPTED", code(workerTwo, 1));
		assertEquals(0, workerOne.closeStatusCode);
		assertEquals(0, workerTwo.closeStatusCode);
		adapter.disconnect(dispatcher);
		adapter.receive(player, request("computer", "offline").add("operation", "status").toString());
		assertEquals("UNAVAILABLE", code(player, 4));
	}

	@Test void activationDispatchesComputerMatchToRegisteredDaemon() throws Exception {
		AuthenticatedPrincipal home = principal(FIRST, ApplicationScope.PLAYER);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(home, ApplicationScope.PLAYER)).thenReturn(home);
		when(access.playerRole(home, MATCH)).thenReturn("home");
		V2PreparationService preparation = mock(V2PreparationService.class);
		when(preparation.isComputerMatch(MATCH)).thenReturn(true);
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.activate(eq("home"), any(String.class))).thenAnswer(call -> preparedResponse());
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> home, access, setup,
			mock(MatchService.class), preparation, mock(BrowserSavedTeamJson.class),
			new com.fumbbl.ffb.server.match.ComputerOpponentService(SERVICE_HASH));
		Connection player = new Connection(), dispatcher = new Connection();
		adapter.receive(player, authenticate("player-auth", "human").toString());
		adapter.receive(dispatcher, request("authenticateComputer", "service-auth").add("serviceToken", SERVICE_TOKEN).toString());
		adapter.receive(dispatcher, request("computer", "register").add("operation", "register").toString());
		adapter.receive(player, request("preparedMatch", "activate").add("operation", "activate")
			.add("matchId", MATCH).toString());
		assertEquals("ACCEPTED", code(player, 1));
		assertEquals("computerJobs", JsonObject.readFrom(dispatcher.messages.get(2)).getString("type", null));
		assertEquals(MATCH, JsonObject.readFrom(dispatcher.messages.get(2)).get("matches").asArray().get(0).asString());
	}
	@Test void completedParticipantResultUsesV2EnvelopeAndSpectatorScopeCannotRead() throws Exception {
		AuthenticatedPrincipal player = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		AuthenticatedPrincipal outsider = principal("cccccccc-cccc-cccc-cccc-cccccccccccc", ApplicationScope.PLAYER);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.require(player, ApplicationScope.PLAYER)).thenReturn(player);
		when(access.playerRole(player, MATCH)).thenReturn("home");
		when(access.require(outsider, ApplicationScope.PLAYER)).thenReturn(outsider);
		when(access.playerRole(outsider, MATCH)).thenThrow(new MatchService.Failure("NOT_FOUND"));
		when(access.require(spectator, ApplicationScope.PLAYER)).thenThrow(new MatchService.Failure("AUTHORIZATION"));
		MatchService matches = mock(MatchService.class);
		when(matches.result("home", MATCH)).thenReturn(new CompletedMatch(new JsonObject().add("matchId", MATCH)
			.add("events", new com.eclipsesource.json.JsonArray().add(new JsonObject().add("revision", 0).add("kind", "FULL_TIME"))).toString()));
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> "player".equals(bearer) ? player : "outsider".equals(bearer) ? outsider : spectator,
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
		Connection unrelated = new Connection();
		adapter.receive(unrelated, authenticate("auth-3", "outsider").toString());
		adapter.receive(unrelated, request("matchResult", "outside-load").add("operation", "load").add("matchId", MATCH).toString());
		adapter.receive(unrelated, request("matchResult", "outside-replay").add("operation", "replay").add("matchId", MATCH).add("index", 0).toString());
		assertEquals("NOT_FOUND", code(unrelated, 1));
		assertEquals("NOT_FOUND", code(unrelated, 2));
		verify(matches, times(2)).result("home", MATCH);
		verify(matches, never()).result(FIRST, MATCH);
		verify(matches, never()).result(outsider.accountId(), MATCH);
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
		verify(setup, never()).browseDocument(any(String.class));
	}

	@Test void plainBrowseAndExplicitlyDisabledDetailsKeepTheExactLegacyEntry() throws Exception {
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.browse(spectator)).thenReturn(Collections.singletonList(MATCH));
		SetupApplication setup = mock(SetupApplication.class);
		BrowserV2Adapter adapter = adapter(bearer -> spectator, access, setup);
		Connection browser = new Connection();
		adapter.receive(browser, authenticate("auth", "viewer").toString());
		adapter.receive(browser, request("browse", "plain").toString());
		adapter.receive(browser, request("browse", "disabled").add("includeDetails", false).toString());
		JsonObject legacy = new JsonObject().add("matchId", MATCH).add("label", "Home vs Away");
		for (int index = 1; index <= 2; index++) {
			assertEquals("ACCEPTED", code(browser, index));
			assertEquals(legacy, JsonObject.readFrom(browser.messages.get(index)).get("matches").asArray().get(0));
		}
		verify(setup, never()).browseDocument(any(String.class));
	}

	@Test void browseRejectsNonBooleanDetailsFlagBeforeReadingMatches() throws Exception {
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		BrowserV2Adapter adapter = adapter(bearer -> spectator, access, setup);
		Connection browser = new Connection();
		adapter.receive(browser, authenticate("auth", "viewer").toString());
		adapter.receive(browser, request("browse", "null").add("includeDetails", JsonValue.NULL).toString());
		adapter.receive(browser, request("browse", "text").add("includeDetails", "true").toString());
		adapter.receive(browser, request("browse", "number").add("includeDetails", 1).toString());
		for (int index = 1; index <= 3; index++) assertEquals("MALFORMED_MESSAGE", code(browser, index));
		verify(access, never()).browse(spectator);
		verify(setup, never()).browseDocument(any(String.class));
	}

	@Test void browseProjectsOnlyPublicMatchFactsAndCountsLiveSpectators() throws Exception {
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.browse(spectator)).thenReturn(Collections.singletonList(MATCH));
		SetupApplication setup = mock(SetupApplication.class);
		FrozenTeam home = frozenTeam("The Reavers", "human", 1000000);
		FrozenTeam away = frozenTeam("The Raiders", "orc", 1050000);
		MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
			new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away));
		when(setup.browseDocument(MATCH)).thenReturn(document);
		when(setup.browseState(MATCH)).thenReturn(new JsonObject().add("phase", "PLAY").add("half", 2)
			.add("turn", 5).add("homeScore", 1).add("awayScore", 2).add("private-token", "never-send"));
		when(setup.spectatorView(MATCH)).thenReturn(new JsonObject().add("matchId", MATCH));
		AuthenticatedPrincipal watcherPrincipal = principal(FIRST, ApplicationScope.SPECTATOR);
		BrowserV2Adapter adapter = adapter(bearer -> "watcher".equals(bearer) ? watcherPrincipal : spectator, access, setup);
		Connection watcher = new Connection(), browser = new Connection();
		adapter.receive(watcher, authenticate("watcher-auth", "watcher").toString());
		adapter.receive(watcher, request("watch", "watch").add("matchId", MATCH).toString());
		adapter.receive(browser, authenticate("browse-auth", "viewer").toString());
		adapter.receive(browser, request("browse", "browse").add("includeDetails", true).toString());
		JsonObject entry = JsonObject.readFrom(browser.messages.get(1)).get("matches").asArray().get(0).asObject();
		JsonObject details = entry.get("details").asObject();
		assertEquals("Home vs Away", entry.getString("label", null));
		assertEquals("The Reavers", details.get("home").asObject().getString("name", null));
		assertEquals("Human", details.get("home").asObject().getString("type", null));
		assertEquals(1000000, details.get("home").asObject().getInt("teamValue", -1));
		assertTrue(details.get("home").asObject().get("coach").isNull());
		assertEquals("Orc", details.get("away").asObject().getString("type", null));
		assertEquals(1, details.getInt("spectators", -1));
		assertEquals(2, details.getInt("awayScore", -1));
		assertTrue(details.get("competition").isNull());
		assertFalse(entry.toString().contains("private-token"));
		assertFalse(entry.toString().contains("never-send"));
		assertFalse(entry.toString().contains(FIRST));
		when(setup.browseState(MATCH)).thenThrow(new SQLException("checkpoint unavailable"));
		adapter.receive(browser, request("browse", "retry").add("includeDetails", true).toString());
		JsonObject fallback = JsonObject.readFrom(browser.messages.get(2)).get("matches").asArray().get(0).asObject().get("details").asObject();
		assertEquals("The Reavers", fallback.get("home").asObject().getString("name", null));
		assertTrue(fallback.get("homeScore").isNull());
	}

	@Test void browseLimitsEntriesAndKeepsUnavailableSummariesOptional() throws Exception {
		AuthenticatedPrincipal spectator = principal(SECOND, ApplicationScope.SPECTATOR);
		V2MatchAccess access = mock(V2MatchAccess.class);
		when(access.browse(spectator)).thenReturn(Collections.nCopies(101, MATCH));
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.browseDocument(MATCH)).thenThrow(new MatchService.Failure("NOT_FOUND"));
		BrowserV2Adapter adapter = adapter(bearer -> spectator, access, setup);
		Connection browser = new Connection();
		adapter.receive(browser, authenticate("auth", "viewer").toString());
		adapter.receive(browser, request("browse", "browse").add("includeDetails", true).toString());
		JsonArray entries = JsonObject.readFrom(browser.messages.get(1)).get("matches").asArray();
		assertEquals(100, entries.size());
		assertEquals(2, entries.get(0).asObject().size());
		verify(setup, times(100)).browseDocument(MATCH);
	}

	private FrozenTeam frozenTeam(String name, String roster, int value) {
		return new FrozenTeam(MATCH, 1, "home", "BB2025", "catalog", roster, "exhibition-1150", "catalog", null,
			name, value, 1150000, 0, Collections.emptyList(), Collections.emptyMap(),
			new JsonObject().add("name", "orc".equals(roster) ? "Orc" : "Human").toString());
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
