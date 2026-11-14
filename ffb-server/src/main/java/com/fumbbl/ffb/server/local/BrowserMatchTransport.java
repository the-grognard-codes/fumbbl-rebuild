package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

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
	private static final Pattern MATCH_ID = Pattern.compile("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}", Pattern.CASE_INSENSITIVE);
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
	private final AtomicBoolean publicationRetryQueued = new AtomicBoolean();
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
		watchdog.scheduleWithFixedDelay(() -> queuePublicationRetry(adapter), 1, 1, TimeUnit.SECONDS);
	}

	void queuePublicationRetry(BrowserProtocol adapter) {
		if (stopped.get() || !adapter.hasPendingPublications() || !publicationRetryQueued.compareAndSet(false, true)) return;
		try {
			boolean queued = submitControl(BrowserRequestTiming.TaskKind.CONTROL, () -> {
				try { if (!stopped.get()) adapter.retryPublications(); }
				finally { publicationRetryQueued.set(false); }
			}, () -> publicationRetryQueued.set(false));
			if (!queued) publicationRetryQueued.set(false);
		} catch (RuntimeException unavailable) { publicationRetryQueued.set(false); }
	}

	void queueDecisionCheck(BrowserProtocol adapter) {
		if (stopped.get() || !deadlineCheckQueued.compareAndSet(false, true)) return;
		try {
			boolean queued = submitControl(BrowserRequestTiming.TaskKind.DECISION_EXPIRY, () -> {
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
		submitControl(BrowserRequestTiming.TaskKind.DISCONNECT, release, release);
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
		return submit(work, rejected, null, true, BrowserRequestTiming.TaskKind.INGRESS);
	}

	boolean submit(String message, Runnable work, Runnable rejected) {
		return submit(work, rejected, requestWork(message), true, BrowserRequestTiming.TaskKind.INGRESS);
	}

	/** Trusted, coalesced operator/deadline/disconnect work shares ordering, not browser admission. */
	boolean submitControl(Runnable work, Runnable rejected) {
		return submitControl(BrowserRequestTiming.TaskKind.CONTROL, work, rejected);
	}

	private boolean submitControl(BrowserRequestTiming.TaskKind kind, Runnable work, Runnable rejected) {
		return submit(work, rejected, null, false, kind);
	}

	private boolean submit(Runnable work, Runnable rejected, RequestWork request, boolean trackedIngress,
		BrowserRequestTiming.TaskKind kind) {
		boolean advisory = request != null && request.advisory();
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
		QueuedWork pending = new QueuedWork(work, request, kind, advisory, trackedIngress, timing.queued(kind));
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
		RequestWork request = pending.request;
		server.getCommunication().describeWork(request == null ? pending.kind.name() : request.type(),
			request == null ? null : request.matchId());
		if (pending.trackedIngress) metrics.ingressDelay(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()) - pending.submittedAt);
		try (BrowserRequestTiming.Scope ignored = timing.handling(pending.timing, metrics::taskFinished)) {
			try { pending.work.run(); }
			finally { release(pending); }
		}
	}

	private void release(QueuedWork pending) {
		if (!pending.trackedIngress) return;
		if (pending.advisory) advisoryIngress.release();
		ingress.release();
		metrics.ingressQueueDepth(MAX_INGRESS_WORK - ingress.availablePermits());
	}

	/** Scheduling and fatal log context only; the adapter still validates and authorizes the body. */
	private RequestWork requestWork(String message) {
		if (message == null || message.length() > 16 * 1024) return null;
		try {
			JsonObject request = JsonObject.readFrom(message);
			if (request.getInt("version", -1) != 2) return null;
			BrowserV2RequestType type = BrowserV2RequestType.fromWireName(request.getString("type", ""));
			boolean advisory = switch (type) {
				case BROWSE, CURRENT_MATCHES, MOVEMENT_RANGE, MOVEMENT_PREVIEW, ROUTE_PREVIEW -> true;
				case DIAGNOSTICS -> "probe".equals(request.getString("operation", ""));
				default -> false;
			};
			JsonValue id = request.get("matchId");
			String matchId = id != null && id.isString() ? id.asString() : null;
			if (matchId != null) matchId = MATCH_ID.matcher(matchId).matches() ? matchId.toLowerCase(Locale.ROOT) : null;
			return new RequestWork(type.logName(), matchId, advisory);
		} catch (RuntimeException malformed) { return null; }
	}

	private record RequestWork(String type, String matchId, boolean advisory) { }

	private static class QueuedWork {
		private final Runnable work;
		private final RequestWork request;
		private final BrowserRequestTiming.TaskKind kind;
		private final boolean advisory;
		private final boolean trackedIngress;
		private final BrowserRequestTiming.Request timing;
		private final long submittedAt = TimeUnit.NANOSECONDS.toMillis(System.nanoTime());
		private QueuedWork(Runnable work, RequestWork request, BrowserRequestTiming.TaskKind kind,
			boolean advisory, boolean trackedIngress, BrowserRequestTiming.Request timing) {
			this.work = work;
			this.request = request;
			this.kind = kind;
			this.advisory = advisory;
			this.trackedIngress = trackedIngress;
			this.timing = timing;
		}
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
