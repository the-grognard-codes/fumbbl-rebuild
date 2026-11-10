package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.FirebaseDnsResolver;

import java.net.InetSocketAddress;

/** Keeps the accepted spike fixtures on the production resolver implementation. */
final class FirebaseDnsCandidate extends FirebaseDnsResolver {
	FirebaseDnsCandidate(InetSocketAddress server) { super(server); }
}
