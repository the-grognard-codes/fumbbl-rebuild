package com.fumbbl.ffb.server.local;

/** Browser protocol output, independent of the WebSocket transport. */
public interface BrowserConnection {
	void send(String message);
	/** Transports without atomic optional admission preserve mandatory state and use paged history. */
	default void sendWithOptionalPredecessor(String optional, String mandatory) { send(mandatory); }
	default void close(int statusCode, String reason) { }
}
