package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;

/** Public match conversation stored in the same recoverable checkpoint as native play. */
public final class MatchChat {
	private static final int MAX_MESSAGES = 512;
	private final JsonArray messages = new JsonArray();
	private final Map<String, Entry> requests = new LinkedHashMap<>();

	public MatchChat() { }

	public MatchChat(JsonObject saved) {
		exact(saved, "formatVersion", "messages", "requests");
		if (saved.getInt("formatVersion", -1) != 1) throw new IllegalArgumentException("Unsupported chat format");
		JsonArray stored = saved.get("messages").asArray();
		if (stored.size() > MAX_MESSAGES) throw new IllegalArgumentException("Chat limit");
		long priorTime = -1;
		HashSet<Integer> usedIndexes = new HashSet<>();
		for (JsonValue value : stored) {
			JsonObject message = value.asObject();
			exact(message, "index", "at", "revision", "authorId", "role", "text");
			if (message.getInt("index", -1) != messages.size() || message.getInt("revision", -1) < 0
				|| message.get("at").asLong() < 0 || message.get("at").asLong() < priorTime) throw new IllegalArgumentException("Chat order");
			identity(message.getString("authorId", null)); role(message.getString("role", null)); content(message.getString("text", null));
			priorTime = message.get("at").asLong();
			messages.add(message);
		}
		JsonArray history = saved.get("requests").asArray();
		if (history.size() != stored.size()) throw new IllegalArgumentException("Chat request count");
		for (JsonValue value : history) {
			JsonObject request = value.asObject();
			exact(request, "authorId", "requestId", "index", "text");
			String author = request.get("authorId").asString(), id = request.get("requestId").asString();
			identity(author); requestId(id); content(request.get("text").asString());
			int index = request.getInt("index", -1);
			if (index < 0 || index >= messages.size() || !usedIndexes.add(index)
				|| !author.equals(messages.get(index).asObject().getString("authorId", null))
				|| !request.get("text").equals(messages.get(index).asObject().get("text"))
				|| requests.put(author + "\n" + id, new Entry(index, request.get("text").asString())) != null)
				throw new IllegalArgumentException("Chat request history");
		}
	}

	public Outcome append(String authorId, String authorRole, String id, String text, int revision, long now) {
		identity(authorId); role(authorRole); requestId(id); content(text);
		if (revision < 0 || now < 0) throw new IllegalArgumentException("Invalid chat boundary");
		Entry prior = requests.get(authorId + "\n" + id);
		if (prior != null) {
			if (!prior.text.equals(text)) throw new MatchService.Failure("REQUEST_ID_REUSED");
			return new Outcome(messages.get(prior.index).asObject(), true);
		}
		if (messages.size() >= MAX_MESSAGES) throw new MatchService.Failure("CHAT_LIMIT");
		for (int index = messages.size() - 1; index >= 0; index--) {
			JsonObject previous = messages.get(index).asObject();
			if (authorId.equals(previous.getString("authorId", null))) {
				if (now - previous.get("at").asLong() < 1000L) throw new MatchService.Failure("CHAT_RATE_LIMIT");
				break;
			}
		}
		long at = messages.isEmpty() ? now : Math.max(now, messages.get(messages.size() - 1).asObject().get("at").asLong());
		JsonObject message = new JsonObject().add("index", messages.size()).add("at", at).add("revision", revision)
			.add("authorId", authorId).add("role", authorRole).add("text", text);
		messages.add(message);
		requests.put(authorId + "\n" + id, new Entry(message.getInt("index", -1), text));
		return new Outcome(message, false);
	}

	public Outcome duplicate(String authorId, String id, String text) {
		identity(authorId); requestId(id); content(text);
		Entry prior = requests.get(authorId + "\n" + id);
		if (prior == null) throw new MatchService.Failure("MATCH_COMPLETED");
		if (!prior.text.equals(text)) throw new MatchService.Failure("REQUEST_ID_REUSED");
		return new Outcome(messages.get(prior.index).asObject(), true);
	}

	public JsonObject page(int from, int limit) {
		if (from < 0 || from > messages.size() || limit < 1 || limit > 32) throw new MatchService.Failure("INVALID_REQUEST");
		JsonArray selected = new JsonArray();
		for (int index = from; index < messages.size() && selected.size() < limit; index++) selected.add(messages.get(index));
		return new JsonObject().add("formatVersion", 1).add("from", from).add("next", from + selected.size())
			.add("total", messages.size()).add("messages", selected);
	}

	public JsonObject json() {
		JsonArray history = new JsonArray();
		requests.forEach((key, entry) -> {
			int split = key.indexOf('\n');
			history.add(new JsonObject().add("authorId", key.substring(0, split)).add("requestId", key.substring(split + 1))
				.add("index", entry.index).add("text", entry.text));
		});
		return new JsonObject().add("formatVersion", 1).add("messages", messages).add("requests", history);
	}

	private static void identity(String value) {
		if (value == null || !value.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw new IllegalArgumentException("Invalid chat author");
	}
	private static void role(String value) {
		if (!Arrays.asList("home", "away", "spectator").contains(value)) throw new IllegalArgumentException("Invalid chat role");
	}
	private static void requestId(String value) {
		if (value == null || !value.matches("[A-Za-z0-9_-]{1,100}")) throw new IllegalArgumentException("Invalid chat request ID");
	}
	private static void content(String value) {
		if (value == null || value.length() < 1 || value.length() > 300 || !value.equals(value.trim())
			|| value.getBytes(StandardCharsets.UTF_8).length > 1024 || value.chars().anyMatch(ch -> Character.isISOControl(ch)))
			throw new IllegalArgumentException("Invalid chat text");
	}
	private static void exact(JsonObject value, String... fields) {
		if (value.size() != fields.length || !new HashSet<>(value.names()).equals(new HashSet<>(Arrays.asList(fields))))
			throw new IllegalArgumentException("Unexpected chat fields");
	}
	private static final class Entry {
		final int index; final String text;
		Entry(int index, String text) { this.index = index; this.text = text; }
	}
	public static final class Outcome {
		public final JsonObject message;
		public final boolean duplicate;
		Outcome(JsonObject message, boolean duplicate) { this.message = message; this.duplicate = duplicate; }
	}
}
