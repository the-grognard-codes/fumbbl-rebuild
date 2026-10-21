package com.fumbbl.ffb.server.skilluse;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcSkillUsePreferenceRepositoryTest {
	@Test void loadBindsOnlyTheAccountAndNormalizesSparseRowsToAllDefaults() throws Exception {
		Connection connection = mock(Connection.class); PreparedStatement query = mock(PreparedStatement.class); ResultSet rows = mock(ResultSet.class);
		when(connection.prepareStatement(anyString())).thenReturn(query); when(query.executeQuery()).thenReturn(rows);
		when(rows.next()).thenReturn(true, false); when(rows.getString(1)).thenReturn("pass-bomb"); when(rows.getString(2)).thenReturn("always-ask");
		SkillUsePreferences result = new JdbcSkillUsePreferenceRepository(() -> connection).load("account");
		assertEquals(18, result.toJson().size());
		assertEquals(SkillUsePreferences.Mode.ALWAYS_ASK, result.mode(SkillUsePreferences.UseCase.PASS_BOMB));
		assertEquals(SkillUsePreferences.Mode.ALWAYS_USE, result.mode(SkillUsePreferences.UseCase.PASS_BALL));
		verify(query).setString(1, "account");
		verify(connection, never()).commit();
	}
	@Test void idempotentUpdatesBindOneCaseAndCommitBeforeAcknowledgement() throws Exception {
		for (boolean autoCommit : new boolean[] {true, false}) {
			Connection connection = mock(Connection.class); PreparedStatement update = mock(PreparedStatement.class);
			when(connection.prepareStatement(anyString())).thenReturn(update); when(connection.getAutoCommit()).thenReturn(autoCommit);
			new JdbcSkillUsePreferenceRepository(() -> connection).update("account", SkillUsePreferences.UseCase.DODGE_BLOCK, SkillUsePreferences.Mode.ALWAYS_ASK);
			ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class); verify(connection).prepareStatement(sql.capture());
			assertTrue(sql.getValue().contains("ON DUPLICATE KEY UPDATE mode=VALUES(mode)"));
			assertFalse(sql.getValue().contains("DELETE"));
			verify(update).setString(1, "account"); verify(update).setString(2, "dodge-block"); verify(update).setString(3, "always-ask");
			if (autoCommit) verify(connection, never()).commit(); else verify(connection).commit();
		}
	}
	@Test void corruptRowsFailClosedAndCommitFailuresPropagate() throws Exception {
		Connection connection = mock(Connection.class); PreparedStatement query = mock(PreparedStatement.class); ResultSet rows = mock(ResultSet.class);
		when(connection.prepareStatement(anyString())).thenReturn(query); when(query.executeQuery()).thenReturn(rows);
		when(rows.next()).thenReturn(true, false); when(rows.getString(1)).thenReturn("unknown"); when(rows.getString(2)).thenReturn("always-use");
		JdbcSkillUsePreferenceRepository repository = new JdbcSkillUsePreferenceRepository(() -> connection);
		assertThrows(SQLException.class, () -> repository.load("account"));
		org.mockito.Mockito.doThrow(new SQLException("commit failed")).when(connection).commit();
		assertThrows(SQLException.class, () -> repository.update("account", SkillUsePreferences.UseCase.CATCH, SkillUsePreferences.Mode.ALWAYS_USE));
	}
}
