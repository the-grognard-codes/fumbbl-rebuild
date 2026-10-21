package com.fumbbl.ffb.server.skilluse;

import java.sql.SQLException;

public interface SkillUsePreferenceRepository {
	SkillUsePreferences load(String accountId) throws SQLException;
	void update(String accountId, SkillUsePreferences.UseCase useCase, SkillUsePreferences.Mode mode) throws SQLException;
}
