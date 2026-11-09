package com.fumbbl.ffb.server.db;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import javax.net.SocketFactory;

/** Connector/J's public socket-factory seam. Only socket cancellation runs off the engine worker. */
public final class JdbcDeadlineSocketFactory extends SocketFactory {
	private static final ThreadLocal<Open> OPEN = new ThreadLocal<>();
	static final class Open implements AutoCloseable {
		private final Open previous = OPEN.get();
		private final JdbcRequestConfiguration configuration;
		private final ScheduledThreadPoolExecutor timer;
		private final int connectMillis, ioMillis;
		TimedSocket socket;
		Open(JdbcRequestConfiguration configuration, ScheduledThreadPoolExecutor timer, int connectMillis, int ioMillis) {
			this.configuration = configuration; this.timer = timer; this.connectMillis = connectMillis; this.ioMillis = ioMillis;
			OPEN.set(this);
		}
		@Override public void close() { if (previous == null) OPEN.remove(); else OPEN.set(previous); }
	}
	static final class TimedSocket extends Socket {
		private final ScheduledThreadPoolExecutor timer;
		private ScheduledFuture<?> timeout;
		private long generation;
		private boolean expired;
		TimedSocket(ScheduledThreadPoolExecutor timer) { this.timer = timer; }
		synchronized void arm(int millis) {
			disarm();
			expired = false;
			long expected = generation;
			timeout = timer.schedule(() -> expire(expected), millis, TimeUnit.MILLISECONDS);
		}
		private synchronized void expire(long expected) {
			if (generation != expected) return;
			expired = true;
			try { super.close(); } catch (IOException ignored) { /* Closing the transport is the cancellation. */ }
		}
		synchronized boolean disarm() {
			generation++;
			if (timeout != null) { timeout.cancel(false); timeout = null; }
			return expired;
		}
		@Override public synchronized void close() throws IOException { disarm(); super.close(); }
	}
	@Override public Socket createSocket() throws IOException {
		Open open = OPEN.get();
		if (open == null || open.socket != null) throw new IOException("JDBC socket requires one bounded acquisition");
		TimedSocket socket = new TimedSocket(open.timer);
		open.socket = socket;
		socket.arm(open.ioMillis);
		try {
			socket.connect(new InetSocketAddress(open.configuration.address(), open.configuration.port()), open.connectMillis);
			return socket;
		} catch (IOException failure) { socket.close(); throw failure; }
	}
	@Override public Socket createSocket(String host, int port) throws IOException { throw unsupported(); }
	@Override public Socket createSocket(String host, int port, InetAddress local, int localPort) throws IOException { throw unsupported(); }
	@Override public Socket createSocket(InetAddress host, int port) throws IOException { throw unsupported(); }
	@Override public Socket createSocket(InetAddress host, int port, InetAddress local, int localPort) throws IOException { throw unsupported(); }
	private IOException unsupported() { return new IOException("Only bounded pre-resolved JDBC sockets are supported"); }
}
