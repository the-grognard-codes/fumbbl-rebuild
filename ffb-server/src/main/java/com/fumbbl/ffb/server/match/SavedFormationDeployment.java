package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.team.bb2025.TeamFormations;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Applies a complete template through native setup commands within one durable mutation. */
final class SavedFormationDeployment {

	void apply(GameState state, boolean home, FrozenTeam frozen, TeamFormations.Formation formation, boolean computer) {
		Game game = state.getGame();
		Team team = home ? game.getTeamHome() : game.getTeamAway();
		List<Player<?>> available = new ArrayList<>();
		for (Player<?> player : team.getPlayers())
			if (game.getFieldModel().getPlayerState(player).canBeMovedDuringSetup()) available.add(player);
		available.sort(Comparator.comparingInt(player -> jersey(frozen, player)));
		Map<Player<?>, FieldCoordinate> plan = new LinkedHashMap<>();
		if (formation != null) for (TeamFormations.Assignment assignment : formation.players()) {
			available.stream().filter(player -> jersey(frozen, player) == assignment.jerseyNumber()).findFirst()
				.ifPresent(player -> plan.put(player, new FieldCoordinate(12 - assignment.depth(), assignment.column())));
		}
		if (computer) complete(plan, available);
		// Clear this side only. Ineligible players retain their KO/casualty/sent-off boxes.
		for (Player<?> player : available) {
			FieldCoordinate current = game.getFieldModel().getPlayerCoordinate(player);
			if (!FieldCoordinateBounds.FIELD.isInBounds(current)) continue;
			int box = home ? FieldCoordinate.RSV_HOME_X : FieldCoordinate.RSV_AWAY_X;
			int row = 0;
			while (game.getFieldModel().getPlayer(new FieldCoordinate(box, row)) != null) row++;
			FieldCoordinate reserve = new FieldCoordinate(box, row);
			state.handleCommand(new ReceivedCommand(new ClientCommandSetupPlayer(player.getId(), home ? reserve : reserve.transform()), home));
		}
		for (Map.Entry<Player<?>, FieldCoordinate> assignment : plan.entrySet()) {
			// Native away commands mirror x only; rotate template columns to keep the coach's own perspective.
			FieldCoordinate square = assignment.getValue();
			FieldCoordinate commandSquare = home ? square : new FieldCoordinate(square.getX(), 14 - square.getY());
			state.handleCommand(new ReceivedCommand(new ClientCommandSetupPlayer(assignment.getKey().getId(), commandSquare), home));
		}
	}

	private void complete(Map<Player<?>, FieldCoordinate> plan, List<Player<?>> available) {
		int required = Math.min(11, available.size());
		int minimumLos = Math.min(3, required);
		// Captains must be fielded even when the saved eleven predate their recruitment.
		List<Player<?>> priority = new ArrayList<>(available);
		priority.sort(Comparator.comparing(player -> !player.hasSkillProperty(NamedProperties.needsToBeSetUp)));
		for (Player<?> player : priority) {
			if (plan.containsKey(player)) continue;
			if (plan.size() >= required) {
				if (!player.hasSkillProperty(NamedProperties.needsToBeSetUp)) continue;
				Player<?> replacement = plan.keySet().stream().filter(candidate -> !candidate.hasSkillProperty(NamedProperties.needsToBeSetUp)).findFirst().orElse(null);
				if (replacement == null) continue;
				plan.put(player, plan.remove(replacement));
			} else {
				boolean needsLos = plan.values().stream().filter(square -> square.getX() == 12).count() < minimumLos;
				plan.put(player, freeSquare(plan, needsLos ? 12 : 11));
			}
		}
		while (plan.values().stream().filter(square -> square.getX() == 12).count() < minimumLos) {
			Player<?> move = plan.keySet().stream().filter(player -> plan.get(player).getX() != 12).findFirst().orElseThrow();
			plan.put(move, freeSquare(plan, 12));
		}
	}

	private FieldCoordinate freeSquare(Map<Player<?>, FieldCoordinate> plan, int x) {
		for (int depth = 0; depth < 12; depth++) for (int y : new int[] { 7, 6, 8, 5, 9, 4, 10 }) {
			FieldCoordinate square = new FieldCoordinate(x - depth, y);
			if (!plan.containsValue(square)) return square;
		}
		throw new IllegalStateException("No free formation square");
	}

	private int jersey(FrozenTeam frozen, Player<?> enginePlayer) {
		if (frozen.teamName.isEmpty()) return enginePlayer.getNr();
		for (FrozenTeam.Player player : frozen.players)
			if ((frozen.sourceTeamId + ":" + player.id).equals(enginePlayer.getId())) return player.jerseyNumber;
		throw new IllegalStateException("Unrecognized frozen player");
	}
}
