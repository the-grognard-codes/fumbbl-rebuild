package com.fumbbl.ffb.server.local;

/** Protocol implementations share the bounded single-worker transport. */
public interface BrowserProtocol {
	void receive(BrowserConnection connection, String text);
	void disconnect(BrowserConnection connection);
	default void expireDecisions() { }
	default boolean hasPendingPublications() { return false; }
	default void retryPublications() { }
}
