package com.fumbbl.ffb.server.local;

/** Protocol implementations share the bounded single-worker transport. */
public interface BrowserProtocol {
	void receive(BrowserMatchAdapter.Connection connection, String text);
	void disconnect(BrowserMatchAdapter.Connection connection);
}
