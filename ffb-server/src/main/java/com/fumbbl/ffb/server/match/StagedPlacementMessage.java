package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;

import java.util.Map;
import java.util.Set;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

final class StagedPlacementMessage {
	JsonObject encode(String matchId, int revision, int sequence, Map<String, FieldCoordinate> squares, Set<String> selection) {
		JsonArray players = new JsonArray();
		squares.forEach((playerId, square) -> {
			boolean pitch = FieldCoordinateBounds.FIELD.isInBounds(square);
			players.add(new JsonObject().add("playerId", playerId)
				.add("x", pitch ? JsonValue.valueOf(square.getX()) : JsonValue.NULL)
				.add("y", pitch ? JsonValue.valueOf(square.getY()) : JsonValue.NULL));
		});
		return new JsonObject().add("version", 2).add("type", "stagedPlacement").add("requestId", JsonValue.NULL)
			.add("code", "ACCEPTED").add("matchId", matchId).add("baseRevision", revision)
			.add("stageSeq", sequence).add("players", players).add("selectedPlayerIds", selectedPlayers(selection));
	}

	JsonArray selectedPlayers(Set<String> selection) {
		JsonArray players = new JsonArray();
		selection.forEach(players::add);
		return players;
	}
}
