package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ActiveMatchPublisherTest {

	@Test void spectatorBroadcastExcludesCoachOnlyGuidanceWithoutChangingTheCoachResponse() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		BrowserMatchAdapter.Connection spectator = mock(BrowserMatchAdapter.Connection.class);
		when(setup.spectatorView("match")).thenReturn(new JsonObject());
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup, mock(V2PreparationService.class));
		publisher.watch(spectator, mock(AuthenticatedPrincipal.class), "match", "watch");
		JsonObject coach = new JsonObject().add("callerRole", "away").add("phase", "PLAY")
			.add("revision", 51).add("computer", new JsonObject().add("policyVersion", "bogruk-v1"))
			.add("threats", new JsonObject().add("role", "away"));

		publisher.publish("match", null, coach);

		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(spectator).send(frame.capture());
		JsonObject view = JsonObject.readFrom(frame.getValue()).get("state").asObject();
		assertEquals("spectator", view.getString("callerRole", null));
		assertEquals(51, view.getInt("revision", -1));
		assertNull(view.get("computer"));
		assertNull(view.get("threats"));
		assertEquals("away", coach.getString("callerRole", null));
		assertNotNull(coach.get("computer"));
		assertNotNull(coach.get("threats"));
	}

	@Test void chatDoesNotTreatTheComputerAsAHumanOrRemoveItsGameplaySubscription() throws Exception {
		V2MatchAccess access = mock(V2MatchAccess.class);
		SetupApplication setup = mock(SetupApplication.class);
		V2PreparationService preparation = mock(V2PreparationService.class);
		BrowserMatchAdapter.Connection computer = mock(BrowserMatchAdapter.Connection.class);
		SetupApplication.HandleOutcome outcome = mock(SetupApplication.HandleOutcome.class);
		when(preparation.isComputerMatch("match")).thenReturn(true);
		when(setup.handleComputerWithOutcome(any(JsonObject.class))).thenReturn(outcome);
		when(outcome.response()).thenReturn(new JsonObject().add("type", "setupState").add("code", "ACCEPTED")
			.add("state", new JsonObject().add("callerRole", "away")));
		ActiveMatchPublisher publisher = new ActiveMatchPublisher(access, setup, preparation);
		publisher.enrollComputer(computer, "match");

		publisher.publishChat("match", null, new JsonObject());
		verifyNoInteractions(access, computer);
		publisher.publish("match", null, new JsonObject().add("phase", "PLAY"));

		ArgumentCaptor<String> frame = ArgumentCaptor.forClass(String.class);
		verify(computer).send(frame.capture());
		assertEquals("setupState", JsonObject.readFrom(frame.getValue()).getString("type", null));
	}
}
