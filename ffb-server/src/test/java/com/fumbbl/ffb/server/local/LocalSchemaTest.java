package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.DbConnectionManager;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
class LocalSchemaTest {
	@Test
	void schemaOnlyInitializationRefusesNonEmptyDatabaseBeforeWriting() throws Exception {
		DbConnectionManager manager = mock(DbConnectionManager.class);
		Connection connection = mock(Connection.class);
		Statement statement = mock(Statement.class);
		ResultSet tables = mock(ResultSet.class);
		when(manager.openDbConnection()).thenReturn(connection);
		when(connection.createStatement()).thenReturn(statement);
		when(statement.executeQuery("SHOW TABLES")).thenReturn(tables);
		when(tables.next()).thenReturn(true);

		assertThrows(SQLException.class, () -> new LocalSchema().initializeSchemaOnly(manager));

		verify(statement, never()).executeUpdate(anyString());
	}

	@Test
	void namedTeamStartupVerifiesRetainedAndNewTablesWithoutMigrationWrites() throws Exception {
		DbConnectionManager manager = mock(DbConnectionManager.class);
		Connection connection = mock(Connection.class); Statement statement = mock(Statement.class);
		ResultSet version = mock(ResultSet.class);
		when(manager.openDbConnection()).thenReturn(connection); when(connection.createStatement()).thenReturn(statement);
		when(statement.executeQuery("SELECT version FROM ffb_local_schema")).thenReturn(version);
		when(version.next()).thenReturn(true, false); when(version.getInt(1)).thenReturn(9);
		LocalSchema schema = spy(new LocalSchema());
		doNothing().when(schema).verifySavedTeams(connection); doNothing().when(schema).verifyCompletedMatches(connection);
		doNothing().when(schema).verifyRecovery(connection, true); doNothing().when(schema).verifyMarker6(connection);

		schema.initialize(manager);

		verify(schema).verifySavedTeams(connection); verify(schema).verifyCompletedMatches(connection);
		verify(schema).verifyRecovery(connection, true); verify(schema).verifyMarker6(connection);
		verify(statement, never()).executeUpdate(anyString()); verify(connection, never()).commit();
	}

	@Test
	void markerSixStartupRefusesMarkerFiveWithoutMigrationWrites() throws Exception {
		DbConnectionManager manager = mock(DbConnectionManager.class);
		Connection connection = mock(Connection.class); Statement statement = mock(Statement.class);
		ResultSet version = mock(ResultSet.class);
		when(manager.openDbConnection()).thenReturn(connection); when(connection.createStatement()).thenReturn(statement);
		when(statement.executeQuery("SELECT version FROM ffb_local_schema")).thenReturn(version);
		when(version.next()).thenReturn(true, false); when(version.getInt(1)).thenReturn(5);

		assertThrows(SQLException.class, () -> new LocalSchema().initialize(manager));

		verify(statement, never()).executeUpdate(anyString()); verify(connection, never()).commit();
	}

}
