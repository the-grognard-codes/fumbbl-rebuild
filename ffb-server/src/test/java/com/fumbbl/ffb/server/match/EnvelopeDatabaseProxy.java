package com.fumbbl.ffb.server.match;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** Loopback-only failure target. Never stops or modifies the shared development database. */
final class EnvelopeDatabaseProxy implements AutoCloseable {
	private final ServerSocket listener = new ServerSocket(0, 50, java.net.InetAddress.getLoopbackAddress());
	private final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
	final AtomicInteger attempts = new AtomicInteger();
	volatile boolean unavailable;
	EnvelopeDatabaseProxy(int databasePort) throws IOException {
		Thread.ofVirtual().start(() -> {
			while (!listener.isClosed()) try {
				Socket incoming = listener.accept(); attempts.incrementAndGet(); sockets.add(incoming);
				if (unavailable) { incoming.close(); sockets.remove(incoming); continue; }
				Socket outgoing = new Socket("127.0.0.1", databasePort); sockets.add(outgoing);
				Thread.ofVirtual().start(() -> copy(incoming, outgoing));
				Thread.ofVirtual().start(() -> copy(outgoing, incoming));
			} catch (IOException failure) { if (!listener.isClosed()) throw new IllegalStateException(failure); }
		});
	}
	int port() { return listener.getLocalPort(); }
	private void copy(Socket from, Socket to) {
		try { from.getInputStream().transferTo(to.getOutputStream()); }
		catch (IOException expectedOnClose) { }
		finally { close(from); close(to); }
	}
	private void close(Socket socket) { sockets.remove(socket); try { socket.close(); } catch (IOException ignored) { } }
	@Override public void close() throws IOException { listener.close(); for (Socket socket : sockets) close(socket); }
}
