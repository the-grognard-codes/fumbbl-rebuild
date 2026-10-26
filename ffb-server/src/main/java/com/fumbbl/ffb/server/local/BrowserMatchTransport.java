package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;

import com.eclipsesource.json.JsonObject;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded browser traffic; forecasts yield to an ordered foreground/control lane on the native worker. */
public class BrowserMatchTransport {
	static final int MAX_CONNECTIONS = 16;
	static final int MAX_INGRESS_WORK = 128;
	static final int MAX_ADVISORY_WORK = MAX_INGRESS_WORK - MAX_CONNECTIONS;
	static final int MAX_FOREGROUND_BURST = 8;
	// A Solid Defence state includes destinations for every selected player.
	// Keep each connection bounded while admitting the match clients' largest response family.
	static final int MAX_OUTBOUND_BYTES = 2 * 1024 * 1024;
	static final int MAX_LIVE_TRANSCRIPT_BYTES = 256 * 1024;
	static final int MAX_OUTBOUND_MESSAGES = 64;
	static final long OUTBOUND_WRITE_TIMEOUT_MS = 2000;
	private final BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
	private final BrowserRequestTiming timing;
	private final Semaphore connections = new Semaphore(MAX_CONNECTIONS);
	private final Semaphore ingress = new Semaphore(MAX_INGRESS_WORK);
	private final Semaphore advisoryIngress = new Semaphore(MAX_ADVISORY_WORK);
	private final Object queueLock = new Object();
	private final Deque<QueuedWork> foregroundWork = new ArrayDeque<>();
	private final Deque<QueuedWork> advisoryWork = new ArrayDeque<>();
	private int foregroundBurst;
	private final Set<BrowserMatchSocket> sockets = Collections.newSetFromMap(new ConcurrentHashMap<BrowserMatchSocket, Boolean>());
	private final FantasyFootballServer server;
	private final AtomicBoolean stopped = new AtomicBoolean();
	private final AtomicBoolean deadlineCheckQueued = new AtomicBoolean();
	private final ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor(work -> {
		Thread thread = new Thread(work, "browser-match-write-watchdog");
		thread.setDaemon(true);
		return thread;
	});

	public BrowserMatchTransport(FantasyFootballServer server) {
		this(server, new BrowserRequestTiming());
	}

	BrowserMatchTransport(FantasyFootballServer server, BrowserRequestTiming timing) {
		this.server = server;
		this.timing = timing;
		metrics.activeConnectionSupplier(() -> MAX_CONNECTIONS - connections.availablePermits());
		watchdog.scheduleWithFixedDelay(() -> {
			long now = TimeUnit.NANOSECONDS.toMillis(System.nanoTime());
			for (BrowserMatchSocket socket : sockets) socket.expireDelivery(now);
		}, 100, 100, TimeUnit.MILLISECONDS);
	}

	public boolean admitConnection() {
		boolean admitted = !stopped.get() && connections.tryAcquire();
		if (!admitted) metrics.admissionRejected();
		return admitted;
	}

	/** Wall-clock scheduling only; native decisions and publication stay on the engine worker. */
	void startDecisionChecks(BrowserProtocol adapter) {
		watchdog.scheduleWithFixedDelay(() -> queueDecisionCheck(adapter), 1, 1, TimeUnit.SECONDS);
	}

	void queueDecisionCheck(BrowserProtocol adapter) {
		if (stopped.get() || !deadlineCheckQueued.compareAndSet(false, true)) return;
		try {
			boolean queued = submitControl(() -> {
				try { if (!stopped.get()) adapter.expireDecisions(); }
				finally { deadlineCheckQueued.set(false); }
			}, () -> deadlineCheckQueued.set(false));
			if (!queued) deadlineCheckQueued.set(false);
		} catch (RuntimeException unavailable) {
			deadlineCheckQueued.set(false); // A transient enqueue failure must not cancel future deadline checks.
		}
	}

	synchronized boolean connected(BrowserMatchSocket socket) {
		if (stopped.get()) {
			releaseConnection();
			return false;
		}
		sockets.add(socket);
		metrics.activeConnections(MAX_CONNECTIONS - connections.availablePermits());
		return true;
	}
	void disconnect(BrowserMatchSocket socket, Runnable cleanup) {
		if (!sockets.remove(socket)) return;
		Runnable release = () -> {
			try {
				cleanup.run();
			} finally {
				releaseConnection();
			}
		};
		submitControl(release, release);
	}

	void disconnectFromEngineWorker(BrowserMatchSocket socket, Runnable cleanup) {
		if (!sockets.remove(socket)) return;
		try {
			cleanup.run();
		} finally {
			releaseConnection();
		}
	}

	private void releaseConnection() {
		connections.release();
		metrics.activeConnections(MAX_CONNECTIONS - connections.availablePermits());
	}

	public boolean submit(Runnable work, Runnable rejected) {
		return submit(work, rejected, false, true);
	}

	boolean submit(String message, Runnable work, Runnable rejected) {
		return submit(work, rejected, advisory(message), true);
	}

	/** Trusted, coalesced operator/deadline/disconnect work shares ordering, not browser admission. */
	boolean submitControl(Runnable work, Runnable rejected) {
		return submit(work, rejected, false, false);
	}

	private boolean submit(Runnable work, Runnable rejected, boolean advisory, boolean trackedIngress) {
		if (stopped.get() || trackedIngress && !ingress.tryAcquire()) {
			if (trackedIngress) metrics.ingressOverload();
			rejected.run();
			return false;
		}
		if (advisory && !advisoryIngress.tryAcquire()) {
			ingress.release();
			metrics.ingressOverload();
			rejected.run();
			return false;
		}
		QueuedWork pending = new QueuedWork(work, advisory, trackedIngress, trackedIngress ? timing.queued() : null);
		boolean queued;
		synchronized (queueLock) {
			Deque<QueuedWork> lane = advisory ? advisoryWork : foregroundWork;
			lane.addLast(pending);
			metrics.ingressQueueDepth(MAX_INGRESS_WORK - ingress.availablePermits());
			try {
				// Each admitted request retains one native-queue marker. Its lane is
				// chosen only when that marker reaches the single engine worker.
				queued = server.getCommunication().execute(this::runQueued);
			} catch (RuntimeException unavailable) {
				if (trackedIngress) metrics.ingressOverload();
				queued = false;
			}
			if (!queued && !lane.remove(pending)) return true; // An inline executor already handled it.
		}
		if (!queued) {
			release(pending);
			rejected.run();
		}
		return queued;
	}

	private void runQueued() {
		QueuedWork pending;
		synchronized (queueLock) {
			if (!advisoryWork.isEmpty() && (foregroundWork.isEmpty() || foregroundBurst >= MAX_FOREGROUND_BURST)) {
				pending = advisoryWork.removeFirst();
				foregroundBurst = 0;
			} else {
				pending = foregroundWork.pollFirst();
				foregroundBurst = advisoryWork.isEmpty() ? 0 : foregroundBurst + 1;
			}
		}
		if (pending == null) return;
		if (pending.trackedIngress) metrics.ingressDelay(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()) - pending.submittedAt);
		try (BrowserRequestTiming.Scope ignored = timing.handling(pending.timing)) {
			pending.work.run();
		} finally {
			release(pending);
		}
	}

	private void release(QueuedWork pending) {
		if (!pending.trackedIngress) return;
		if (pending.advisory) advisoryIngress.release();
		ingress.release();
		metrics.ingressQueueDepth(MAX_INGRESS_WORK - ingress.availablePermits());
	}

	/** Scheduling hint only; the adapter still validates and authorizes the original body. */
	private boolean advisory(String message) {
		if (message == null || message.length() > 16 * 1024) return false;
		try {
			JsonObject request = JsonObject.readFrom(message);
			int version = request.getInt("version", -1);
			if (version != 1 && version != 2) return false;
			String type = request.getString("type", "");
			return "movementRange".equals(type) || "movementPreview".equals(type) || "routePreview".equals(type);
		} catch (RuntimeException malformed) {
			return false;
		}
	}

	private static class QueuedWork {
		private final Runnable work;
		private final boolean advisory;
		private final boolean trackedIngress;
		private final BrowserRequestTiming.Request timing;
		private final long submittedAt = TimeUnit.NANOSECONDS.toMillis(System.nanoTime());
		private QueuedWork(Runnable work, boolean advisory, boolean trackedIngress, BrowserRequestTiming.Request timing) {
			this.work = work;
			this.advisory = advisory;
			this.trackedIngress = trackedIngress;
			this.timing = timing;
		}
	}

	/** Safe from the communication worker: it does not wait for Jetty I/O. */
	public void closeConnections() {
		for (BrowserMatchSocket socket : sockets) socket.closeFromEngineWorker();
	}

	public BrowserMatchTransportMetrics getMetrics() { return metrics; }

	public void destroy() {
		BrowserMatchSocket[] remaining;
		synchronized (this) {
			if (!stopped.compareAndSet(false, true)) return;
			remaining = sockets.toArray(new BrowserMatchSocket[0]);
		}
		for (BrowserMatchSocket socket : remaining) socket.closeFromEngineWorker();
		watchdog.shutdownNow();
	}
}
