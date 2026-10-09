package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.Constant;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.MoveSquare;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.DodgeModifierFactory;
import com.fumbbl.ffb.factory.common.GoForItModifierFactory;
import com.fumbbl.ffb.mechanics.AgilityMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.modifiers.DodgeContext;
import com.fumbbl.ffb.modifiers.DodgeModifier;
import com.fumbbl.ffb.modifiers.GoForItContext;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.util.UtilCards;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

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
	private final MovementChecks movementChecks;

	RoutePlanner(GameState state) { this(state, false); }

	RoutePlanner(GameState state, boolean allowJump) {
		this(state, state.getGame().getActingPlayer().getPlayer(), false, allowJump);
	}

	/** A player-specific forecast uses a detached acting context and never selects a player in the game. */
	RoutePlanner(GameState state, Player<?> selected, boolean nextTurn) {
		this(state, selected, nextTurn, false);
	}

	private RoutePlanner(GameState state, Player<?> selected, boolean nextTurn, boolean allowJump) {
		this.state = state;
		game = state.getGame();
		ActingPlayer active = game.getActingPlayer();
		player = selected;
		acting = selected != null && active.getPlayer() == selected && !nextTurn ? active : new ActingPlayer(game);
		if (acting != active && selected != null) acting.setPlayerId(selected.getId());
		movementChecks = new MovementChecks(state, selected);
		if (player == null || (acting.isJumping() && !allowJump) || player.hasSkillProperty(NamedProperties.movesRandomly))
			throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		start = game.getFieldModel().getPlayerCoordinate(player);
		if (!FieldCoordinateBounds.FIELD.isInBounds(start)) throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		PlayerState status = game.getFieldModel().getPlayerState(player);
		int standing = status.getBase() == PlayerState.PRONE && !player.hasSkillProperty(NamedProperties.canStandUpForFree)
			? Math.min(Constant.MINIMUM_MOVE_TO_STAND_UP, player.getMovementWithModifiers()) : 0;
		currentMove = (acting == active && !nextTurn ? active.getCurrentMove() : 0) + standing;
		allowance = player.getMovementWithModifiers() + 2
			+ (player.hasSkillProperty(NamedProperties.canMakeAnExtraGfi) ? 1 : 0)
			+ (UtilCards.hasUnusedSkillWithProperty(acting, NamedProperties.canMakeAnExtraGfiOnce) ? 1 : 0);
		agility = (AgilityMechanic) game.getRules().getFactory(FactoryType.Factory.MECHANIC)
			.forName(Mechanic.Type.AGILITY.name());
	}

	JsonObject range() {
		JsonArray steps = new JsonArray();
		PriorityQueue<Node> queue = new PriorityQueue<>(Comparator.comparing((Node node) -> node, RoutePlanner::compare));
		Map<String, Node> best = new HashMap<>();
		Map<String, Node> squares = new HashMap<>();
		Node root = new Node(start, 0, 0, 0, 0, false, null, null);
		queue.add(root);
		best.put(key(root), root);
		while (!queue.isEmpty()) {
			Node node = queue.remove();
			if (best.get(key(node)) != node) continue;
			if (node.step != null) {
				String square = node.at.getX() + ":" + node.at.getY();
				Node prior = squares.get(square);
				if (prior == null || compare(node, prior) < 0) squares.put(square, node);
			}
			if (currentMove + node.used >= allowance) continue;
			for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
				if (x == 0 && y == 0) continue;
				FieldCoordinate next = node.at.add(x, y);
				if (!FieldCoordinateBounds.FIELD.isInBounds(next) || next.equals(start) || occupied(next)) continue;
				Step step = step(node.at, next, node.used, node.ballHandled, false);
				int reactions = node.reactions + step.reactions.size() + (step.checks.ballContact && step.checks.pickupTarget == 0 ? 1 : 0);
				int rolls = node.rolls + (step.dodge > 0 ? 1 : 0) + (step.rush > 0 ? 1 : 0) + (step.checks.pickupTarget > 0 ? 1 : 0);
				double risk = node.risk + loss(step.dodge) + loss(step.rush) + loss(step.checks.pickupTarget);
				Node candidate = new Node(next, node.used + 1, reactions, rolls, risk, node.ballHandled || step.checks.ballContact, node, step);
				String key = key(candidate);
				Node prior = best.get(key);
				if (prior == null || compare(candidate, prior) < 0) { best.put(key, candidate); queue.add(candidate); }
			}
		}
		List<Node> ordered = new ArrayList<>(squares.values());
		ordered.sort(Comparator.comparingInt((Node node) -> node.at.getY()).thenComparingInt(node -> node.at.getX()));
		for (Node node : ordered) steps.add(node.step.json());
		return new JsonObject().add("rangeVersion", 1).add("playerId", player.getId())
			.add("from", point(start)).add("remaining", Math.max(0, allowance - currentMove)).add("steps", steps);
	}

	JsonObject preview(List<FieldCoordinate> waypoints) {
		if (acting.isJumping()) throw new MatchService.Failure("ROUTE_UNAVAILABLE");
		if (waypoints.isEmpty() || waypoints.size() > 20) throw new MatchService.Failure("INVALID_ROUTE");
		List<Step> path = new ArrayList<>();
		FieldCoordinate from = start;
		for (FieldCoordinate waypoint : waypoints) {
			if (!FieldCoordinateBounds.FIELD.isInBounds(waypoint) || waypoint.equals(from)
				|| occupied(waypoint)) throw new MatchService.Failure("INVALID_ROUTE");
			List<Step> segment = waypoint.isAdjacent(from)
				? (currentMove + path.size() < allowance
					? java.util.Collections.singletonList(step(from, waypoint, path.size(), path.stream().anyMatch(step -> step.checks.ballContact), false)) : null)
				: span(from, waypoint, path.size(), path.stream().anyMatch(step -> step.checks.ballContact));
			if (segment == null) throw new MatchService.Failure("NO_ROUTE");
			path.addAll(segment);
			from = waypoint;
		}
		JsonArray steps = new JsonArray();
		for (Step step : path) steps.add(step.json());
		return new JsonObject().add("routeVersion", 3).add("playerId", player.getId())
			.add("from", point(start)).add("remaining", Math.max(0, allowance - currentMove))
			.add("steps", steps);
	}

	JsonObject emptyPreview() {
		return new JsonObject().add("routeVersion", 3).add("playerId", player.getId())
			.add("from", point(start)).add("remaining", Math.max(0, allowance - currentMove))
			.add("steps", new JsonArray());
	}

	int blitzApproachSteps() {
		return player.getMovementWithModifiers() - currentMove
			+ (player.hasSkillProperty(NamedProperties.canMakeAnExtraGfi) ? 2 : 1);
	}

	/** Choose one reachable adjacent approach with the same ordering as an ordinary route. */
	FieldCoordinate approach(FieldCoordinate target) {
		if (start.isAdjacent(target)) return start;
		PriorityQueue<Node> queue = new PriorityQueue<>(Comparator.comparing((Node node) -> node, RoutePlanner::compare));
		Map<String, Node> best = new HashMap<>();
		Node root = new Node(start, 0, 0, 0, 0, false, null, null);
		queue.add(root);
		best.put(key(root), root);
		while (!queue.isEmpty()) {
			Node node = queue.remove();
			if (best.get(key(node)) != node) continue;
			if (node.at.isAdjacent(target)) return node.at;
			if (node.used >= blitzApproachSteps()) continue;
			for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
				if (x == 0 && y == 0) continue;
				FieldCoordinate next = node.at.add(x, y);
				if (!FieldCoordinateBounds.FIELD.isInBounds(next) || next.equals(start) || occupied(next)) continue;
				Step step = step(node.at, next, node.used, node.ballHandled, false);
				int reactions = node.reactions + step.reactions.size() + (step.checks.ballContact && step.checks.pickupTarget == 0 ? 1 : 0);
				int rolls = node.rolls + (step.dodge > 0 ? 1 : 0) + (step.rush > 0 ? 1 : 0) + (step.checks.pickupTarget > 0 ? 1 : 0);
				double risk = node.risk + loss(step.dodge) + loss(step.rush) + loss(step.checks.pickupTarget);
				Node candidate = new Node(next, node.used + 1, reactions, rolls, risk, node.ballHandled || step.checks.ballContact, node, step);
				String key = key(candidate);
				Node prior = best.get(key);
				if (prior == null || compare(candidate, prior) < 0) { best.put(key, candidate); queue.add(candidate); }
			}
		}
		throw new MatchService.Failure("NO_ROUTE");
	}

	JsonObject adjacent(List<Action> actions) { return adjacent(actions, false); }

	/** Regenerate T08 metadata for strict comparison of an older, durable public view. */
	JsonObject legacyAdjacent(List<Action> actions) { return adjacent(actions, true); }

	private JsonObject adjacent(List<Action> actions, boolean legacy) {
		JsonArray steps = new JsonArray();
		for (Action action : actions) {
			if ("move".equals(action.kind) && action.targetSquare != null && action.targetSquare.isAdjacent(start))
				steps.add(step(start, action.targetSquare, 0, false, legacy).json(legacy));
			else if (!legacy && "jump".equals(action.kind)) for (MoveSquare square : game.getFieldModel().getMoveSquares()) {
				if (!square.getCoordinate().equals(action.targetSquare)) continue;
				int rush = square.getMinimumRollGoForIt() > 0 ? DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(square.getMinimumRollGoForIt()) : 0;
				MovementChecks.Forecast checks = movementChecks.at(start, action.targetSquare, false, rush, square, false);
				steps.add(new Step(action.targetSquare, 0, rush, 0, checks.reactions, checks).json());
			}
		}
		return steps.size() == 0 ? null : new JsonObject().add("version", legacy ? 1 : 2).add("playerId", player.getId()).add("steps", steps);
	}

	private List<Step> span(FieldCoordinate from, FieldCoordinate target, int used, boolean ballHandled) {
		int remaining = allowance - currentMove - used;
		if (remaining <= 0) return null;
		PriorityQueue<Node> queue = new PriorityQueue<>(Comparator.comparing((Node node) -> node, RoutePlanner::compare));
		Map<String, Node> best = new HashMap<>();
		Node root = new Node(from, used, 0, 0, 0, ballHandled, null, null);
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
				Step step = step(node.at, next, node.used, node.ballHandled, false);
				int reactions = node.reactions + step.reactions.size() + (step.checks.ballContact && step.checks.pickupTarget == 0 ? 1 : 0);
				int rolls = node.rolls + (step.dodge > 0 ? 1 : 0) + (step.rush > 0 ? 1 : 0) + (step.checks.pickupTarget > 0 ? 1 : 0);
				double risk = node.risk + loss(step.dodge) + loss(step.rush) + loss(step.checks.pickupTarget);
				Node candidate = new Node(next, node.used + 1, reactions, rolls, risk, node.ballHandled || step.checks.ballContact, node, step);
				String key = key(candidate);
				Node prior = best.get(key);
				if (prior == null || compare(candidate, prior) < 0) { best.put(key, candidate); queue.add(candidate); }
			}
		}
		return null;
	}

	private Step step(FieldCoordinate from, FieldCoordinate to, int used, boolean ballHandled, boolean legacy) {
		Set<String> reactions = new HashSet<>();
		int dodge = 0, dodgeModifier = 0;
		boolean inTackleZone = UtilPlayer.findTacklezones(game, player, from) > 0;
		if (!player.hasSkillProperty(NamedProperties.ignoreTacklezonesWhenMoving) && inTackleZone) {
			DodgeModifierFactory modifiers = game.getFactory(FactoryType.Factory.DODGE_MODIFIER);
			Set<DodgeModifier> applicable = modifiers.findModifiers(new DodgeContext(game, acting, from, to), player);
			dodgeModifier = -applicable.stream().mapToInt(DodgeModifier::getModifier).sum();
			dodge = DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(agility.minimumRollDodge(game, player, applicable));
		}
		if (legacy && inTackleZone) {
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
			rush = DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(DiceInterpreter.getInstance().minimumRollGoingForIt(modifiers.findModifiers(
				new GoForItContext(game, player, state.getPrayerState().getMolesUnderThePitch()))));
		}
		MovementChecks.Forecast checks = legacy ? new MovementChecks.Forecast() : movementChecks.at(from, to, dodge > 0, rush, null, ballHandled);
		return new Step(to, dodge, rush, dodgeModifier, legacy ? reactions : checks.reactions, checks);
	}

	private boolean occupied(FieldCoordinate coordinate) {
		Player<?> occupant = game.getFieldModel().getPlayer(coordinate);
		return occupant != null && occupant != player;
	}
	private static String key(Node node) { return node.at.getX() + ":" + node.at.getY() + ":" + node.used + ":" + node.ballHandled; }
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
		final boolean ballHandled;
		final Node previous;
		final Step step;
		Node(FieldCoordinate at, int used, int reactions, int rolls, double risk, boolean ballHandled, Node previous, Step step) {
			this.at = at; this.used = used; this.reactions = reactions; this.rolls = rolls;
			this.risk = risk; this.ballHandled = ballHandled; this.previous = previous; this.step = step;
		}
	}
	private static final class Step {
		final FieldCoordinate at;
		final int dodge, rush, dodgeModifier;
		final Set<String> reactions;
		final MovementChecks.Forecast checks;
		Step(FieldCoordinate at, int dodge, int rush, int dodgeModifier, Set<String> reactions, MovementChecks.Forecast checks) {
			this.at = at; this.dodge = dodge; this.rush = rush; this.dodgeModifier = dodgeModifier; this.reactions = reactions; this.checks = checks;
		}
		JsonObject json() { return json(false); }
		JsonObject json(boolean legacy) {
			JsonArray hazards = new JsonArray();
			reactions.stream().sorted().forEach(hazards::add);
			JsonObject json = new JsonObject().add("x", at.getX()).add("y", at.getY())
				.add("dodge", dodge).add("rush", rush).add("dodgeModifier", dodgeModifier).add("reactions", hazards);
			if (!legacy) json.add("checks", checks.checks);
			return json;
		}
	}
}
