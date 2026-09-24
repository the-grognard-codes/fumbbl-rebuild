package com.fumbbl.ffb.server.team.bb2025;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Value input only: no costs, stats, base skills or engine objects are accepted. */
public final class TeamDraft {
	public static final int FORMAT_VERSION = 2;
	public final int draftVersion;
	public final String teamName;
	public final String catalogVersion, ruleset, rosterId, presetId, captainId;
	public final List<Player> players;
	public final Map<String, Integer> resources;

	public TeamDraft(int draftVersion, String teamName, String catalogVersion, String ruleset, String rosterId, String presetId,
		String captainId, List<Player> players, Map<String, Integer> resources) {
		this.draftVersion = draftVersion;
		this.teamName = canonicalName(Objects.requireNonNull(teamName));
		this.catalogVersion = Objects.requireNonNull(catalogVersion);
		this.ruleset = Objects.requireNonNull(ruleset);
		this.rosterId = Objects.requireNonNull(rosterId);
		this.presetId = Objects.requireNonNull(presetId);
		this.captainId = captainId;
		this.players = Collections.unmodifiableList(new ArrayList<>(players));
		this.resources = Collections.unmodifiableMap(new LinkedHashMap<>(resources));
	}
	/** Decoder for retained format-1/2 documents and the local diagnostic route. */
	public TeamDraft(String catalogVersion, String ruleset, String rosterId, String presetId,
		String captainId, List<Player> players, Map<String, Integer> resources) {
		this(1, "", catalogVersion, ruleset, rosterId, presetId, captainId, players, resources);
	}

	public static final class Player {
		public final String id, positionId, playerName;
		public final int slot, jerseyNumber;
		public final List<String> skillIds;
		public Player(String id, int slot, int jerseyNumber, String playerName, String positionId, List<String> skillIds) {
			this.id = Objects.requireNonNull(id); this.slot = slot;
			this.jerseyNumber = jerseyNumber; this.playerName = canonicalName(Objects.requireNonNull(playerName));
			this.positionId = Objects.requireNonNull(positionId);
			this.skillIds = Collections.unmodifiableList(new ArrayList<>(skillIds));
		}
		public Player(String id, int slot, String positionId, List<String> skillIds) {
			this(id, slot, 0, "", positionId, skillIds);
		}
	}
	private static String canonicalName(String value) {
		for (int index = 0; index < value.length();) {
			int point = value.codePointAt(index);
			if (Character.isISOControl(point)) return value;
			index += Character.charCount(point);
		}
		return Normalizer.normalize(value.trim(), Normalizer.Form.NFC);
	}
}
