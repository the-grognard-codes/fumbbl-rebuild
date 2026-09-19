package com.fumbbl.ffb.server.match;

import java.sql.Connection;
import java.sql.PreparedStatement;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcMatchMembershipRepositoryTest {
	private static final String MATCH = "12345678-1234-1234-1234-123456789abc";
	private static final String HOME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private Connection connection;
	private PreparedStatement statement;
	private JdbcMatchMembershipRepository repository;

	@BeforeEach void setup() throws Exception {
		connection = mock(Connection.class); statement = mock(PreparedStatement.class);
		when(connection.prepareStatement(anyString())).thenReturn(statement);
		repository = new JdbcMatchMembershipRepository(() -> connection);
	}

	@Test void insertsAccountAssociationWithServerAssignedRole() throws Exception {
		when(statement.executeUpdate()).thenReturn(1);
		assertDoesNotThrow(() -> repository.insert(new MatchMembership(MATCH, HOME, "home")));
		verify(statement).setString(1, MATCH); verify(statement).setString(2, HOME); verify(statement).setString(3, "home");
	}
}
