package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Handler;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupPersistenceLoggingTest {

	@Test void completionRetryAndRejectionUseDistinctSafeCodes() {
		Logger logger = Logger.getLogger("com.fumbbl.ffb.server.match.persistence");
		List<String> messages = new ArrayList<>();
		Handler capture = new Handler() {
			@Override public void publish(LogRecord record) { messages.add(record.getMessage()); }
			@Override public void flush() { }
			@Override public void close() { }
		};
		logger.addHandler(capture);
		try {
			MatchPersistenceLog log = new MatchPersistenceLog();
			log.pendingCompletionFailed("untrusted-id", new IllegalStateException("private detail"));
			log.pendingCompletionRejected("untrusted-id", new MatchService.Failure("COMPLETION_CONFLICT"));
		} finally { logger.removeHandler(capture); }
		assertEquals(2, messages.size());
		assertTrue(messages.get(0).startsWith("COMPLETION_RETRY "));
		assertTrue(messages.get(1).startsWith("COMPLETION_REJECTED failureCode=COMPLETION_CONFLICT "));
		assertTrue(messages.stream().allMatch(message -> !message.contains("private detail") && !message.contains("untrusted-id")));
	}

	@Test void eachSetupMappingLogsOneSafeDiagnostic() throws SQLException {
		String matchId = "12345678-1234-1234-1234-123456789abc";
		MatchService matches = mock(MatchService.class);
		SetupApplication legacy = new SetupApplication(null, matches);
		SetupApplication recoverable = new SetupApplication(null, matches, mock(RecoveryRepository.class));
		when(matches.load("home", matchId)).thenThrow(new SQLException("private player name", "42000", 123));
		when(matches.loadForSetup("home", matchId)).thenThrow(new SQLException("private player name", "42000", 123));
		JsonObject request = new JsonObject().add("version", 1).add("type", "preparedMatch").add("operation", "activate")
			.add("requestId", "activate-test").add("matchId", matchId).add("expectedRevision", 1);
		Logger logger = Logger.getLogger("com.fumbbl.ffb.server.match.persistence");
		List<String> messages = new ArrayList<>();
		Handler capture = new Handler() {
			@Override public void publish(LogRecord record) { messages.add(record.getMessage()); }
			@Override public void flush() { }
			@Override public void close() { }
		};
		logger.addHandler(capture);
		try {
			assertEquals("PERSISTENCE_FAILED", legacy.activate("home", request.toString()).getString("code", null));
			assertEquals("PERSISTENCE_FAILED", recoverable.activate("home", request.toString()).getString("code", null));
			request.set("type", "setup").set("operation", "load").set("requestId", "load-test").remove("expectedRevision");
			assertEquals("PERSISTENCE_FAILED", recoverable.handle("home", request).getString("code", null));
		} finally {
			logger.removeHandler(capture);
		}
		assertEquals(3, messages.size());
		assertTrue(messages.get(0).contains("legacy-activation"));
		assertTrue(messages.get(1).contains("recoverable-activation"));
		assertTrue(messages.get(2).contains("match-load"));
		for (String message : messages) {
			assertTrue(message.contains(matchId));
			assertTrue(message.contains("42000"));
			assertTrue(message.contains("123"));
			assertFalse(message.contains("private player name"));
		}
	}
}
