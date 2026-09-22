package com.fumbbl.ffb.server.match;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcRecoveryRepositoryTest {
	private Connection connection;
	private PreparedStatement statement;
	private JdbcRecoveryRepository repository;
	private ResultSet retained;
	private RecoveryRepository.Record record(long generation) { return new RecoveryRepository.Record("match", generation, "staged recovery artifact"); }

	@BeforeEach
	void setup() throws Exception {
		connection = mock(Connection.class); statement = mock(PreparedStatement.class);
		when(connection.prepareStatement(anyString())).thenReturn(statement);
		PreparedStatement lock = mock(PreparedStatement.class), count = mock(PreparedStatement.class);
		ResultSet schema = mock(ResultSet.class); retained = mock(ResultSet.class);
		when(connection.prepareStatement("SELECT version FROM ffb_local_schema FOR UPDATE")).thenReturn(lock);
		when(lock.executeQuery()).thenReturn(schema); when(schema.next()).thenReturn(true); when(schema.getInt(1)).thenReturn(6);
		when(connection.prepareStatement("SELECT COUNT(*),COUNT(CASE WHEN matchid=? THEN 1 END) FROM ffb_match_recovery")).thenReturn(count);
		when(count.executeQuery()).thenReturn(retained); when(retained.next()).thenReturn(true);
		repository = new JdbcRecoveryRepository(() -> connection);
	}

	@Test void fullRetentionRejectsNewRecordsWithoutWritingOrCommitting() throws Exception {
		when(retained.getLong(1)).thenReturn(1024L);
		assertThrows(RecoveryRepository.RetentionLimit.class, () -> repository.save(record(1), 0));
		verify(statement, never()).executeUpdate(); verify(connection, never()).commit(); verify(connection).rollback();
	}

	@Test void fullRetentionStillAllowsExistingCheckpointUpdatesAndDuplicateCas() throws Exception {
		when(retained.getLong(1)).thenReturn(1024L); when(retained.getLong(2)).thenReturn(1L);
		when(statement.executeUpdate()).thenThrow(new SQLException("duplicate", "23000", 1062)).thenReturn(1);
		assertFalse(repository.save(record(1), 0));
		assertTrue(repository.save(record(2), 1));
		verify(connection).commit();
	}

	@Test
	void initialSaveInsertsGenerationOneAndCommits() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		assertTrue(repository.save(record(1), 0));
		verify(statement).setLong(2, 1); verify(connection).commit(); verify(connection, never()).rollback();
	}

	@Test
	void compareAndSwapAdvancesTheExpectedGeneration() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		assertTrue(repository.save(record(8), 7));
		verify(statement).setLong(1, 8); verify(statement).setString(3, "match"); verify(statement).setLong(4, 7);
		verify(connection).commit();
	}

	@Test
	void duplicateOrStaleSaveRollsBackWithoutCommit() throws Exception {
		when(statement.executeUpdate()).thenReturn(0);
		assertFalse(repository.save(record(1), 0));
		verify(connection).rollback(); verify(connection, never()).commit();
	}

	@Test
	void commitAcknowledgementFailureIsOutcomeUnknown() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		doThrow(new SQLException("lost acknowledgement")).when(connection).commit();
		RecoveryRepository.Record record = record(8);
		RecoveryRepository.OutcomeUnknown failure = assertThrows(RecoveryRepository.OutcomeUnknown.class, () -> repository.save(record, 7));
		org.junit.jupiter.api.Assertions.assertSame(record, failure.attempted);
		verify(connection).rollback(); verify(connection).close();
	}

	@Test
	void closeFailureAfterCommitIsOutcomeUnknown() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		doThrow(new SQLException("close failure")).when(connection).close();
		assertThrows(RecoveryRepository.OutcomeUnknown.class, () -> repository.save(record(8), 7));
		verify(connection).commit();
	}

	@Test
	void overflowingGenerationIsRejected() {
		assertThrows(SQLException.class, () -> repository.save(record(1), Long.MAX_VALUE));
	}

	@Test
	void duplicateInsertConflictRollsBackAndReturnsFalse() throws Exception {
		when(statement.executeUpdate()).thenThrow(new SQLException("duplicate", "23000", 1062));
		assertFalse(repository.save(record(1), 0));
		verify(connection).rollback(); verify(connection, never()).commit();
	}

	@Test
	void mismatchedRecordGenerationIsRejectedBeforeWriting() throws Exception {
		assertThrows(SQLException.class, () -> repository.save(record(2), 0));
		verify(connection, never()).setAutoCommit(false);
	}
}
