package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import com.sun.management.HotSpotDiagnosticMXBean;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/** Advisory OOM restart tracking. File I/O belongs exclusively to the maintenance thread. */
public final class MatchSafetyJournal implements AutoCloseable {
	public enum Tracking { DISABLED }
	private static final Logger LOG = Logger.getLogger("com.fumbbl.ffb.server.match.safety");
	private static final Pattern MATCH_ID = Pattern.compile("[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}");
	private static final long QUARANTINE_MILLIS = TimeUnit.MINUTES.toMillis(30);
	private static final int MAX_TRACKED_MATCHES = 33;
	private final Clock clock;
	private final StateStore store;
	private final String runId = UUID.randomUUID().toString();
	private final long startedAt;
	private final String dumpFile;
	private final Set<String> automaticBlocks = new HashSet<>();
	private final AtomicReference<Update> pending = new AtomicReference<>();
	private final Semaphore wake = new Semaphore(0);
	private final Thread writer;
	private Supplier<Set<String>> residentMatches = Set::of;
	private volatile boolean closed;
	private volatile boolean unavailable;
	private long sequence;

	/** Explicit nonpersistent tracking for embedded engines and tests. */
	public MatchSafetyJournal(Tracking disabled) {
		clock = Clock.systemUTC(); startedAt = clock.millis(); dumpFile = ""; store = null; writer = null;
	}

	/** Starts outside the engine worker. Tracking-storage failures are logged and fail open. */
	public MatchSafetyJournal(Path file) { this(new FileStore(file), configuredDump(), Clock.systemUTC()); }

	MatchSafetyJournal(Path file, Path dumpFile, Clock clock) { this(new FileStore(file), dumpFile, clock); }

	MatchSafetyJournal(StateStore store, Path dumpFile, Clock clock) {
		this.clock = clock; startedAt = clock.millis(); this.store = store;
		this.dumpFile = dumpFile == null ? "" : dumpFile.toAbsolutePath().toString();
		try {
			State previous = store.read();
			if (previous != null && !previous.dumpFile().isEmpty()) {
				Path dump = Path.of(previous.dumpFile());
				if (Files.isRegularFile(dump) && Files.size(dump) > 0
					&& Files.getLastModifiedTime(dump).toMillis() >= previous.startedAt())
					automaticBlocks.addAll(previous.matches());
			}
		} catch (IOException | RuntimeException failure) { degrade(); }
		writer = new Thread(this::writeUpdates, "match-safety-store"); writer.setDaemon(true); writer.start();
		submit(Set.of());
	}

	/** The supplier is invoked only by the engine worker, never by the maintenance thread. */
	public void configureResidentMatches(Supplier<Set<String>> source) { residentMatches = source; }

	/**
	 * One transport boundary covers ingress, restore, publication and multi-match control work.
	 * Waits at most 25 ms for persistence; a failed/late handoff never rejects gameplay.
	 */
	public void beginTask(String matchId) {
		if (writer == null || closed || unavailable) return;
		Set<String> ids = matchId == null ? residentMatches.get() : Set.of(matchId);
		Set<String> safe = new HashSet<>();
		for (String id : ids) if (id != null && MATCH_ID.matcher(id).matches() && safe.size() < MAX_TRACKED_MATCHES) safe.add(id);
		Update update = submit(Set.copyOf(safe));
		var budget = new BrowserRequestTiming().budget();
		long allowance = budget == null ? 25 : budget.allowanceMillis(25, 0);
		try { if (allowance > 0) update.persisted().await(allowance, TimeUnit.MILLISECONDS); }
		catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
	}

	/** Only handled task exits clear the current operation; fatal Errors leave OOM attribution intact. */
	public void finishWork() { if (writer != null && !closed && !unavailable) submit(Set.of()); }

	/**
	 * Only automatic computer reloads are delayed, for this startup and at most thirty minutes.
	 * @throws MatchService.Failure with MATCH_QUARANTINED for an OOM-suspect automatic reload.
	 */
	public void requireAutomaticAvailable(String matchId) {
		if (clock.millis() - startedAt < QUARANTINE_MILLIS && automaticBlocks.contains(matchId))
			throw new MatchService.Failure(MatchStopReason.MATCH_QUARANTINED.name());
	}

	private Update submit(Set<String> ids) {
		Update update = new Update(new State(runId, startedAt, dumpFile, ++sequence, ids), new CountDownLatch(1));
		if (pending.getAndSet(update) == null) wake.release();
		return update;
	}

	private void writeUpdates() {
		try {
			while (!closed || pending.get() != null) {
				wake.acquire();
				Update update;
				while ((update = pending.getAndSet(null)) != null) {
					try { if (!unavailable) store.write(update.state()); }
					catch (IOException | RuntimeException failure) { degrade(); }
					finally { update.persisted().countDown(); }
				}
			}
		} catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
		finally { try { store.close(); } catch (IOException failure) { degrade(); } }
	}

	private void degrade() {
		if (!unavailable) LOG.warning("MATCH_SAFETY_TRACKING_UNAVAILABLE: continuing with strict memory admission");
		unavailable = true;
	}

	private static Path configuredDump() {
		try {
			HotSpotDiagnosticMXBean options = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
			if (!Boolean.parseBoolean(options.getVMOption("HeapDumpOnOutOfMemoryError").getValue())) return null;
			String value = options.getVMOption("HeapDumpPath").getValue();
			return value.isEmpty() ? null : Path.of(value);
		} catch (RuntimeException unsupported) { return null; }
	}

	/** Bounded shutdown; a stalled store remains isolated on its daemon and keeps its file lease. */
	@Override public void close() {
		closed = true; wake.release();
		if (writer != null) try { writer.join(100); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
	}

	record State(String runId, long startedAt, String dumpFile, long sequence, Set<String> matches) { }
	private record Update(State state, CountDownLatch persisted) { }
	interface StateStore extends AutoCloseable {
		State read() throws IOException;
		void write(State state) throws IOException;
		@Override default void close() throws IOException { }
	}

	/** Startup/admin reads occur off-worker; all runtime writes are owned by the maintenance thread. */
	static final class FileStore implements StateStore {
		private final Path file;
		private FileChannel lease;
		private FileLock lock;
		FileStore(Path file) { this.file = file; }
		private void acquireLease() throws IOException {
			if (lease != null) return;
			lease = FileChannel.open(file.resolveSibling(file.getFileName() + ".lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
			try { lock = lease.tryLock(); } catch (OverlappingFileLockException busy) { throw new IOException("Stop the server before clearing OOM tracking", busy); }
			if (lock == null) throw new IOException("Stop the server before clearing OOM tracking");
		}
		@Override public State read() throws IOException {
			acquireLease();
			if (!Files.exists(file)) return null;
			if (Files.size(file) > 64 * 1024) throw new IOException("OOM tracking file exceeds startup bound");
			try {
				JsonObject object = JsonObject.readFrom(Files.readString(file));
				if (object.getInt("version", 0) != 1) throw new IllegalArgumentException();
				Set<String> ids = new HashSet<>();
				for (var id : object.get("matches").asArray()) {
					if (!MATCH_ID.matcher(id.asString()).matches() || ids.size() >= MAX_TRACKED_MATCHES) throw new IllegalArgumentException();
					ids.add(id.asString());
				}
				return new State(object.getString("run", ""), object.getLong("startedAt", 0), object.getString("dump", ""), object.getLong("sequence", 0), Set.copyOf(ids));
			} catch (RuntimeException invalid) { throw new IOException("Invalid OOM tracking state", invalid); }
		}
		@Override public void write(State state) throws IOException {
			acquireLease();
			JsonArray ids = new JsonArray(); state.matches().stream().sorted().forEach(ids::add);
			JsonObject object = new JsonObject().add("version", 1).add("run", state.runId()).add("startedAt", state.startedAt())
				.add("dump", state.dumpFile()).add("sequence", state.sequence()).add("matches", ids);
			Path next = file.resolveSibling(file.getFileName() + ".next");
			Files.writeString(next, object.toString());
			Files.move(next, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
		}
		@Override public void close() throws IOException {
			try { if (lock != null && lock.isValid()) lock.release(); } finally { if (lease != null) lease.close(); }
		}
	}
}
