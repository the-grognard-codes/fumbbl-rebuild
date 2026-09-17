package com.fumbbl.gameservice;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicBoolean;

/** Per-connection, bounded FIFO writer. A slow peer is closed rather than retaining game state. */
final class OutboundDelivery {
	interface Completion { void succeeded(); void failed(Throwable failure); }
	interface Sink { boolean open(); void close(int code, String reason); void write(String message, Completion completion); }
	private static final int MAX_MESSAGES = 32;
	private static final int MAX_BYTES = 128 * 1024;
	private final Sink sink;
	private final Deque<Entry> pending = new ArrayDeque<Entry>();
	private int bytes;
	private boolean writing;
	private boolean closed;
	OutboundDelivery(Sink sink) { this.sink = sink; }
	boolean send(String text) {
		String next = null; boolean overflow = false;
		synchronized (this) {
			int size = text.getBytes(StandardCharsets.UTF_8).length;
			if (closed || !sink.open()) return false;
			if (pending.size() >= MAX_MESSAGES || bytes + size > MAX_BYTES) { closed = true; pending.clear(); bytes = 0; writing = false; overflow = true; }
			else { pending.addLast(new Entry(text, size)); bytes += size; if (!writing) { writing = true; next = pending.peekFirst().text; } }
		}
		if (overflow) { sink.close(1013, "slow_consumer"); return false; }
		if (next != null) write(next); return true;
	}
	synchronized void close() { closed = true; pending.clear(); bytes = 0; writing = false; }
	private void write(String text) {
		Completion callback = new Completion() { private final AtomicBoolean once = new AtomicBoolean(); public void succeeded() { if (once.compareAndSet(false, true)) complete(true); } public void failed(Throwable failure) { if (once.compareAndSet(false, true)) complete(false); } };
		try { sink.write(text, callback); } catch (RuntimeException failure) { callback.failed(failure); }
	}
	private void complete(boolean success) {
		String next = null; boolean disconnect = false;
		synchronized (this) {
			if (!writing) return;
			Entry done = pending.pollFirst(); if (done != null) bytes -= done.bytes;
			writing = false;
			if (!success || closed || !sink.open()) { closed = true; pending.clear(); bytes = 0; disconnect = true; }
			else if (!pending.isEmpty()) { writing = true; next = pending.peekFirst().text; }
		}
		if (disconnect) sink.close(1013, "slow_consumer"); else if (next != null) write(next);
	}
	private static final class Entry { final String text; final int bytes; Entry(String text, int bytes) { this.text = text; this.bytes = bytes; } }
}
