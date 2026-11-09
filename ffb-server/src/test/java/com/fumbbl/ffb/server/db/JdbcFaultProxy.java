package com.fumbbl.ffb.server.db;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Test-only MySQL packet relay: lose one real acknowledgement, with either actual write outcome. */
public final class JdbcFaultProxy implements AutoCloseable {
	public enum Fault { COMMIT_COMMITTED, COMMIT_UNCOMMITTED, WRITE_COMMITTED, WRITE_UNCOMMITTED }
	private final ServerSocket listener;
	private final ExecutorService workers = Executors.newFixedThreadPool(9, work -> {
		Thread thread = new Thread(work, "synthetic-jdbc-fault-relay"); thread.setDaemon(true); return thread;
	});
	private final Set<Socket> sockets = ConcurrentHashMap.newKeySet();
	private final AtomicBoolean injected = new AtomicBoolean();
	private volatile boolean closed;
	public JdbcFaultProxy(int backendPort, Fault fault) throws IOException {
		listener = new ServerSocket(0, 8, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}));
		workers.submit(() -> {
			while (!closed) try {
				Socket client = listener.accept(), backend = new Socket();
				sockets.add(client); sockets.add(backend);
				backend.connect(new InetSocketAddress("127.0.0.1", backendPort), 500);
				AtomicBoolean suppress = new AtomicBoolean();
				workers.submit(() -> relay(client, backend, fault, suppress, true));
				workers.submit(() -> relay(backend, client, fault, suppress, false));
			} catch (IOException expectedShutdown) { if (!closed) throw new IllegalStateException(expectedShutdown); }
		});
	}
	public int port() { return listener.getLocalPort(); }
	public boolean injected() { return injected.get(); }
	private void relay(Socket source, Socket destination, Fault fault, AtomicBoolean suppress, boolean clientSide) {
		try {
			while (!closed) {
				byte[] packet = packet(source.getInputStream());
				boolean skip = false;
				if (clientSide && packet.length > 5 && packet[4] == 3) {
					String sql = new String(packet, 5, packet.length - 5, StandardCharsets.UTF_8).trim();
					boolean commit = sql.equalsIgnoreCase("COMMIT");
					boolean write = sql.startsWith("INSERT INTO ffb_v2_match_members") || sql.startsWith("INSERT INTO ffb_v2_skill_use_preferences");
					boolean selected = fault == Fault.COMMIT_COMMITTED || fault == Fault.COMMIT_UNCOMMITTED ? commit : write;
					if (selected && injected.compareAndSet(false, true)) {
						suppress.set(true);
						skip = fault == Fault.COMMIT_UNCOMMITTED || fault == Fault.WRITE_UNCOMMITTED;
					}
				}
				if (!skip && (clientSide || !suppress.get())) {
					destination.getOutputStream().write(packet); destination.getOutputStream().flush();
				}
			}
		} catch (IOException expectedCancellation) {
			// Client deadline closes both ends; an unforwarded transaction rolls back on disconnect.
		} finally { closeSocket(source); closeSocket(destination); }
	}
	private byte[] packet(InputStream input) throws IOException {
		byte[] header = input.readNBytes(4);
		if (header.length != 4) throw new EOFException();
		int length = (header[0] & 255) | (header[1] & 255) << 8 | (header[2] & 255) << 16;
		if (length > 16 * 1024 * 1024) throw new IOException("Synthetic packet exceeds test limit");
		byte[] packet = new byte[length + 4]; System.arraycopy(header, 0, packet, 0, 4);
		if (input.readNBytes(packet, 4, length) != length) throw new EOFException();
		return packet;
	}
	private void closeSocket(Socket socket) { try { socket.close(); } catch (IOException ignored) { } sockets.remove(socket); }
	@Override public void close() throws Exception {
		closed = true; listener.close();
		for (Socket socket : sockets) closeSocket(socket);
		workers.shutdownNow();
		if (!workers.awaitTermination(3, TimeUnit.SECONDS)) throw new IllegalStateException("Synthetic relay did not terminate");
	}
}
