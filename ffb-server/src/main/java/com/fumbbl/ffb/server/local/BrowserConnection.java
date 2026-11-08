package com.fumbbl.ffb.server.local;

/** Browser protocol output, independent of the WebSocket transport. */
public interface BrowserConnection {
	void send(String message);
	/** Optional diagnostics may be dropped without closing or delaying admission of a gameplay reply. */
	default void sendDiagnostics(String message) { }
	default void diagnosticsEnabled(boolean enabled) { }
	default void diagnosticDetailsEnabled(boolean enabled) { }
	default boolean diagnosticDetailsEnabled() { return false; }
	default void sendDiagnosticTrace(String message) { }
	/** Transports without atomic optional admission preserve mandatory state and use paged history. */
	default void sendWithOptionalPredecessor(String optional, String mandatory) { send(mandatory); }
	default void close(int statusCode, String reason) { }
}
