package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.factory.DodgeModifierFactory;
import com.fumbbl.ffb.factory.common.GoForItModifierFactory;
import com.fumbbl.ffb.mechanics.AgilityMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.modifiers.DodgeContext;
import com.fumbbl.ffb.modifiers.GoForItContext;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilCards;
import com.fumbbl.ffb.util.UtilPlayer;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

/** Read-only route forecast. Each step is checked again by the native engine when committed. */
final class RoutePlanner {
	private final GameState state;
	private final Game game;
	private final ActingPlayer acting;
	private final Player<?> player;
	private final FieldCoordinate start;
	private final int allowance;
	private final int currentMove;
	private final AgilityMechanic agility;

	RoutePlanner(GameState state) {
		this.state = state;
		game = state.getGame();
		acting = game.getActingPlayer();
		player = acting.getPlayer();
		if (player == null || acting.isJumping() || player.hasSkillProperty(NamedProperties.movesRandomly))
			throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		start = game.getFieldModel().getPlayerCoordinate(player);
		if (!FieldCoordinateBounds.FIELD.isInBounds(start)) throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		currentMove = acting.getCurrentMove();
		allowance = player.getMovementWithModifiers() + 2
			+ (player.hasSkillProperty(NamedProperties.canMakeAnExtraGfi) ? 1 : 0)
			+ (UtilCards.hasUnusedSkillWithProperty(acting, NamedProperties.canMakeAnExtraGfiOnce) ? 1 : 0);
		agility = (AgilityMechanic) game.getRules().getFactory(FactoryType.Factory.MECHANIC)
			.forName(Mechanic.Type.AGILITY.name());
	}

	JsonObject preview(List<FieldCoordinate> waypoints) {
		if (waypoints.isEmpty() || waypoints.size() > 20) throw new MatchService.Failure("INVALID_ROUTE");
		List<Step> path = new ArrayList<>();
		FieldCoordinate from = start;
		for (FieldCoordinate waypoint : waypoints) {
			if (!FieldCoordinateBounds.FIELD.isInBounds(waypoint) || waypoint.equals(from)
				|| occupied(waypoint)) throw new MatchService.Failure("INVALID_ROUTE");
			List<Step> segment = span(from, waypoint, path.size());
			if (segment == null) throw new MatchService.Failure("NO_ROUTE");
			path.addAll(segment);
			from = waypoint;
		}
		JsonArray steps = new JsonArray();
		for (Step step : path) steps.add(step.json());
		return new JsonObject().add("routeVersion", 1).add("playerId", player.getId())
			.add("from", point(start)).add("remaining", Math.max(0, allowance - currentMove))
			.add("steps", steps);
	}

	private List<Step> span(FieldCoordinate from, FieldCoordinate target, int used) {
		int remaining = allowance - currentMove - used;
		if (remaining <= 0) return null;
		PriorityQueue<Node> queue = new PriorityQueue<>(Comparator.comparing((Node node) -> node, RoutePlanner::compare));
		Map<String, Node> best = new HashMap<>();
		Node root = new Node(from, used, 0, 0, 0, null, null);
		queue.add(root);
		best.put(key(root), root);
		while (!queue.isEmpty()) {
			Node node = queue.remove();
			if (best.get(key(node)) != node) continue;
			if (node.at.equals(target)) {
				List<Step> result = new ArrayList<>();
				for (Node cursor = node; cursor.step != null; cursor = cursor.previous) result.add(0, cursor.step);
				return result;
			}
			if (node.used - used >= remaining) continue;
			for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
				if (x == 0 && y == 0) continue;
				FieldCoordinate next = node.at.add(x, y);
				if (!FieldCoordinateBounds.FIELD.isInBounds(next) || occupied(next)) continue;
				Step step = step(node.at, next, node.used);
				int reactions = node.reactions + step.reactions.size();
				int rolls = node.rolls + (step.dodge > 0 ? 1 : 0) + (step.rush > 0 ? 1 : 0);
				double risk = node.risk + loss(step.dodge) + loss(step.rush);
				Node candidate = new Node(next, node.used + 1, reactions, rolls, risk, node, step);
				String key = key(candidate);
				Node prior = best.get(key);
				if (prior == null || compare(candidate, prior) < 0) { best.put(key, candidate); queue.add(candidate); }
			}
		}
		return null;
	}

	private Step step(FieldCoordinate from, FieldCoordinate to, int used) {
		Set<String> reactions = new HashSet<>();
		int dodge = 0;
		boolean inTackleZone = UtilPlayer.findTacklezones(game, player, from) > 0;
		if (!player.hasSkillProperty(NamedProperties.ignoreTacklezonesWhenMoving) && inTackleZone) {
			DodgeModifierFactory modifiers = game.getFactory(FactoryType.Factory.DODGE_MODIFIER);
			dodge = agility.minimumRollDodge(game, player,
				modifiers.findModifiers(new DodgeContext(game, acting, from, to)));
		}
		if (inTackleZone) {
			for (Player<?> opponent : game.getOtherTeam(player.getTeam()).getPlayers()) {
				FieldCoordinate at = game.getFieldModel().getPlayerCoordinate(opponent);
				if (!FieldCoordinateBounds.FIELD.isInBounds(at) || !at.isAdjacent(from)
					|| !game.getFieldModel().getPlayerState(opponent).hasTacklezones()) continue;
				if (dodge > 0 && opponent.hasSkillProperty(NamedProperties.canAttemptToTackleDodgingPlayer))
					reactions.add("Diving Tackle");
				if (opponent.hasSkillProperty(NamedProperties.canHoldPlayersLeavingTacklezones)) reactions.add("Tentacles");
				if (opponent.hasSkillProperty(NamedProperties.canFollowPlayerLeavingTacklezones)) reactions.add("Shadowing");
			}
		}
		int rush = 0;
		if (currentMove + used >= player.getMovementWithModifiers()) {
			GoForItModifierFactory modifiers = game.getFactory(FactoryType.Factory.GO_FOR_IT_MODIFIER);
			rush = DiceInterpreter.getInstance().minimumRollGoingForIt(modifiers.findModifiers(
				new GoForItContext(game, player, state.getPrayerState().getMolesUnderThePitch())));
		}
		return new Step(to, dodge, rush, reactions);
	}

	private boolean occupied(FieldCoordinate coordinate) {
		Player<?> occupant = game.getFieldModel().getPlayer(coordinate);
		return occupant != null && occupant != player;
	}
	private static String key(Node node) { return node.at.getX() + ":" + node.at.getY() + ":" + node.used; }
	private static int compare(Node first, Node second) {
		boolean firstSafe = first.rolls == 0 && first.reactions == 0;
		boolean secondSafe = second.rolls == 0 && second.reactions == 0;
		if (firstSafe != secondSafe) return firstSafe ? -1 : 1;
		int risk = Double.compare(first.risk, second.risk);
		if (risk != 0) return risk;
		int reactions = Integer.compare(first.reactions, second.reactions);
		if (reactions != 0) return reactions;
		int rolls = Integer.compare(first.rolls, second.rolls);
		if (rolls != 0) return rolls;
		int distance = Integer.compare(first.used, second.used);
		if (distance != 0) return distance;
		int x = Integer.compare(first.at.getX(), second.at.getX());
		return x != 0 ? x : Integer.compare(first.at.getY(), second.at.getY());
	}
	private static double loss(int target) {
		return target <= 0 ? 0 : -Math.log(Math.max(1, Math.min(5, 7 - target)) / 6.0);
	}
	private static JsonObject point(FieldCoordinate coordinate) {
		return new JsonObject().add("x", coordinate.getX()).add("y", coordinate.getY());
	}
	private static final class Node {
		final FieldCoordinate at;
		final int used, reactions, rolls;
		final double risk;
		final Node previous;
		final Step step;
		Node(FieldCoordinate at, int used, int reactions, int rolls, double risk, Node previous, Step step) {
			this.at = at; this.used = used; this.reactions = reactions; this.rolls = rolls;
			this.risk = risk; this.previous = previous; this.step = step;
		}
	}
	private static final class Step {
		final FieldCoordinate at;
		final int dodge, rush;
		final Set<String> reactions;
		Step(FieldCoordinate at, int dodge, int rush, Set<String> reactions) {
			this.at = at; this.dodge = dodge; this.rush = rush; this.reactions = reactions;
		}
		JsonObject json() {
			JsonArray hazards = new JsonArray();
			reactions.stream().sorted().forEach(hazards::add);
			return new JsonObject().add("x", at.getX()).add("y", at.getY())
				.add("dodge", dodge).add("rush", rush).add("reactions", hazards);
		}
	}
}
