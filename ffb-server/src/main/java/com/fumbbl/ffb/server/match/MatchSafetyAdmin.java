package com.fumbbl.ffb.server.match;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.HashSet;

/** Local operator command. The exclusive store lease requires the server to be stopped. */
public final class MatchSafetyAdmin {
	/** @throws IOException if the state cannot be read/written or the server still owns it. */
	public void clear(Path file, String matchId) throws IOException {
		try (MatchSafetyJournal.FileStore store = new MatchSafetyJournal.FileStore(file)) {
			MatchSafetyJournal.State state = store.read();
			if (state == null) return;
			var ids = new HashSet<>(state.matches());
			var quarantines = new HashMap<>(state.quarantines());
			boolean removed = ids.remove(matchId);
			removed |= quarantines.remove(matchId) != null;
			if (!removed) return;
			store.write(new MatchSafetyJournal.State(state.runId(), state.startedAt(), state.dumpFile(), state.sequence() + 1, ids, quarantines));
		}
	}

	public static void main(String[] args) throws IOException {
		if (args.length != 3 || !"clear".equals(args[0])) throw new IllegalArgumentException("Usage: MatchSafetyAdmin clear <state-file> <match-id>");
		new MatchSafetyAdmin().clear(Path.of(args[1]), args[2]);
	}
}
