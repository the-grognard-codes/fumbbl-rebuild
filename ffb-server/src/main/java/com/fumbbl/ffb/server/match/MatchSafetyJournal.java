package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.logging.Logger;

/** Worker-owned diagnostic append log. An unfinished operation is quarantined at next startup. */
public final class MatchSafetyJournal implements AutoCloseable {
	private static final Logger LOG = Logger.getLogger("com.fumbbl.ffb.server.match.safety");
	private static final long MAX_LOG_BYTES = 64 * 1024 * 1024;
	private static final int MAX_QUARANTINED = 1024;
	private final Map<String, String> quarantined = new LinkedHashMap<>();
	private final Set<String> active = new LinkedHashSet<>();
	private OutputStream output;
	private long bytes;
	private boolean failed;
	private boolean closed;
	private boolean compacting;
	private Path file;
	private ExecutorService maintenance;
	private final ReentrantLock logLock = new ReentrantLock();

	/** In-memory isolation for embedded runtimes and tests. Production opens a durable diagnostic log. */
	public MatchSafetyJournal() { }

	public MatchSafetyJournal(Path file) throws IOException {
		this.file = file;
		if (Files.exists(file)) {
			if (Files.size(file) > MAX_LOG_BYTES) throw new IOException("Match safety log exceeds startup bound");
			try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.US_ASCII)) {
				String line;
				while ((line = reader.readLine()) != null) {
					if (!line.matches("[BEQS] [0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"))
						throw new IOException("Invalid match safety log");
					String id = line.substring(2);
					switch (line.charAt(0)) {
						case 'B' -> active.add(id);
						case 'E' -> active.remove(id);
						case 'S' -> quarantined.put(id, "MATCH_SIZE_LIMIT");
						case 'Q' -> quarantined.put(id, "MATCH_QUARANTINED");
					}
					if (active.size() + quarantined.size() > MAX_QUARANTINED)
						throw new IOException("Match safety quarantine capacity reached");
				}
			}
		}
		for (String id : active) quarantined.putIfAbsent(id, "MATCH_QUARANTINED");
		active.clear();
		// Startup compaction only; worker operations only append short diagnostic records.
		// Replace atomically so a crash while compacting cannot forget prior quarantines.
		Path compact = file.resolveSibling(file.getFileName() + ".next");
		try (OutputStream stream = Files.newOutputStream(compact)) {
			for (Map.Entry<String, String> entry : quarantined.entrySet())
				stream.write(line("MATCH_SIZE_LIMIT".equals(entry.getValue()) ? 'S' : 'Q', entry.getKey()));
		}
		Files.move(compact, file, java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
		bytes = Files.size(file);
		output = Files.newOutputStream(file, StandardOpenOption.APPEND);
		maintenance = Executors.newSingleThreadExecutor(task -> {
			Thread thread = new Thread(task, "match-safety-log"); thread.setDaemon(true); return thread;
		});
	}

	public void requireAvailable(String id) {
		try (Lease ignored = acquire()) {
			if (failed || closed) throw new MatchService.Failure("MATCH_SAFETY_UNAVAILABLE");
			String code = quarantined.get(id);
			if (code != null) throw new MatchService.Failure(code);
		}
	}

	/** Called after authorization, before restoring or mutating native match state. */
	public void enter(String id) {
		try (Lease ignored = acquire()) {
			requireAvailable(id);
			if (!active.contains(id)) { append('B', id); active.add(id); }
		}
	}

	void sizeLimit(String id, long decodedBytes, int limit) {
		try (Lease ignored = acquire()) {
			if (!quarantined.containsKey(id)) {
				if (quarantined.size() >= MAX_QUARANTINED) throw new MatchService.Failure("MATCH_SAFETY_UNAVAILABLE");
				append('S', id);
				quarantined.put(id, "MATCH_SIZE_LIMIT");
				LOG.warning("MATCH_SIZE_LIMIT matchId=" + id + " decodedBytes=" + decodedBytes + " limit=" + limit);
			}
			throw new MatchService.Failure("MATCH_SIZE_LIMIT");
		}
	}

	/** Called only after the whole worker task returns normally, including handled request failures. */
	public void finishWork() {
		try (Lease ignored = acquire()) {
			for (String id : active) append('E', id);
			active.clear();
		}
	}

	private void append(char operation, String id) {
		if (output == null) return;
		byte[] record = line(operation, id);
		if (bytes > MAX_LOG_BYTES - record.length) { failed = true; throw new MatchService.Failure("MATCH_SAFETY_UNAVAILABLE"); }
		try {
			output.write(record); output.flush(); bytes += record.length;
			if (bytes >= 1024 * 1024 && !compacting) { compacting = true; maintenance.execute(this::compact); }
		}
		catch (IOException failure) { failed = true; throw new MatchService.Failure("MATCH_SAFETY_UNAVAILABLE"); }
	}

	/** Only isolated diagnostic-log state is shared with this maintenance thread; never native matches. */
	private void compact() {
		logLock.lock();
		try {
			if (closed || failed) return;
			Path next = file.resolveSibling(file.getFileName() + ".next");
			try {
				try (OutputStream stream = Files.newOutputStream(next)) {
					for (Map.Entry<String, String> entry : quarantined.entrySet())
						stream.write(line("MATCH_SIZE_LIMIT".equals(entry.getValue()) ? 'S' : 'Q', entry.getKey()));
					for (String id : active) stream.write(line('B', id));
				}
				output.close();
				Files.move(next, file, java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
				output = Files.newOutputStream(file, StandardOpenOption.APPEND);
				bytes = Files.size(file);
			} catch (IOException failure) {
				failed = true;
				LOG.warning("MATCH_SAFETY_UNAVAILABLE phase=diagnostic-log-compaction");
			} finally { compacting = false; }
		} finally { logLock.unlock(); }
	}

	/** Maintenance may stall on disk; the engine never waits indefinitely for its lock. */
	private Lease acquire() {
		if (logLock.tryLock()) return new Lease();
		var budget = new BrowserRequestTiming().budget();
		long millis = budget == null ? 25 : budget.allowanceMillis(25, 0);
		try {
			if (millis < 1 || !logLock.tryLock(millis, TimeUnit.MILLISECONDS)) throw new MatchService.Failure("MATCH_SAFETY_UNAVAILABLE");
			return new Lease();
		} catch (InterruptedException interrupted) {
			Thread.currentThread().interrupt(); throw new MatchService.Failure("MATCH_SAFETY_UNAVAILABLE");
		}
	}

	private final class Lease implements AutoCloseable {
		@Override public void close() { logLock.unlock(); }
	}

	private byte[] line(char operation, String id) {
		if (id == null || !id.matches("[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"))
			throw new IllegalArgumentException("Invalid match safety identifier");
		return (operation + " " + id + "\n").getBytes(StandardCharsets.US_ASCII);
	}

	@Override public void close() throws IOException {
		logLock.lock();
		try {
			closed = true;
			if (maintenance != null) maintenance.shutdown();
			if (output != null) output.close();
		} finally { logLock.unlock(); }
	}
}
