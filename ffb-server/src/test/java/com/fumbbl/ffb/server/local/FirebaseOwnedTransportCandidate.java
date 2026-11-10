package com.fumbbl.ffb.server.local;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.LowLevelHttpRequest;
import com.google.api.client.http.LowLevelHttpResponse;
import com.google.api.client.testing.http.MockLowLevelHttpResponse;

import org.eclipse.jetty.client.BytesRequestContent;
import org.eclipse.jetty.client.CompletableResponseListener;
import org.eclipse.jetty.client.ContentResponse;
import org.eclipse.jetty.client.Destination;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.Request;
import org.eclipse.jetty.io.Transport;
import org.eclipse.jetty.util.component.LifeCycle;
import org.eclipse.jetty.util.ssl.SslContextFactory;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.channels.SelectableChannel;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.ToIntFunction;
import java.util.concurrent.atomic.AtomicInteger;

/** Spike only. All HTTP channels and deadlines belong to one synchronous SDK operation. */
final class FirebaseOwnedTransportCandidate extends HttpTransport implements AutoCloseable {
	private static final int MAX_BODY = 262_144;
	private final HttpClient client = new HttpClient();
	private final FirebaseDnsCandidate dns;
	private final ToIntFunction<URI> routePort;
	private final ThreadLocal<Operation> current = new ThreadLocal<>();
	FirebaseOwnedTransportCandidate(FirebaseDnsCandidate dns, SslContextFactory.Client ssl, int routePort) throws Exception {
		this(dns, ssl, uri -> routePort);
	}
	FirebaseOwnedTransportCandidate(FirebaseDnsCandidate dns, SslContextFactory.Client ssl, ToIntFunction<URI> routePort) throws Exception {
		this.dns = dns; this.routePort = routePort;
		client.setSslContextFactory(ssl);
		client.setConnectBlocking(false); client.setConnectTimeout(250);
		client.setFollowRedirects(false); client.setMaxConnectionsPerDestination(1);
		client.setMaxRequestsQueuedPerDestination(1); client.setMaxDestinations(8);
		client.getContentDecoderFactories().clear();
		client.setSocketAddressResolver((host, port, context, promise) -> promise.failed(new IOException("Unowned DNS forbidden")));
		client.start();
	}
	Operation begin() throws IOException {
		if (current.get() != null) throw new IOException("Nested allocation reset forbidden");
		BrowserRequestTiming.Budget budget = new BrowserRequestTiming().budget();
		if (budget != null && budget.allowanceMillis(1_000, 150) < 1_000) throw new IOException("Insufficient request budget");
		Operation operation = new Operation(); current.set(operation); return operation;
	}
	int destinations() { return client.getDestinations().size(); }
	void sendBufferBytes(int size) { client.getClientConnector().setSendBufferSize(size); }
	@Override protected LowLevelHttpRequest buildRequest(String method, String url) throws IOException {
		Operation operation = current.get();
		if (operation == null) throw new IOException("Provider operation scope required");
		operation.check();
		URI original = URI.create(url);
		return new LowLevelHttpRequest() {
			private final Map<String, String> headers = new LinkedHashMap<>();
			@Override public void addHeader(String name, String value) throws IOException {
				if (headers.size() >= 64 || name.length() > 256 || value.length() > 8_192) throw new IOException("Provider header limit");
				headers.put(name, value);
			}
			@Override public LowLevelHttpResponse execute() throws IOException {
				operation.attempt();
				int mappedPort = routePort.applyAsInt(original);
				int port = mappedPort > 0 ? mappedPort : original.getPort() > 0 ? original.getPort() : "https".equals(original.getScheme()) ? 443 : 80;
				InetSocketAddress address = dns.resolve(original.getHost(), port, Math.min(operation.ioDeadline, System.nanoTime() + 200_000_000L)).getFirst();
				operation.check();
				URI target;
				try { target = new URI(original.getScheme(), null, original.getHost(), port, original.getPath(), original.getQuery(), null); }
				catch (Exception failure) { throw new IOException("Invalid provider URI", failure); }
				Request request = client.newRequest(target).method(method).transport(new OwnedTransport(operation, address))
					.timeout(Math.max(1, operation.remainingIo()), TimeUnit.NANOSECONDS).followRedirects(false);
				request.onRequestHeaders(ignored -> operation.headers.incrementAndGet());
				request.onRequestSuccess(ignored -> operation.writes.incrementAndGet());
				request.headers(fields -> {
					headers.forEach(fields::put);
					fields.put("Accept-Encoding", "identity");
				});
				if (getStreamingContent() != null) {
					ByteArrayOutputStream body = new ByteArrayOutputStream() {
						@Override public synchronized void write(int value) {
							if (size() == MAX_BODY) throw new IllegalArgumentException("Provider body limit");
							super.write(value);
						}
						@Override public synchronized void write(byte[] bytes, int offset, int length) {
							if (length > MAX_BODY - size()) throw new IllegalArgumentException("Provider body limit");
							super.write(bytes, offset, length);
						}
					};
					getStreamingContent().writeTo(body); request.body(new BytesRequestContent(getContentType(), body.toByteArray()));
				}
				Destination destination = client.resolveDestination(request); operation.destinations.add(destination);
				try {
					ContentResponse response = new CompletableResponseListener(request, MAX_BODY).send().get(operation.remainingIo(), TimeUnit.NANOSECONDS);
					operation.statuses.add(response.getStatus());
					operation.check();
					if (response.getStatus() >= 300) throw new IOException("Terminal provider status " + response.getStatus());
					if (response.getHeaders().get("Content-Encoding") != null && !"identity".equalsIgnoreCase(response.getHeaders().get("Content-Encoding")))
						throw new IOException("Compressed provider response forbidden");
					MockLowLevelHttpResponse result = new MockLowLevelHttpResponse().setStatusCode(response.getStatus()).setContent(response.getContent())
						.setContentType(response.getHeaders().get("Content-Type")).setContentLength(response.getContent().length);
					response.getHeaders().forEach(field -> result.addHeader(field.getName(), field.getValue()));
					return result;
				} catch (Exception failure) {
					request.abort(failure);
					operation.cancel();
					if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
					if (failure instanceof TimeoutException) throw new SocketTimeoutException("Provider operation I/O deadline");
					throw new IOException("Provider transport failed", failure);
				}
			}
		};
	}

	final class Operation implements AutoCloseable {
		private final long started = System.nanoTime();
		private final long ioDeadline = started + 900_000_000L;
		private final List<SelectableChannel> channels = new ArrayList<>();
		private final List<Destination> destinations = new ArrayList<>();
		private final List<Integer> statuses = new ArrayList<>();
		private final AtomicInteger headers = new AtomicInteger(), writes = new AtomicInteger();
		private boolean cancelled;
		private boolean released;
		private int attempts;
		long elapsedMillis() { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started); }
		int attempts() { return attempts; }
		int startedWrites() { return headers.get(); }
		int completedWrites() { return writes.get(); }
		List<Integer> statuses() { return List.copyOf(statuses); }
		long remainingIo() throws SocketTimeoutException { check(); return Math.max(1, ioDeadline - System.nanoTime()); }
		synchronized void check() throws SocketTimeoutException {
			if (cancelled || System.nanoTime() >= ioDeadline) throw new SocketTimeoutException("Provider I/O allocation expired");
		}
		synchronized void attempt() throws IOException { check(); if (++attempts > 8) throw new IOException("Provider HTTP attempt limit"); }
		synchronized SelectableChannel track(SelectableChannel channel) throws IOException {
			try { check(); channels.add(channel); return channel; }
			catch (IOException failure) { channel.close(); throw failure; }
		}
		synchronized int openChannels() { return (int) channels.stream().filter(SelectableChannel::isOpen).count(); }
		synchronized void cancel() {
			cancelled = true;
			for (SelectableChannel channel : channels) try { channel.close(); } catch (IOException ignored) { /* Actual socket cancellation. */ }
		}
		@Override public void close() {
			synchronized (this) { if (released) return; released = true; }
			cancel();
			try {
				for (Destination destination : destinations) try { LifeCycle.stop(destination); } finally { client.removeDestination(destination); }
			} finally { if (current.get() == this) current.remove(); }
		}
	}
	private final class OwnedTransport extends Transport.Wrapper {
		private final Operation operation;
		private final InetSocketAddress address;
		private boolean opened;
		OwnedTransport(Operation operation, InetSocketAddress address) { super(Transport.TCP_IP); this.operation = operation; this.address = address; }
		@Override public boolean requiresDomainNameResolution() { return false; }
		@Override public SocketAddress getSocketAddress() { return address; }
		@Override public synchronized SelectableChannel newSelectableChannel() throws IOException {
			if (opened) throw new IOException("Provider connection retry forbidden");
			opened = true;
			return operation.track(super.newSelectableChannel());
		}
	}
	@Override public void close() throws Exception { client.stop(); }
}
