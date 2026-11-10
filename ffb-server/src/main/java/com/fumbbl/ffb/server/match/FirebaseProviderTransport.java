package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.LowLevelHttpRequest;
import com.google.api.client.http.LowLevelHttpResponse;
import org.eclipse.jetty.client.BytesRequestContent;
import org.eclipse.jetty.client.CompletableResponseListener;
import org.eclipse.jetty.client.ContentResponse;
import org.eclipse.jetty.client.Destination;
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.client.Request;
import org.eclipse.jetty.io.Transport;
import org.eclipse.jetty.util.component.LifeCycle;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.eclipse.jetty.util.thread.QueuedThreadPool;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
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
import java.util.concurrent.atomic.AtomicInteger;

/** One admitted provider operation owns every DNS/HTTP/TLS channel, including credential refresh. */
public class FirebaseProviderTransport extends HttpTransport implements AutoCloseable {
	private static final int MAX_BODY = FirebaseProviderBounds.MAX_BODY_BYTES;
	private final HttpClient client;
	private final FirebaseProviderBounds bounds;
	private final boolean restrictedEndpoints;
	private final FirebaseDnsResolver dns;
	private final ThreadLocal<Operation> current = new ThreadLocal<>();
	public FirebaseProviderTransport(FirebaseProviderBounds bounds) throws Exception {
		this(bounds, new FirebaseDnsResolver(), new SslContextFactory.Client(), true);
	}
	protected FirebaseProviderTransport(FirebaseProviderBounds bounds, FirebaseDnsResolver dns, SslContextFactory.Client ssl, boolean restrictedEndpoints) throws Exception {
		if (bounds == null || dns == null || ssl == null) throw new IllegalArgumentException("Firebase transport dependencies required");
		this.bounds = bounds; this.dns = dns; this.restrictedEndpoints = restrictedEndpoints; this.client = new HttpClient();
		QueuedThreadPool threads = new QueuedThreadPool(8, 2); threads.setName("firebase-io"); threads.setDaemon(true);
		client.setExecutor(threads); client.getClientConnector().setSelectors(1);
		client.setSslContextFactory(ssl);
		client.setConnectBlocking(false); client.setConnectTimeout(bounds.connectMillis());
		client.setFollowRedirects(false); client.setMaxConnectionsPerDestination(1);
		client.setMaxRequestsQueuedPerDestination(1); client.setMaxDestinations(FirebaseProviderBounds.MAX_HTTP_REQUESTS);
		client.getContentDecoderFactories().clear();
		client.setSocketAddressResolver((host, port, context, promise) -> promise.failed(new IOException("Unowned DNS forbidden")));
		try { client.start(); }
		catch (Exception failure) { try { client.stop(); } catch (Exception cleanup) { failure.addSuppressed(cleanup); } throw failure; }
	}
	/** Package-only seam for pre-existing SDK doubles; production always constructs the network transport. */
	static FirebaseProviderTransport withoutNetworkForTests(FirebaseProviderBounds bounds) { return new FirebaseProviderTransport(bounds, true); }
	private FirebaseProviderTransport(FirebaseProviderBounds bounds, boolean noNetwork) {
		if (!noNetwork) throw new IllegalArgumentException("Use the production constructor for network transport");
		this.bounds = bounds; this.client = null; this.dns = null; this.restrictedEndpoints = true;
	}
	protected int connectPort(URI uri) { return uri.getPort(); }
	public Operation begin() throws IOException {
		if (current.get() != null) throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.POLICY);
		BrowserRequestTiming.Budget budget = new BrowserRequestTiming().budget();
		if (budget != null && budget.allowanceMillis(bounds.operationMillis(), FirebaseProviderBounds.REQUEST_RESERVE_MILLIS) < bounds.operationMillis()) throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.ADMISSION);
		Operation operation = new Operation(); current.set(operation); return operation;
	}
	public int destinations() { return client == null ? 0 : client.getDestinations().size(); }
	protected void sendBufferBytes(int size) { client.getClientConnector().setSendBufferSize(size); }
	@Override protected final LowLevelHttpRequest buildRequest(String method, String url) throws IOException {
		Operation operation = current.get();
		if (operation == null || client == null) throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.POLICY);
		operation.check();
		URI original = URI.create(url);
		if (restrictedEndpoints) bounds.requireEndpoint(original);
		return new LowLevelHttpRequest() {
			private final Map<String, String> headers = new LinkedHashMap<>();
			@Override public void addHeader(String name, String value) throws IOException {
				if (headers.size() >= 64 || name.length() > 256 || value.length() > 8_192) throw new IOException("Provider header limit");
				headers.put(name, value);
			}
			@Override public LowLevelHttpResponse execute() throws IOException {
				operation.attempt();
				int mappedPort = connectPort(original);
				int port = mappedPort > 0 ? mappedPort : original.getPort() > 0 ? original.getPort() : "https".equals(original.getScheme()) ? 443 : 80;
				InetSocketAddress address = dns.resolve(original.getHost(), port, Math.min(operation.ioDeadline, System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(bounds.dnsMillis()))).getFirst();
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
					if (getContentEncoding() != null) request.headers(fields -> fields.put("Content-Encoding", getContentEncoding()));
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
					if (response.getStatus() >= 300) throw FirebaseProviderFailure.response(response.getStatus(), response.getContent(),
						"identitytoolkit.googleapis.com".equals(original.getHost()) && original.getPath().endsWith("/accounts:lookup"));
					if (response.getHeaders().get("Content-Encoding") != null && !"identity".equalsIgnoreCase(response.getHeaders().get("Content-Encoding")))
						throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.POLICY);
					return new BufferedResponse(response);
				} catch (Exception failure) {
					request.abort(failure);
					operation.cancel();
					if (failure instanceof InterruptedException) Thread.currentThread().interrupt();
					if (failure instanceof FirebaseProviderFailure known) throw known;
					throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.AVAILABILITY, failure);
				}
			}
		};
	}

	public final class Operation implements AutoCloseable {
		private Operation() { }
		private final long started = System.nanoTime();
		private final long ioDeadline = started + TimeUnit.MILLISECONDS.toNanos(bounds.ioMillis());
		private final List<SelectableChannel> channels = new ArrayList<>();
		private final List<Destination> destinations = new ArrayList<>();
		private final List<Integer> statuses = new ArrayList<>();
		private final AtomicInteger headers = new AtomicInteger(), writes = new AtomicInteger();
		private boolean cancelled;
		private boolean released;
		private int attempts;
		public long elapsedMillis() { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started); }
		public void requireCompleted() throws FirebaseProviderFailure {
			if (System.nanoTime() - started > TimeUnit.MILLISECONDS.toNanos(bounds.operationMillis()))
				throw new FirebaseProviderFailure(FirebaseProviderFailure.Kind.AVAILABILITY);
		}
		public int attempts() { return attempts; }
		public int requestsWithHeaders() { return headers.get(); }
		public int completedWrites() { return writes.get(); }
		public List<Integer> statuses() { return List.copyOf(statuses); }
		long remainingIo() throws SocketTimeoutException { check(); return Math.max(1, ioDeadline - System.nanoTime()); }
		synchronized void check() throws SocketTimeoutException {
			if (cancelled || System.nanoTime() >= ioDeadline) throw new SocketTimeoutException("Provider I/O allocation expired");
		}
		synchronized void attempt() throws IOException { check(); if (++attempts > FirebaseProviderBounds.MAX_HTTP_REQUESTS) throw new IOException("Provider HTTP attempt limit"); }
		public synchronized SelectableChannel track(SelectableChannel channel) throws IOException {
			try { check(); channels.add(channel); return channel; }
			catch (IOException failure) { channel.close(); throw failure; }
		}
		public synchronized int openChannels() { return (int) channels.stream().filter(SelectableChannel::isOpen).count(); }
		synchronized void cancel() {
			cancelled = true;
			for (SelectableChannel channel : channels) try { channel.close(); } catch (IOException ignored) { /* Actual socket cancellation. */ }
		}
		@Override public void close() {
			synchronized (this) { if (released) return; released = true; }
			cancel();
			RuntimeException cleanupFailure = null;
			try {
				for (Destination destination : destinations) {
					try { LifeCycle.stop(destination); }
					catch (RuntimeException failure) { if (cleanupFailure == null) cleanupFailure = failure; else cleanupFailure.addSuppressed(failure); }
					finally { client.removeDestination(destination); }
				}
			} finally { if (current.get() == this) current.remove(); }
			if (cleanupFailure != null) throw cleanupFailure;
		}
	}
	private static final class BufferedResponse extends LowLevelHttpResponse {
		private final int status;
		private final byte[] bytes;
		private final String contentType;
		private final List<String> names = new ArrayList<>(), values = new ArrayList<>();
		private final InputStream content;
		BufferedResponse(ContentResponse response) {
			status = response.getStatus(); bytes = response.getContent(); contentType = response.getHeaders().get("Content-Type");
			response.getHeaders().forEach(field -> { names.add(field.getName()); values.add(field.getValue()); });
			content = new ByteArrayInputStream(bytes);
		}
		@Override public InputStream getContent() { return content; }
		@Override public String getContentEncoding() { return null; }
		@Override public long getContentLength() { return bytes.length; }
		@Override public String getContentType() { return contentType; }
		@Override public String getStatusLine() { return "HTTP/1.1 " + status; }
		@Override public int getStatusCode() { return status; }
		@Override public String getReasonPhrase() { return ""; }
		@Override public int getHeaderCount() { return names.size(); }
		@Override public String getHeaderName(int index) { return names.get(index); }
		@Override public String getHeaderValue(int index) { return values.get(index); }
		@Override public void disconnect() throws IOException { content.close(); }
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
	@Override public void close() throws Exception { if (client != null) client.stop(); }
}
