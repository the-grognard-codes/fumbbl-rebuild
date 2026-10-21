package com.fumbbl.ffb.server.step.bb2025.block;

import com.fumbbl.ffb.CatchScatterThrowInMode;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.SkillUse;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.SkillMechanic;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.report.ReportSkillUse;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.step.AbstractStep;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.action.block.UtilBlockSequence;
import com.fumbbl.ffb.server.util.UtilServerPushback;
import com.fumbbl.ffb.util.UtilCards;

/** BB2025 pushback setup with account policy applied before any ball-drop effects. */
public final class PushbackInitialization {
	public PushbackInitialization() { }

	/** Returns null while an eligible Strip Ball decision is pending. */
	public Boolean chooseStripBall(AbstractStep step) {
		if (!step.getGameState().getOptionalSkillUse().enabled()) return Boolean.TRUE;
		Game game = step.getGameState().getGame();
		ActingPlayer actingPlayer = game.getActingPlayer();
		Player<?> defender = game.getDefender();
		Skill stripBall = actingPlayer.getPlayer().getSkillWithProperty(NamedProperties.forceOpponentToDropBallOnPushback);
		if (stripBall == null || defender == null || defender.getTeam() == actingPlayer.getPlayer().getTeam()) return Boolean.TRUE;
		FieldCoordinate defenderCoordinate = game.getFieldModel().getPlayerCoordinate(defender);
		if (defenderCoordinate == null || !defenderCoordinate.equals(game.getFieldModel().getBallCoordinate())) return Boolean.TRUE;
		Skill counter = UtilCards.getSkillCancelling(defender, stripBall);
		SkillMechanic mechanic = (SkillMechanic) game.getFactory(FactoryType.Factory.MECHANIC)
			.forName(Mechanic.Type.SKILL.name());
		if (counter != null && mechanic.canPreventStripBall(game.getFieldModel().getPlayerState(defender))) return Boolean.TRUE;
		return step.getGameState().getOptionalSkillUse().choice(step, UseCase.STRIP_BALL, actingPlayer.getPlayer(), stripBall);
	}

	public StepParameterSet initPushback(AbstractStep step, boolean useStripBall) {
		if (!step.getGameState().getOptionalSkillUse().enabled()) return UtilBlockSequence.initPushback(step);
		StepParameterSet parameters = new StepParameterSet();
		Game game = step.getGameState().getGame();
		SkillMechanic mechanic = (SkillMechanic) game.getFactory(FactoryType.Factory.MECHANIC)
			.forName(Mechanic.Type.SKILL.name());
		ActingPlayer actingPlayer = game.getActingPlayer();
		FieldCoordinate attackerCoordinate = game.getFieldModel().getPlayerCoordinate(actingPlayer.getPlayer());
		FieldCoordinate defenderCoordinate = game.getFieldModel().getPlayerCoordinate(game.getDefender());
		game.getFieldModel().clearPushbackSquares();
		parameters.add(new StepParameter(StepParameterKey.STARTING_PUSHBACK_SQUARE,
			UtilServerPushback.findStartingSquare(attackerCoordinate, defenderCoordinate, game.isHomePlaying())));
		Skill stripBall = actingPlayer.getPlayer().getSkillWithProperty(NamedProperties.forceOpponentToDropBallOnPushback);
		if (useStripBall && stripBall != null && defenderCoordinate.equals(game.getFieldModel().getBallCoordinate())
			&& game.getDefender().getTeam() != actingPlayer.getPlayer().getTeam()) {
			Skill counter = UtilCards.getSkillCancelling(game.getDefender(), stripBall);
			if (counter != null && mechanic.canPreventStripBall(game.getFieldModel().getPlayerState(game.getDefender()))) {
				step.getResult().addReport(new ReportSkillUse(game.getDefenderId(), counter, true, SkillUse.CANCEL_STRIP_BALL));
			} else {
				step.getResult().addReport(new ReportSkillUse(actingPlayer.getPlayerId(), stripBall, true, SkillUse.STEAL_BALL));
				parameters.add(new StepParameter(StepParameterKey.CATCH_SCATTER_THROW_IN_MODE, CatchScatterThrowInMode.SCATTER_BALL));
				parameters.add(new StepParameter(StepParameterKey.BALL_KNOCKED_LOSE, true));
				if (counter != null && !game.getFieldModel().getPlayerState(game.getDefender()).hasTacklezones()) {
					step.getResult().addReport(new ReportSkillUse(game.getDefenderId(), counter, false, SkillUse.NO_TACKLEZONE));
				}
			}
		}
		return parameters;
	}
}
