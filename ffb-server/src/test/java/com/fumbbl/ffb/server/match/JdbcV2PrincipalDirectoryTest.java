package com.fumbbl.ffb.server.match;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumSet;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcV2PrincipalDirectoryTest {
	private static final String ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private static final Clock CLOCK = Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC);

	@Test void reauthorizationRejectsLegacyOrExpiredPrincipalBeforeAnyDatabaseAccess() throws Exception {
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(() -> { throw new AssertionError("database should not be opened"); }, CLOCK);

		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> directory.reauthorize(new AuthenticatedPrincipal(ACCOUNT, EnumSet.of(ApplicationScope.PLAYER), 2000)));
		assertThrows(V2PrincipalAuthenticator.Rejected.class, () -> directory.reauthorize(new AuthenticatedPrincipal(ACCOUNT, EnumSet.of(ApplicationScope.PLAYER), 1000, "issuer", "subject")));
	}

	@Test void reauthorizationLoadsCurrentScopesAndNeverCreatesAnAccount() throws Exception {
		Connection connection = mock(Connection.class);
		PreparedStatement statement = mock(PreparedStatement.class);
		when(connection.prepareStatement(anyString())).thenReturn(statement);
		ResultSet account = rows(ACCOUNT);
		ResultSet accountState = rows("ACTIVE");
		ResultSet identityState = rows("ACTIVE");
		ResultSet scopes = rows("SPECTATOR");
		when(statement.executeQuery()).thenReturn(account, accountState, identityState, scopes);
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(() -> connection, CLOCK);
		AuthenticatedPrincipal original = new AuthenticatedPrincipal(ACCOUNT, EnumSet.of(ApplicationScope.PLAYER), 2000, "issuer", "subject");

		AuthenticatedPrincipal refreshed = directory.reauthorize(original);

		assertFalse(refreshed.hasScope(ApplicationScope.PLAYER));
		assertTrue(refreshed.hasScope(ApplicationScope.SPECTATOR));
		verify(connection, never()).setAutoCommit(false);
	}

	private ResultSet rows(String... values) throws Exception {
		ResultSet rows = mock(ResultSet.class);
		Boolean[] next = new Boolean[values.length + 1];
		for (int index = 0; index < values.length; index++) next[index] = true;
		next[values.length] = false;
		when(rows.next()).thenReturn(next[0], java.util.Arrays.copyOfRange(next, 1, next.length));
		for (int index = 0; index < values.length; index++) when(rows.getString(1)).thenReturn(values[index]);
		return rows;
	}
}
