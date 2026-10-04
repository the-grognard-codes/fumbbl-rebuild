package com.fumbbl.ffb.server.local;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LocalAcceptanceTokenMintTest {
	private static final String HOME = "acceptance-home-01234567-89ab-cdef-0123-456789abcdef";
	private static final String AWAY = "acceptance-away-01234567-89ab-cdef-0123-456789abcdef";
	private static final String SPECTATOR = "acceptance-spectator-01234567-89ab-cdef-0123-456789abcdef";
	private static final String SERVICE_ACCOUNT = "dev-moles-under-the-pitch-org@appspot.gserviceaccount.com";

	@Test
	void acceptsOnlyFreshDistinctProjectBoundIdentitiesAndOutputPath() {
		assertDoesNotThrow(() -> LocalAcceptanceTokenMint.validateInputs("/output/coach-tokens.json", HOME, AWAY, SPECTATOR,
			LocalAcceptanceTokenMint.PROJECT, SERVICE_ACCOUNT));
		assertThrows(IllegalArgumentException.class, () -> LocalAcceptanceTokenMint.validateInputs("/tmp/tokens.json", HOME, AWAY, SPECTATOR,
			LocalAcceptanceTokenMint.PROJECT, SERVICE_ACCOUNT));
		assertThrows(IllegalArgumentException.class, () -> LocalAcceptanceTokenMint.validateInputs("/output/tokens.json", HOME, HOME, SPECTATOR,
			LocalAcceptanceTokenMint.PROJECT, SERVICE_ACCOUNT));
		assertThrows(IllegalArgumentException.class, () -> LocalAcceptanceTokenMint.validateInputs("/output/tokens.json", HOME, AWAY, SPECTATOR,
			"unrelated-project", SERVICE_ACCOUNT));
		assertThrows(IllegalArgumentException.class, () -> LocalAcceptanceTokenMint.validateInputs("/output/tokens.json", HOME, AWAY, SPECTATOR,
			LocalAcceptanceTokenMint.PROJECT, "other-project@appspot.gserviceaccount.com"));
	}
}
