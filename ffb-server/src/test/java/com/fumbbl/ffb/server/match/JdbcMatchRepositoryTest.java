package com.fumbbl.ffb.server.match;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.eq;

class JdbcMatchRepositoryTest {
	private Connection connection;
	private PreparedStatement statement;
	private JdbcMatchRepository repository;
	private final MatchRepository.Record record = new MatchRepository.Record("match", 2, "complete snapshot and retry metadata");

	@BeforeEach
	void setup() throws Exception {
		connection = mock(Connection.class); statement = mock(PreparedStatement.class);
		when(connection.prepareStatement(anyString())).thenReturn(statement);
		repository = new JdbcMatchRepository(() -> connection);
	}

	@Test
	void compareAndSwapCommitsCompleteDocumentOnce() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		assertTrue(repository.replace(record, 1));
		verify(statement).setString(2, record.json); verify(statement).setString(3, "match"); verify(statement).setInt(4, 1);
		verify(connection).commit(); verify(connection, never()).rollback(); verify(connection).close();
	}

	@Test
	void losingCompareAndSwapRollsBackWithoutCommit() throws Exception {
		assertFalse(repository.replace(record, 1));
		verify(connection).rollback(); verify(connection, never()).commit();
	}

	@Test
	void insertFailureRollsBackWithoutAcknowledgingMembership() throws Exception {
		when(statement.executeUpdate()).thenThrow(new SQLException("injected write failure"));
		assertThrows(SQLException.class, () -> repository.insert(record));
		verify(connection).rollback(); verify(connection, never()).commit(); verify(connection).close();
	}

	@Test
	void commitAcknowledgementFailureIsUnknownAndRetainsAttemptedLocator() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		doThrow(new SQLException("injected lost acknowledgement")).when(connection).commit();
		MatchRepository.OutcomeUnknown failure = assertThrows(MatchRepository.OutcomeUnknown.class, () -> repository.insert(record));
		org.junit.jupiter.api.Assertions.assertSame(record, failure.attempted);
		verify(connection).rollback(); verify(connection).close();
	}

	@Test
	void closeFailureAfterCommitIsConservativelyUnknown() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		doThrow(new SQLException("injected close failure")).when(connection).close();
		assertThrows(MatchRepository.OutcomeUnknown.class, () -> repository.replace(record, 1));
		verify(connection).commit();
	}

	@Test void compressesLargeWritesAndFindReturnsTheOriginalLogicalJson() throws Exception {
		String json = "{\"state\":\"" + repeat("full-native-snapshot-", 500_000) + "\"}";
		MatchRepository.Record large = new MatchRepository.Record("match", 2, json);
		when(statement.executeUpdate()).thenReturn(1);
		assertTrue(repository.replace(large, 1));
		org.mockito.ArgumentCaptor<String> stored = org.mockito.ArgumentCaptor.forClass(String.class);
		verify(statement).setString(eq(2), stored.capture());
		org.junit.jupiter.api.Assertions.assertNotEquals(json, stored.getValue());

		ResultSet rows = mock(ResultSet.class); PreparedStatement query = mock(PreparedStatement.class);
		when(connection.prepareStatement("SELECT match_id,document_version,document_json FROM ffb_prepared_matches WHERE match_id=?")).thenReturn(query);
		when(query.executeQuery()).thenReturn(rows); when(rows.next()).thenReturn(true);
		when(rows.getString(1)).thenReturn("match"); when(rows.getInt(2)).thenReturn(2); when(rows.getString(3)).thenReturn(stored.getValue());
		assertEquals(json, repository.find("match").json);
	}

	private String repeat(String value, int count) {
		StringBuilder result = new StringBuilder(value.length() * count);
		for (int index = 0; index < count; index++) result.append(value);
		return result.toString();
	}
}
