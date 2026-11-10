package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.ApplicationScope;
import com.fumbbl.ffb.server.match.AuthenticatedPrincipal;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BrowserV2DiagnosticsTest {
	private final AtomicLong millis = new AtomicLong(10000);
	private final AtomicLong nanos = new AtomicLong();
	private final Clock clock = mock(Clock.class);
	private final AuthenticatedPrincipal player = new AuthenticatedPrincipal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		EnumSet.of(ApplicationScope.PLAYER), 1000000);
	private final V2MatchAccess access = mock(V2MatchAccess.class);
	private final SetupApplication setup = mock(SetupApplication.class);
	private final BrowserV2Adapter adapter;
	private final BrowserRequestTiming timing = new BrowserRequestTiming(nanos::get, line -> { });

	BrowserV2DiagnosticsTest() throws Exception {
		when(clock.millis()).thenAnswer(call -> millis.get());
		when(access.require(any(), any())).thenAnswer(call -> call.getArgument(0));
		adapter = new BrowserV2Adapter(bearer -> player, access, setup, null, null, null, new ComputerOpponentService(null), clock);
		adapter.configureDiagnostics(true);
	}

	@Test void configurationRequiresAuthenticationAndStrictFieldsAndDoesNotChangeMatchState() {
		Connection connection = new Connection();
		adapter.receive(connection, configure(true).toString());
		assertEquals("AUTHENTICATION_REQUIRED", connection.last().getString("code", ""));
		authenticate(connection);
		assertEquals(5, connection.last().size()); // Existing authentication response has no capability fields.
		adapter.receive(connection, configure(true).add("matchId", "private").toString());
		assertEquals("MALFORMED_MESSAGE", connection.last().getString("code", ""));
		assertFalse(connection.enabled);
		adapter.receive(connection, configure(true).set("enabled", "true").toString());
		assertEquals("MALFORMED_MESSAGE", connection.last().getString("code", ""));
		adapter.receive(connection, configure(true).toString());
		assertTrue(connection.enabled);
		assertEquals(new JsonObject().add("type", "diagnostics").add("requestId", "configure")
			.add("code", "ACCEPTED").add("enabled", true).add("version", 2), connection.last());
		verifyNoInteractions(setup);
	}

	@Test void productionPolicyRejectsEnableButAcceptsDisable() {
		Connection connection = new Connection();
		authenticate(connection);
		adapter.configureDiagnostics(false);
		adapter.receive(connection, configure(true).toString());
		assertEquals("UNSUPPORTED_MESSAGE", connection.last().getString("code", ""));
		assertFalse(connection.enabled);
		adapter.receive(connection, configure(false).toString());
		assertEquals("ACCEPTED", connection.last().getString("code", ""));
		assertFalse(connection.last().getBoolean("enabled", true));
	}

	@Test void probesAreOptInRateLimitedPerConnectionAndDisableAndDisconnectClearState() {
		Connection connection = new Connection();
		authenticate(connection);
		probe(connection, "off");
		assertEquals("DIAGNOSTICS_DISABLED", connection.last().getString("code", ""));
		adapter.receive(connection, configure(true).toString());
		probe(connection, "first");
		assertEquals("ACCEPTED", connection.last().getString("code", ""));
		probe(connection, "limited");
		assertEquals("RATE_LIMITED", connection.last().getString("code", ""));
		// Repeated configuration cannot reset the rate limiter.
		adapter.receive(connection, configure(true).toString());
		millis.addAndGet(999);
		probe(connection, "early");
		assertEquals("RATE_LIMITED", connection.last().getString("code", ""));
		millis.incrementAndGet();
		probe(connection, "next");
		assertEquals("ACCEPTED", connection.last().getString("code", ""));
		adapter.receive(connection, configure(false).toString());
		assertFalse(connection.enabled);
		probe(connection, "disabled");
		assertEquals("DIAGNOSTICS_DISABLED", connection.last().getString("code", ""));
		adapter.receive(connection, configure(true).toString());
		probe(connection, "toggle-cannot-reset-limiter");
		assertEquals("RATE_LIMITED", connection.last().getString("code", ""));
		adapter.disconnect(connection);
		assertFalse(connection.enabled);
		probe(connection, "disconnected");
		assertEquals("AUTHENTICATION_REQUIRED", connection.last().getString("code", ""));
		assertTrue(connection.telemetry.isEmpty());
		verifyNoInteractions(setup);
	}

	@Test void optedInOwnRequestsReceiveSeparateTelemetryWithoutChangingNormalReplies() {
		Connection connection = new Connection();
		authenticate(connection);
		timedProbe(connection, "before-enable");
		assertTrue(connection.telemetry.isEmpty());
		adapter.receive(connection, configure(true).toString());
		timedProbe(connection, "own-probe");
		assertEquals("diagnostics", connection.last().getString("type", ""));
		assertEquals(1, connection.telemetry.size());
		JsonObject telemetry = JsonObject.readFrom(connection.telemetry.get(0));
		assertEquals("own-probe", telemetry.getString("requestId", ""));
		assertEquals("diagnosticsTiming", telemetry.getString("type", ""));
		assertEquals(7, telemetry.get("timing").asObject().size());
		Connection replacement = new Connection();
		authenticate(replacement);
		assertFalse(connection.enabled);
		timedProbe(replacement, "new-connection-off");
		assertTrue(replacement.telemetry.isEmpty());
		verifyNoInteractions(setup);
	}

	@Test void revokedAuthorizationCannotRunProbe() throws Exception {
		Connection connection = new Connection();
		authenticate(connection);
		adapter.receive(connection, configure(true).toString());
		when(access.require(any(), any())).thenThrow(new com.fumbbl.ffb.server.match.MatchService.Failure("AUTHENTICATION_REQUIRED"));
		timedProbe(connection, "revoked");
		assertEquals("AUTHENTICATION_REQUIRED", connection.last().getString("code", ""));
		assertTrue(connection.telemetry.isEmpty());
		verifyNoInteractions(setup);
	}

	private void timedProbe(Connection connection, String id) {
		try (BrowserRequestTiming.Scope ignored = timing.handling(timing.queued())) { probe(connection, id); }
	}
	private void probe(Connection connection, String id) {
		adapter.receive(connection, request("diagnostics", id).add("operation", "probe").toString());
	}
	private void authenticate(Connection connection) {
		adapter.receive(connection, request("authenticate", "auth").add("bearer", "private-bearer").toString());
	}
	private JsonObject configure(boolean enabled) { return request("diagnostics", "configure").add("operation", "configure").add("enabled", enabled); }
	private JsonObject request(String type, String id) { return new JsonObject().add("version", 2).add("type", type).add("requestId", id); }
	private static final class Connection implements BrowserConnection {
		private final List<String> messages = new ArrayList<>(), telemetry = new ArrayList<>();
		private boolean enabled;
		@Override public void send(String message) { messages.add(message); }
		@Override public void sendDiagnostics(String message) { telemetry.add(message); }
		@Override public void diagnosticsEnabled(boolean enabled) { this.enabled = enabled; }
		JsonObject last() { return JsonObject.readFrom(messages.getLast()); }
	}
}
