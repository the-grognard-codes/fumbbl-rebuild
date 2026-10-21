package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.lang.reflect.Field;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Verifies the application boundary without duplicating native skill mechanics. */
class SetupApplicationSkillUsePreferencesTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private static final long NOW = 2000000000000L;

	@Test void resolvesBothCoachPoliciesBeforeActionAndBeforeDeadlineContinuation() throws Exception {
		Fixture fixture = new Fixture();
		SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
		SkillUsePreferences home = SkillUsePreferences.defaults().with(SkillUsePreferences.UseCase.FEND, SkillUsePreferences.Mode.ALWAYS_USE);
		SkillUsePreferences away = SkillUsePreferences.defaults().with(SkillUsePreferences.UseCase.WRESTLE_DEFENDER, SkillUsePreferences.Mode.ALWAYS_USE);
		when(preferences.loadForMatch(MATCH, "home")).thenReturn(home);
		when(preferences.loadForMatch(MATCH, "away")).thenReturn(away);
		fixture.application.configureSkillUsePreferences(preferences);
		JsonObject action = fixture.action();
		assertEquals("ACCEPTED", fixture.application.handle("home", action).getString("code", null));
		InOrder actionOrder = inOrder(preferences, fixture.session);
		actionOrder.verify(preferences).loadForMatch(MATCH, "home");
		actionOrder.verify(preferences).loadForMatch(MATCH, "away");
		actionOrder.verify(fixture.session).configureSkillUsePreferences(home, away);
		actionOrder.verify(fixture.session).expireReactiveDecision(NOW);
		actionOrder.verify(fixture.session).apply("home", action, NOW);
		clearInvocations(preferences, fixture.session);
		when(fixture.session.reactiveDecisionDue(NOW)).thenReturn(true);
		when(fixture.session.expireReactiveDecision(NOW)).thenReturn(true);
		assertEquals(1, fixture.application.expireReactiveDecisions().size());
		InOrder timerOrder = inOrder(preferences, fixture.session);
		timerOrder.verify(preferences).loadForMatch(MATCH, "home");
		timerOrder.verify(preferences).loadForMatch(MATCH, "away");
		timerOrder.verify(fixture.session).configureSkillUsePreferences(home, away);
		timerOrder.verify(fixture.session).expireReactiveDecision(NOW);
	}

	@Test void ownershipReadFailurePreventsActionAndDoesNotInstallAPartialSnapshot() throws Exception {
		for (String failedRole : new String[] {"home", "away"}) {
			Fixture fixture = new Fixture(); SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
			when(preferences.loadForMatch(eq(MATCH), any(String.class))).thenReturn(SkillUsePreferences.defaults());
			doThrow(new SQLException("unavailable")).when(preferences).loadForMatch(MATCH, failedRole);
			fixture.application.configureSkillUsePreferences(preferences);
			SetupApplication.HandleOutcome outcome = fixture.application.handleWithOutcome("home", fixture.action());
			assertEquals("PERSISTENCE_FAILED", outcome.response().getString("code", null)); assertFalse(outcome.publish());
			verify(fixture.session, never()).configureSkillUsePreferences(any(SkillUsePreferences.class), any(SkillUsePreferences.class));
			verify(fixture.session, never()).expireReactiveDecision(anyLong());
			verify(fixture.session, never()).apply(any(String.class), any(JsonObject.class), anyLong());
		}
	}

	@Test void ownershipReadFailurePreventsTimedMutationAndPublication() throws Exception {
		Fixture fixture = new Fixture(); SkillUsePreferenceService preferences = mock(SkillUsePreferenceService.class);
		when(preferences.loadForMatch(MATCH, "home")).thenThrow(new SQLException("unavailable"));
		when(fixture.session.reactiveDecisionDue(NOW)).thenReturn(true);
		fixture.application.configureSkillUsePreferences(preferences);
		assertEquals(0, fixture.application.expireReactiveDecisions().size());
		verify(fixture.session, never()).expireReactiveDecision(anyLong());
		verify(fixture.session, never()).configureSkillUsePreferences(any(SkillUsePreferences.class), any(SkillUsePreferences.class));
	}

	@Test void accountUpdateCannotAnswerOrRestartAnOpenDecisionAndAppliesToTheNextAction() throws Exception {
		Fixture fixture = new Fixture(); Memory repository = new Memory(); MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
		when(memberships.accountForRole(MATCH, "home")).thenReturn("coach-account");
		SkillUsePreferenceService preferences = new SkillUsePreferenceService(repository, memberships);
		fixture.application.configureSkillUsePreferences(preferences);
		fixture.application.handle("home", fixture.action());
		clearInvocations(fixture.session);
		preferences.update("coach-account", SkillUsePreferences.UseCase.FEND, SkillUsePreferences.Mode.ALWAYS_USE);
		verifyNoInteractions(fixture.session);
		fixture.application.handle("home", fixture.action().set("requestId", "next-action"));
		ArgumentCaptor<SkillUsePreferences> home = ArgumentCaptor.forClass(SkillUsePreferences.class);
		verify(fixture.session).configureSkillUsePreferences(home.capture(), any(SkillUsePreferences.class));
		assertEquals(SkillUsePreferences.Mode.ALWAYS_USE, home.getValue().mode(SkillUsePreferences.UseCase.FEND));
	}

	private static final class Fixture {
		final MatchService matches = mock(MatchService.class);
		final SetupSession session = mock(SetupSession.class);
		final SetupApplication application = new SetupApplication(mock(FantasyFootballServer.class), matches, null, false,
			Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));
		Fixture() throws Exception {
			MatchDocument document = new MatchDocument(MATCH, 3, "away", MatchDocument.Lifecycle.ACTIVATED,
				new MatchDocument.Member("home", "home", null), new MatchDocument.Member("away", "away", null));
			when(matches.load("home", MATCH)).thenReturn(new MatchService.Result(document, false));
			when(session.apply(eq("home"), any(JsonObject.class), eq(NOW))).thenReturn(reply());
			when(session.reply("deadline", "ACCEPTED", false, "home")).thenReturn(reply());
			when(session.decorateSaveResume(any(JsonObject.class))).thenAnswer(call -> call.getArgument(0));
			Field resident = SetupApplication.class.getDeclaredField("sessions"); resident.setAccessible(true);
			@SuppressWarnings("unchecked") Map<String, SetupSession> sessions = (Map<String, SetupSession>) resident.get(application);
			sessions.put(MATCH, session);
		}
		JsonObject action() { return new JsonObject().add("version", 1).add("type", "setup").add("operation", "action")
			.add("requestId", "action").add("matchId", MATCH).add("expectedRevision", 3).add("actionId", "server-action"); }
		JsonObject reply() { return new JsonObject().add("code", "ACCEPTED").add("duplicate", false).add("state", new JsonObject().add("revision", 4)); }
	}
	private static final class Memory implements SkillUsePreferenceRepository {
		final Map<String, SkillUsePreferences> policies = new HashMap<>();
		@Override public SkillUsePreferences load(String accountId) { return policies.getOrDefault(accountId, SkillUsePreferences.defaults()); }
		@Override public void update(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) { policies.put(accountId, load(accountId).with(useCase, mode)); }
	}
}
