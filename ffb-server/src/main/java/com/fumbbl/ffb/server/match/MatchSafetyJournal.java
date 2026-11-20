package com.fumbbl.ffb.server.match;

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
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
	private static final int MAX_STATE_BYTES = 64 * 1024;
	private final Clock clock;
	private final StateStore store;
	private final String runId = UUID.randomUUID().toString();
	private final long startedAt;
	private final String dumpFile;
	private final Map<String, Long> automaticBlocks = new HashMap<>();
	private final AtomicReference<State> pending = new AtomicReference<>();
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
			if (previous != null) previous.quarantines().forEach((id, until) -> {
				if (until > startedAt) automaticBlocks.put(id, until);
			});
			if (previous != null && !previous.dumpFile().isEmpty()) {
				Path dump = Path.of(previous.dumpFile());
				if (Files.isRegularFile(dump) && Files.size(dump) > 0
					&& Files.getLastModifiedTime(dump).toMillis() >= previous.startedAt())
					previous.matches().forEach(id -> automaticBlocks.put(id, startedAt + QUARANTINE_MILLIS));
			}
		} catch (IOException | RuntimeException failure) { degrade(); }
		writer = new Thread(this::writeUpdates, "match-safety-store"); writer.setDaemon(true); writer.start();
		submit(Set.of());
	}

	/** The supplier is invoked only by the engine worker, never by the maintenance thread. */
	public void configureResidentMatches(Supplier<Set<String>> source) { residentMatches = source; }

	/**
	 * One transport boundary covers ingress, restore, publication and multi-match control work.
	 * Enqueues an immutable advisory snapshot and returns without waiting for persistence.
	 */
	public void beginTask(String matchId) {
		if (writer == null || closed || unavailable) return;
		Set<String> ids = matchId == null ? residentMatches.get() : Set.of(matchId);
		Set<String> safe = new HashSet<>();
		for (String id : ids) if (id != null && MATCH_ID.matcher(id).matches() && safe.size() < MAX_TRACKED_MATCHES) safe.add(id);
		submit(Set.copyOf(safe));
	}

	/** Only handled task exits clear the current operation; fatal Errors leave OOM attribution intact. */
	public void finishWork() { if (writer != null && !closed && !unavailable) submit(Set.of()); }

	/**
	 * All automatic recovery entry points are delayed until the persisted absolute expiry.
	 * @throws MatchService.Failure with MATCH_QUARANTINED for an OOM-suspect automatic reload.
	 */
	public void requireAutomaticAvailable(String matchId) {
		if (quarantineUntil(matchId) > 0) throw new MatchService.Failure(MatchStopReason.MATCH_QUARANTINED.name());
	}

	long quarantineUntil(String matchId) {
		long expiry = automaticBlocks.getOrDefault(matchId, 0L);
		return expiry > clock.millis() ? expiry : 0;
	}

	private void submit(Set<String> ids) {
		State snapshot = new State(runId, startedAt, dumpFile, ++sequence, ids, Map.copyOf(automaticBlocks));
		if (pending.getAndSet(snapshot) == null) wake.release();
	}

	private void writeUpdates() {
		try {
			while (!closed || pending.get() != null) {
				wake.acquire();
				State snapshot;
				while ((snapshot = pending.getAndSet(null)) != null) {
					try { if (!unavailable) store.write(snapshot); }
					catch (IOException | RuntimeException failure) { degrade(); }
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

	record State(String runId, long startedAt, String dumpFile, long sequence, Set<String> matches, Map<String, Long> quarantines) { }
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
			if (Files.size(file) > MAX_STATE_BYTES) throw new IOException("OOM tracking file exceeds startup bound");
			try {
				JsonObject object = JsonObject.readFrom(Files.readString(file));
				int version = object.getInt("version", 0);
				if (version != 1 && version != 2) throw new IllegalArgumentException();
				Set<String> ids = new HashSet<>();
				for (var id : object.get("matches").asArray()) {
					if (!MATCH_ID.matcher(id.asString()).matches() || ids.size() >= MAX_TRACKED_MATCHES) throw new IllegalArgumentException();
					ids.add(id.asString());
				}
				Map<String, Long> quarantines = new HashMap<>();
				if (version == 2) for (JsonObject.Member entry : object.get("quarantines").asObject()) {
					if (!MATCH_ID.matcher(entry.getName()).matches() || entry.getValue().asLong() < 0)
						throw new IllegalArgumentException();
					quarantines.put(entry.getName(), entry.getValue().asLong());
				}
				return new State(object.getString("run", ""), object.getLong("startedAt", 0), object.getString("dump", ""), object.getLong("sequence", 0), Set.copyOf(ids), Map.copyOf(quarantines));
			} catch (RuntimeException invalid) { throw new IOException("Invalid OOM tracking state", invalid); }
		}
		@Override public void write(State state) throws IOException {
			acquireLease();
			JsonArray ids = new JsonArray(); state.matches().stream().sorted().forEach(ids::add);
			JsonObject quarantines = new JsonObject();
			state.quarantines().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> quarantines.add(entry.getKey(), entry.getValue()));
			JsonObject object = new JsonObject().add("version", 2).add("run", state.runId()).add("startedAt", state.startedAt())
				.add("dump", state.dumpFile()).add("sequence", state.sequence()).add("matches", ids).add("quarantines", quarantines);
			Path next = file.resolveSibling(file.getFileName() + ".next");
			String json = object.toString();
			if (new Utf8Size().bytes(json) > MAX_STATE_BYTES) throw new IOException("OOM tracking state exceeds startup bound");
			Files.writeString(next, json);
			Files.move(next, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
		}
		@Override public void close() throws IOException {
			try { if (lock != null && lock.isValid()) lock.release(); } finally { if (lease != null) lease.close(); }
		}
	}
}
