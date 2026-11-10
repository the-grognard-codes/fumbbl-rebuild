package com.fumbbl.ffb.server.db;

import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcAvailabilityBreakerTest {
	@Test void oneProbeTaskCanNestConnectionsWithoutAdmittingAnotherTask() throws Exception {
		AtomicLong nanos = new AtomicLong();
		JdbcAvailabilityBreaker breaker = new JdbcAvailabilityBreaker(nanos::get);
		for (int index = 0; index < 3; index++) breaker.acquire().failure(new SQLException("transport", "08000"));
		nanos.set(5_000_000_000L);
		Object task = new Object(), other = new Object();
		JdbcAvailabilityBreaker.Lease outer = breaker.acquire(task), nested = breaker.acquire(task);
		assertDoesNotThrow(() -> breaker.requireAvailable(task));
		assertThrows(JdbcConnections.Unavailable.class, () -> breaker.acquire(other));
		nested.success();
		assertThrows(JdbcConnections.Unavailable.class, () -> breaker.acquire(other));
		outer.success();
		assertDoesNotThrow(() -> breaker.acquire(other).success());
	}
	@Test void failedNestedProbeReopensAndItsOlderOuterSuccessCannotHealIt() throws Exception {
		AtomicLong nanos = new AtomicLong();
		JdbcAvailabilityBreaker breaker = new JdbcAvailabilityBreaker(nanos::get);
		for (int index = 0; index < 3; index++) breaker.acquire().failure(new SQLException("transport", "08000"));
		nanos.set(5_000_000_000L); Object task = new Object();
		JdbcAvailabilityBreaker.Lease outer = breaker.acquire(task);
		breaker.acquire(task).failure(new SQLException("transport", "08000")); outer.success();
		assertThrows(JdbcConnections.Unavailable.class, () -> breaker.acquire(task));
		nanos.addAndGet(5_000_000_000L);
		assertDoesNotThrow(() -> breaker.acquire(new Object()).success());
	}
	@Test void olderSuccessfulConnectionCannotEraseANewerOpenCircuit() throws Exception {
		AtomicLong nanos = new AtomicLong();
		JdbcAvailabilityBreaker breaker = new JdbcAvailabilityBreaker(nanos::get);
		JdbcAvailabilityBreaker.Lease older = breaker.acquire();
		for (int index = 0; index < 3; index++) breaker.acquire().failure(new SQLException("transport", "08000"));
		older.success();
		assertThrows(JdbcConnections.Unavailable.class, breaker::acquire);
		nanos.set(5_000_000_000L); breaker.acquire().success();
		assertDoesNotThrow(() -> { breaker.acquire(); });
	}
	@Test void consecutiveFailuresOpenCooldownAdmitsOneProbeAndFailedProbeRestartsCooldown() throws Exception {
		AtomicLong nanos = new AtomicLong();
		JdbcAvailabilityBreaker breaker = new JdbcAvailabilityBreaker(nanos::get);
		for (int index = 0; index < 3; index++) {
			JdbcAvailabilityBreaker.Lease lease = breaker.acquire();
			lease.failure(new SQLException("transport", "08000"));
			lease.success(); // Cleanup cannot reset the failure of its own connection.
		}
		assertThrows(JdbcConnections.Unavailable.class, breaker::acquire);
		nanos.set(5_000_000_000L);
		JdbcAvailabilityBreaker.Lease probe = breaker.acquire();
		assertThrows(JdbcConnections.Unavailable.class, breaker::acquire);
		probe.failure(new SQLTimeoutException());
		assertThrows(JdbcConnections.Unavailable.class, breaker::acquire);
		nanos.addAndGet(5_000_000_000L);
		breaker.acquire().success();
		assertDoesNotThrow(() -> breaker.acquire().success());
	}
	@Test void contentionValidationAndLocalBudgetRefusalDoNotBecomeDatabaseOutages() throws Exception {
		JdbcAvailabilityBreaker breaker = new JdbcAvailabilityBreaker(() -> 0);
		assertFalse(breaker.availabilityFailure(new SQLTimeoutException("lock", "HY000", 1205)));
		assertFalse(breaker.availabilityFailure(new SQLException("duplicate", "23000", 1062)));
		assertFalse(breaker.availabilityFailure(new SQLException("deadlock", "40001", 1213)));
		assertFalse(breaker.availabilityFailure(new JdbcConnections.NotStarted()));
		assertFalse(breaker.availabilityFailure(new JdbcConnections.DeadlineExpired(new SQLException("lost acknowledgement", "08000"))));
		assertTrue(breaker.availabilityFailure(new SQLException("connection refused", "08001")));
		for (int index = 0; index < 8; index++) {
			JdbcAvailabilityBreaker.Lease lease = breaker.acquire();
			lease.failure(new JdbcConnections.NotStarted()); lease.abandon();
		}
		assertDoesNotThrow(() -> { breaker.acquire(); });
	}
}
