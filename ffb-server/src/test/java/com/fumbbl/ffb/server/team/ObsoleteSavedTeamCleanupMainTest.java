package com.fumbbl.ffb.server.team;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.sql.SQLException;
import java.util.Collections;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ObsoleteSavedTeamCleanupMainTest {
	private static final String URL = "jdbc:mariadb://example.invalid:3306/ffb_local";

	@Test void postCommitInventoryFailureRetainsCommittedStatusAndRequestsReadOnlyRecheck() throws Exception {
		ObsoleteSavedTeamCleanup.Store store = mock(ObsoleteSavedTeamCleanup.Store.class);
		when(store.schemaVersion()).thenReturn(7);
		when(store.databaseName()).thenReturn("ffb_local");
		when(store.scan()).thenThrow(new SQLException("private connection detail"));
		ByteArrayOutputStream output = new ByteArrayOutputStream(), errors = new ByteArrayOutputStream();
		int status = ObsoleteSavedTeamCleanupMain.reportCommitted(new ObsoleteSavedTeamCleanup(), store, "local", URL,
			new ObsoleteSavedTeamCleanup.Result(2, 1), new PrintStream(output, true, "UTF-8"),
			new PrintStream(errors, true, "UTF-8"));
		assertEquals(3, status);
		assertTrue(output.toString("UTF-8").startsWith("committed=true deleted=2 alreadyAbsent=1"));
		assertTrue(errors.toString("UTF-8").contains("CLEANUP_COMMITTED_VERIFICATION_PENDING"));
		assertTrue(!output.toString("UTF-8").contains("private connection detail"));
		assertTrue(!errors.toString("UTF-8").contains("private connection detail"));
	}

	@Test void postCommitInventorySuccessReportsRemainingAggregateCount() throws Exception {
		ObsoleteSavedTeamCleanup.Store store = mock(ObsoleteSavedTeamCleanup.Store.class);
		when(store.schemaVersion()).thenReturn(7);
		when(store.databaseName()).thenReturn("ffb_local");
		when(store.scan()).thenReturn(Collections.emptyList());
		ByteArrayOutputStream output = new ByteArrayOutputStream(), errors = new ByteArrayOutputStream();
		int status = ObsoleteSavedTeamCleanupMain.reportCommitted(new ObsoleteSavedTeamCleanup(), store, "local", URL,
			new ObsoleteSavedTeamCleanup.Result(1, 0), new PrintStream(output, true, "UTF-8"),
			new PrintStream(errors, true, "UTF-8"));
		assertEquals(0, status);
		assertTrue(output.toString("UTF-8").contains("postCommitVerification=complete remainingObsolete=0 currentOrExcluded=0"));
		assertEquals("", errors.toString("UTF-8"));
	}
}
