package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.server.match.MatchMembershipRepository;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SkillUsePreferencesTest {
	@Test void allEighteenDefaultsMatchTheApprovedInventoryAndUpdatesAreImmutable() {
		EnumSet<SkillUsePreferences.UseCase> ask = EnumSet.of(SkillUsePreferences.UseCase.FEND,
			SkillUsePreferences.UseCase.TAUNT, SkillUsePreferences.UseCase.WRESTLE_ATTACKER,
			SkillUsePreferences.UseCase.WRESTLE_DEFENDER, SkillUsePreferences.UseCase.STAND_FIRM, SkillUsePreferences.UseCase.PICK_ME_UP);
		SkillUsePreferences original = SkillUsePreferences.defaults();
		assertEquals(18, SkillUsePreferences.UseCase.values().length);
		for (SkillUsePreferences.UseCase useCase : SkillUsePreferences.UseCase.values()) {
			assertEquals(ask.contains(useCase) ? SkillUsePreferences.Mode.ALWAYS_ASK : SkillUsePreferences.Mode.ALWAYS_USE, original.mode(useCase));
			assertEquals(useCase, SkillUsePreferences.UseCase.fromKey(useCase.key()));
		}
		assertEquals(SkillUsePreferences.Mode.ALWAYS_ASK, original.with(SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK).mode(SkillUsePreferences.UseCase.CATCH));
		assertEquals(SkillUsePreferences.Mode.ALWAYS_USE, original.mode(SkillUsePreferences.UseCase.CATCH));
		assertEquals(original.toJson(), SkillUsePreferences.fromJson(original.toJson()).toJson());
	}
	@Test void fullJsonRejectsMissingUnknownDuplicateAndInvalidValues() {
		JsonObject valid = SkillUsePreferences.defaults().toJson();
		assertThrows(IllegalArgumentException.class, () -> SkillUsePreferences.fromJson(valid.remove("catch")));
		assertThrows(IllegalArgumentException.class, () -> SkillUsePreferences.fromJson(SkillUsePreferences.defaults().toJson().add("pro", "always-use")));
		assertThrows(IllegalArgumentException.class, () -> SkillUsePreferences.fromJson(SkillUsePreferences.defaults().toJson().set("catch", "never-use")));
		JsonObject duplicate = SkillUsePreferences.defaults().toJson().remove("pass-ball").add("catch", "always-ask");
		assertThrows(IllegalArgumentException.class, () -> SkillUsePreferences.fromJson(duplicate));
	}
	@Test void nativeLoadsResolveTheDurableCoachAccountAndMissingComputerSeatsUseDefaults() throws Exception {
		SkillUsePreferenceRepository repository = mock(SkillUsePreferenceRepository.class);
		MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
		when(memberships.accountForRole("match", "home")).thenReturn("account");
		SkillUsePreferences preferences = SkillUsePreferences.defaults().with(SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK);
		when(repository.load("account")).thenReturn(preferences);
		SkillUsePreferenceService service = new SkillUsePreferenceService(repository, memberships);
		assertEquals(preferences, service.loadForMatch("match", "home"));
		assertEquals(SkillUsePreferences.defaults().toJson(), service.loadForMatch("match", "away").toJson());
		assertEquals(SkillUsePreferences.defaults().toJson(), service.loadForMatch("match", "spectator").toJson());
		verify(memberships, never()).accountForRole("match", "spectator");
		verify(repository, never()).load(null);
	}
	@Test void failedWritesNeverReturnASavedPolicy() throws Exception {
		SkillUsePreferenceRepository repository = mock(SkillUsePreferenceRepository.class);
		org.mockito.Mockito.doThrow(new SQLException("unavailable")).when(repository).update("account", SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK);
		SkillUsePreferenceService service = new SkillUsePreferenceService(repository, mock(MatchMembershipRepository.class));
		assertThrows(SQLException.class, () -> service.update("account", SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_ASK));
		verify(repository, never()).load("account");
	}
}
