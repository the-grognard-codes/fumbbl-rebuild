package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.PlayerChoiceMode;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;
import com.fumbbl.ffb.server.mechanic.SetupMechanic;
import com.fumbbl.ffb.server.step.KickoffAdjustmentBudget;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.util.UtilServerSetup;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

/** Manages one in-memory setup or kick-off stage on the match worker. */
final class SetupStaging {
	static final int SETUP_ADJUSTMENT_LIMIT = 100;

	enum StageEnd { NONE, CONFIRM_POSITIONS, CONFIRM_SELECTION, DISCARD }

	private enum StageKind {
		SETUP(SETUP_ADJUSTMENT_LIMIT), KICKOFF(KickoffAdjustmentBudget.KICKOFF_ADJUSTMENT_LIMIT);

		private final int limit;

		StageKind(int limit) { this.limit = limit; }
	}

	private final GameState state;
	private final MatchDocument document;
	private final Supplier<SetupMechanic> mechanic;
	private final SavedFormationDeployment formations = new SavedFormationDeployment();
	private final StagedPlacements overlay = new StagedPlacements();
	private final Map<String, String> requests = new LinkedHashMap<>();
	private final Set<String> selection = new LinkedHashSet<>();

	SetupStaging(GameState state, MatchDocument document, Supplier<SetupMechanic> mechanic) {
		this.state = state;
		this.document = document;
		this.mechanic = mechanic;
	}

	boolean isStagedRequest(JsonObject request) {
		String operation = request.getString("operation", "");
		if ("place".equals(operation) || "formation".equals(operation)) return true;
		if (!"action".equals(operation) || step() != StepId.APPLY_KICKOFF_RESULT) return false;
		String action = localActionId(request);
		Game game = state.getGame();
		TurnMode mode = game.getTurnMode();
		if (mode == TurnMode.SOLID_DEFENCE) return action.startsWith("solid-place:") || action.startsWith("event-pick:");
		if (mode == TurnMode.QUICK_SNAP || mode == TurnMode.HIGH_KICK)
			return action.startsWith("event-") && !"event-confirm".equals(action);
		return action.startsWith("event-pick:") && game.getDialogParameter() instanceof DialogPlayerChoiceParameter dialog
			&& (dialog.getPlayerChoiceMode() == PlayerChoiceMode.SOLID_DEFENCE
				|| dialog.getPlayerChoiceMode() == PlayerChoiceMode.QUICK_SNAP || dialog.getPlayerChoiceMode() == PlayerChoiceMode.CHARGE);
	}

	boolean duplicate(String key, String fingerprint) {
		String prior = requests.get(key);
		if (prior == null) return false;
		if (!prior.equals(fingerprint)) throw new MatchService.Failure("REQUEST_ID_REUSED");
		return true;
	}

	void stage(String role, JsonObject request, String key, String fingerprint, Supplier<Action> offeredAction) {
		Game game = state.getGame();
		StageKind kind = step() == StepId.SETUP ? StageKind.SETUP : StageKind.KICKOFF;
		boolean home = "home".equals(role);
		Team team = home ? game.getTeamHome() : game.getTeamAway();
		String operation = request.getString("operation", "");
		FieldModel field = game.getFieldModel();
		if (exhausted(kind)) throw new MatchService.Failure("INVALID_OPTION");
		if ("action".equals(operation)) {
			stageKickoffAction(request, offeredAction.get(), team);
		} else {
			if (kind != StageKind.SETUP || game.getTurnMode() != TurnMode.SETUP) throw new MatchService.Failure("WRONG_PHASE");
			overlay.adjust(field, team, () -> {
				if ("formation".equals(operation))
					formations.applyStaged(state, home, frozenTeam(home), request.getInt("formationIndex", -1));
				else new SetupPlayerPlacement(game, role, request).applyStaged(state);
			});
		}
		requests.put(key, fingerprint);
		if (exhausted(kind) && (kind == StageKind.SETUP || game.getTurnMode() == TurnMode.SOLID_DEFENCE)
			&& !setupErrors(kind == StageKind.SETUP ? 0 : state.getKickingSwarmers()).isEmpty()) {
			overlay.revert();
			// Default setup supplies a legal base. With default setup disabled the base can be empty,
			// so deploy a legal formation to keep Confirm usable at the limit.
			if (kind == StageKind.SETUP && !setupErrors(0).isEmpty())
				overlay.adjust(field, team, () -> deployDefault(role, true));
		}
	}

	private void stageKickoffAction(JsonObject request, Action option, Team team) {
		if (request.get("playerIds") != null) throw new MatchService.Failure("INVALID_OPTION");
		if (option.id.startsWith("event-pick:")) {
			if (!selection.remove(option.targetPlayerId)) selection.add(option.targetPlayerId);
			return;
		}
		if (!(option.command instanceof ClientCommandSetupPlayer move)) throw new MatchService.Failure("INVALID_OPTION");
		Game game = state.getGame();
		FieldModel field = game.getFieldModel();
		overlay.adjust(field, team, () -> {
			if (game.getTurnMode() == TurnMode.SOLID_DEFENCE) {
				Player<?> player = game.getPlayerById(move.getPlayerId());
				FieldCoordinate to = option.targetSquare;
				Player<?> occupant = field.getPlayer(to);
				if (occupant != null) field.setPlayerCoordinate(occupant, field.getPlayerCoordinate(player));
				if (FieldCoordinateBounds.FIELD.isInBounds(field.getPlayerCoordinate(player))) {
					field.setPlayerCoordinate(player, to);
					return;
				}
			}
			UtilServerSetup.setupPlayer(state, move.getPlayerId(), move.getCoordinate());
		});
	}

	JsonArray setupErrors(int swarmers) {
		return project(() -> {
			JsonArray errors = new JsonArray();
			mechanic.get().setupErrors(state, state.getGame().isHomePlaying(), swarmers).forEach(errors::add);
			return errors;
		});
	}

	void deployDefault(String role, boolean quiet) {
		boolean home = "home".equals(role);
		formations.applyDefault(state, home, frozenTeam(home), mechanic.get(), quiet);
	}

	/** Future clock enforcement submits this through the durable confirmation path. */
	JsonObject forcedConfirmation(String role, int revision, Supplier<List<Action>> available) {
		Game game = state.getGame();
		JsonObject request = new JsonObject().add("requestId", "stage-timeout-" + revision).add("expectedRevision", revision);
		if (step() == StepId.SETUP) {
			if (!setupErrors(0).isEmpty())
				overlay.adjust(game.getFieldModel(), game.getActingTeam(), () -> deployDefault(role, true));
			return request.add("operation", "confirm");
		}
		String id = switch (game.getTurnMode()) {
			case SOLID_DEFENCE -> {
				if (!setupErrors(state.getKickingSwarmers()).isEmpty()) overlay.revert();
				yield "confirm-solid-defence";
			}
			case QUICK_SNAP, HIGH_KICK -> "end-event";
			default -> selectionConfirmation(available.get());
		};
		return request.add("operation", "action").add("actionId", revision + ":" + id);
	}

	private String selectionConfirmation(List<Action> available) {
		if (available.stream().anyMatch(action -> "event-confirm".equals(action.id))) return "event-confirm";
		if (available.stream().anyMatch(action -> "decline-event".equals(action.id))) return "decline-event";
		throw new MatchService.Failure("WRONG_PHASE");
	}

	<T> T project(Supplier<T> projection) {
		return overlay.project(state.getGame().getFieldModel(), projection);
	}

	/** Classify before preparing a durable command, which can itself change session state. */
	StageEnd stageEnd(JsonObject request, boolean fromActor) {
		StageEnd end = switch (request.getString("operation", "")) {
			case "confirm" -> StageEnd.CONFIRM_POSITIONS;
			case "concede" -> StageEnd.DISCARD;
			case "action" -> switch (localActionId(request)) {
				case "confirm-solid-defence", "end-event" -> StageEnd.CONFIRM_POSITIONS;
				case "event-confirm" -> StageEnd.CONFIRM_SELECTION;
				case "decline-event" -> StageEnd.DISCARD;
				default -> StageEnd.NONE;
			};
			default -> StageEnd.NONE;
		};
		if (end == StageEnd.NONE && fromActor && !requests.isEmpty()) throw new MatchService.Failure("INVALID_OPTION");
		return end;
	}

	private String localActionId(JsonObject request) {
		String id = request.getString("actionId", "");
		return id.substring(id.indexOf(':') + 1);
	}

	void finish(StageEnd end) {
		if (end == StageEnd.NONE) return;
		// event-confirm already carries the validated participant list in its native command.
		if (end == StageEnd.CONFIRM_POSITIONS) overlay.commit(state.getGame().getFieldModel());
		overlay.clear();
		requests.clear();
		selection.clear();
	}

	JsonObject message(String matchId, int revision) {
		// The legacy Solid Defence placement prompt uses the set to choose which player to move.
		Set<String> participants = state.getGame().getTurnMode() == TurnMode.SOLID_DEFENCE ? Set.of() : selection;
		return new StagedPlacementMessage().encode(matchId, revision, sequence(), overlay.squares(), participants);
	}

	int sequence() { return requests.size(); }

	int movedCount() { return overlay.movedCount(); }

	Set<String> selection() { return selection; }

	boolean setupExhausted() { return step() == StepId.SETUP && exhausted(StageKind.SETUP); }

	private boolean exhausted(StageKind kind) { return sequence() >= kind.limit; }

	private StepId step() { return state.getCurrentStep() == null ? StepId.END_GAME : state.getCurrentStep().getId(); }

	private FrozenTeam frozenTeam(boolean home) { return home ? document.home.team : document.away.team; }
}
