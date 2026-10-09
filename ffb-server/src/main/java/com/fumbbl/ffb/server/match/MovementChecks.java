package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.MoveSquare;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.PickupModifierFactory;
import com.fumbbl.ffb.mechanics.AgilityMechanic;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.modifiers.PickupContext;
import com.fumbbl.ffb.modifiers.PickupModifier;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.bb2025.shared.StepSteadyFooting;
import com.fumbbl.ffb.util.UtilCards;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.HashSet;
import java.util.Set;

/** Public entry checks; conditional reactions describe eligibility, never hidden results. */
final class MovementChecks {
    private final GameState state;
    private final Game game;
    private final Player<?> player;

    MovementChecks(GameState state) {
        this(state, state.getGame().getActingPlayer().getPlayer());
    }

    MovementChecks(GameState state, Player<?> player) {
        this.state = state;
        game = state.getGame();
        this.player = player;
    }

    Forecast at(FieldCoordinate from, FieldCoordinate to, boolean dodging, int rush, MoveSquare jump, boolean ballHandled) {
        Forecast result = new Forecast();
        boolean jumping = jump != null;
		if ((dodging && UtilPlayer.findEligibleDivingTacklers(game, player, from, to,
            NamedProperties.canAttemptToTackleDodgingPlayer).length > 0)
            || (jumping && !UtilCards.hasSkillToCancelProperty(player, NamedProperties.canAttemptToTackleJumpingPlayer)
				&& UtilPlayer.findEligibleDivingTacklers(game, player, from, to, NamedProperties.canAttemptToTackleJumpingPlayer).length > 0))
            result.reaction("Diving Tackle");
		if ((dodging || jumping) && UtilPlayer.findAdjacentOpposingPlayersWithProperty(game, player, from,
			NamedProperties.canHoldPlayersLeavingTacklezones, false, false).length > 0) result.reaction("Tentacles");
        if (!jumping && game.getTurnMode() != TurnMode.KICKOFF_RETURN
            && !player.hasSkillProperty(NamedProperties.movesRandomly)) {
			Player<?>[] opponents = UtilPlayer.filterThrower(game, UtilPlayer.findAdjacentOpposingPlayersWithProperty(
				game, player, from, NamedProperties.canFollowPlayerLeavingTacklezones, true, false));
            if (game.getTurnMode() == TurnMode.DUMP_OFF) opponents = UtilPlayer.filterAttackerAndDefender(game, opponents);
            for (Player<?> opponent : opponents) if (opponent.getMovementWithModifiers() > state.shadowingCount(opponent.getId())) {
                result.reaction("Shadowing"); break;
            }
        }
        if (jumping) result.add("Jump", required(jump.getMinimumRollDodge()), "entry");
        if (!ballHandled && game.getFieldModel().isBallInPlay() && game.getFieldModel().isBallMoving()
            && to.equals(game.getFieldModel().getBallCoordinate())) {
            result.ballContact = true;
            if (player.hasSkillProperty(NamedProperties.preventHoldBall) || player.hasSkillProperty(NamedProperties.preventPickup)
                || !game.getFieldModel().getPlayerState(player).hasTacklezones()) result.add("Ball scatter", null, "entry");
            else {
                PickupModifierFactory modifiers = game.getFactory(FactoryType.Factory.PICKUP_MODIFIER);
                AgilityMechanic agility = game.getMechanic(Mechanic.Type.AGILITY);
                Set<PickupModifier> pickupModifiers = modifiers.findModifiers(new PickupContext(game, player, to));
                ActingPlayer acting = game.getActingPlayer();
                int minimum = acting.getPlayer() == player && acting.getPlayerAction() == PlayerAction.SECURE_THE_BALL
                    ? agility.minimumRoll(2, pickupModifiers) : agility.minimumRollPickup(player, pickupModifiers);
                result.pickupTarget = required(minimum);
                result.add("Pickup", result.pickupTarget, "entry");
            }
        }
        if ((dodging || jumping || rush > 0) && player.hasSkillProperty(NamedProperties.canAvoidFallingDown)) {
            PlayerState status = game.getFieldModel().getPlayerState(player);
            if (!status.isHypnotized() && !status.isConfused() && !status.isProneOrStunned()
                && status.getBase() != PlayerState.HIT_ON_GROUND) result.add("Steady Footing", StepSteadyFooting.MINIMUM_ROLL, "fall");
        }
        return result;
    }

    private int required(int minimum) { return DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(minimum); }

    static final class Forecast {
        final JsonArray checks = new JsonArray();
        final Set<String> reactions = new HashSet<>();
        boolean ballContact;
        int pickupTarget;

        void reaction(String name) { reactions.add(name); add(name, null, "possible"); }
        void add(String name, Integer target, String condition) {
            checks.add(new JsonObject().add("name", name).add("target", target == null ? JsonValue.NULL : JsonValue.valueOf(target))
                .add("condition", condition));
        }
    }
}
