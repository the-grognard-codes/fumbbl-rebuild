package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;
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
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
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
	@Test void exhaustedActorBudgetSkipsEveryFamilyWithoutQueryingOrRetiringViewers() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) {
			Fixture fixture = new Fixture(); fixture.enroll(family, 2); fixture.reset();
			fixture.withBudget(() -> { fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS); fixture.publish(family); });
			assertEquals(0, fixture.directory.batches);
			assertTrue(fixture.connections.stream().allMatch(connection -> connection.messages.isEmpty()));
			fixture.withBudget(() -> fixture.retry(family));
			assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
			for (Connection connection : fixture.connections) assertEquals("ACCEPTED", connection.last().getString("code", null));
		}
	}
	@Test void budgetExpiryAfterBatchAndDuringFinalAdmissionPreservesEverySubscription() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) for (boolean finalAdmission : new boolean[] {false, true}) {
			Fixture fixture = new Fixture(); fixture.enroll(family, 2); fixture.reset();
			if (family == V2PublicationAuthorization.Family.STATE) fixture.publisher.liveTranscript(fixture.connections.getFirst(), true);
			if (finalAdmission) {
				AtomicInteger checks = new AtomicInteger();
				when(fixture.clock.millis()).thenAnswer(call -> {
					if (checks.incrementAndGet() == 2) fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
					return fixture.millis.get();
				});
			} else fixture.directory.afterBatch = () -> fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			fixture.withBudget(() -> fixture.publish(family));
			assertTrue(fixture.connections.stream().allMatch(connection -> connection.messages.isEmpty()));
			assertEquals(0, fixture.connections.getFirst().predecessors);
			fixture.directory.afterBatch = () -> { }; when(fixture.clock.millis()).thenAnswer(call -> fixture.millis.get());
			fixture.reset(); fixture.withBudget(() -> fixture.retry(family));
			assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
			for (Connection connection : fixture.connections) assertEquals("ACCEPTED", connection.last().getString("code", null));
		}
	}
	@Test void jdbcRequestDeadlineRefusalSkipsThePushButDatabaseFailuresStillRetire() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) for (SQLException refusal : new SQLException[] {
			new JdbcConnections.NotStarted(), new JdbcConnections.DeadlineExpired(new SQLException("synthetic deadline")) }) {
			Fixture fixture = new Fixture(); fixture.enroll(family, 2); fixture.reset(); fixture.directory.requestRefusal = refusal;
			fixture.withBudget(() -> fixture.publish(family));
			assertTrue(fixture.connections.stream().allMatch(connection -> connection.messages.isEmpty()));
			fixture.directory.requestRefusal = null; fixture.reset(); fixture.withBudget(() -> fixture.retry(family));
			assertEquals(1, fixture.directory.batches);
			for (Connection connection : fixture.connections) assertEquals("ACCEPTED", connection.last().getString("code", null));
		}
	}
	@Test void projectionJdbcDeadlineRefusalPreservesPlayersAndSpectatorsForTheNextFreshBatch() throws Exception {
		for (SQLException refusal : new SQLException[] {new JdbcConnections.NotStarted(), new JdbcConnections.DeadlineExpired(new SQLException("synthetic projection deadline"))}) {
			Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 2); fixture.reset();
			when(fixture.setup.publishedState(anyString(), anyString(), anyBoolean())).thenThrow(refusal);
			fixture.withBudget(() -> fixture.publish(V2PublicationAuthorization.Family.STATE));
			assertTrue(fixture.connections.stream().allMatch(connection -> connection.messages.isEmpty()));
			doAnswer(call -> state(call.getArgument(1))).when(fixture.setup).publishedState(anyString(), anyString(), anyBoolean());
			fixture.reset(); fixture.withBudget(() -> fixture.retry(V2PublicationAuthorization.Family.STATE));
			assertEquals(1, fixture.directory.batches);
			for (Connection connection : fixture.connections) assertEquals("ACCEPTED", connection.last().getString("code", null));
		}
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

	@Test void deferredTurnHandoffArrivesWithoutAnotherActionAndFinalFrameRetiresSpectator() throws Exception {
		for (String phase : new String[] {"PLAY", "FULL_TIME"}) {
			Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 2); fixture.reset();
			JsonObject handoff = new JsonObject().add("revision", 2).add("phase", phase).add("activeTeam", "away");
			when(fixture.setup.publishedState(anyString(), anyString(), anyBoolean())).thenReturn(state("away").set("state", handoff));
			fixture.withBudget(() -> { fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS); fixture.publisher.publish(MATCH, null, handoff); });
			assertEquals(1, fixture.publisher.spectatorCount(MATCH));
			fixture.withBudget(fixture.publisher::retryPublications);
			for (Connection connection : fixture.connections) {
				assertEquals(1, connection.messages.size());
				assertEquals("away", connection.last().get("state").asObject().getString("activeTeam", ""));
				assertEquals(phase, connection.last().get("state").asObject().getString("phase", ""));
			}
			assertEquals("FULL_TIME".equals(phase) ? 0 : 1, fixture.publisher.spectatorCount(MATCH));
			assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
		}
	}
	@Test void partialChatCatchesUpInOrderWithoutRepeatingDeliveredRecipients() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.CHAT, 3); fixture.reset();
		fixture.connections.getFirst().afterSend = () -> fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
		fixture.withBudget(() -> fixture.publisher.publishChat(MATCH, null, new JsonObject().add("message", "first")));
		fixture.connections.getFirst().afterSend = () -> { };
		fixture.withBudget(() -> fixture.publisher.publishChat(MATCH, null, new JsonObject().add("message", "second")));
		assertEquals(1, fixture.connections.getFirst().messages.size());
		fixture.withBudget(fixture.publisher::retryPublications);
		for (Connection connection : fixture.connections) {
			assertEquals(2, connection.messages.size());
			assertEquals("first", connection.messages.get(0).get("page").asObject().getString("message", ""));
			assertEquals("second", connection.messages.get(1).get("page").asObject().getString("message", ""));
		}
		assertEquals(3, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
	}
	@Test void manyPendingStatesCoalesceToLatestWithoutRetiringViewersOrReprojectingHistory() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 2); fixture.reset();
		fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			for (int revision = 1; revision <= 100; revision++)
				fixture.publisher.publish(MATCH, null, new JsonObject().add("revision", revision).add("phase", "PLAY"));
		});
		for (Connection connection : fixture.connections) assertTrue(connection.messages.isEmpty());
		fixture.withBudget(fixture.publisher::retryPublications);
		assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
		assertEquals(100, fixture.connections.get(1).last().get("state").asObject().getInt("revision", -1));
		for (Connection connection : fixture.connections) assertEquals(1, connection.messages.size());
		org.mockito.Mockito.verify(fixture.setup, org.mockito.Mockito.times(1)).publishedState(MATCH, "home", false);
	}

	@Test void sixteenMatchesWithoutLiveTranscriptDoNotReserveSixteenMaximumFrames() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 1); fixture.reset();
		fixture.publisher.remove(fixture.connections.getFirst());
		List<Connection> viewers = new ArrayList<>();
		fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			for (int index = 0; index < 16; index++) {
				String matchId = "00000000-0000-0000-0000-%012d".formatted(index);
				Connection viewer = new Connection(); viewers.add(viewer);
				fixture.publisher.enrollPlayer(viewer, fixture.principals.getFirst(), matchId);
				fixture.publisher.publish(matchId, null, new JsonObject().add("revision", 1).add("phase", "PLAY"));
			}
		});
		for (Connection viewer : viewers) assertTrue(viewer.messages.isEmpty());
		fixture.withBudget(fixture.publisher::retryPublications);
		assertEquals(16, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
		for (Connection viewer : viewers) assertEquals("ACCEPTED", viewer.last().getString("code", ""));
	}

	@Test void adapterRewatchRetainsQueuedChatWithFreshPerRequestPrincipalAndRejectsReauthentication() throws Exception {
		Fixture fixture = new Fixture(); fixture.enrollAdapterPlayers(); fixture.directory.freshPrincipal = true;
		Connection spectator = fixture.connections.get(1);
		String watch = new JsonObject().add("version", 2).add("type", "watch").add("requestId", "watch")
			.add("matchId", MATCH).toString();
		fixture.adapter.receive(spectator, watch);
		assertEquals("ACCEPTED", spectator.last().getString("code", ""));
		com.fumbbl.ffb.server.match.MatchChat chat = new com.fumbbl.ffb.server.match.MatchChat();
		when(fixture.setup.sendChat(anyString(), anyString(), anyString(), anyString(), anyString()))
			.thenReturn(chat.append(fixture.principals.getFirst().accountId(), "home", "chat", "hello", 1, 1000));
		when(fixture.setup.chatPage(MATCH, 0, 1)).thenReturn(new JsonObject().add("message", "retained"));
		fixture.reset();
		fixture.connections.getFirst().afterSend = () -> fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
		fixture.withBudget(() -> fixture.adapter.receive(fixture.connections.getFirst(), new JsonObject().add("version", 2)
			.add("type", "matchChat").add("operation", "send").add("requestId", "chat").add("matchId", MATCH).add("text", "hello").toString()));
		assertTrue(fixture.adapter.hasPendingPublications()); assertTrue(spectator.messages.isEmpty());
		fixture.withBudget(() -> fixture.adapter.receive(spectator, watch));
		assertEquals("ACCEPTED", spectator.last().getString("code", ""));
		fixture.adapter.receive(spectator, new JsonObject().add("version", 2).add("type", "authenticate")
			.add("requestId", "refresh").add("bearer", "1").toString());
		assertEquals("IDENTITY_REBINDING_FORBIDDEN", spectator.last().getString("code", ""));
		fixture.reset(); fixture.withBudget(fixture.adapter::retryPublications);
		assertEquals(1, spectator.messages.size()); assertEquals("retained", spectator.last().get("page").asObject().getString("message", ""));
		assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
	}

	@Test void ordinaryGameplayEnrollmentRefreshDoesNotDiscardDeferredChat() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.CHAT, 1); fixture.reset();
		fixture.withBudget(() -> { fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS); fixture.publisher.publishChat(MATCH, null, new JsonObject().add("message", "retained")); });
		fixture.publisher.enrollPlayer(fixture.connections.getFirst(), fixture.principals.getFirst(), MATCH);
		fixture.withBudget(fixture.publisher::retryPublications);
		assertEquals("retained", fixture.connections.getFirst().last().get("page").asObject().getString("message", ""));
		assertEquals(1, fixture.directory.batches); assertEquals(0, fixture.directory.providerCalls);
	}

	@Test void leavingAndReturningToSameMatchDoesNotReviveOldChatEnrollment() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.CHAT, 1); fixture.reset();
		fixture.withBudget(() -> { fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS); fixture.publisher.publishChat(MATCH, null, new JsonObject().add("message", "old")); });
		fixture.publisher.remove(fixture.connections.getFirst());
		fixture.publisher.enrollPlayer(fixture.connections.getFirst(), fixture.principals.getFirst(), MATCH);
		fixture.withBudget(fixture.publisher::retryPublications);
		assertTrue(fixture.connections.getFirst().messages.isEmpty()); assertEquals(0, fixture.directory.batches);
	}

	@Test void deferredPushRechecksRevocationExpiryAndEnrollmentBeforeAnyPayload() throws Exception {
		for (String change : new String[] {"revoked", "expired", "replaced", "disconnected"}) {
			Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.STATE, 2); fixture.reset();
			fixture.withBudget(() -> { fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS); fixture.publish(V2PublicationAuthorization.Family.STATE); });
			if ("revoked".equals(change)) fixture.directory.denied.addAll(fixture.principals.stream().map(AuthenticatedPrincipal::accountId).toList());
			if ("expired".equals(change)) fixture.millis.set(10_000);
			if ("replaced".equals(change)) for (int index = 0; index < 2; index++) fixture.publisher.enrollPlayer(fixture.connections.get(index), fixture.principals.get(index), MATCH);
			if ("disconnected".equals(change)) fixture.connections.forEach(fixture.publisher::disconnect);
			fixture.withBudget(fixture.publisher::retryPublications);
			for (Connection connection : fixture.connections) assertTrue(connection.messages.stream().allMatch(message -> "VIEW_UNAVAILABLE".equals(message.getString("code", ""))));
			assertEquals(0, fixture.directory.providerCalls);
		}
	}
	@Test void transientDatabaseUnavailableStillFailsClosedRatherThanRetryingUnverifiedRecipients() throws Exception {
		for (V2PublicationAuthorization.Family family : V2PublicationAuthorization.Family.values()) {
			Fixture fixture = new Fixture(); fixture.enroll(family, 2); fixture.reset(); fixture.directory.requestRefusal = new JdbcConnections.Unavailable();
			fixture.publish(family);
			for (Connection connection : fixture.connections) assertEquals("VIEW_UNAVAILABLE", connection.last().getString("code", ""));
			fixture.directory.requestRefusal = null; fixture.reset(); fixture.withBudget(() -> fixture.retry(family));
			assertEquals(0, fixture.directory.batches);
		}
	}

	@Test void pendingQueueIsBoundedAndOverflowIsExplicitlyUnavailable() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.CHAT, 1); fixture.reset();
		fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			for (int index = 0; index <= PublicationDelivery.MAX_PENDING; index++) fixture.publisher.publishChat(MATCH, null, new JsonObject().add("index", index));
		});
		assertEquals("VIEW_UNAVAILABLE", fixture.connections.getFirst().last().getString("code", ""));
		fixture.reset(); fixture.withBudget(fixture.publisher::retryPublications);
		assertEquals(0, fixture.directory.batches); assertTrue(fixture.connections.getFirst().messages.isEmpty());
	}
	@Test void oversizedDeferredPayloadDoesNotEnterTheQueue() throws Exception {
		Fixture fixture = new Fixture(); fixture.enroll(V2PublicationAuthorization.Family.CHAT, 1); fixture.reset();
		fixture.withBudget(() -> {
			fixture.nanos.addAndGet(BrowserRequestTiming.REQUEST_BUDGET_NANOS);
			fixture.publisher.publishChat(MATCH, null, new JsonObject().add("large", "x".repeat(PublicationDelivery.MAX_RETAINED_CHARACTERS)));
		});
		assertEquals("VIEW_UNAVAILABLE", fixture.connections.getFirst().last().getString("code", ""));
		fixture.reset(); fixture.withBudget(fixture.publisher::retryPublications); assertEquals(0, fixture.directory.batches);
	}

	private static JsonObject state(String role) { return new JsonObject().add("type", "setupState").add("code", "ACCEPTED").add("state", new JsonObject().add("revision", 1).add("phase", "PLAY").add("callerRole", role)); }
	private static final class Connection implements BrowserConnection {
		final List<JsonObject> messages = new ArrayList<>(); int predecessors; Runnable afterSend = () -> { };
		@Override public void send(String message) { messages.add(JsonObject.readFrom(message)); afterSend.run(); }
		@Override public void sendWithOptionalPredecessor(String predecessor, String mandatory) { predecessors++; send(mandatory); }
		JsonObject last() { return messages.getLast(); }
	}
	private static final class Directory implements V2PrincipalDirectory {
		boolean freshPrincipal;
		int providerCalls, batches; boolean outage, sqlFailure;
		Runnable afterBatch = () -> { }; SQLException requestRefusal;
		final Set<String> denied = new HashSet<>();
		@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) { throw new UnsupportedOperationException(); }
		@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws V2PrincipalAuthenticator.Rejected {
			providerCalls++; if (outage) throw new V2PrincipalAuthenticator.Rejected();
			return freshPrincipal ? new AuthenticatedPrincipal(principal.accountId(), java.util.EnumSet.allOf(com.fumbbl.ffb.server.match.ApplicationScope.class), principal.expiresAtMillis()) : principal;
		}
		@Override public Snapshot authorizePublication(String matchId, Family family, List<Target> targets) throws SQLException {
			batches++; if (sqlFailure) throw new SQLException("synthetic local failure");
			if (requestRefusal != null) throw requestRefusal;
			Map<Integer, String> roles = new HashMap<>();
			for (int slot = 0; slot < targets.size(); slot++) if (!denied.contains(targets.get(slot).principal().accountId()))
				roles.put(slot, targets.get(slot).audience() == Audience.SPECTATOR ? "spectator" : "home");
			afterBatch.run(); return new Snapshot(roles);
		}
	}
	private static final class Fixture {
		final AtomicLong millis = new AtomicLong(1_000); final Clock clock = mock(Clock.class);
		final AtomicLong nanos = new AtomicLong();
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
		void withBudget(Runnable action) {
			BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, clock, ignored -> { });
			try (BrowserRequestTiming.Scope ignored = timing.handling(new BrowserRequestTiming.Request(nanos.get(), nanos::get, false))) { action.run(); }
		}
		void retry(V2PublicationAuthorization.Family family) {
			if (family == V2PublicationAuthorization.Family.PREPARATION) adapter.retryPublications(); else publisher.retryPublications();
		}
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
