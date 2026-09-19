package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
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
		verify(setup, never()).handle(any(String.class), any(JsonObject.class));
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

	@Test void broadcastRechecksRecipientAccessAndWithholdsStateWhenItIsNoLongerAuthorized() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		AuthenticatedPrincipal source = principal(FIRST, ApplicationScope.PLAYER);
		AuthenticatedPrincipal recipient = principal(SECOND, ApplicationScope.PLAYER);
		when(access.require(any(AuthenticatedPrincipal.class), eq(ApplicationScope.PLAYER))).thenAnswer(call -> call.getArgument(0));
		when(access.playerRole(eq(source), eq(MATCH))).thenReturn("home");
		when(access.playerRole(eq(recipient), eq(MATCH))).thenReturn("away").thenThrow(new MatchService.Failure("AUTHENTICATION_REQUIRED"));
		SetupApplication setup = mock(SetupApplication.class);
		when(setup.handle(any(String.class), any(JsonObject.class))).thenAnswer(call -> new JsonObject().add("code", "ACCEPTED")
			.add("state", new JsonObject().add("matchId", MATCH).add("phase", "PLAY")));
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
		return new BrowserV2Adapter(authenticator, access, setup, mock(MatchService.class), mock(V2PreparationService.class), mock(BrowserSavedTeamJson.class));
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
