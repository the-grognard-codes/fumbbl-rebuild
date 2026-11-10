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
	static final int MAX_DEFERRALS = 3;
	static final int MAX_RETAINED_CHARACTERS = 4 * 1024 * 1024;
	interface Recipient {
		boolean enrolled();
		V2PublicationAuthorization.Target target();
		void send(V2PublicationAuthorization.Snapshot authorization, int slot) throws SQLException;
		void unavailable();
	}
	private static final class Pending {
		final String matchId;
		final V2PublicationAuthorization.Family family;
		final List<Recipient> recipients;
		final int characters;
		int deferrals;
		Pending(String matchId, V2PublicationAuthorization.Family family, List<Recipient> recipients, int characters, int deferrals) {
			this.matchId = matchId; this.family = family; this.recipients = new ArrayList<>(recipients);
			this.characters = characters; this.deferrals = deferrals;
		}
	}
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
		int deferrals = 0;
		// Current full state covers all viewers except its directly acknowledged source.
		// Supersession must not reset the failed delivery chain's retry allowance.
		if (family == V2PublicationAuthorization.Family.STATE && lane != null) {
			for (Pending previous : new ArrayList<>(lane)) if (previous.family == family) {
				deferrals = Math.max(deferrals, previous.deferrals); removed(previous);
			}
		}
		if (recipients.isEmpty()) return;
		Pending publication = new Pending(matchId, family, recipients, characters, deferrals);
		if (recipients.size() > V2PublicationAuthorization.MAX_TARGETS) { retire(publication); return; }
		// Use only the caller's remaining deadline; do not wait for the watchdog when work can proceed.
		drain(matchId);
		if (!pending.containsKey(matchId) && attempt(publication)) return;
		if (pendingCount >= MAX_PENDING || characters < 0 || characters > MAX_RETAINED_CHARACTERS - retainedCharacters) {
			retire(publication); return;
		}
		enqueue(publication);
	}

	/** Each match gets one turn per control task; deferred matches rotate behind their peers. */
	void retry() {
		for (String matchId : new ArrayList<>(pending.keySet())) {
			if (!hasBudget()) break;
			drain(matchId);
			Deque<Pending> lane = pending.remove(matchId);
			if (lane != null) pending.put(matchId, lane);
		}
	}

	private void drain(String matchId) {
		Deque<Pending> lane = pending.get(matchId);
		while (lane != null && !lane.isEmpty()) {
			Pending publication = lane.getFirst();
			if (!attempt(publication)) return;
			removed(publication);
		}
	}

	private void enqueue(Pending publication) {
		pending.computeIfAbsent(publication.matchId, ignored -> new ArrayDeque<>()).addLast(publication);
		pendingCount++; retainedCharacters += publication.characters; hasPending = true;
	}

	private void removed(Pending publication) {
		Deque<Pending> lane = pending.get(publication.matchId);
		lane.remove(publication);
		if (lane.isEmpty()) pending.remove(publication.matchId);
		pendingCount--; retainedCharacters -= publication.characters; hasPending = pendingCount != 0;
	}

	private boolean hasBudget() {
		BrowserRequestTiming.Budget budget = new BrowserRequestTiming().budget();
		return budget == null || budget.remainingNanos() > 0;
	}

	private boolean attempt(Pending publication) {
		publication.recipients.removeIf(recipient -> !recipient.enrolled());
		if (publication.recipients.isEmpty()) return true;
		if (!hasBudget()) return false; // An already exhausted caller does not spend a retry.
		try (BrowserRequestTiming.Scope ignored = new BrowserRequestTiming().span(BrowserRequestTiming.Phase.PUBLICATION)) {
			if (deliver(publication)) return true;
			if (++publication.deferrals < MAX_DEFERRALS) return false;
			retire(publication); return true;
		}
	}

	private boolean deliver(Pending publication) {
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
