package com.fumbbl.ffb.server.mechanic.bb2025;

import com.fumbbl.ffb.CommonProperty;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.InjuryAttribute;
import com.fumbbl.ffb.LeaderState;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.ReRollOptions;
import com.fumbbl.ffb.ReRollProperty;
import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.ReRolledAction;
import com.fumbbl.ffb.ReRolledActions;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.bb2025.SeriousInjury;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.factory.mixed.CasualtyModifierFactory;
import com.fumbbl.ffb.inducement.InducementType;
import com.fumbbl.ffb.inducement.Usage;
import com.fumbbl.ffb.injury.context.InjuryContext;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.FieldModel;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.InducementSet;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.model.ZappedPlayer;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.modifiers.bb2020.CasualtyModifier;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.report.ReportReRoll;
import com.fumbbl.ffb.report.bb2025.ReportMascotUsed;
import com.fumbbl.ffb.report.bb2025.ReportTeamCaptainRoll;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.DiceRoller;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.AbstractStepWithReRoll;
import com.fumbbl.ffb.server.step.DeferredReRoll;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepCommandStatus;
import com.fumbbl.ffb.server.step.StepResult;
import com.fumbbl.ffb.server.step.UtilServerSteps;
import com.fumbbl.ffb.server.util.ServerUtilPlayer;
import com.fumbbl.ffb.server.util.UtilServerDialog;
import com.fumbbl.ffb.server.util.UtilServerInducementUse;
import com.fumbbl.ffb.util.UtilCards;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@RulesCollection(RulesCollection.Rules.BB2025)
public class RollMechanic extends com.fumbbl.ffb.server.mechanic.RollMechanic {

	private static final Set<TurnMode> modesProhibitingReRolls = new HashSet<TurnMode>() {{
		add(TurnMode.KICKOFF);
		add(TurnMode.PASS_BLOCK);
		add(TurnMode.DUMP_OFF);
		add(TurnMode.QUICK_SNAP);
		add(TurnMode.BETWEEN_TURNS);
	}};

	private static final Set<ReRolledAction> passiveReRollActions = new HashSet<ReRolledAction>() {{
		add(ReRolledActions.SWOOP_DISTANCE);
		add(ReRolledActions.SWOOP_DIRECTION);
		// This is a workaround, in case of a multi block double self cas if both initial regeneration rolls fail
		// and the then the first roll is rerolled successfully the player state is already set to not-stunned/prone
		// so the pro check would then be positive for the second re-roll
		// the "proper" fix would be to rework the multi apo step again to inject another phase between re-rolling
		// regeneration and apo that is then used to reset the player state
		add(ReRolledActions.REGENERATION);
	}};

	private static final int MASCOT_MINIMUM_ROLL = 4;
	private static final int TEAM_CAPTAIN_MINIMUM_ROLL = 6;
	private final Map<InjuryAttribute, Integer> reductionThresholds = new HashMap<InjuryAttribute, Integer>() {{
		put(InjuryAttribute.MA, 1);
		put(InjuryAttribute.ST, 1);
		put(InjuryAttribute.AG, 6);
		put(InjuryAttribute.PA, 6);
		put(InjuryAttribute.AV, 3);
	}};

	private final List<SeriousInjury> orderedInjuries = new ArrayList<SeriousInjury>() {{
		add(SeriousInjury.HEAD_INJURY);
		add(SeriousInjury.HEAD_INJURY);
		add(SeriousInjury.SMASHED_KNEE);
		add(SeriousInjury.BROKEN_ARM);
		add(SeriousInjury.DISLOCATED_HIP);
		add(SeriousInjury.DISLOCATED_SHOULDER);
	}};

	@Override
	public int[] rollCasualty(DiceRoller diceRoller) {
		return new int[]{diceRoller.rollDice(16), diceRoller.rollDice(6)};
	}

	@Override
	public PlayerState interpretInjuryRoll(Game game, InjuryContext pInjuryContext) {
		PlayerState playerState = null;
		if ((game != null) && (pInjuryContext != null)) {
			int[] injuryRoll = pInjuryContext.getInjuryRoll();
			Player<?> defender = game.getPlayerById(pInjuryContext.getDefenderId());
			if ((defender != null) && defender.hasSkillProperty(NamedProperties.preventDamagingInjuryModifications)) {
				pInjuryContext.clearInjuryModifiers();
			}
			if (injuryRoll == null) {
				// This is a forced injury, for example triggered by the player being eaten
				// We expect an injury being available in the injury context
				playerState = pInjuryContext.getInjury();
			} else {
				boolean isStunty = Arrays.stream(pInjuryContext.getInjuryModifiers())
					.anyMatch(injuryModifier -> injuryModifier.isRegisteredToSkillWithProperty(NamedProperties.isHurtMoreEasily));
				int total = injuryRoll[0] + injuryRoll[1] + pInjuryContext.getInjuryModifierTotal(game);
				boolean hasThickSkull = defender != null && defender.hasSkillProperty(NamedProperties.convertKOToStunOn8);

				if (total == 7 && isStunty) {
					if (hasThickSkull) {
						playerState = new PlayerState(PlayerState.STUNNED);
						defender.getSkillWithProperty(NamedProperties.convertKOToStunOn8).getInjuryModifiers()
							.forEach(pInjuryContext::addInjuryModifier);
					} else {
						playerState = new PlayerState(PlayerState.KNOCKED_OUT);
					}
				} else if ((total == 8) && hasThickSkull && !isStunty) {
					playerState = new PlayerState(PlayerState.STUNNED);
					defender.getSkillWithProperty(NamedProperties.convertKOToStunOn8).getInjuryModifiers()
						.forEach(pInjuryContext::addInjuryModifier);
				} else if ((total == 9) && isStunty) {
					playerState = new PlayerState(PlayerState.BADLY_HURT);
				} else if (total > 9) {
					//noinspection DataFlowIssue
					playerState = null;
				} else if (total > 7) {
					playerState = new PlayerState(PlayerState.KNOCKED_OUT);
				} else {
					playerState = new PlayerState(PlayerState.STUNNED);
				}
			}
		}
		return playerState;
	}

	@Override
	public PlayerState interpretCasualtyRollAndAddModifiers(Game game, InjuryContext injuryContext, Player<?> player,
		boolean useDecayRoll) {
		if (player instanceof ZappedPlayer) {
			return new PlayerState(PlayerState.BADLY_HURT);
		}
		int[] roll = injuryContext.getCasualtyRoll();
		CasualtyModifierFactory factory = game.getFactory(FactoryType.Factory.CASUALTY_MODIFIER);
		Set<CasualtyModifier> casualtyModifiers = factory.findModifiers(player);
		injuryContext.addCasualtyModifiers(casualtyModifiers);
		int modifierSum = casualtyModifiers.stream().mapToInt(CasualtyModifier::getModifier).sum();
		return new PlayerState(mapCasualtyRoll(roll[0] + modifierSum));
	}

	@Override
	public SeriousInjury interpretSeriousInjuryRoll(Game game, InjuryContext injuryContext, boolean useDecay) {
		return interpretSeriousInjuryRoll(game, injuryContext);
	}

	@Override
	public SeriousInjury interpretSeriousInjuryRoll(Game game, InjuryContext injuryContext) {
		int casModifier = injuryContext.casualtyModifiers.stream().mapToInt(CasualtyModifier::getModifier).sum();
		return interpretSeriousInjuryRoll(game, injuryContext, injuryContext.getCasualtyRoll()[0] + casModifier,
			injuryContext.getCasualtyRoll()[1]);
	}

	@Override
	public SeriousInjury interpretSeriousInjuryRoll(Game game, InjuryContext injuryContext, int[] roll) {
		return interpretSeriousInjuryRoll(game, injuryContext, roll[0], roll[1]);
	}

	@Override
	public int multiBlockAttackerModifier() {
		return -2;
	}

	@Override
	public int multiBlockDefenderModifier() {
		return 0;
	}

	private SeriousInjury interpretSeriousInjuryRoll(Game game, InjuryContext injuryContext, int casRoll, int siRoll) {
		if (isSI(casRoll)) {
			return mapSIRoll(game, injuryContext, siRoll);
		}

		if (casRoll >= 11 && casRoll <= 12) {
			return SeriousInjury.SERIOUS_INJURY;
		}

		if (casRoll >= 9 && casRoll <= 10) {
			return SeriousInjury.SERIOUSLY_HURT;
		}

		return null;
	}

	private SeriousInjury mapSIRoll(Game game, InjuryContext injuryContext, int roll) {
		Player<?> defender = game.getPlayerById(injuryContext.getDefenderId());
		SeriousInjury originalInjury = mapSIRoll(roll);
		InjuryAttribute attribute = originalInjury.getInjuryAttribute();

		if (canBeReduced(attribute, currentValue(attribute, defender))) {
			return originalInjury;
		}

		injuryContext.setOriginalSeriousInjury(originalInjury);

		return SeriousInjury.SERIOUSLY_HURT;
	}

	/**
	 * @return current stat value WITHOUT temporary modifiers
	 */
	private int currentValue(InjuryAttribute attribute, Player<?> player) {
		switch (attribute) {
			case MA:
				return player.getMovement();
			case ST:
				return player.getStrength();
			case AG:
				return player.getAgility();
			case PA:
				return player.getPassing();
			case AV:
				return player.getArmour();
			default:
				return 0;
		}
	}

	private boolean isSI(int roll) {
		return roll == 13 || roll == 14;
	}

	@Override
	public int minimumLonerRoll(Player<?> player) {
		return player.getSkillIntValue(NamedProperties.hasToRollToUseTeamReroll);
	}

	@Override
	public int minimumProRoll() {
		return 3;
	}

	@Override
	public boolean askForReRollIfAvailable(GameState gameState, Player<?> player, ReRolledAction reRolledAction,
		int minimumRoll, boolean fumble, Skill modificationSkill, Skill reRollSkill, CommonProperty menuProperty,
		String defaultValueKey, List<String> messages) {
		boolean dialogShown = false;
		Game game = gameState.getGame();
		if (minimumRoll >= 0) {
			ReRollOptions reRollOptions = findReRollOptions(gameState, player, reRolledAction, reRollSkill);

			dialogShown =
				(reRollOptions.canActuallyReRoll() || modificationSkill != null);
			if (dialogShown) {
				Team actingTeam = game.isHomePlaying() ? game.getTeamHome() : game.getTeamAway();
				String playerId = player.getId();
				UtilServerDialog.showDialog(gameState,
					new DialogReRollPropertiesParameter(playerId, reRolledAction, minimumRoll, reRollOptions.getProperties(),
						fumble, reRollOptions.getReRollSkill(), modificationSkill, menuProperty, defaultValueKey, messages),
					!actingTeam.hasPlayer(player));
			}
		}
		return dialogShown;
	}

	@Override
	public StepCommandStatus handleDeferredReRoll(AbstractStepWithReRoll step, ReceivedCommand received) {
		GameState state = step.getGameState();
		Game game = state.getGame();
		DeferredReRoll deferred = step.getDeferredReRoll();
		if (!(game.getDialogParameter() instanceof DialogReRollPropertiesParameter))
			return deferred == null ? null : StepCommandStatus.SKIP_STEP;
		DialogReRollPropertiesParameter dialog = (DialogReRollPropertiesParameter) game.getDialogParameter();
		if (!(received.getCommand() instanceof ClientCommandUseReRoll))
			return deferred == null ? null : StepCommandStatus.SKIP_STEP;
		ClientCommandUseReRoll command = (ClientCommandUseReRoll) received.getCommand();
		if (deferred == null && command.getReRollSource() != ReRollSources.PRO) return null;
		Player<?> player = game.getPlayerById(dialog.getPlayerId());
		boolean authorized = player != null && (game.getTeamHome().hasPlayer(player)
			? UtilServerSteps.checkCommandIsFromHomePlayer(state, received)
			: UtilServerSteps.checkCommandIsFromAwayPlayer(state, received));
		if (!authorized || command.getReRolledAction() != dialog.getReRolledAction()) return StepCommandStatus.SKIP_STEP;
		if (deferred != null) {
			if (deferred.getSuccessful() != null || !deferred.getPlayerId().equals(player.getId())) return StepCommandStatus.SKIP_STEP;
			ReRollSource source = command.getReRollSource();
			boolean permitted = source == null
				|| source == ReRollSources.TEAM_RE_ROLL && dialog.hasProperty(ReRollProperty.TRR)
				|| source == ReRollSources.MASCOT && dialog.hasProperty(ReRollProperty.MASCOT)
				|| source == ReRollSources.MASCOT_TRR && dialog.hasProperty(ReRollProperty.TRR) && dialog.hasProperty(ReRollProperty.MASCOT);
			if (!permitted) return StepCommandStatus.SKIP_STEP;
			boolean successful = source != null && useReRoll(step, source, player);
			if (successful) {
				int roll = state.getDiceRoller().rollSkill();
				successful = DiceInterpreter.getInstance().isSkillRollSuccessful(roll, minimumProRoll());
				step.getResult().addReport(new ReportReRoll(player.getId(), ReRollSources.PRO, successful, roll));
			}
			step.setDeferredReRoll(new DeferredReRoll(player.getId(), successful));
			return StepCommandStatus.EXECUTE_STEP;
		}
		if (!dialog.hasProperty(ReRollProperty.PRO)) return StepCommandStatus.SKIP_STEP;
		step.setReRolledAction(command.getReRolledAction());
		step.setReRollSource(ReRollSources.PRO);
		boolean successful = useReRoll(step, ReRollSources.PRO, player);
		boolean retryAllowed = !successful && dialog.hasProperty(ReRollProperty.LONER)
			&& (dialog.hasProperty(ReRollProperty.TRR) || dialog.hasProperty(ReRollProperty.MASCOT));
		step.setDeferredReRoll(new DeferredReRoll(player.getId(), retryAllowed ? null : successful));
		if (!retryAllowed) return StepCommandStatus.EXECUTE_STEP;
		List<ReRollProperty> properties = new ArrayList<>();
		for (ReRollProperty property : ReRollProperty.values())
			if (property != ReRollProperty.PRO && dialog.hasProperty(property)) properties.add(property);
		UtilServerDialog.showDialog(state, new DialogReRollPropertiesParameter(player.getId(), ReRolledActions.SINGLE_DIE,
			minimumProRoll(), properties, false, null, null, null, null, null), !game.getActingTeam().hasPlayer(player));
		return StepCommandStatus.SKIP_STEP;
	}

	public boolean useReRoll(IStep pStep, ReRollSource reRollSource, Player<?> pPlayer) {
		if (pPlayer == null) {
			throw new IllegalArgumentException("Parameter player must not be null.");
		}
		if (reRollSource == ReRollSources.PRO && pStep instanceof AbstractStepWithReRoll) {
			AbstractStepWithReRoll step = (AbstractStepWithReRoll) pStep;
			DeferredReRoll deferred = step.getDeferredReRoll();
			if (deferred != null && deferred.getSuccessful() != null && deferred.getPlayerId().equals(pPlayer.getId())) {
				step.setDeferredReRoll(null);
				return deferred.getSuccessful();
			}
		}
		boolean successful = false;
		GameState gameState = pStep.getGameState();
		Game game = gameState.getGame();
		StepResult stepResult = pStep.getResult();
		TurnData turnData = game.getTurnData();
		if (reRollSource != null) {

			InducementType mascotType = turnData.getInducementSet().forUsage(Usage.CONDITIONAL_REROLL);
			boolean mascotAvailable = isMascotAvailable(gameState, pPlayer);
			boolean teamSource = Arrays.asList(ReRollSources.TEAM_RE_ROLL, ReRollSources.BRILLIANT_COACHING,
				ReRollSources.LEADER, ReRollSources.PUMP_UP_THE_CROWD, ReRollSources.SHOW_STAR).contains(reRollSource);
			if (teamSource || reRollSource == ReRollSources.MASCOT || reRollSource == ReRollSources.MASCOT_TRR)
				return useTeamSources(pStep, pPlayer, turnData, teamSource || reRollSource == ReRollSources.MASCOT_TRR);

			Skill reRollSourceSkill = reRollSource.getSkill(game);
			if (reRollSourceSkill != null) {
				if (reRollSourceSkill.hasSkillProperty(NamedProperties.canRerollOncePerTurn)) {
					PlayerState playerState = game.getFieldModel().getPlayerState(pPlayer);
					successful = (pPlayer.hasSkillProperty(NamedProperties.canRerollOncePerTurn)
						&& !playerState.hasUsedPro());
					if (successful) {
						game.getFieldModel().setPlayerState(pPlayer, playerState.changeUsedPro(true));
						int proRoll = gameState.getDiceRoller().rollSkill();
						successful = DiceInterpreter.getInstance().isSkillRollSuccessful(proRoll, minimumProRoll());
						stepResult.addReport(new ReportReRoll(pPlayer.getId(), ReRollSources.PRO, successful, proRoll));
						if (!successful &&
							Arrays.asList(ReRollSources.PRO_MASCOT, ReRollSources.PRO_TRR, ReRollSources.PRO_MASCOT_TRR)
								.contains(reRollSource)) {
							boolean proMascot =
								Arrays.asList(ReRollSources.PRO_MASCOT, ReRollSources.PRO_MASCOT_TRR).contains(reRollSource) &&
									mascotAvailable;
							if (proMascot) {
								int mascotRoll = gameState.getDiceRoller().rollDice(6);
								successful = mascotRoll >= MASCOT_MINIMUM_ROLL;
								boolean fallback =
									!successful && reRollSource == ReRollSources.PRO_MASCOT_TRR && turnData.getReRolls() > 0;

								useMascot(stepResult, gameState, mascotRoll, successful, fallback, mascotType, turnData);

								if (successful) {
									if (checkForLoner(pPlayer, gameState, stepResult)) {
										proRoll = gameState.getDiceRoller().rollSkill();
										successful = DiceInterpreter.getInstance().isSkillRollSuccessful(proRoll, minimumProRoll());
										stepResult.addReport(new ReportReRoll(pPlayer.getId(), ReRollSources.PRO, successful, proRoll));
										return successful;
									} else {
										return false;
									}
								} else if (!fallback) {
									return false;
								}
							}

							if (Arrays.asList(ReRollSources.PRO_TRR, ReRollSources.PRO_MASCOT_TRR).contains(reRollSource)) {
								if (useTeamSources(pStep, pPlayer, turnData, true)) {
									proRoll = gameState.getDiceRoller().rollSkill();
									successful = DiceInterpreter.getInstance().isSkillRollSuccessful(proRoll, minimumProRoll());
									stepResult.addReport(new ReportReRoll(pPlayer.getId(), ReRollSources.PRO, successful, proRoll));
									return successful;
								} else {
									return false;
								}
							}
						}
					}
				} else {
					if (reRollSourceSkill.getSkillUsageType().isTrackOutsideActivation()) {
						successful = !pPlayer.isUsed(reRollSourceSkill);
					} else {
						successful = UtilCards.hasSkill(pPlayer, reRollSourceSkill);
					}
					stepResult.addReport(new ReportReRoll(pPlayer.getId(), reRollSource, successful, 0));
				}
				if (reRollSourceSkill.getSkillUsageType().isTrackOutsideActivation()) {
					ActingPlayer actingPlayer = game.getActingPlayer();
					if (actingPlayer.getPlayer() == pPlayer) {
						actingPlayer.markSkillUsed(reRollSourceSkill);
					} else {
						pPlayer.markUsed(reRollSourceSkill, game);
					}
				}
			}
		}
		return successful;
	}

	private void useMascot(StepResult stepResult, GameState gameState, int mascotRoll, boolean successful,
		boolean fallback, InducementType mascotType, TurnData turnData) {
		stepResult.addReport(
			new ReportMascotUsed(gameState.getGame().getActingTeam().getId(), MASCOT_MINIMUM_ROLL, mascotRoll, successful,
				fallback));

		if (!successful || !checkTeamCaptain(stepResult, gameState)) {
			UtilServerInducementUse.useInducement(mascotType, 1, turnData.getInducementSet());
		}
	}

	private boolean checkTeamCaptain(StepResult stepResult, GameState gameState) {

		FieldModel fieldModel = gameState.getGame().getFieldModel();
		if (Arrays.stream(gameState.getGame().getActingTeam().getPlayers())
			.noneMatch(player -> player.hasSkillProperty(NamedProperties.canSaveReRolls) &&
				FieldCoordinateBounds.FIELD.isInBounds(fieldModel.getPlayerCoordinate(player)))) {
			return false;
		}

		int roll = gameState.getDiceRoller().rollDice(6);
		boolean rrSaved = roll >= TEAM_CAPTAIN_MINIMUM_ROLL;
		stepResult.addReport(
			new ReportTeamCaptainRoll(gameState.getGame().getActingTeam().getId(), TEAM_CAPTAIN_MINIMUM_ROLL, roll, rrSaved));
		return rrSaved;
	}

	private boolean useTeamSources(IStep step, Player<?> player, TurnData turnData, boolean allowFallback) {
		GameState state = step.getGameState();
		StepResult result = step.getResult();
		// Expiring native drive sources precede conditional Mascot, then Leader/team.
		if (firstAvailableSpecialReRollSource(turnData) != null && isTeamReRollAvailable(state, player))
			return useGuaranteedTeamReRoll(player, turnData, result, state);
		if (isMascotAvailable(state, player)) {
			InducementType type = turnData.getInducementSet().forUsage(Usage.CONDITIONAL_REROLL);
			int roll = state.getDiceRoller().rollDice(6);
			boolean successful = roll >= MASCOT_MINIMUM_ROLL;
			boolean fallback = !successful && allowFallback && isTeamReRollAvailable(state, player);
			useMascot(result, state, roll, successful, fallback, type, turnData);
			if (successful) return checkForLoner(player, state, result);
			if (!fallback) return false;
		} else if (!allowFallback) return false;
		return isTeamReRollAvailable(state, player) && useGuaranteedTeamReRoll(player, turnData, result, state);
	}

	private boolean useGuaranteedTeamReRoll(Player<?> pPlayer, TurnData turnData, StepResult stepResult,
		GameState gameState) {

		boolean rrSaved = checkTeamCaptain(stepResult, gameState);
		ReRollSource usedReRollSource = findUsedTeamReRollSource(turnData);

		if (!rrSaved) {
			updateTurnDataAfterReRollUsage(turnData, usedReRollSource);
		}

		stepResult.addReport(new ReportReRoll(pPlayer.getId(), usedReRollSource, true, 0));
		return checkForLoner(pPlayer, gameState, stepResult);
	}

	private boolean checkForLoner(Player<?> pPlayer, GameState gameState, StepResult stepResult) {
		if (pPlayer.hasSkillProperty(NamedProperties.hasToRollToUseTeamReroll)) {
			int roll = gameState.getDiceRoller().rollSkill();
			int minimumRoll = minimumLonerRoll(pPlayer);
			boolean successful = DiceInterpreter.getInstance().isSkillRollSuccessful(roll, minimumRoll);
			stepResult.addReport(new ReportReRoll(pPlayer.getId(), ReRollSources.LONER, successful, roll));
			return successful;
		} else {
			return true;
		}
	}

	private ReRollSource findUsedTeamReRollSource(TurnData turnData) {
		ReRollSource fallbackSpecialSource = firstAvailableSpecialReRollSource(turnData);
		if (fallbackSpecialSource != null) {
			return fallbackSpecialSource;
		}
		if (LeaderState.AVAILABLE.equals(turnData.getLeaderState())) {
			return ReRollSources.LEADER;
		}

		return ReRollSources.TEAM_RE_ROLL;
	}

	private void updateTurnDataAfterReRollUsage(TurnData turnData, ReRollSource usedReRollSource) {
		turnData.setReRolls(turnData.getReRolls() - 1);
		if (isSpecialReRollSourceAvailable(turnData, usedReRollSource)) {
			consumeSpecialReRoll(turnData, usedReRollSource);
			return;
		}
		if (ReRollSources.LEADER == usedReRollSource && LeaderState.AVAILABLE.equals(turnData.getLeaderState())) {
			turnData.setLeaderState(LeaderState.USED);
		}
	}

	private ReRollSource firstAvailableSpecialReRollSource(TurnData turnData) {
		if (turnData.getReRollsBrilliantCoachingOneDrive() > 0) {
			return ReRollSources.BRILLIANT_COACHING;
		}
		if (turnData.getReRollsPumpUpTheCrowdOneDrive() > 0) {
			return ReRollSources.PUMP_UP_THE_CROWD;
		}
		if (turnData.getReRollShowStarOneDrive() > 0) {
			return ReRollSources.SHOW_STAR;
		}

		return null;
	}

	private boolean isSpecialReRollSourceAvailable(TurnData turnData, ReRollSource reRollSource) {
		if (ReRollSources.BRILLIANT_COACHING == reRollSource) {
			return turnData.getReRollsBrilliantCoachingOneDrive() > 0;
		}
		if (ReRollSources.PUMP_UP_THE_CROWD == reRollSource) {
			return turnData.getReRollsPumpUpTheCrowdOneDrive() > 0;
		}
		if (ReRollSources.SHOW_STAR == reRollSource) {
			return turnData.getReRollShowStarOneDrive() > 0;
		}

		return false;
	}

	private void consumeSpecialReRoll(TurnData turnData, ReRollSource reRollSource) {
		if (ReRollSources.BRILLIANT_COACHING == reRollSource) {
			turnData.setReRollsBrilliantCoachingOneDrive(turnData.getReRollsBrilliantCoachingOneDrive() - 1);
		} else if (ReRollSources.PUMP_UP_THE_CROWD == reRollSource) {
			turnData.setReRollsPumpUpTheCrowdOneDrive(turnData.getReRollsPumpUpTheCrowdOneDrive() - 1);
		} else if (ReRollSources.SHOW_STAR == reRollSource) {
			turnData.setReRollShowStarOneDrive(turnData.getReRollShowStarOneDrive() - 1);
		}
	}

	@Override
	public boolean allowsTeamReRoll(TurnMode turnMode) {
		return !modesProhibitingReRolls.contains(turnMode);
	}


	@Override
	public boolean isMascotAvailable(GameState pGameState, Player<?> pPlayer) {
		Game game = pGameState.getGame();
		InducementSet inducementSet = game.isHomePlaying() ?
			game.getTurnDataHome().getInducementSet() : game.getTurnDataAway().getInducementSet();

		return Arrays.stream(inducementSet.getInducements())
			.anyMatch(ind -> ind.getType().hasUsage(Usage.CONDITIONAL_REROLL) && ind.getUsesLeft() > 0)
			&& firstAvailableSpecialReRollSource(game.getTurnData()) == null
			&& isTeamReRollAvailable(pGameState, pPlayer, 1);

	}

	private boolean canBeReduced(InjuryAttribute attribute, int currentValue) {
		return currentValue > 0 && reductionThresholds.get(attribute) != currentValue;
	}

	private SeriousInjury mapSIRoll(int roll) {
		return orderedInjuries.get(roll - 1);
	}

	private int mapCasualtyRoll(int roll) {
		if (roll >= 15) {
			return PlayerState.RIP;
		}
		if (roll >= 9) {
			return PlayerState.SERIOUS_INJURY;
		}

		return PlayerState.BADLY_HURT;
	}

	@Override
	public Optional<ReRollProperty> findAdditionalReRollProperty(TurnData turnData) {
		if (turnData.getReRollsBrilliantCoachingOneDrive() > 0) {
			return Optional.of(ReRollProperty.BRILLIANT_COACHING);
		}
		if (turnData.getReRollsPumpUpTheCrowdOneDrive() > 0) {
			return Optional.of(ReRollProperty.PUMP_UP_THE_CROWD);
		}
		if (turnData.getReRollShowStarOneDrive() > 0) {
			return Optional.of(ReRollProperty.SHOW_STAR);
		}
		return Optional.empty();
	}

	@Override
	public int getTotalAttackerStrength(GameState gameState, Player<?> attacker, Player<?> defender,
		boolean usingMultiBlock,
		boolean successfulDauntless, boolean doubleTargetStrength, int defenderStrength) {
		Game game = gameState.getGame();
		int blockStrengthAttacker = getAttackerBaseStrength(game, attacker, defender, usingMultiBlock);

		if (successfulDauntless) {
			blockStrengthAttacker =
				Math.max(blockStrengthAttacker, doubleTargetStrength ? 2 * defenderStrength : defenderStrength);
		}

		ActingPlayer actingPlayer = game.getActingPlayer();

		if (attacker.hasSkillProperty(NamedProperties.addStrengthOnBlitz)
			&& ((actingPlayer.getPlayerAction() == PlayerAction.BLITZ)
			|| (actingPlayer.getPlayerAction() == PlayerAction.BLITZ_MOVE))) {
			blockStrengthAttacker++;
		}

		blockStrengthAttacker =
			ServerUtilPlayer.findBlockStrength(game, attacker, blockStrengthAttacker, defender, usingMultiBlock);


		Set<String> multiBlockTargets = gameState.getGame().getMultiBlockTargets();
		int additionalAssists = gameState.getAdditionalAssist(game.getActingTeam().getId());
		// add additional assist when:
		// - effect is present
		// - either no multi block
		// - or no multiblock target yet selected (we are only showing decorations)
		// - or only this player is selected (also showing decorations but keep the assist for the "first" target)
		// - or two multiblock targets are selected
		//
		// if two players are selected we are actually blocking, so we can simply check for the existing effect as it
		// is removed after the "first" block
		if (!usingMultiBlock || multiBlockTargets.isEmpty() || multiBlockTargets.size() == 2 ||
			multiBlockTargets.size() == 1 && multiBlockTargets.contains(defender.getId())) {
			blockStrengthAttacker += additionalAssists;
		}
		return blockStrengthAttacker;
	}

	@Override
	public int getAttackerBaseStrength(Game game, Player<?> attacker, Player<?> defender, boolean isMultiBlock) {
		int strength = attacker.getStrengthWithModifiers();

		if (isMultiBlock) {
			strength += multiBlockAttackerModifier();
		}

		return Math.max(strength, 1);
	}

	@Override
	public ReRollOptions findReRollOptions(GameState gameState, Player<?> player, ReRolledAction reRolledAction, Skill reRollSkill) {
		Game game = gameState.getGame();
		List<ReRollProperty> properties = new ArrayList<>();
		if (isMascotAvailable(gameState, player)) {
			properties.add(ReRollProperty.MASCOT);
		}
		if (isTeamReRollAvailable(gameState, player)) {
			properties.add(ReRollProperty.TRR);
		}
		findAdditionalReRollProperty(game.getTurnData()).ifPresent(properties::add);

		if (player.hasSkillProperty(NamedProperties.hasToRollToUseTeamReroll)) {
			properties.add(ReRollProperty.LONER);
		}

		if (!passiveReRollActions.contains(reRolledAction) &&
			isProReRollAvailable(player, game, gameState.getPassState())) {
			properties.add(ReRollProperty.PRO);
		}

		if (reRollSkill == null) {
			Optional<Skill> reRollOnce =
				UtilCards.getUnusedSkillWithProperty(player, NamedProperties.canRerollSingleDieOncePerPeriod);
			if (reRollOnce.isPresent()) {
				reRollSkill = reRollOnce.get();
			}
		}

		return new ReRollOptions(properties, reRollSkill);
	}
}
