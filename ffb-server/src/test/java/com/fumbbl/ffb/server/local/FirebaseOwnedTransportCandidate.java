package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.FirebaseProviderBounds;
import com.fumbbl.ffb.server.match.FirebaseProviderTransport;

import org.eclipse.jetty.util.ssl.SslContextFactory;

import java.net.URI;
import java.util.function.ToIntFunction;

/** Accepted spike routing/trust fixture; all deadline and channel logic comes from production. */
final class FirebaseOwnedTransportCandidate extends FirebaseProviderTransport {
	private final ToIntFunction<URI> ports;
	FirebaseOwnedTransportCandidate(FirebaseDnsCandidate dns, SslContextFactory.Client ssl, int port) throws Exception {
		this(dns, ssl, uri -> port);
	}
	FirebaseOwnedTransportCandidate(FirebaseDnsCandidate dns, SslContextFactory.Client ssl, ToIntFunction<URI> ports) throws Exception {
		this(dns, ssl, ports, new FirebaseProviderBounds(1_000, 200, 250, 3, 5_000));
	}
	FirebaseOwnedTransportCandidate(FirebaseDnsCandidate dns, SslContextFactory.Client ssl, ToIntFunction<URI> ports, FirebaseProviderBounds bounds) throws Exception {
		super(bounds, dns, ssl, false);
		this.ports = ports;
	}
	@Override protected int connectPort(URI uri) { return ports.applyAsInt(uri); }
	@Override protected void sendBufferBytes(int size) { super.sendBufferBytes(size); }
}
