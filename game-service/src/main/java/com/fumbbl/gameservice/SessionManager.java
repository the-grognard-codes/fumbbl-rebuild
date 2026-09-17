package com.fumbbl.gameservice;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Process-local proof sessions. Callers hold this monitor through ordered delivery. */
public final class SessionManager {
	private static final int HISTORY_LIMIT = 50;
	private static final long TTL_MILLIS = 60L * 60L * 1000L;
	private final SecureRandom random = new SecureRandom();
	private final Map<String, Game> games = new HashMap<>();
	private final Map<String, String> accountCodes = new HashMap<>();
	private final Clock clock;
	private final int capacity;

	public SessionManager() { this(Clock.systemUTC(), 512); }
	SessionManager(Clock clock, int capacity) { this.clock = clock; this.capacity = capacity; }

	public synchronized Snapshot create(String account) throws GameException {
		requireAvailable(account);
		purge();
		if (games.size() >= capacity) throw new GameException("capacity_reached");
		String code;
		do { code = code(); } while (games.containsKey(code));
		Game game = new Game(code);
		game.accounts[0] = account;
		game.connected[0] = true;
		game.event("authenticated", 0, null);
		game.event("joined", 0, null);
		games.put(code, game);
		accountCodes.put(account, code);
		return game.snapshot(account);
	}

	public synchronized Snapshot join(String account, String code) throws GameException {
		requireAvailable(account);
		purge();
		Game game = games.get(code);
		if (game == null) throw new GameException("session_not_found");
		int slot = game.slot(account);
		if (slot >= 0) {
			game.connected[slot] = true;
			accountCodes.put(account, code);
			game.event("authenticated", slot, null);
			game.event("reconnected", slot, null);
			return game.snapshot(account);
		}
		if (game.accounts[1] != null) throw new GameException("session_full");
		game.accounts[1] = account;
		game.connected[1] = true;
		accountCodes.put(account, code);
		game.event("authenticated", 1, null);
		game.event("joined", 1, null);
		return game.snapshot(account);
	}

	public synchronized Snapshot chat(String account, String text) throws GameException {
		Game game = gameFor(account);
		if (text == null || text.trim().isEmpty() || text.length() > 1000) throw new GameException("invalid_message");
		game.event("chat", game.slot(account), text);
		return game.snapshot(account);
	}

	/** Leaving releases presence, while the private slot stays reserved until expiry. */
	public synchronized Snapshot leave(String account) throws GameException { return disconnected(account); }

	public synchronized Snapshot disconnected(String account) throws GameException {
		Game game = gameFor(account);
		int slot = game.slot(account);
		game.connected[slot] = false;
		accountCodes.remove(account);
		game.event("left", slot, null);
		return game.snapshot(account);
	}

	public synchronized Snapshot snapshot(String account) throws GameException { return gameFor(account).snapshot(account); }

	private void requireAvailable(String account) throws GameException {
		if (account == null || account.isEmpty()) throw new GameException("rejected");
		if (accountCodes.containsKey(account)) throw new GameException("already_in_session");
	}

	private Game gameFor(String account) throws GameException {
		String code = accountCodes.get(account);
		Game game = code == null ? null : games.get(code);
		if (game == null || game.slot(account) < 0) throw new GameException("session_not_found");
		return game;
	}

	private void purge() {
		Iterator<Game> iterator = games.values().iterator();
		while (iterator.hasNext()) {
			Game game = iterator.next();
			if (!game.connected[0] && !game.connected[1] && clock.millis() - game.lastActivity >= TTL_MILLIS) iterator.remove();
		}
	}

	private String code() {
		byte[] bytes = new byte[16];
		random.nextBytes(bytes);
		StringBuilder value = new StringBuilder(32);
		for (byte part : bytes) {
			value.append(Character.forDigit((part & 255) >>> 4, 16));
			value.append(Character.forDigit(part & 15, 16));
		}
		return value.toString();
	}

	public static final class GameException extends Exception {
		public final String code;
		GameException(String code) { this.code = code; }
	}

	public static final class Snapshot {
		public final String code;
		public final int selfSlot;
		public final List<Map<String, Object>> slots;
		public final List<Map<String, Object>> events;
		Snapshot(String code, int selfSlot, List<Map<String, Object>> slots, List<Map<String, Object>> events) {
			this.code = code; this.selfSlot = selfSlot; this.slots = slots; this.events = events;
		}
	}

	private final class Game {
		private final String code;
		private final String[] accounts = new String[2];
		private final boolean[] connected = new boolean[2];
		private final List<Map<String, Object>> events = new ArrayList<>();
		private long nextSequence = 1;
		private long lastActivity = clock.millis();
		Game(String code) { this.code = code; }
		int slot(String account) { return account.equals(accounts[0]) ? 0 : account.equals(accounts[1]) ? 1 : -1; }
		void event(String type, int slot, String text) {
			Map<String, Object> event = new LinkedHashMap<>();
			event.put("sequence", nextSequence++); event.put("type", type); event.put("slot", slot);
			if (text != null) event.put("text", text);
			events.add(Collections.unmodifiableMap(event));
			if (events.size() > HISTORY_LIMIT) events.remove(0);
			lastActivity = clock.millis();
		}
		Snapshot snapshot(String account) {
			List<Map<String, Object>> states = new ArrayList<>();
			for (int slot = 0; slot < 2; slot++) {
				Map<String, Object> state = new LinkedHashMap<>();
				state.put("occupied", accounts[slot] != null); state.put("connected", connected[slot]);
				states.add(Collections.unmodifiableMap(state));
			}
			return new Snapshot(code, slot(account), Collections.unmodifiableList(states), Collections.unmodifiableList(new ArrayList<>(events)));
		}
	}
}
