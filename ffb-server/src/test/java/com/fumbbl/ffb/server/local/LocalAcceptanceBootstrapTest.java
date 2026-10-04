package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.DbConnectionManager;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LocalAcceptanceBootstrapTest {
	@Test
	void onlyExactMarkerInventoriesAreAccepted() {
		assertDoesNotThrow(() -> LocalAcceptanceBootstrap.requireInventory(
			new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_v2_account")),
			new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_v2_account"))));
		assertThrows(SQLException.class, () -> LocalAcceptanceBootstrap.requireInventory(
			new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_v2_account", "private_user_data")),
			new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_v2_account"))));
		assertThrows(SQLException.class, () -> LocalAcceptanceBootstrap.requireInventory(
			new HashSet<>(Arrays.asList("ffb_local_schema")),
			new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_v2_account"))));
	}

	@Test
	void markerFiveWithAnyDataIsRejectedBeforeMigrationWrites() throws Exception {
		DbConnectionManager manager = mock(DbConnectionManager.class);
		Connection connection = mock(Connection.class);
		Statement statement = mock(Statement.class);
		ResultSet count = mock(ResultSet.class);
		when(manager.openDbConnection()).thenReturn(connection);
		when(connection.createStatement()).thenReturn(statement);
		when(statement.executeQuery(anyString())).thenReturn(count);
		when(count.next()).thenReturn(true);
		when(count.getLong(1)).thenReturn(1L);

		assertThrows(SQLException.class, () -> LocalAcceptanceBootstrap.requireNoRows(manager,
			new HashSet<>(Arrays.asList("ffb_local_schema", "ffb_coaches"))));

		verify(statement, never()).execute(anyString());
		verify(statement, never()).executeUpdate(anyString());
	}

	@Test
	void markerSixRecoveryRejectsAnyV2AccountRows() throws Exception {
		DbConnectionManager manager = mock(DbConnectionManager.class);
		Connection connection = mock(Connection.class);
		Statement statement = mock(Statement.class);
		ResultSet count = mock(ResultSet.class);
		when(manager.openDbConnection()).thenReturn(connection);
		when(connection.createStatement()).thenReturn(statement);
		when(statement.executeQuery("SELECT COUNT(*) FROM ffb_v2_account")).thenReturn(count);
		when(count.next()).thenReturn(true);
		when(count.getLong(1)).thenReturn(1L);

		assertThrows(SQLException.class, () -> LocalAcceptanceBootstrap.requireNoRows(manager,
			Collections.singleton("ffb_v2_account")));

		verify(statement, never()).execute(anyString());
		verify(statement, never()).executeUpdate(anyString());
	}

	@Test
	void migrationParserRemovesSemicolonsInsideLineCommentsBeforeSplitting() {
		assertEquals(Collections.singletonList("UPDATE ffb_local_schema SET version=7 WHERE version=6"),
			LocalAcceptanceBootstrap.splitStatements("-- new account writes use format 3; do not split this comment\nUPDATE ffb_local_schema SET version=7 WHERE version=6;\n"));
	}
}
