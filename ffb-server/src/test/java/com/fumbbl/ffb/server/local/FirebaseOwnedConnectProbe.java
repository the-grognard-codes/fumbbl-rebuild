package com.fumbbl.ffb.server.local;

import com.google.api.client.http.GenericUrl;

import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.xbill.DNS.Address;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;

/** Run only in a task-owned internal Docker network, targeting an unused address on that network. */
public final class FirebaseOwnedConnectProbe {
	public static void main(String[] args) throws Exception {
		if (args.length != 1) throw new IllegalArgumentException("One literal unused IPv4 address required");
		byte[] bytes = Address.toByteArray(args[0], Address.IPv4);
		if (bytes == null) throw new IllegalArgumentException("Literal IPv4 required");
		FirebaseDnsCandidate dns = new FirebaseDnsCandidate(new InetSocketAddress(Address.getByAddress("127.0.0.1"), 53));
		try (FirebaseOwnedTransportCandidate transport = new FirebaseOwnedTransportCandidate(dns, new SslContextFactory.Client(), 0)) {
			FirebaseOwnedTransportCandidate.Operation operation = transport.begin();
			try (operation) {
				boolean failed = false;
				boolean timeout = false;
				try { transport.createRequestFactory().buildGetRequest(new GenericUrl("http://" + args[0] + ":44444/connect")).execute(); }
				catch (IOException expected) {
					failed = true;
					Throwable cause = expected;
					for (int depth = 0; cause != null && depth < 16; depth++, cause = cause.getCause())
						if (cause instanceof java.net.SocketTimeoutException || cause instanceof java.util.concurrent.TimeoutException) timeout = true;
				}
				long elapsed = operation.elapsedMillis();
				if (!failed || !timeout || elapsed < 180 || elapsed >= 1_000 || operation.requestsWithHeaders() != 0 || operation.openChannels() != 0)
					throw new AssertionError("Pending connect did not satisfy the deadline/physical cancellation proof");
				String remote = "%02X%02X%02X%02X:AD9C".formatted(bytes[3] & 255, bytes[2] & 255, bytes[1] & 255, bytes[0] & 255);
				if (Files.readString(Path.of("/proc/net/tcp")).contains(remote)) throw new AssertionError("Kernel still holds the pending connection");
				operation.close();
				if (operation.elapsedMillis() >= 1_000) throw new AssertionError("Pending-connect cleanup exceeded allocation");
				System.out.println("FIREBASE_OWNED_SPIKE pendingConnect elapsedMs=" + operation.elapsedMillis() + " activeChannels=0 kernelPending=0 attempts=" + operation.attempts() + " jvm=" + Runtime.version());
			}
			if (transport.destinations() != 0) throw new AssertionError("Destination retained after operation cleanup");
		}
	}
}
