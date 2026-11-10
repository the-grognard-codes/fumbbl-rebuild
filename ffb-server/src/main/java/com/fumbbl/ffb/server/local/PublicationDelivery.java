package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;

import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** Worker-owned, bounded FIFO catch-up. Only undelivered, still-enrolled recipients are retried. */
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
	private final Deque<Pending> pending = new ArrayDeque<>();
	private int retainedCharacters;
	PublicationDelivery(V2MatchAccess access) { this.access = access; }

	void publish(String matchId, V2PublicationAuthorization.Family family, List<Recipient> recipients, int characters) {
		if (recipients.isEmpty()) return;
		Pending publication = new Pending(matchId, family, new ArrayList<>(recipients), characters);
		if (recipients.size() > V2PublicationAuthorization.MAX_TARGETS) { retire(publication); return; }
		if (pending.isEmpty() && attempt(publication)) return;
		if (pending.size() >= MAX_PENDING || characters < 0 || characters > MAX_RETAINED_CHARACTERS - retainedCharacters) {
			retire(publication); // Explicit unavailable is preferable to silent loss or unbounded retention.
			return;
		}
		pending.addLast(publication); retainedCharacters += characters;
	}

	/** Called only by a separately timed worker control task, never recursively from the originating request. */
	void retry() {
		while (!pending.isEmpty()) {
			Pending publication = pending.getFirst();
			if (!attempt(publication)) return;
			pending.removeFirst(); retainedCharacters -= publication.characters;
		}
	}

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
