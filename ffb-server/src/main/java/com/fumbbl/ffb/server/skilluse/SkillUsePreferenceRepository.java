package com.fumbbl.ffb.server.skilluse;

import java.sql.SQLException;

public interface SkillUsePreferenceRepository {
	final class OutcomeUnknown extends java.sql.SQLException {
		public OutcomeUnknown(java.sql.SQLException cause) { super("Preference write outcome unknown; retry the same setting", cause); }
	}
	SkillUsePreferences load(String accountId) throws SQLException;
	void update(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) throws SQLException;
}
