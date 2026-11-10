package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;

import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Worker-owned, bounded catch-up ordered within each match. Only enrolled recipients are retried. */
final class PublicationDelivery {
	static final int MAX_PENDING = 64;
	static final int MAX_RETAINED_CHARACTERS = 4 * 1024 * 1024;
	interface Recipient {
		boolean enrolled();
		V2PublicationAuthorization.Target target();
		void send(V2PublicationAuthorization.Snapshot authorization, int slot) throws SQLException;
		void unavailable();
	}
	private record Pending(String matchId, V2PublicationAuthorization.Family family,
		List<Recipient> recipients, int characters) { }
	private final V2MatchAccess access;
	private final Map<String, Deque<Pending>> pending = new LinkedHashMap<>();
	private int retainedCharacters;
	private int pendingCount;
	private volatile boolean hasPending;
	PublicationDelivery(V2MatchAccess access) { this.access = access; }

	/** A scheduling hint only; the watchdog never reads worker-owned collections. */
	boolean hasPending() { return hasPending; }

	void publish(String matchId, V2PublicationAuthorization.Family family, List<Recipient> recipients, int characters) {
		Deque<Pending> lane = pending.get(matchId);
		// Every state publication covers current viewers (except the directly acknowledged source).
		// Keep the newest snapshot after preceding chat, without replaying obsolete projections.
		if (family == V2PublicationAuthorization.Family.STATE && lane != null) {
			lane.removeIf(previous -> {
				if (previous.family != V2PublicationAuthorization.Family.STATE) return false;
				removed(previous); return true;
			});
			if (lane.isEmpty()) { pending.remove(matchId); lane = null; }
		}
		try {
			if (recipients.isEmpty()) return;
			Pending publication = new Pending(matchId, family, new ArrayList<>(recipients), characters);
			if (recipients.size() > V2PublicationAuthorization.MAX_TARGETS) { retire(publication); return; }
			if (lane == null && attempt(publication)) return;
			if (pendingCount >= MAX_PENDING || characters < 0 || characters > MAX_RETAINED_CHARACTERS - retainedCharacters) {
				retire(publication); // Explicit unavailable is preferable to silent loss or unbounded retention.
				return;
			}
			pending.computeIfAbsent(matchId, ignored -> new ArrayDeque<>()).addLast(publication);
			pendingCount++; retainedCharacters += characters;
		} finally { hasPending = pendingCount != 0; }
	}

	/** Each match gets one turn per control task; deferred matches rotate behind their peers. */
	void retry() {
		try {
			for (String matchId : new ArrayList<>(pending.keySet())) {
				BrowserRequestTiming.Budget budget = new BrowserRequestTiming().budget();
				if (budget != null && budget.remainingNanos() == 0) break;
				Deque<Pending> lane = pending.remove(matchId);
				while (!lane.isEmpty()) {
					Pending publication = lane.getFirst();
					if (!attempt(publication)) break;
					lane.removeFirst(); removed(publication);
					if (budget != null && budget.remainingNanos() == 0) break;
				}
				if (!lane.isEmpty()) pending.put(matchId, lane);
			}
		} finally { hasPending = pendingCount != 0; }
	}

	private void removed(Pending publication) { pendingCount--; retainedCharacters -= publication.characters; }

	private boolean attempt(Pending publication) {
		try (BrowserRequestTiming.Scope ignored = new BrowserRequestTiming().span(BrowserRequestTiming.Phase.PUBLICATION)) {
			return deliver(publication);
		}
	}
	private boolean deliver(Pending publication) {
		publication.recipients.removeIf(recipient -> !recipient.enrolled());
		if (publication.recipients.isEmpty()) return true;
		V2PublicationAuthorization.Snapshot authorization;
		try {
			authorization = access.publication(publication.matchId, publication.family,
				publication.recipients.stream().map(Recipient::target).toList());
		} catch (SQLException | RuntimeException failure) {
			if (deferred(failure)) return false;
			retire(publication); return true;
		}
		int slot = 0;
		while (!publication.recipients.isEmpty()) {
			Recipient recipient = publication.recipients.getFirst();
			try { recipient.send(authorization, slot); }
			catch (SQLException | RuntimeException failure) {
				if (deferred(failure)) return false;
				unavailable(recipient);
			}
			publication.recipients.removeFirst(); slot++;
		}
		return true;
	}
	private boolean deferred(Exception failure) {
		return failure instanceof V2MatchAccess.PublicationDeferred || failure instanceof JdbcConnections.NotStarted
			|| failure instanceof JdbcConnections.DeadlineExpired;
	}
	private void retire(Pending publication) { publication.recipients.forEach(this::unavailable); publication.recipients.clear(); }
	private void unavailable(Recipient recipient) {
		try { if (recipient.enrolled()) recipient.unavailable(); }
		catch (RuntimeException disconnected) { /* One failed transport cannot prevent cleanup of its peers. */ }
	}
}
