package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.io.StringReader;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.endsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LobbyBatchReadTest {
	@Test void documentQueriesStayConstantAtOneAndOneHundredEntries() throws Exception {
		for (int count : List.of(1, 100)) {
			Connection connection = mock(Connection.class);
			PreparedStatement query = mock(PreparedStatement.class);
			ResultSet rows = rows(count, "{}");
			when(connection.prepareStatement(anyString())).thenReturn(query);
			when(query.executeQuery()).thenReturn(rows);
			AtomicInteger opens = new AtomicInteger();
			JdbcMatchRepository repository = new JdbcMatchRepository(() -> { opens.incrementAndGet(); return connection; });
			assertEquals(count, repository.findAll(ids(count), new LobbyReadBudget()).size());
			assertEquals(1, opens.get()); verify(query).executeQuery(); verify(connection).close();
		}
	}

	@Test void checkpointAndJournalQueriesStayConstantWithoutNativeRecovery() throws Exception {
		for (boolean journal : List.of(false, true)) for (int count : List.of(1, 100)) {
			Connection connection = mock(Connection.class);
			PreparedStatement checkpoint = mock(PreparedStatement.class), tail = mock(PreparedStatement.class);
			when(connection.prepareStatement(anyString())).thenReturn(checkpoint, tail);
			String artifact = new RecoveryArtifactJson().encode(new JsonObject().add("matchId", "test"), 10000);
			ResultSet checkpointRows = rows(count, artifact);
			when(checkpoint.executeQuery()).thenReturn(checkpointRows);
			ResultSet empty = mock(ResultSet.class); when(tail.executeQuery()).thenReturn(empty);
			AtomicInteger opens = new AtomicInteger();
			JdbcRecoveryRepository repository = new JdbcRecoveryRepository(() -> { opens.incrementAndGet(); return connection; }, journal);
			assertEquals(count, repository.findAll(ids(count), new LobbyReadBudget()).size());
			assertEquals(1, opens.get()); verify(connection, times(journal ? 2 : 1)).prepareStatement(anyString());
			if (journal) verify(connection).prepareStatement(endsWith("LIMIT " + (count * 33)));
			verify(connection).commit(); verify(connection).close();
		}
	}
	@Test void excessJournalRowsMakeOnlyTheirEntryUnavailable() throws Exception {
		Connection connection = mock(Connection.class);
		PreparedStatement checkpoint = mock(PreparedStatement.class), tail = mock(PreparedStatement.class);
		when(connection.prepareStatement(anyString())).thenReturn(checkpoint, tail);
		String artifact = new RecoveryArtifactJson().encode(new JsonObject().add("matchId", "test"), 10000);
		ResultSet checkpointRows = rows(1, artifact); when(checkpoint.executeQuery()).thenReturn(checkpointRows);
		ResultSet excess = rows(33, "{}"); when(excess.getString(1)).thenReturn("id-0");
		when(tail.executeQuery()).thenReturn(excess);
		JdbcRecoveryRepository repository = new JdbcRecoveryRepository(() -> connection, true);
		assertTrue(repository.findAll(ids(1), new LobbyReadBudget()).isEmpty());
		verify(connection).commit(); verify(connection).close();
	}

	@Test void pageLimitsFailTheWholeReadWhileRecordLimitsAreEntryFailures() throws Exception {
		LobbyReadBudget budget = new LobbyReadBudget();
		assertEquals("RATE_LIMITED", assertThrows(MatchService.Failure.class, () -> budget.entries(101)).code);
		assertThrows(LobbyReadBudget.InvalidRecord.class,
			() -> budget.admit("x".repeat(LobbyReadBudget.RECORD_BYTES + 1)));
		LobbyReadBudget exact = new LobbyReadBudget();
		String record = "x".repeat(LobbyReadBudget.RECORD_BYTES);
		for (int index = 0; index < 8; index++) exact.admit(record);
		assertEquals("RATE_LIMITED", assertThrows(MatchService.Failure.class, () -> exact.admit("x")).code);
		String inflated = new BoundedJsonStorageCodec(10_000_000, 10_000_000).encode("x".repeat(LobbyReadBudget.RECORD_BYTES + 1));
		ResultSet rows = mock(ResultSet.class); when(rows.getCharacterStream(1)).thenReturn(new StringReader(inflated));
		assertThrows(LobbyReadBudget.InvalidRecord.class,
			() -> budget.read(rows, 1, new BoundedJsonStorageCodec(10_000_000, 10_000_000)));
		assertThrows(IllegalArgumentException.class, () -> new LobbyReadBudget().admit("[".repeat(129)));
		JdbcMatchRepository repository = new JdbcMatchRepository(() -> { throw new SQLException("unavailable"); });
		assertThrows(SQLException.class, () -> repository.findAll(ids(1), new LobbyReadBudget()));
	}

	@Test void oversizedCheckpointAndCorruptJournalDoNotHideHealthyNeighbors() throws Exception {
		for (boolean oversized : List.of(false, true)) {
			Connection connection = mock(Connection.class);
			PreparedStatement checkpoint = mock(PreparedStatement.class), tail = mock(PreparedStatement.class);
			when(connection.prepareStatement(anyString())).thenReturn(checkpoint, tail);
			String artifact = new RecoveryArtifactJson().encode(new JsonObject().add("matchId", "test"), 10000);
			ResultSet checkpoints = rows(2, artifact);
			when(checkpoints.getLong(4)).thenReturn(oversized ? (long) LobbyReadBudget.RECORD_BYTES + 1 : 100L, 100L);
			when(checkpoint.executeQuery()).thenReturn(checkpoints);
			ResultSet journal = oversized ? mock(ResultSet.class) : rows(1, "{}");
			when(tail.executeQuery()).thenReturn(journal);
			var result = new JdbcRecoveryRepository(() -> connection, true).findAll(ids(2), new LobbyReadBudget());
			assertFalse(result.containsKey("id-0"));
			assertTrue(result.containsKey("id-1"));
			verify(connection).commit(); verify(connection).close();
		}
	}

	private List<String> ids(int count) {
		List<String> ids = new ArrayList<>(); for (int index = 0; index < count; index++) ids.add("id-" + index); return ids;
	}

	private ResultSet rows(int count, String json) throws Exception {
		ResultSet rows = mock(ResultSet.class); AtomicInteger index = new AtomicInteger(-1);
		when(rows.next()).thenAnswer(call -> index.incrementAndGet() < count);
		when(rows.getString(1)).thenAnswer(call -> "id-" + index.get());
		when(rows.getLong(2)).thenReturn(1L); when(rows.getLong(5)).thenReturn(1L);
		when(rows.getInt(2)).thenReturn(1);
		when(rows.getCharacterStream(3)).thenAnswer(call -> new StringReader(json));
		return rows;
	}
}
