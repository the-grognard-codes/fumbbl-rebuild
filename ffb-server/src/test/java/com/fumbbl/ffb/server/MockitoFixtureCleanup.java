package com.fumbbl.ffb.server;

import org.junit.jupiter.api.extension.AfterAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.mockito.Mockito;

/** Releases inline mock state after the test class and its fixtures have finished. */
public final class MockitoFixtureCleanup implements AfterAllCallback {
	@Override
	public void afterAll(ExtensionContext context) {
		Mockito.framework().clearInlineMocks();
	}
}
