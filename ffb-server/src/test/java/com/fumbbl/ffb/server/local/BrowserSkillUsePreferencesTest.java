package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BrowserSkillUsePreferencesTest {
	private static final String FIRST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private static final String SECOND = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
	private static final String SERVICE_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	private static final String SERVICE_HASH = "66d34fba71f8f450f7e45598853e53bfc23bbd129027cbb131a2f4ffd7878cd0";

	@Test void settingsPersistAcrossConnectionsAndMatchesWithAccountIsolationAndNoGameplayMutation() throws Exception {
		Memory repository = new Memory(); SetupApplication setup = mock(SetupApplication.class);
		BrowserV2Adapter adapter = adapter(repository, setup);
		Peer first = new Peer(), second = new Peer(), anotherDevice = new Peer();
		authenticate(adapter, first, FIRST); authenticate(adapter, second, SECOND);
		adapter.receive(first, update("fend", "always-use").toString());
		assertEquals("always-use", first.last().get("preferences").asObject().getString("fend", null));
		adapter.receive(second, request("load").toString());
		assertEquals("always-ask", second.last().get("preferences").asObject().getString("fend", null));
		adapter.disconnect(first); authenticate(adapter, anotherDevice, FIRST);
		adapter.receive(anotherDevice, request("load").toString());
		assertEquals(18, anotherDevice.last().get("preferences").asObject().size());
		assertEquals("always-use", anotherDevice.last().get("preferences").asObject().getString("fend", null));
		adapter.receive(anotherDevice, update("dodge-movement", "always-ask").toString());
		adapter.receive(anotherDevice, update("dodge-block", "always-ask").toString());
		assertEquals("always-use", anotherDevice.last().get("preferences").asObject().getString("fend", null));
		assertEquals("always-ask", repository.load(FIRST).toJson().getString("dodge-movement", null));
		assertEquals("always-ask", repository.load(FIRST).toJson().getString("dodge-block", null));
		assertFalse(anotherDevice.last().names().contains("accountId"));
		verifyNoInteractions(setup);
	}
	@Test void unauthenticatedSpectatorAndComputerRequestsCannotWritePreferences() throws Exception {
		SkillUsePreferenceRepository repository = mock(SkillUsePreferenceRepository.class);
		BrowserV2Adapter adapter = adapter(repository, mock(SetupApplication.class));
		Peer anonymous = new Peer(), spectator = new Peer(), computer = new Peer();
		adapter.receive(anonymous, update("catch", "always-ask").toString());
		assertEquals("AUTHENTICATION_REQUIRED", anonymous.last().getString("code", null));
		authenticate(adapter, spectator, "spectator");
		adapter.receive(spectator, update("catch", "always-ask").toString());
		assertEquals("AUTHORIZATION", spectator.last().getString("code", null));
		adapter.receive(computer, new JsonObject().add("version", 2).add("type", "authenticateComputer").add("requestId", "computer-auth").add("serviceToken", SERVICE_TOKEN).toString());
		assertEquals("ACCEPTED", computer.last().getString("code", null));
		adapter.receive(computer, update("catch", "always-ask").toString());
		assertEquals("UNSUPPORTED_MESSAGE", computer.last().getString("code", null));
		verifyNoInteractions(repository);
	}
	@Test void unknownModesUseCasesSpoofedIdentityAndDuplicateFieldsFailBeforeWriting() throws Exception {
		SkillUsePreferenceRepository repository = mock(SkillUsePreferenceRepository.class);
		BrowserV2Adapter adapter = adapter(repository, mock(SetupApplication.class)); Peer peer = new Peer(); authenticate(adapter, peer, FIRST);
		for (JsonObject malformed : new JsonObject[] {update("pro", "always-use"), update("catch", "never"),
			update("catch", "always-use").add("accountId", SECOND), update("catch", "always-use").add("matchId", SECOND),
			update("catch", "always-use").add("mode", "always-ask"), request("reset")}) {
			adapter.receive(peer, malformed.toString()); assertEquals("MALFORMED_MESSAGE", peer.last().getString("code", null));
		}
		verifyNoInteractions(repository);
	}
	@Test void persistenceFailureDoesNotReturnAnAcceptedProjection() throws Exception {
		SkillUsePreferenceRepository repository = mock(SkillUsePreferenceRepository.class);
		org.mockito.Mockito.doThrow(new SQLException("private database failure")).when(repository).update(FIRST, SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK);
		BrowserV2Adapter adapter = adapter(repository, mock(SetupApplication.class)); Peer peer = new Peer(); authenticate(adapter, peer, FIRST);
		adapter.receive(peer, update("catch", "always-ask").toString());
		assertEquals("PERSISTENCE_FAILED", peer.last().getString("code", null));
		assertFalse(peer.last().toString().contains("private database"));
	}
	@Test void everyPreferenceRequestRechecksCurrentAccountAuthorization() throws Exception {
		SkillUsePreferenceRepository repository = mock(SkillUsePreferenceRepository.class);
		V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
		when(directory.reauthorize(any(AuthenticatedPrincipal.class))).thenThrow(new V2PrincipalAuthenticator.Rejected());
		V2MatchAccess access = new V2MatchAccess(mock(MatchMembershipRepository.class), directory, Clock.systemUTC());
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> new AuthenticatedPrincipal(FIRST, EnumSet.of(ApplicationScope.PLAYER), Long.MAX_VALUE),
			access, mock(SetupApplication.class), null, null, null);
		adapter.configureSkillUsePreferences(new SkillUsePreferenceService(repository, mock(MatchMembershipRepository.class)));
		Peer peer = new Peer(); authenticate(adapter, peer, FIRST);
		adapter.receive(peer, update("catch", "always-ask").toString());
		assertEquals("AUTHENTICATION_REQUIRED", peer.last().getString("code", null));
		verifyNoInteractions(repository);
	}
	private BrowserV2Adapter adapter(SkillUsePreferenceRepository repository, SetupApplication setup) throws Exception {
		V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
		when(directory.reauthorize(any(AuthenticatedPrincipal.class))).thenAnswer(call -> call.getArgument(0));
		MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
		V2MatchAccess access = new V2MatchAccess(memberships, directory, Clock.systemUTC());
		BrowserV2Adapter adapter = new BrowserV2Adapter(bearer -> new AuthenticatedPrincipal("spectator".equals(bearer) ? FIRST : bearer,
			EnumSet.of("spectator".equals(bearer) ? ApplicationScope.SPECTATOR : ApplicationScope.PLAYER), Long.MAX_VALUE),
			access, setup, mock(MatchService.class), null, null, new ComputerOpponentService(SERVICE_HASH));
		adapter.configureSkillUsePreferences(new SkillUsePreferenceService(repository, memberships)); return adapter;
	}
	private void authenticate(BrowserV2Adapter adapter, Peer peer, String bearer) {
		adapter.receive(peer, new JsonObject().add("version", 2).add("type", "authenticate").add("requestId", "auth").add("bearer", bearer).toString());
	}
	private JsonObject request(String operation) { return new JsonObject().add("version", 2).add("type", "skillUsePreferences").add("requestId", "settings").add("operation", operation); }
	private JsonObject update(String useCase, String mode) { return request("update").add("useCase", useCase).add("mode", mode); }
	private static final class Peer implements BrowserMatchAdapter.Connection {
		final List<String> messages = new ArrayList<>();
		@Override public void send(String message) { messages.add(message); }
		JsonObject last() { return JsonObject.readFrom(messages.get(messages.size() - 1)); }
	}
	private static final class Memory implements SkillUsePreferenceRepository {
		final Map<String, SkillUsePreferences> accounts = new HashMap<>();
		@Override public SkillUsePreferences load(String accountId) { return accounts.getOrDefault(accountId, SkillUsePreferences.defaults()); }
		@Override public void update(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) { accounts.put(accountId, load(accountId).with(useCase, mode)); }
	}
}
