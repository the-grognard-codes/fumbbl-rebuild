package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.MatchMembershipRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.match.V2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.V2PrincipalDirectory;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;
import com.fumbbl.ffb.server.match.VerifiedIdentity;
import com.fumbbl.ffb.server.match.FirebaseProviderProbe;
import com.fumbbl.ffb.server.match.ProviderSessionRejection;
import com.fumbbl.ffb.server.match.MatchMembership;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PublicationAuthorizationTest {
	private static final String MATCH = "00000000-0000-0000-0000-000000000051";
	@Test void allFamiliesBatchZeroOneAndSixteenTargetsWithoutProviderWorkEvenDuringOutage() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) for (int count : new int[] {0, 1, 16}) {
			Fixture fixture = new Fixture(); fixture.enroll(family, count); fixture.reset(); fixture.directory.outage = true;
			new CaptureRequestProbe().within(() -> { fixture.publish(family); return null; });
			assertEquals(count == 0 ? 0 : 1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
			for (Connection connection : fixture.connections) assertEquals("ACCEPTED", connection.last().getString("code", null));
		}
	}
	@Test void localRevocationAndSqlFailureRemoveOnlyEligibleSubscriptionsWithoutUndoingDurableState() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) {
			Fixture fixture = new Fixture(); fixture.enroll(family, 2); fixture.reset(); fixture.directory.denied.add(fixture.principals.getFirst().accountId());
			fixture.publish(family);
			assertEquals("VIEW_UNAVAILABLE", fixture.connections.get(0).last().getString("code", null));
			assertEquals("ACCEPTED", fixture.connections.get(1).last().getString("code", null));
			fixture.directory.sqlFailure = true; fixture.publish(family);
			assertEquals(1, fixture.connections.get(0).messages.size()); assertEquals("VIEW_UNAVAILABLE", fixture.connections.get(1).last().getString("code", null));
			fixture.reset(); fixture.publish(family); assertEquals(0, fixture.directory.batches);
		}
	}
	@Test void expiryDuringProjectionPreventsBothStateAndOptionalTranscriptDelivery() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 1); fixture.reset();
		fixture.publisher.liveTranscript(fixture.connections.getFirst(), true);
		when(fixture.setup.publishedState(anyString(), anyString(), anyBoolean())).thenAnswer(call -> { fixture.millis.set(10_000); return state(call.getArgument(1)); });
		fixture.publish(V2PublicationAuthorization.Family.STATE);
		assertEquals(1, fixture.connections.getFirst().messages.size());
		assertEquals("VIEW_UNAVAILABLE", fixture.connections.getFirst().last().getString("code", null));
		assertEquals(0, fixture.connections.getFirst().predecessors);
		assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
	}
	@Test void expiryAtTheOriginalTokenDeadlineStopsEveryFamilyAndNeverRefreshesProviderState() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) {
			Fixture fixture = new Fixture(); fixture.enroll(family, 1); fixture.reset(); fixture.millis.set(10_000); fixture.publish(family);
			assertEquals("VIEW_UNAVAILABLE", fixture.connections.getFirst().last().getString("code", null));
			fixture.reset(); fixture.publish(family); assertEquals(0, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
		}
	}
	@Test void publisherAndAccessNeverAuthorizeASeventeenthTarget() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 16);
		assertThrows(MatchService.Failure.class, () -> fixture.publisher.enrollPlayer(new Connection(), fixture.principals.getFirst(), MATCH));
		List<V2PublicationAuthorization.Target> targets = new ArrayList<>();
		for (int index = 0; index < 17; index++) targets.add(new V2PublicationAuthorization.Target(fixture.principals.getFirst(), V2PublicationAuthorization.Audience.PLAYER));
		assertThrows(MatchService.Failure.class, () -> fixture.access.publication(MATCH, V2PublicationAuthorization.Family.STATE, targets));
	}
	@Test void observedProviderRejectionRemovesBothLiveViewerAndPreparationSubscriptionsBeforeAnotherPush() throws Exception {
		for (V2PublicationAuthorization.Family family : new V2PublicationAuthorization.Family[] {V2PublicationAuthorization.Family.STATE, V2PublicationAuthorization.Family.PREPARATION}) {
			Fixture fixture = new Fixture();
			if (family == V2PublicationAuthorization.Family.STATE) fixture.enrollAdapterPlayers(); else fixture.enroll(family, 2);
			fixture.reset();
			fixture.authenticator.observer.accept(new FirebaseProviderProbe(null).rejection("synthetic-publication", "subject-1", Long.MAX_VALUE));
			assertEquals("VIEW_UNAVAILABLE", fixture.connections.get(1).last().getString("code", null));
			fixture.reset();
			fixture.adapter.receive(fixture.connections.getFirst(), new JsonObject().add("version", 2).add("type", family == V2PublicationAuthorization.Family.STATE ? "setup" : "preparedMatch")
				.add("requestId", "after-rejection").add("operation", family == V2PublicationAuthorization.Family.STATE ? "confirm" : "create").add("matchId", MATCH).toString());
			assertEquals("ACCEPTED", fixture.connections.getFirst().last().getString("code", null));
			assertTrue(fixture.connections.get(1).messages.isEmpty()); assertEquals(0, fixture.directory.batches);
		}
	}

	private static JsonObject state(String role) { return new JsonObject().add("type", "setupState").add("code", "ACCEPTED").add("state", new JsonObject().add("revision", 1).add("phase", "PLAY").add("callerRole", role)); }
	private static final class Connection implements BrowserConnection {
		final List<JsonObject> messages = new ArrayList<>(); int predecessors;
		@Override public void send(String message) { messages.add(JsonObject.readFrom(message)); }
		@Override public void sendWithOptionalPredecessor(String predecessor, String mandatory) { predecessors++; send(mandatory); }
		JsonObject last() { return messages.getLast(); }
	}
	private static final class Directory implements V2PrincipalDirectory {
		int providerCalls, batches; boolean outage, sqlFailure;
		final Set<String> denied = new HashSet<>();
		@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) { throw new UnsupportedOperationException(); }
		@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws V2PrincipalAuthenticator.Rejected {
			providerCalls++; if (outage) throw new V2PrincipalAuthenticator.Rejected(); return principal;
		}
		@Override public Snapshot authorizePublication(String matchId, Family family, List<Target> targets) throws SQLException {
			batches++; if (sqlFailure) throw new SQLException("synthetic local failure");
			Map<Integer, String> roles = new HashMap<>();
			for (int slot = 0; slot < targets.size(); slot++) if (!denied.contains(targets.get(slot).principal().accountId()))
				roles.put(slot, targets.get(slot).audience() == Audience.SPECTATOR ? "spectator" : "home");
			return new Snapshot(roles);
		}
	}
	private static final class Fixture {
		final AtomicLong millis = new AtomicLong(1_000); final Clock clock = mock(Clock.class);
		final Directory directory = new Directory(); final SetupApplication setup = mock(SetupApplication.class);
		final V2MatchAccess access; final ActiveMatchPublisher publisher; final BrowserV2Adapter adapter;
		final List<Connection> connections = new ArrayList<>(); final List<AuthenticatedPrincipal> principals = new ArrayList<>();
		final Rejections authenticator = new Rejections(principals);
		Fixture() throws Exception {
			when(clock.millis()).thenAnswer(ignored -> millis.get());
			MatchMembershipRepository membership = mock(MatchMembershipRepository.class); when(membership.isActive(MATCH)).thenReturn(true);
			when(membership.find(anyString(), anyString())).thenAnswer(call -> new MatchMembership(call.getArgument(0), call.getArgument(1), "home"));
			access = new V2MatchAccess(membership, directory, clock); publisher = new ActiveMatchPublisher(access, setup);
			when(setup.spectatorView(MATCH)).thenReturn(new JsonObject().add("revision", 1).add("phase", "PLAY"));
			when(setup.publishedState(anyString(), anyString(), anyBoolean())).thenAnswer(call -> state(call.getArgument(1)));
			when(setup.handleWithOutcome(anyString(), any(JsonObject.class))).thenAnswer(call -> {
				SetupApplication.HandleOutcome outcome = mock(SetupApplication.HandleOutcome.class);
				when(outcome.response()).thenReturn(state("home")); when(outcome.publish()).thenReturn(!"load".equals(call.<JsonObject>getArgument(1).getString("operation", ""))); return outcome;
			});
			when(setup.liveTranscriptPage(MATCH, 1)).thenReturn(new JsonObject().add("formatVersion", 2).add("from", 1).add("next", 2).add("total", 2)
				.add("records", new JsonArray().add(new JsonObject().add("index", 1).add("revision", 1).add("state", new JsonObject().add("revision", 1)))));
			V2PreparationService preparation = mock(V2PreparationService.class);
			when(preparation.handle(anyString(), any(JsonObject.class))).thenReturn(new JsonObject().add("type", "preparedMatch").add("code", "ACCEPTED").add("document", new JsonObject().add("matchId", MATCH)));
			adapter = new BrowserV2Adapter(authenticator, access, setup, mock(MatchService.class), preparation,
				mock(BrowserSavedTeamJson.class), new com.fumbbl.ffb.server.match.ComputerOpponentService(null), clock);
		}
		void enroll(V2PublicationAuthorization.Family family, int count) throws Exception {
			for (int index = 0; index < count; index++) {
				AuthenticatedPrincipal principal = new FirebaseProviderProbe(null).principal("synthetic-publication", "aaaaaaaa-aaaa-aaaa-aaaa-%012d".formatted(index), "subject-" + index, 100, 10_000);
				principals.add(principal); Connection connection = new Connection(); connections.add(connection);
				if (family == V2PublicationAuthorization.Family.PREPARATION) {
					adapter.receive(connection, new JsonObject().add("version", 2).add("type", "authenticate").add("requestId", "auth-" + index).add("bearer", Integer.toString(index)).add("purpose", "preparation").toString());
					adapter.receive(connection, new JsonObject().add("version", 2).add("type", "preparedMatch").add("requestId", "prepare-" + index).add("operation", "create").toString());
				} else if (index % 2 == 0) publisher.enrollPlayer(connection, principal, MATCH);
				else publisher.watch(connection, principal, MATCH, "watch");
			}
		}
		void enrollAdapterPlayers() {
			for (int index = 0; index < 2; index++) {
				principals.add(new FirebaseProviderProbe(null).principal("synthetic-publication", "aaaaaaaa-aaaa-aaaa-aaaa-%012d".formatted(index), "subject-" + index, 100, 10_000));
				Connection connection = new Connection(); connections.add(connection);
				adapter.receive(connection, new JsonObject().add("version", 2).add("type", "authenticate").add("requestId", "auth-" + index).add("bearer", Integer.toString(index)).toString());
				adapter.receive(connection, new JsonObject().add("version", 2).add("type", "setup").add("requestId", "load-" + index).add("operation", "load").add("matchId", MATCH).toString());
			}
		}
		void reset() { directory.batches = 0; directory.providerCalls = 0; connections.forEach(connection -> connection.messages.clear()); }
		void publish(V2PublicationAuthorization.Family family) {
			switch (family) {
				case STATE -> publisher.publish(MATCH, null, new JsonObject().add("revision", 1).add("phase", "PLAY"));
				case CHAT -> publisher.publishChat(MATCH, null, new JsonObject());
				case PREPARATION -> adapter.preparationChanged(MATCH, null);
			}
		}
	}
	private static final class Rejections implements V2PrincipalAuthenticator {
		private final List<AuthenticatedPrincipal> principals;
		java.util.function.Consumer<ProviderSessionRejection> observer;
		Rejections(List<AuthenticatedPrincipal> principals) { this.principals = principals; }
		@Override public AuthenticatedPrincipal authenticate(String bearer) { return principals.get(Integer.parseInt(bearer)); }
		@Override public void observeProviderRejection(java.util.function.Consumer<ProviderSessionRejection> observer) { this.observer = observer; }
	}
}
