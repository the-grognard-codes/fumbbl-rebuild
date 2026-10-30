package com.fumbbl.ffb.dialog;

import com.fumbbl.ffb.INamedObject;

/**
 * @author Kalimar
 */
public enum DialogId implements INamedObject {

	COIN_CHOICE("coinChoice"), RE_ROLL("reRoll"), RE_ROLL_PROPERTIES("reRollProperties"),
	RE_ROLL_FOR_TARGETS("reRollForTargets"), RE_ROLL_BLOCK_FOR_TARGETS("reRollBlockForTargets"), SKILL_USE("skillUse"),
	USE_APOTHECARY("useApothecary"),
	USE_APOTHECARIES("useApothecaries"), USE_MORTUARY_ASSISTANTS("useMortuaryAssistants"),
	RECEIVE_CHOICE("receiveChoice"), FOLLOWUP_CHOICE("followupChoice"), START_GAME("startGame"),
	APOTHECARY_CHOICE("apothecaryChoice"), TOUCHBACK("touchback"), INTERCEPTION("interception"),
	SETUP_ERROR("setupError"), GAME_STATISTICS("gameStatistics"), WINNINGS_RE_ROLL("winningsReRoll"),
	BLOCK_ROLL("blockRoll"), PLAYER_CHOICE("playerChoice"),
	DEFENDER_ACTION("defenderAction"), CONCEDE_GAME("concedeGame"), END_TURN("endTurn"),
	BRIBES("bribes"), PILING_ON("pilingOn"), BUY_INDUCEMENTS("buyInducements"),
	KICK_SKILL("kickSkill"), USE_IGOR("useIgor"), USE_MORTUARY_ASSISTANT("useMortuaryAssistant"),
	KICKOFF_RETURN("kickoffReturn"), SWARMING("swarming"), SWARMING_ERROR("swarmingError"), PETTY_CASH("pettyCash"),
	WIZARD_SPELL("wizardSpell"), USE_INDUCEMENT("useInducement"), PASS_BLOCK("passBlock"), BUY_CARDS("buyCards"),
	BUY_CARDS_AND_INDUCEMENTS("buyCardsAndInducements"), ARGUE_THE_CALL("argueTheCall"), SELECT_BLITZ_TARGET("selectBlitzTarget"),
	OPPONENT_BLOCK_SELECTION("opponentBlockSelection"), PILE_DRIVER("pileDriver"), USE_CHAINSAW("useChainsaw"),
	BLOCK_ROLL_PARTIAL_RE_ROLL("blockRollPartialReRoll"), INVALID_SOLID_DEFENCE("invalidSolidDefence"), SELECT_SKILL("selectSkill"),
	BRIBERY_AND_CORRUPTION_RE_ROLL("briberyAndCorruptionReRoll"), SELECT_GAZE_TARGET("selectGazeTarget"),
	CONFIRM_END_ACTION("confirmEndAction"), SELECT_WEATHER("selectWeather"),
	INFORMATION_OKAY("informationOkay"), KICK_OFF_RESULT("kickOffResult"),
	BLOODLUST_ACTION("bloodlustAction"), PENALTY_SHOOTOUT("penaltyShootout"), BUY_PRAYERS_AND_INDUCEMENTS("buyPrayersAndInducements"),
	BLOCK_ROLL_PROPERTIES("blockRollProperties"), RE_ROLL_BLOCK_FOR_TARGETS_PROPERTIES("reRollBlockForTargetsProperties"),
	OPPONENT_BLOCK_SELECTION_PROPERTIES("opponentBlockSelectionProperties"), PICK_UP_CHOICE("pickUpChoice"), SELECT_KEYWORD("selectKeyword"),
	SELECT_POSITION("selectPosition"), RE_ROLL_REGENERATION_MULTIPLE("reRollRegenerationMultiple"), PUNT_TO_CROWD("puntToCrowd");

	private final String fName;

	DialogId(String pName) {
		fName = pName;
	}

	public String getName() {
		return fName;
	}

}
