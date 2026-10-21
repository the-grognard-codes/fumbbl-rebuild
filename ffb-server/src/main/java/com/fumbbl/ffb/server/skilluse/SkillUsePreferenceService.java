package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.server.match.MatchMembershipRepository;

import java.sql.SQLException;

/** Native callers resolve durable ownership; browser callers supply only their verified principal ID. */
public final class SkillUsePreferenceService {
	private final SkillUsePreferenceRepository repository;
	private final MatchMembershipRepository memberships;
	public SkillUsePreferenceService(SkillUsePreferenceRepository repository, MatchMembershipRepository memberships) {
		this.repository = repository; this.memberships = memberships;
	}
	public SkillUsePreferences loadForMatch(String matchId, String role) throws SQLException {
		if (!"home".equals(role) && !"away".equals(role)) return SkillUsePreferences.defaults();
		String accountId = memberships.accountForRole(matchId, role);
		return accountId == null ? SkillUsePreferences.defaults() : load(accountId);
	}
	public SkillUsePreferences load(String accountId) throws SQLException { return repository.load(accountId); }
	public SkillUsePreferences update(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) throws SQLException {
		repository.update(accountId, useCase, mode);
		return repository.load(accountId);
	}
}
