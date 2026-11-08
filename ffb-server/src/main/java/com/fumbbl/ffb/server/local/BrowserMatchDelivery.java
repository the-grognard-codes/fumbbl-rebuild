package com.fumbbl.ffb.server.local;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.ArrayList;
import java.util.List;
import java.util.function.LongSupplier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded, ordered asynchronous delivery for one browser connection. */
public class BrowserMatchDelivery {
	static final int TRACE_BYTES = 8192;
	public interface WriteObserver {
		void completed(String status, long queueMillis, long writeMillis, int bytes);
		default void admitted(int optionalBytes, boolean optionalDropped) { }
	}
	private static void observe(QueuedMessage message, String status, long queueMillis, long writeMillis) {
		if (message != null && message.observer != null) try { message.observer.completed(status, queueMillis, writeMillis, message.bytes); }
		catch (RuntimeException ignored) { /* Instrumentation cannot interfere with transport. */ }
	}
	public interface Completion {
		void failed(Throwable failure);
		void succeeded();
	}

	public interface Sink {
		boolean isOpen();
		void close(int statusCode, String reason);
		void send(String message, Completion completion);
	}

	private static final int CLOSE_SLOW_CONSUMER = 1013;
	private final int maximumBytes;
	private final int maximumMessages;
	private final BrowserMatchTransportMetrics metrics;
	private final Sink sink;
	private final LongSupplier clock;
	private final Deque<QueuedMessage> messages = new ArrayDeque<>();
	private int bytes;
	private boolean writing;
	private boolean closed;
	private long writeStartedAt;
	private QueuedMessage queuedTiming;

	public BrowserMatchDelivery(Sink sink, BrowserMatchTransportMetrics metrics, int maximumMessages, int maximumBytes) {
		this(sink, metrics, maximumMessages, maximumBytes, () -> TimeUnit.NANOSECONDS.toMillis(System.nanoTime()));
	}

	BrowserMatchDelivery(Sink sink, BrowserMatchTransportMetrics metrics, int maximumMessages, int maximumBytes, LongSupplier clock) {
		this.sink = sink;
		this.metrics = metrics;
		this.maximumMessages = maximumMessages;
		this.maximumBytes = maximumBytes;
		this.clock = clock;
	}

	public boolean send(String message) {
		return sendWithOptionalPredecessor(null, message);
	}

	/** Best effort telemetry: admit only behind the current write, leaving the rest of the queue for gameplay. */
	boolean sendOptional(String message) {
		return sendOptional(message, 2048, false);
	}
	boolean sendTrace(String message) { return sendOptional(message, TRACE_BYTES, true); }
	private boolean sendOptional(String message, int budget, boolean trace) {
		String next = null;
		synchronized (this) {
			// Once basic timing is in flight, allow one queued detail behind it. Neither can
			// displace queued basic timing; the queued optional frame still yields to gameplay.
			boolean followingBasic = trace && writing && queuedTiming != null
				&& messages.peekFirst() == queuedTiming && !queuedTiming.trace;
			if (closed || queuedTiming != null && !followingBasic || messages.size() > 1 || !sink.isOpen()) return false;
			int messageBytes = message.getBytes(StandardCharsets.UTF_8).length;
			if (messageBytes > Math.min(budget, maximumBytes - bytes) || messages.size() + 2 > maximumMessages) return false;
			queuedTiming = new QueuedMessage(message, messageBytes, clock.getAsLong(), null, trace);
			messages.addLast(queuedTiming);
			bytes += messageBytes;
			metrics.deliveryQueued(messageBytes);
			if (!writing) {
				writing = true;
				writeStartedAt = clock.getAsLong();
				metrics.deliveryQueueDelay(0);
				next = message;
			}
		}
		if (next != null) write(next);
		return true;
	}

	/** Optional history is admitted only when the following mandatory state also fits the bounded queue. */
	public boolean sendWithOptionalPredecessor(String optional, String mandatory) {
		return sendWithOptionalPredecessor(optional, mandatory, null);
	}
	boolean sendWithOptionalPredecessor(String optional, String mandatory, WriteObserver observer) {
		String next = null;
		boolean close = false;
		boolean accepted = false;
		int admittedOptionalBytes = 0;
		List<QueuedMessage> discarded = List.of();
		synchronized (this) {
			// Queued optional timing yields immediately to the next mandatory response.
			if (queuedTiming != null && !(writing && messages.peekFirst() == queuedTiming)) {
				messages.remove(queuedTiming);
				bytes -= queuedTiming.bytes;
				metrics.deliveryCleared(1, queuedTiming.bytes);
				queuedTiming = null;
			}
			int messageBytes = mandatory.getBytes(StandardCharsets.UTF_8).length;
			if (closed || !sink.isOpen()) { /* Reject outside the lock below. */ }
			else if (messages.size() >= maximumMessages || messageBytes > maximumBytes - bytes) {
				closed = true;
				writing = false;
				metrics.outboundOverload();
				metrics.slowDisconnect();
				metrics.deliveryCleared(messages.size(), bytes);
				discarded = new ArrayList<>(messages); messages.clear();
				queuedTiming = null;
				bytes = 0;
				close = true;
			} else {
				if (optional != null && messages.size() + 2 <= maximumMessages) {
					int optionalBytes = optional.getBytes(StandardCharsets.UTF_8).length;
					if (optionalBytes <= maximumBytes - bytes - messageBytes) {
						admittedOptionalBytes = optionalBytes;
						messages.addLast(new QueuedMessage(optional, optionalBytes, clock.getAsLong()));
						bytes += optionalBytes;
						metrics.deliveryQueued(optionalBytes);
					}
				}
				messages.addLast(new QueuedMessage(mandatory, messageBytes, clock.getAsLong(), observer));
				accepted = true;
				bytes += messageBytes;
				metrics.deliveryQueued(messageBytes);
				if (!writing) {
					writing = true;
					next = messages.peekFirst().text;
					writeStartedAt = clock.getAsLong();
					metrics.deliveryQueueDelay(0);
				}
			}
		}
		for (QueuedMessage message : discarded) observe(message, "closed", -1, -1);
		if (accepted && observer != null) try { observer.admitted(admittedOptionalBytes, optional != null && admittedOptionalBytes == 0); } catch (RuntimeException ignored) { }
		if (!accepted && observer != null) try { observer.completed("rejected", -1, -1, -1); } catch (RuntimeException ignored) { }
		if (close) {
			closeSlowConsumer();
			return false;
		}
		if (!accepted) return false;
		if (next != null) write(next);
		return true;
	}

	public void close() {
		List<QueuedMessage> discarded;
		synchronized (this) {
			discarded = new ArrayList<>(messages);
			closed = true;
			metrics.deliveryCleared(messages.size(), bytes);
			messages.clear();
			queuedTiming = null;
			bytes = 0;
			writing = false;
		}
		for (QueuedMessage message : discarded) observe(message, "closed", -1, -1);
	}

	boolean expireIfStalled(long now, long timeoutMillis) {
		boolean close = false;
		List<QueuedMessage> discarded = List.of();
		synchronized (this) {
			if (!closed && writing && now - writeStartedAt >= timeoutMillis) {
				discarded = new ArrayList<>(messages);
				closed = true;
				writing = false;
				metrics.deliveryCleared(messages.size(), bytes);
				messages.clear();
				queuedTiming = null;
				bytes = 0;
				metrics.slowDisconnect();
				close = true;
			}
		}
		for (int index = 0; index < discarded.size(); index++) observe(discarded.get(index), index == 0 ? "timeout" : "closed", -1, -1);
		if (close) closeSlowConsumer();
		return close;
	}

	private void write(String message) {
		Completion completion = new Completion() {
				private final AtomicBoolean completed = new AtomicBoolean();
				@Override
				public void failed(Throwable failure) { if (completed.compareAndSet(false, true)) complete(false); }
				@Override
				public void succeeded() { if (completed.compareAndSet(false, true)) complete(true); }
			};
		try {
			sink.send(message, completion);
		} catch (RuntimeException exception) {
			completion.failed(exception);
		}
	}

	private void complete(boolean succeeded) {
		String next = null;
		boolean close = false;
		QueuedMessage observed = null;
		long queueMillis = -1, writeMillis = -1;
		List<QueuedMessage> discarded = List.of();
		synchronized (this) {
			if (!writing) return;
			QueuedMessage completed = messages.pollFirst();
			observed = completed;
			if (completed != null && completed.observer != null) {
				queueMillis = Math.max(0, writeStartedAt - completed.queuedAt);
				writeMillis = Math.max(0, clock.getAsLong() - writeStartedAt);
			}
			if (completed == queuedTiming) queuedTiming = null;
			if (completed != null) {
				bytes -= completed.bytes;
				metrics.deliveryCompleted(completed.bytes);
			}
			writing = false;
			if (!succeeded || closed || !sink.isOpen()) {
				discarded = new ArrayList<>(messages);
				closed = true;
				metrics.deliveryCleared(messages.size(), bytes);
				messages.clear();
				queuedTiming = null;
				bytes = 0;
				metrics.slowDisconnect();
				close = true;
			} else if (!messages.isEmpty()) {
				writing = true;
				QueuedMessage queued = messages.peekFirst();
				next = queued.text;
				writeStartedAt = clock.getAsLong();
				metrics.deliveryQueueDelay(writeStartedAt - queued.queuedAt);
			}
		}
		observe(observed, succeeded ? "completed" : "failed", queueMillis, writeMillis);
		for (QueuedMessage message : discarded) observe(message, "closed", -1, -1);
		if (close) {
			closeSlowConsumer();
			return;
		}
		if (next != null) write(next);
	}

	private static class QueuedMessage {
		private final int bytes;
		private final long queuedAt;
		private final String text;
		private final WriteObserver observer;
		private final boolean trace;
		private QueuedMessage(String text, int bytes, long queuedAt) {
			this(text, bytes, queuedAt, null);
		}
		private QueuedMessage(String text, int bytes, long queuedAt, WriteObserver observer) {
			this(text, bytes, queuedAt, observer, false);
		}
		private QueuedMessage(String text, int bytes, long queuedAt, WriteObserver observer, boolean trace) {
			this.text = text;
			this.bytes = bytes;
			this.queuedAt = queuedAt;
			this.observer = observer;
			this.trace = trace;
		}
	}

	private void closeSlowConsumer() {
		try {
			sink.close(CLOSE_SLOW_CONSUMER, "Browser client cannot keep up; reconnect for a full snapshot");
		} catch (RuntimeException ignored) {
			// The session is already gone.
		}
	}
}
