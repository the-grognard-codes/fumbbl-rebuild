package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchMembership;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;

import java.time.Clock;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.HashSet;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Real authorization boundary with local repository/application doubles; no provider credentials. */
class BrowserV2ProjectionTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private static final String FOREIGN = "22345678-1234-1234-1234-123456789abc";
	private static final String ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private final MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
	private final V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
	private final SetupApplication setup = mock(SetupApplication.class);
	private final BrowserSavedTeamJson teams = mock(BrowserSavedTeamJson.class);
	private final V2PreparationService preparation = mock(V2PreparationService.class);
	private final AuthenticatedPrincipal principal = new AuthenticatedPrincipal(ACCOUNT,
		EnumSet.of(ApplicationScope.PLAYER, ApplicationScope.SPECTATOR), Long.MAX_VALUE);
	private final Peer peer = new Peer();
	private final BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> principal,
		new V2MatchAccess(memberships, directory, Clock.systemUTC()), setup, mock(MatchService.class), preparation, teams);

	@Test void authenticationAndBrowseExposeOnlyTheirDocumentedFields() throws Exception {
		authenticate(); keys(peer.last, "version", "type", "requestId", "code", "accountId");
		assertEquals(ACCOUNT, peer.last.getString("accountId", null));
		when(memberships.activeMatches()).thenReturn(Arrays.asList(MATCH));
		send(request("browse")); keys(peer.last, "version", "type", "requestId", "code", "matches");
		JsonObject entry = peer.last.get("matches").asArray().get(0).asObject();
		keys(entry, "matchId", "label"); assertEquals("Home vs Away", entry.getString("label", null));
	}

	@Test void catalogAndValidationExposeOnlyPublicCatalogFields() throws Exception {
		authenticate(); send(request("catalog"));
		keys(peer.last, "version", "type", "requestId", "catalogVersion", "ruleset", "rosterId", "name", "presetId", "budget",
			"minPlayers", "maxPlayers", "skillPoints", "maxSecondary", "maxElite", "league", "specialRule", "positions", "skills", "resources", "unsupported");
		java.nio.file.Path fixture = java.nio.file.Paths.get("..", "browser-client", "examples", "human-starter-draft.json");
		JsonObject draft = JsonObject.readFrom(new String(java.nio.file.Files.readAllBytes(fixture), java.nio.charset.StandardCharsets.UTF_8));
		send(request("validateTeam").add("draft", draft));
		keys(peer.last, "version", "type", "requestId", "catalogVersion", "ruleset", "valid", "budget", "skillPoints", "messages", "total");
	}

	@Test void homeAndAwayAreResolvedFromMembershipAndCrossMatchRetriesNeverReachEngine() throws Exception {
		authenticate();
		for (String role : Arrays.asList("home", "away")) {
			when(memberships.find(MATCH, ACCOUNT)).thenReturn(new MatchMembership(MATCH, ACCOUNT, role));
			when(setup.handle(any(String.class), any(JsonObject.class))).thenReturn(new JsonObject().add("code", "NOT_ACTIVATED"));
			send(request("setup").add("operation", "load").add("matchId", MATCH));
			verify(setup).handle(org.mockito.ArgumentMatchers.eq(role), any(JsonObject.class));
		}
		JsonObject foreign = request("setup").add("operation", "action").add("matchId", FOREIGN);
		for (int retry = 0; retry < 2; retry++) { send(foreign); denial("NOT_FOUND"); }
		verify(setup, never()).handle(any(String.class), org.mockito.ArgumentMatchers.argThat(value -> FOREIGN.equals(value.getString("matchId", null))));
	}

	@Test void spectatorWithBothDefaultScopesCannotReadPreparationOrExecuteOrRetryPlayerOperations() throws Exception {
		authenticate(); when(memberships.isActive(MATCH)).thenReturn(true);
		when(setup.spectatorView(MATCH)).thenReturn(new JsonObject().add("matchId", MATCH).add("callerRole", "spectator"));
		send(request("watch").add("matchId", MATCH));
		keys(peer.last, "version", "type", "requestId", "code", "duplicate", "state");
		assertEquals("spectator", peer.last.get("state").asObject().getString("callerRole", null));
		for (String operation : Arrays.asList("load", "choice", "place", "confirm", "action")) {
			JsonObject intent = request("setup").add("operation", operation).add("matchId", MATCH);
			for (int retry = 0; retry < 2; retry++) { send(intent); denial("NOT_FOUND"); }
		}
		for (String operation : Arrays.asList("load", "activate", "release")) {
			send(request("preparedMatch").add("operation", operation).add("matchId", MATCH)); denial("NOT_FOUND");
		}
		verify(setup, never()).handle(any(String.class), any(JsonObject.class)); verifyNoInteractions(preparation);
	}

	@Test void revokedIdentityDeniesEveryProtocolFamilyBeforePrivateApplicationReads() throws Exception {
		authenticate(); when(directory.reauthorize(principal)).thenThrow(new V2PrincipalAuthenticator.Rejected());
		for (String family : Arrays.asList("browse", "watch", "catalog", "validateTeam", "savedTeam", "preparedMatch", "setup")) {
			JsonObject request = request(family);
			if ("watch".equals(family)) request.add("matchId", MATCH);
			send(request); denial("AUTHENTICATION_REQUIRED");
		}
		verifyNoInteractions(memberships, setup, teams, preparation);
	}

	@Test void unavailableFamiliesAndForgedIdentityFieldsReturnOnlyGenericErrors() throws Exception {
		authenticate();
		for (String family : Arrays.asList("admin", "support", "result", "replay", "chat", "legacy")) {
			send(request(family)); denial("UNSUPPORTED_MESSAGE");
		}
		for (String field : Arrays.asList("email", "uid", "name", "role", "dice")) {
			send(request("browse").add(field, "private-sentinel")); denial("MALFORMED_MESSAGE");
			assertFalse(peer.last.toString().contains("private-sentinel"));
		}
		verifyNoInteractions(memberships, setup, teams, preparation);
	}

	private void authenticate() throws Exception {
		when(directory.reauthorize(principal)).thenReturn(principal);
		send(request("authenticate").add("bearer", "synthetic-only"));
	}
	private JsonObject request(String type) { return new JsonObject().add("version", 2).add("type", type).add("requestId", "contract"); }
	private void send(JsonObject request) { adapter.receive(peer, request.toString()); }
	private void denial(String code) { assertEquals(code, peer.last.getString("code", null)); keys(peer.last, "version", "type", "requestId", "code"); }
	private void keys(JsonObject value, String... expected) { assertEquals(new HashSet<>(Arrays.asList(expected)), new HashSet<>(value.names())); assertEquals(expected.length, value.size()); }
	private static final class Peer implements BrowserMatchAdapter.Connection {
		JsonObject last;
		@Override public void send(String text) { last = JsonObject.readFrom(text); }
	}
}
