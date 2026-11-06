package com.fumbbl.ffb.server.team.bb2025;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/** Jersey-based templates in team-relative coordinates: column 0–14, depth 0–12 from the LoS. */
public final class TeamFormations {

	public record Assignment(int jerseyNumber, int column, int depth) { }

	public record Formation(String name, List<Assignment> players) {
		public Formation {
			if (name == null || !name.equals(name.trim()) || !name.matches("[A-Za-z0-9 .,!?()'&+_:/-]{1,16}"))
				throw new IllegalArgumentException("Formation names must contain 1–16 ordinary characters.");
			players = List.copyOf(players);
			if (players.size() != 11) throw new IllegalArgumentException("A formation requires eleven assignments.");
			Set<Integer> numbers = new HashSet<>(), squares = new HashSet<>();
			int los = 0, left = 0, right = 0;
			for (Assignment player : players) {
				if (player.jerseyNumber() < 1 || player.jerseyNumber() > 99 || player.column() < 0 || player.column() > 14
					|| player.depth() < 0 || player.depth() > 12 || !numbers.add(player.jerseyNumber())
					|| !squares.add(player.depth() * 15 + player.column()))
					throw new IllegalArgumentException("Invalid or duplicate formation assignment.");
				if (player.depth() == 0) los++;
				if (player.column() < 4) left++;
				if (player.column() > 10) right++;
			}
			if (los < 3 || left > 2 || right > 2)
				throw new IllegalArgumentException("A formation needs at least three on the LoS and at most two in each wide zone.");
		}
	}

	public record FormationSet(List<Formation> offense, List<Formation> defense) {
		public FormationSet {
			offense = List.copyOf(offense);
			defense = List.copyOf(defense);
			if (offense.size() > 3 || defense.size() > 3) throw new IllegalArgumentException("At most three formations per role.");
		}
		public List<Formation> forReceiving(boolean receiving) { return receiving ? offense : defense; }
	}

	/** Absence is initialized once on save/load; explicit empty collections are retained. */
	public FormationSet defaults(List<TeamDraft.Player> roster) {
		List<Integer> numbers = roster.stream().sorted(Comparator.comparingInt(player -> player.jerseyNumber > 0 ? player.jerseyNumber : player.slot))
			.map(player -> player.jerseyNumber > 0 ? player.jerseyNumber : player.slot).distinct().limit(11).toList();
		if (numbers.size() < 11) return new FormationSet(List.of(), List.of());
		return new FormationSet(List.of(
			diagram("5-4-2 Offense", numbers, new String[] {
				"XXXXXA819BXXXXX", "XX24XXXXXXX53XX", "XXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXX",
				"XXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXX", "XXXX6XXXXX7XXXX" }),
			diagram("7-2-2 Offense", numbers, new String[] {
				"XXXX2891AB3XXXX", "XXX4XXXXXXX5XXX", "XXXXXXXXXXXXXXX", "XXXXXXXXXXXXXXX",
				"XXXXXXXXXXXXXXX", "XXXX6XXXXX7XXXX" })),
			List.of(
				diagram("Chevron Defense", numbers, new String[] {
					"XXXXXX819XXXXXX", "XXXXXXXXXXXXXXX", "XXAXX6XXX7XXBXX", "XXX2XX4X5XX3XXX" }),
				diagram("Anchor Defense", numbers, new String[] {
					"XXXXXX8A9XXXXXX", "XXXXXXXXXXXXXXX", "XXXX1XX7XXBXXXX", "XXXXX43625XXXXX" })));
	}

	private Formation diagram(String name, List<Integer> numbers, String[] rows) {
		List<Assignment> players = new ArrayList<>();
		for (int depth = 0; depth < rows.length; depth++) {
			for (int column = 0; column < rows[depth].length(); column++) {
				char value = rows[depth].charAt(column);
				if (value != 'X') players.add(new Assignment(numbers.get(Character.digit(value, 16) - 1), column, depth));
			}
		}
		return new Formation(name, players);
	}

	public FormationSet decode(JsonObject object) {
		exact(object, "offense", "defense");
		return new FormationSet(decodeGroup(object.get("offense").asArray()), decodeGroup(object.get("defense").asArray()));
	}

	private List<Formation> decodeGroup(JsonArray array) {
		if (array.size() > 3) throw new IllegalArgumentException("At most three formations per role.");
		List<Formation> group = new ArrayList<>();
		for (JsonValue value : array) {
			JsonObject item = value.asObject();
			exact(item, "name", "players");
			JsonArray assignments = item.get("players").asArray();
			if (assignments.size() != 11) throw new IllegalArgumentException("A formation requires eleven assignments.");
			List<Assignment> players = new ArrayList<>();
			for (JsonValue entry : assignments) {
				JsonObject player = entry.asObject();
				exact(player, "jerseyNumber", "column", "depth");
				players.add(new Assignment(player.get("jerseyNumber").asInt(), player.get("column").asInt(), player.get("depth").asInt()));
			}
			group.add(new Formation(item.get("name").asString(), players));
		}
		return group;
	}

	public JsonObject encode(FormationSet collection) {
		return new JsonObject().add("offense", encodeGroup(collection.offense())).add("defense", encodeGroup(collection.defense()));
	}

	private JsonArray encodeGroup(List<Formation> group) {
		JsonArray array = new JsonArray();
		for (Formation formation : group) {
			JsonArray players = new JsonArray();
			for (Assignment player : formation.players()) players.add(new JsonObject().add("jerseyNumber", player.jerseyNumber())
				.add("column", player.column()).add("depth", player.depth()));
			array.add(new JsonObject().add("name", formation.name()).add("players", players));
		}
		return array;
	}

	private void exact(JsonObject object, String... fields) {
		if (object.size() != fields.length || !new HashSet<>(object.names()).equals(Set.of(fields)))
			throw new IllegalArgumentException("Missing, duplicate or unsupported formation fields.");
	}
}
