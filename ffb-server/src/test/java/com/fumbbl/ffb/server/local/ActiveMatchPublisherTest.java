package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class ActiveMatchPublisherTest {
	@Test void terminalPublicationUsesTheCommittedTerminalViewAfterTheEngineIsReleased() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		BrowserConnection peer = mock(BrowserConnection.class);
		new PublicationTestGrants().allow(access, target -> "away");
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.enrollPlayer(peer, mock(AuthenticatedPrincipal.class), "match");
		publisher.publish("match", null, new JsonObject().add("phase", "FULL_TIME").add("revision", 900)
			.add("callerRole", "home").add("computer", new JsonObject()).add("threats", new JsonObject()));
		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(peer).send(frame.capture());
		JsonObject view = JsonObject.readFrom(frame.getValue()).get("state").asObject();
		assertEquals("away", view.getString("callerRole", null));
		assertEquals(900, view.getInt("revision", -1));
		assertNull(view.get("computer")); assertNull(view.get("threats"));
		verifyNoInteractions(setup);
	}

	@Test void sizeLimitNoticesUseCurrentPublicationAuthorizationWithoutReadingAnotherMatchState() throws Exception {
		for (boolean allowed : new boolean[] {true, false}) {
			V2MatchAccess access = mock(V2MatchAccess.class);
			SetupApplication setup = mock(SetupApplication.class);
			BrowserConnection peer = mock(BrowserConnection.class);
			new PublicationTestGrants().allow(access, target -> allowed ? "home" : null);
			when(setup.failure(null, "MATCH_SIZE_LIMIT")).thenReturn(new JsonObject().add("type", "setupState")
				.add("requestId", com.eclipsesource.json.JsonValue.NULL).add("code", "MATCH_SIZE_LIMIT")
				.add("duplicate", false).add("state", com.eclipsesource.json.JsonValue.NULL));
			ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
			publisher.enrollPlayer(peer, mock(AuthenticatedPrincipal.class), "match");
			publisher.publishStopped("match", null, "MATCH_SIZE_LIMIT");
			ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
			verify(peer).send(frame.capture());
			assertEquals(allowed ? "MATCH_SIZE_LIMIT" : "VIEW_UNAVAILABLE", JsonObject.readFrom(frame.getValue()).getString("code", null));
			verify(setup, never()).handle(any(String.class), any(JsonObject.class));
		}
	}
	@Test void playerPublicationUsesItsOwnCommittedViewAfterAuthorization() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		AuthenticatedPrincipal principal = mock(AuthenticatedPrincipal.class);
		BrowserConnection peer = mock(BrowserConnection.class);
		new PublicationTestGrants().allow(access, target -> "away");
		when(setup.publishedState("match", "away", false)).thenReturn(new JsonObject()
			.add("type", "setupState").add("code", "ACCEPTED")
			.add("state", new JsonObject().add("callerRole", "away").add("revision", 7)));
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.enrollPlayer(peer, principal, "match");
		publisher.publish("match", null, new JsonObject().add("callerRole", "home").add("revision", 7));
		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(peer).send(frame.capture());
		assertEquals("away", JsonObject.readFrom(frame.getValue()).get("state").asObject().getString("callerRole", null));
		verify(setup, never()).handle(any(String.class), any(JsonObject.class));
	}

	@Test void revokedPlayerCannotReadCommittedPublication() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		AuthenticatedPrincipal principal = mock(AuthenticatedPrincipal.class);
		BrowserConnection peer = mock(BrowserConnection.class);
		new PublicationTestGrants().allow(access, target -> null);
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.enrollPlayer(peer, principal, "match");
		publisher.publish("match", null, new JsonObject());
		publisher.publishPlacement("match", null, new JsonObject().add("type", "stagedPlacement"));
		verifyNoInteractions(setup);
		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(peer).send(frame.capture());
		assertEquals("VIEW_UNAVAILABLE", JsonObject.readFrom(frame.getValue()).getString("code", null));
	}

	@Test void abandonmentPublishesTheAuthorizedCoachsViewAfterTheEngineIsReleased() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		AuthenticatedPrincipal home = mock(AuthenticatedPrincipal.class), away = mock(AuthenticatedPrincipal.class);
		BrowserConnection homeConnection = mock(BrowserConnection.class), awayConnection = mock(BrowserConnection.class);
		new PublicationTestGrants().allow(access, target -> target.principal() == home ? "home" : "away");
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.enrollPlayer(homeConnection, home, "match");
		publisher.enrollPlayer(awayConnection, away, "match");
		JsonObject terminal = new JsonObject().add("revision", 7).add("saveResume", new JsonObject().add("status", "ABANDONED"));

		publisher.publishAbandonment("match", new JsonObject(terminal).add("callerRole", "home"),
			new JsonObject(terminal).add("callerRole", "away"));

		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(homeConnection).send(frame.capture());
		verify(awayConnection).send(frame.capture());
		List<JsonObject> states = frame.getAllValues().stream().map(value -> JsonObject.readFrom(value).get("state").asObject()).toList();
		assertEquals(List.of("home", "away"), states.stream().map(state -> state.getString("callerRole", null)).toList());
		for (JsonObject state : states) assertEquals("ABANDONED", state.get("saveResume").asObject().getString("status", null));
		verifyNoInteractions(setup);
	}

	@Test void placementSendsIdenticalFramesToEnrolledPeersWithoutServiceReads() throws Exception {
		MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
		V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
		V2MatchAccess access = new V2MatchAccess(memberships, directory, Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC));
		SetupApplication setup = mock(SetupApplication.class);
		BrowserConnection coach = mock(BrowserConnection.class);
		BrowserConnection opponent = mock(BrowserConnection.class);
		BrowserConnection spectator = mock(BrowserConnection.class);
		BrowserConnection computer = mock(BrowserConnection.class);
		AuthenticatedPrincipal player = new AuthenticatedPrincipal(
			"00000000-0000-0000-0000-000000000001", Set.of(ApplicationScope.PLAYER), 2000);
		AuthenticatedPrincipal watcher = new AuthenticatedPrincipal(
			"00000000-0000-0000-0000-000000000002", Set.of(ApplicationScope.SPECTATOR), 2000);
		when(setup.spectatorView("match")).thenReturn(new JsonObject());
		when(directory.reauthorize(watcher)).thenReturn(watcher);
		when(memberships.isActive("match")).thenReturn(true);
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.enrollPlayer(coach, player, "match");
		publisher.enrollPlayer(opponent, player, "match");
		publisher.watch(spectator, watcher, "match", "watch");
		publisher.enrollComputer(computer, "match");
		JsonObject frame = new JsonObject().add("version", 2).add("type", "stagedPlacement")
			.add("baseRevision", 8).add("stageSeq", 1);

		publisher.publishPlacement("match", coach, frame);
		publisher.retryPublications();

		verify(coach, never()).send(any(String.class));
		verify(opponent).send(frame.toString());
		verify(spectator).send(frame.toString());
		verify(computer).send(frame.toString());
		verify(setup).spectatorView("match");
		verify(directory).reauthorize(watcher);
		verify(memberships).isActive("match");
		verifyNoMoreInteractions(setup, directory, memberships);
	}

	@Test void expiredViewerIsRemovedBeforeStagedDelivery() {
		Clock clock = mock(Clock.class);
		when(clock.millis()).thenReturn(1000L, 2000L);
		MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
		V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
		SetupApplication setup = mock(SetupApplication.class);
		BrowserConnection player = mock(BrowserConnection.class);
		AuthenticatedPrincipal principal = new AuthenticatedPrincipal(
			"00000000-0000-0000-0000-000000000001", Set.of(ApplicationScope.PLAYER), 2000);
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(new V2MatchAccess(memberships, directory, clock), setup);
		publisher.enrollPlayer(player, principal, "match");
		JsonObject frame = new JsonObject().add("version", 2).add("type", "stagedPlacement");

		publisher.publishPlacement("match", null, frame);
		publisher.publishPlacement("match", null, frame);
		publisher.publishPlacement("match", null, frame);

		ArgumentCaptor<String> frames = ArgumentCaptor.forClass(String.class);
		verify(player, times(2)).send(frames.capture());
		List<String> messages = frames.getAllValues();
		assertEquals(frame.toString(), messages.getFirst());
		assertEquals("VIEW_UNAVAILABLE", JsonObject.readFrom(messages.getLast()).getString("code", null));
		verifyNoInteractions(setup, directory, memberships);
	}

	@Test void spectatorBroadcastExcludesCoachOnlyGuidanceWithoutChangingTheCoachResponse() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		BrowserConnection spectator = mock(BrowserConnection.class);
		when(setup.spectatorView("match")).thenReturn(new JsonObject());
		new PublicationTestGrants().allow(access, target -> "spectator");
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.watch(spectator, mock(AuthenticatedPrincipal.class), "match", "watch");
		JsonObject coach = new JsonObject().add("callerRole", "away").add("phase", "PLAY")
			.add("revision", 51).add("computer", new JsonObject().add("policyVersion", "bogruk-v1"))
			.add("threats", new JsonObject().add("role", "away")).add("savedFormations", new com.eclipsesource.json.JsonArray()).add("blockPreview", new JsonObject());

		publisher.publish("match", null, coach);

		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(spectator).send(frame.capture());
		JsonObject view = JsonObject.readFrom(frame.getValue()).get("state").asObject();
		assertEquals("spectator", view.getString("callerRole", null));
		assertEquals(51, view.getInt("revision", -1));
		assertNull(view.get("computer"));
		assertNull(view.get("threats"));
		assertNull(view.get("savedFormations"));
		assertNull(view.get("blockPreview"));
		assertEquals("away", coach.getString("callerRole", null));
		assertNotNull(coach.get("computer"));
		assertNotNull(coach.get("threats"));
	}

	@Test void chatDoesNotTreatTheComputerAsAHumanOrRemoveItsGameplaySubscription() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		BrowserConnection computer = mock(BrowserConnection.class);
		new PublicationTestGrants().allow(access, target -> "away");
		when(setup.publishedState("match", "away", true)).thenReturn(new JsonObject().add("type", "setupState").add("code", "ACCEPTED")
			.add("state", new JsonObject().add("callerRole", "away")));
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup);
		publisher.enrollComputer(computer, "match");

		publisher.publishChat("match", null, new JsonObject());
		verifyNoInteractions(access, computer);
		publisher.publish("match", null, new JsonObject().add("phase", "PLAY"));

		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(computer).send(frame.capture());
		assertEquals("setupState", JsonObject.readFrom(frame.getValue()).getString("type", null));
		verify(setup, never()).handleComputerWithOutcome(any(), any(JsonObject.class));
	}
}
