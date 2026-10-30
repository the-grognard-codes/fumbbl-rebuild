package com.fumbbl.ffb.net;

import com.fumbbl.ffb.INamedObject;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandApothecaryChoice;
import com.fumbbl.ffb.net.commands.ClientCommandArgueTheCall;
import com.fumbbl.ffb.net.commands.ClientCommandBlitzMove;
import com.fumbbl.ffb.net.commands.ClientCommandBlock;
import com.fumbbl.ffb.net.commands.ClientCommandBlockChoice;
import com.fumbbl.ffb.net.commands.ClientCommandBlockOrReRollChoiceForTarget;
import com.fumbbl.ffb.net.commands.ClientCommandBloodlustAction;
import com.fumbbl.ffb.net.commands.ClientCommandBuyCard;
import com.fumbbl.ffb.net.commands.ClientCommandBuyInducements;
import com.fumbbl.ffb.net.commands.ClientCommandCoinChoice;
import com.fumbbl.ffb.net.commands.ClientCommandConcedeGame;
import com.fumbbl.ffb.net.commands.ClientCommandConfirm;
import com.fumbbl.ffb.net.commands.ClientCommandEndTurn;
import com.fumbbl.ffb.net.commands.ClientCommandFieldCoordinate;
import com.fumbbl.ffb.net.commands.ClientCommandFollowupChoice;
import com.fumbbl.ffb.net.commands.ClientCommandFoul;
import com.fumbbl.ffb.net.commands.ClientCommandGaze;
import com.fumbbl.ffb.net.commands.ClientCommandHandOver;
import com.fumbbl.ffb.net.commands.ClientCommandIllegalProcedure;
import com.fumbbl.ffb.net.commands.ClientCommandInterceptorChoice;
import com.fumbbl.ffb.net.commands.ClientCommandKeywordSelection;
import com.fumbbl.ffb.net.commands.ClientCommandKickOffResultChoice;
import com.fumbbl.ffb.net.commands.ClientCommandKickTeamMate;
import com.fumbbl.ffb.net.commands.ClientCommandKickoff;
import com.fumbbl.ffb.net.commands.ClientCommandMove;
import com.fumbbl.ffb.net.commands.ClientCommandPass;
import com.fumbbl.ffb.net.commands.ClientCommandPettyCash;
import com.fumbbl.ffb.net.commands.ClientCommandPickUpChoice;
import com.fumbbl.ffb.net.commands.ClientCommandPileDriver;
import com.fumbbl.ffb.net.commands.ClientCommandPlayerChoice;
import com.fumbbl.ffb.net.commands.ClientCommandPositionSelection;
import com.fumbbl.ffb.net.commands.ClientCommandPuntToCrowd;
import com.fumbbl.ffb.net.commands.ClientCommandPushback;
import com.fumbbl.ffb.net.commands.ClientCommandReceiveChoice;
import com.fumbbl.ffb.net.commands.ClientCommandSelectCardToBuy;
import com.fumbbl.ffb.net.commands.ClientCommandSelectWeather;
import com.fumbbl.ffb.net.commands.ClientCommandSetBlockTargetSelection;
import com.fumbbl.ffb.net.commands.ClientCommandSetupPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandSkillSelection;
import com.fumbbl.ffb.net.commands.ClientCommandStartGame;
import com.fumbbl.ffb.net.commands.ClientCommandSwoop;
import com.fumbbl.ffb.net.commands.ClientCommandSynchronousMultiBlock;
import com.fumbbl.ffb.net.commands.ClientCommandTargetSelected;
import com.fumbbl.ffb.net.commands.ClientCommandThrowKeg;
import com.fumbbl.ffb.net.commands.ClientCommandThrowTeamMate;
import com.fumbbl.ffb.net.commands.ClientCommandTouchback;
import com.fumbbl.ffb.net.commands.ClientCommandUnsetBlockTargetSelection;
import com.fumbbl.ffb.net.commands.ClientCommandUseApothecaries;
import com.fumbbl.ffb.net.commands.ClientCommandUseApothecary;
import com.fumbbl.ffb.net.commands.ClientCommandUseBrawler;
import com.fumbbl.ffb.net.commands.ClientCommandUseChainsaw;
import com.fumbbl.ffb.net.commands.ClientCommandUseConsummateReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseFumblerooskie;
import com.fumbbl.ffb.net.commands.ClientCommandUseHatred;
import com.fumbbl.ffb.net.commands.ClientCommandUseIgors;
import com.fumbbl.ffb.net.commands.ClientCommandUseInducement;
import com.fumbbl.ffb.net.commands.ClientCommandUseMultiBlockDiceReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseProReRollForBlock;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRollForTarget;
import com.fumbbl.ffb.net.commands.ClientCommandUseSingleBlockDieReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.net.commands.ClientCommandUseTeamMatesWisdom;
import com.fumbbl.ffb.net.commands.ClientCommandWizardSpell;
import com.fumbbl.ffb.net.commands.ServerCommandAddPlayer;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.net.commands.ServerCommandRemovePlayer;
import com.fumbbl.ffb.net.commands.ServerCommandSound;
import com.fumbbl.ffb.net.commands.ServerCommandUnzapPlayer;
import com.fumbbl.ffb.net.commands.ServerCommandZapPlayer;
/**
 * @author Kalimar
 */
public enum NetCommandId implements INamedObject {


	CLIENT_SETUP_PLAYER("clientSetupPlayer"),
	CLIENT_START_GAME("clientStartGame"),
	CLIENT_ACTING_PLAYER("clientActingPlayer"),
	CLIENT_MOVE("clientMove"),
	CLIENT_BLITZ_MOVE("clientBlitzMove"),
	CLIENT_TARGET_SELECTED("targetSelected"),
	CLIENT_USE_RE_ROLL("clientUseReRoll"),
	CLIENT_USE_RE_ROLL_FOR_TARGET("clientUseReRollForTarget"),
	SERVER_SOUND("serverSound"),
	CLIENT_COIN_CHOICE("clientCoinChoice"),
	CLIENT_RECEIVE_CHOICE("clientReceiveChoice"),
	CLIENT_END_TURN("clientEndTurn"),
	CLIENT_KICKOFF("clientKickoff"),
	CLIENT_TOUCHBACK("clientTouchback"),
	CLIENT_HAND_OVER("clientHandOver"),
	CLIENT_PASS("clientPass"),
	CLIENT_BLOCK("clientBlock"),
	CLIENT_BLOCK_CHOICE("clientBlockChoice"),
	CLIENT_PUSHBACK("clientPushback"),
	CLIENT_USE_CONSUMMATE_RE_ROLL_FOR_BLOCK("clientUseConsummateReRollForBlock"),
	CLIENT_USE_PRO_RE_ROLL_FOR_BLOCK("clientUseProReRollForBlock"),
	CLIENT_FOLLOWUP_CHOICE("clientFollowupChoice"),
	CLIENT_INTERCEPTOR_CHOICE("clientInterceptorChoice"),
	CLIENT_USE_SKILL("clientUseSkill"),
	CLIENT_FOUL("clientFoul"),
	CLIENT_USE_APOTHECARY("clientUseApothecary"),
	CLIENT_APOTHECARY_CHOICE("clientApothecaryChoice"),
	SERVER_MODEL_SYNC("serverModelSync"),
	CLIENT_THROW_TEAM_MATE("clientThrowTeamMate"),
	CLIENT_KICK_TEAM_MATE("clientKickTeamMate"),
	CLIENT_SWOOP("clientSwoop"),
	CLIENT_PLAYER_CHOICE("clientPlayerChoice"),
	CLIENT_ILLEGAL_PROCEDURE("clientIllegalProcedure"),
	CLIENT_CONCEDE_GAME("clientConcedeGame"),
	CLIENT_USE_INDUCEMENT("clientUseInducement"),
	CLIENT_BUY_INDUCEMENTS("clientBuyInducements"),
	SERVER_ADD_PLAYER("serverAddPlayer"),
	SERVER_ZAP_PLAYER("serverZapPlayer"),
	SERVER_UNZAP_PLAYER("serverUnzapPlayer"),
	CLIENT_GAZE("clientGaze"),
	CLIENT_CONFIRM("clientConfirm"),
	CLIENT_PETTY_CASH("clientPettyCash"),
	SERVER_REMOVE_PLAYER("serverRemovePlayer"),
	CLIENT_WIZARD_SPELL("clientWizardSpell"),
	CLIENT_BUY_CARD("clientBuyCard"),
	CLIENT_SELECT_CARD_TO_BUY("clientSelectCardToBuy"),
	CLIENT_ARGUE_THE_CALL("clientArgueTheCall"),
	CLIENT_USE_APOTHECARIES("clientUseApothecaries"),
	CLIENT_USE_IGORS("clientUseIgors"),
	CLIENT_SET_BLOCK_TARGET_SELECTION("clientSetBlockTargetSelection"),
	CLIENT_UNSET_BLOCK_TARGET_SELECTION("clientUnsetBlockTargetSelection"),
	CLIENT_SYNCHRONOUS_MULTI_BLOCK("clientSynchronousMultiBlock"),
	CLIENT_BLOCK_OR_RE_ROLL_CHOICE_FOR_TARGET("clientBlockOrReRollChoiceForTarget"),
	CLIENT_PILE_DRIVER("clientPileDriver"),
	CLIENT_USE_CHAINSAW("clientUseChainsaw"),
	CLIENT_USE_BRAWLER("clientUseBrawler"),
	CLIENT_FIELD_COORDINATE("clientFieldCoordinate"),
	CLIENT_USE_FUMBLEROOSKIE("clientUseFumblerooskie"),
	CLIENT_PRAYER_SELECTION("clientPrayerSelection"),
	CLIENT_USE_TEAM_MATES_WISDOM("clientUseTeamMatesWisdom"),
	CLIENT_THROW_KEG("clientThrowKeg"),
	CLIENT_SELECT_WEATHER("clientSelectWeather"),
	CLIENT_KICK_OFF_RESULT_CHOICE("clientKickOffResultChoice"),
	CLIENT_BLOODLUST_ACTION("clientBloodlustAction"),
	CLIENT_USE_SINGLE_BLOCK_DIE_RE_ROLL("clientUseSingleBlockDieReRoll"),
	CLIENT_USE_MULTI_BLOCK_DICE_RE_ROLL("clientUseMultiBlockDiceReRoll"),
	CLIENT_PICK_UP_CHOICE("clientPickUpChoice"),
	CLIENT_KEYWORD_SELECTION("clientKeywordSelection"),
	CLIENT_USE_HATRED("clientUseHatred"),
	CLIENT_POSITION_SELECTION("clientPositionSelection"),
	CLIENT_PUNT_TO_CROWD("clientPuntToCrowd");

	private final String fName;

	NetCommandId(String pName) {
		fName = pName;
	}

	public String getName() {
		return fName;
	}

	public NetCommand createNetCommand() {
		switch (this) {
			case CLIENT_SETUP_PLAYER:
				return new ClientCommandSetupPlayer();
			case CLIENT_START_GAME:
				return new ClientCommandStartGame();
			case CLIENT_ACTING_PLAYER:
				return new ClientCommandActingPlayer();
			case CLIENT_MOVE:
				return new ClientCommandMove();
			case CLIENT_BLITZ_MOVE:
				return new ClientCommandBlitzMove();
			case CLIENT_TARGET_SELECTED:
				return new ClientCommandTargetSelected();
			case CLIENT_USE_RE_ROLL:
				return new ClientCommandUseReRoll();
			case SERVER_SOUND:
				return new ServerCommandSound();
			case CLIENT_COIN_CHOICE:
				return new ClientCommandCoinChoice();
			case CLIENT_RECEIVE_CHOICE:
				return new ClientCommandReceiveChoice();
			case CLIENT_END_TURN:
				return new ClientCommandEndTurn();
			case CLIENT_KICKOFF:
				return new ClientCommandKickoff();
			case CLIENT_TOUCHBACK:
				return new ClientCommandTouchback();
			case CLIENT_HAND_OVER:
				return new ClientCommandHandOver();
			case CLIENT_PASS:
				return new ClientCommandPass();
			case CLIENT_BLOCK:
				return new ClientCommandBlock();
			case CLIENT_BLOCK_CHOICE:
				return new ClientCommandBlockChoice();
			case CLIENT_PUSHBACK:
				return new ClientCommandPushback();
			case CLIENT_FOLLOWUP_CHOICE:
				return new ClientCommandFollowupChoice();
			case CLIENT_INTERCEPTOR_CHOICE:
				return new ClientCommandInterceptorChoice();
			case CLIENT_USE_SKILL:
				return new ClientCommandUseSkill();
			case CLIENT_FOUL:
				return new ClientCommandFoul();
			case CLIENT_USE_APOTHECARY:
				return new ClientCommandUseApothecary();
			case CLIENT_APOTHECARY_CHOICE:
				return new ClientCommandApothecaryChoice();
			case CLIENT_THROW_TEAM_MATE:
				return new ClientCommandThrowTeamMate();
			case CLIENT_KICK_TEAM_MATE:
				return new ClientCommandKickTeamMate();
			case CLIENT_SWOOP:
				return new ClientCommandSwoop();
			case CLIENT_PLAYER_CHOICE:
				return new ClientCommandPlayerChoice();
			case SERVER_MODEL_SYNC:
				return new ServerCommandModelSync();
			case CLIENT_ILLEGAL_PROCEDURE:
				return new ClientCommandIllegalProcedure();
			case CLIENT_CONCEDE_GAME:
				return new ClientCommandConcedeGame();
			case CLIENT_USE_INDUCEMENT:
				return new ClientCommandUseInducement();
			case CLIENT_BUY_INDUCEMENTS:
				return new ClientCommandBuyInducements();
			case SERVER_ADD_PLAYER:
				return new ServerCommandAddPlayer();
			case SERVER_ZAP_PLAYER:
				return new ServerCommandZapPlayer();
			case SERVER_UNZAP_PLAYER:
				return new ServerCommandUnzapPlayer();
			case CLIENT_GAZE:
				return new ClientCommandGaze();
			case CLIENT_CONFIRM:
				return new ClientCommandConfirm();
			case CLIENT_PETTY_CASH:
				return new ClientCommandPettyCash();
			case SERVER_REMOVE_PLAYER:
				return new ServerCommandRemovePlayer();
			case CLIENT_WIZARD_SPELL:
				return new ClientCommandWizardSpell();
			case CLIENT_BUY_CARD:
				return new ClientCommandBuyCard();
			case CLIENT_SELECT_CARD_TO_BUY:
				return new ClientCommandSelectCardToBuy();
			case CLIENT_ARGUE_THE_CALL:
				return new ClientCommandArgueTheCall();
			case CLIENT_SET_BLOCK_TARGET_SELECTION:
				return new ClientCommandSetBlockTargetSelection();
			case CLIENT_UNSET_BLOCK_TARGET_SELECTION:
				return new ClientCommandUnsetBlockTargetSelection();
			case CLIENT_SYNCHRONOUS_MULTI_BLOCK:
				return new ClientCommandSynchronousMultiBlock();
			case CLIENT_USE_RE_ROLL_FOR_TARGET:
				return new ClientCommandUseReRollForTarget();
			case CLIENT_BLOCK_OR_RE_ROLL_CHOICE_FOR_TARGET:
				return new ClientCommandBlockOrReRollChoiceForTarget();
			case CLIENT_USE_APOTHECARIES:
				return new ClientCommandUseApothecaries();
			case CLIENT_USE_IGORS:
				return new ClientCommandUseIgors();
			case CLIENT_PILE_DRIVER:
				return new ClientCommandPileDriver();
			case CLIENT_USE_CHAINSAW:
				return new ClientCommandUseChainsaw();
			case CLIENT_USE_BRAWLER:
				return new ClientCommandUseBrawler();
			case CLIENT_FIELD_COORDINATE:
				return new ClientCommandFieldCoordinate();
			case CLIENT_USE_FUMBLEROOSKIE:
				return new ClientCommandUseFumblerooskie();
			case CLIENT_USE_PRO_RE_ROLL_FOR_BLOCK:
				return new ClientCommandUseProReRollForBlock();
			case CLIENT_PRAYER_SELECTION:
				return new ClientCommandSkillSelection();
			case CLIENT_USE_CONSUMMATE_RE_ROLL_FOR_BLOCK:
				return new ClientCommandUseConsummateReRollForBlock();
			case CLIENT_USE_TEAM_MATES_WISDOM:
				return new ClientCommandUseTeamMatesWisdom();
			case CLIENT_THROW_KEG:
				return new ClientCommandThrowKeg();
			case CLIENT_SELECT_WEATHER:
				return new ClientCommandSelectWeather();
			case CLIENT_KICK_OFF_RESULT_CHOICE:
				return new ClientCommandKickOffResultChoice();
			case CLIENT_BLOODLUST_ACTION:
				return new ClientCommandBloodlustAction();
			case CLIENT_USE_SINGLE_BLOCK_DIE_RE_ROLL:
				return new ClientCommandUseSingleBlockDieReRoll();
			case CLIENT_USE_MULTI_BLOCK_DICE_RE_ROLL:
				return new ClientCommandUseMultiBlockDiceReRoll();
			case CLIENT_PICK_UP_CHOICE:
				return new ClientCommandPickUpChoice();
			case CLIENT_KEYWORD_SELECTION:
				return new ClientCommandKeywordSelection();
			case CLIENT_USE_HATRED:
				return new ClientCommandUseHatred();
			case CLIENT_POSITION_SELECTION:
				return new ClientCommandPositionSelection();
			case CLIENT_PUNT_TO_CROWD:
				return new ClientCommandPuntToCrowd();
			default:
				throw new IllegalStateException("Unhandled netCommandId " + this + ".");
		}
	}

}
