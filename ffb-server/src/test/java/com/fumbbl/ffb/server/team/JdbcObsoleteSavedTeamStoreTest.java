package com.fumbbl.ffb.server.team;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcObsoleteSavedTeamStoreTest {
	private static final String ID = "00000000-0000-0000-0000-000000000001";
	private static final String OWNER = "00000000-0000-0000-0000-000000000011";

	@Test void changedLockedRowRollsBackBeforeAnyDelete() throws Exception {
		Connection connection = mock(Connection.class);
		List<String> statements = stubStatements(connection);
		JdbcObsoleteSavedTeamStore store = new JdbcObsoleteSavedTeamStore(() -> connection);
		ObsoleteSavedTeamCleanup.Entry entry = new ObsoleteSavedTeamCleanup.Entry(
			ObsoleteSavedTeamCleanup.Table.ACCOUNT, ID, OWNER, 1, "a");
		assertEquals("PLAN_ROW_CHANGED", assertThrows(SQLException.class,
			() -> store.delete(Collections.singletonList(entry), (planned, actual) -> false)).getMessage());
		verify(connection).rollback();
		verify(connection, never()).commit();
		assertTrue(statements.stream().anyMatch(sql -> sql.endsWith("WHERE team_id=? FOR UPDATE")));
		assertTrue(statements.stream().noneMatch(sql -> sql.startsWith("DELETE ")));
	}

	@Test void exactLockedRowDeletesOnlySelectedSavedTeamAndCommits() throws Exception {
		Connection connection = mock(Connection.class);
		List<String> statements = stubStatements(connection);
		JdbcObsoleteSavedTeamStore store = new JdbcObsoleteSavedTeamStore(() -> connection);
		ObsoleteSavedTeamCleanup.Entry entry = new ObsoleteSavedTeamCleanup.Entry(
			ObsoleteSavedTeamCleanup.Table.ACCOUNT, ID, OWNER, 1, "a");
		ObsoleteSavedTeamCleanup.Result result = store.delete(Collections.singletonList(entry),
			(planned, actual) -> actual.record.teamId.equals(ID) && actual.record.owner.equals(OWNER));
		assertEquals(1, result.deleted);
		assertEquals(0, result.alreadyAbsent);
		assertEquals(1, statements.stream().filter(sql -> sql.startsWith("DELETE FROM ffb_v2_saved_teams WHERE ")).count());
		verify(connection).commit();
		verify(connection, never()).rollback();
	}

	@Test void lostCommitAcknowledgementReportsUnknownOutcome() throws Exception {
		Connection connection = mock(Connection.class);
		stubStatements(connection);
		doThrow(new SQLException("network detail must remain private")).when(connection).commit();
		JdbcObsoleteSavedTeamStore store = new JdbcObsoleteSavedTeamStore(() -> connection);
		ObsoleteSavedTeamCleanup.Entry entry = new ObsoleteSavedTeamCleanup.Entry(
			ObsoleteSavedTeamCleanup.Table.ACCOUNT, ID, OWNER, 1, "a");
		assertEquals("COMMIT_OUTCOME_UNKNOWN", assertThrows(SQLException.class,
			() -> store.delete(Collections.singletonList(entry), (planned, actual) -> true)).getMessage());
		verify(connection).rollback();
	}

	@Test void closeFailureAfterAcknowledgedCommitReportsCommittedOutcome() throws Exception {
		Connection connection = mock(Connection.class);
		stubStatements(connection);
		doThrow(new SQLException("network detail must remain private")).when(connection).close();
		JdbcObsoleteSavedTeamStore store = new JdbcObsoleteSavedTeamStore(() -> connection);
		ObsoleteSavedTeamCleanup.Entry entry = new ObsoleteSavedTeamCleanup.Entry(
			ObsoleteSavedTeamCleanup.Table.ACCOUNT, ID, OWNER, 1, "a");
		assertEquals("COMMIT_COMPLETED_CLOSE_FAILED", assertThrows(SQLException.class,
			() -> store.delete(Collections.singletonList(entry), (planned, actual) -> true)).getMessage());
		verify(connection).commit();
		verify(connection, never()).rollback();
	}

	private List<String> stubStatements(Connection connection) throws Exception {
		List<String> statements = new ArrayList<>();
		when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
			String sql = invocation.getArgument(0);
			statements.add(sql);
			PreparedStatement statement = mock(PreparedStatement.class);
			if (sql.startsWith("DELETE FROM ")) {
				when(statement.executeUpdate()).thenReturn(1);
			} else {
				ResultSet rows = mock(ResultSet.class);
				when(rows.next()).thenReturn(true, false);
				if (sql.startsWith("SELECT version")) when(rows.getInt(1)).thenReturn(7);
				else if (sql.startsWith("SELECT COUNT(*)")) when(rows.getInt(1)).thenReturn(0);
				else if (sql.startsWith("SELECT ENGINE")) when(rows.getString(1)).thenReturn("InnoDB");
				else if (sql.contains("WHERE team_id=? FOR UPDATE")) {
					when(rows.getString(1)).thenReturn(ID);
					when(rows.getString(2)).thenReturn(OWNER);
					when(rows.getInt(3)).thenReturn(1);
					when(rows.getString(4)).thenReturn("catalog");
					when(rows.getString(5)).thenReturn("document");
				}
				when(statement.executeQuery()).thenReturn(rows);
			}
			return statement;
		});
		return statements;
	}
}
