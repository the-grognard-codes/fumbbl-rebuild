package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.ApothecaryType;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.SeriousInjury;
import com.fumbbl.ffb.bb2020.InjuryDescription;
import com.fumbbl.ffb.dialog.DialogApothecaryChoiceParameter;
import com.fumbbl.ffb.dialog.DialogUseApothecaryParameter;
import com.fumbbl.ffb.dialog.DialogUseApothecariesParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.net.commands.ClientCommandApothecaryChoice;
import com.fumbbl.ffb.net.commands.ClientCommandUseApothecary;
import com.fumbbl.ffb.net.commands.ClientCommandUseApothecaries;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ApothecaryPresentationTest {
	private final InjuryPresentation presentation = new InjuryPresentation();

	@Test void namesSimpleOutcomesAndRulesetInjuriesWithTheirEffects() {
		assertEquals("Knocked Out", presentation.injury(new PlayerState(PlayerState.KNOCKED_OUT), null));
		assertEquals("Badly Hurt", presentation.injury(new PlayerState(PlayerState.BADLY_HURT), null));
		assertEquals("Dead", presentation.injury(new PlayerState(PlayerState.RIP), com.fumbbl.ffb.bb2025.SeriousInjury.DEAD));
		assertEquals("Broken Ribs (MNG)", injury(com.fumbbl.ffb.bb2016.SeriousInjury.BROKEN_RIBS));
		assertEquals("Poisoned (MNG)", injury(com.fumbbl.ffb.bb2016.SeriousInjury.POISONED));
		assertEquals("Damaged Back (Niggling Injury, MNG)", injury(com.fumbbl.ffb.bb2016.SeriousInjury.DAMAGED_BACK));
		assertEquals("Smashed Hip (-1MA, MNG)", injury(com.fumbbl.ffb.bb2016.SeriousInjury.SMASHED_HIP));
		assertEquals("Seriously Hurt (MNG)", injury(com.fumbbl.ffb.bb2020.SeriousInjury.SERIOUSLY_HURT));
		assertEquals("Head Injury (-1AV, MNG)", injury(com.fumbbl.ffb.bb2020.SeriousInjury.HEAD_INJURY));
		assertEquals("Serious Injury (Niggling Injury, MNG)", injury(com.fumbbl.ffb.bb2025.SeriousInjury.SERIOUS_INJURY));
		assertEquals("Dislocated Hip (-1AG, MNG)", injury(com.fumbbl.ffb.bb2025.SeriousInjury.DISLOCATED_HIP));
	}

	@Test void initialDecisionKeepsChoiceOrderAndCommandIdentity() {
		GameState state = stateWithInjuredPlayer();
		Game game = state.getGame();
		PlayerState injuryState = new PlayerState(PlayerState.SERIOUS_INJURY);
		when(game.getDialogParameter()).thenReturn(new DialogUseApothecaryParameter("injured", injuryState,
			com.fumbbl.ffb.bb2020.SeriousInjury.HEAD_INJURY,
			Arrays.asList(ApothecaryType.TEAM, ApothecaryType.WANDERING, ApothecaryType.PLAGUE)));

		List<Action> actions = new CorePromptActions(state).actions();
		assertEquals(4, actions.size());
		assertEquals("Accept Head Injury (-1AV, MNG)", actions.get(0).label);
		assertEquals("Use Apothecary", actions.get(1).label);
		assertEquals("Use Wandering Apothecary", actions.get(2).label);
		assertEquals("Use Plague Doctor", actions.get(3).label);
		for (int index = 0; index < actions.size(); index++) {
			Action action = actions.get(index);
			assertEquals(index == 0 ? "apothecary:no" : "apothecary:" + ApothecaryType.values()[index - 1].name(), action.id);
			assertEquals("apothecary", action.kind);
			assertEquals("home", action.role);
			assertEquals("injured", action.targetPlayerId);
			ClientCommandUseApothecary command = (ClientCommandUseApothecary) action.command;
			assertEquals("injured", command.getPlayerId());
			assertEquals(index > 0, command.isApothecaryUsed());
			if (index == 0) assertNull(command.getApothecaryType());
			else assertSame(ApothecaryType.values()[index - 1], command.getApothecaryType());
			assertNull(command.getSeriousInjury());
		}
	}

	@Test void resultChoicePreservesOldAndNewCommandPayloads() {
		GameState state = stateWithInjuredPlayer();
		Game game = state.getGame();
		PlayerState oldState = new PlayerState(PlayerState.SERIOUS_INJURY);
		PlayerState newState = new PlayerState(PlayerState.BADLY_HURT);
		SeriousInjury oldInjury = com.fumbbl.ffb.bb2016.SeriousInjury.DAMAGED_BACK;
		DialogApothecaryChoiceParameter dialog = new DialogApothecaryChoiceParameter("injured", oldState, oldInjury,
			newState, null);
		when(game.getDialogParameter()).thenReturn(dialog);

		List<Action> actions = new CorePromptActions(state).actions();
		assertEquals(2, actions.size());
		assertEquals("injury:old", actions.get(0).id);
		assertEquals("Keep Damaged Back (Niggling Injury, MNG)", actions.get(0).label);
		assertEquals("injury:new", actions.get(1).id);
		assertEquals("Choose Badly Hurt", actions.get(1).label);
		for (int index = 0; index < actions.size(); index++) {
			Action action = actions.get(index);
			assertEquals("apothecary", action.kind);
			assertEquals("home", action.role);
			assertEquals("injured", action.targetPlayerId);
			ClientCommandApothecaryChoice command = (ClientCommandApothecaryChoice) action.command;
			assertEquals("injured", command.getPlayerId());
			assertSame(oldState, command.getOldPlayerState());
			assertSame(index == 0 ? oldState : newState, command.getPlayerState());
			assertSame(index == 0 ? oldInjury : null, command.getSeriousInjury());
		}
	}

	@Test void multipleInjuriesOfferNativeTreatmentPayloadsAndDeclineAll() {
		GameState state = stateWithInjuredPlayer();
		Game game = state.getGame();
		when(game.getTeamHome().getId()).thenReturn("home-team");
		PlayerState firstState = new PlayerState(PlayerState.KNOCKED_OUT);
		PlayerState secondState = new PlayerState(PlayerState.SERIOUS_INJURY);
		SeriousInjury secondInjury = com.fumbbl.ffb.bb2025.SeriousInjury.HEAD_INJURY;
		when(game.getDialogParameter()).thenReturn(new DialogUseApothecariesParameter("home-team", Arrays.asList(
			new InjuryDescription("first", firstState, null, Arrays.asList(ApothecaryType.TEAM, ApothecaryType.WANDERING)),
			new InjuryDescription("second", secondState, secondInjury, Arrays.asList(ApothecaryType.PLAGUE)))));

		List<Action> actions = new CorePromptActions(state).actions();
		assertEquals(4, actions.size());
		assertEquals("apothecaries:no", actions.get(0).id);
		assertEquals("Accept all injuries", actions.get(0).label);
		assertEquals("home", actions.get(0).role);
		assertEquals("apothecary", actions.get(0).kind);
		assertNull(actions.get(0).targetPlayerId);
		ClientCommandUseApothecaries decline = (ClientCommandUseApothecaries) actions.get(0).command;
		assertEquals(0, decline.getInjuryDescriptions().size());

		String[] ids = {"apothecaries:first:TEAM", "apothecaries:first:WANDERING", "apothecaries:second:PLAGUE"};
		String[] labels = {"Use Apothecary: Knocked Out", "Use Wandering Apothecary: Knocked Out",
			"Use Plague Doctor: Head Injury (-1AV, MNG)"};
		ApothecaryType[] types = {ApothecaryType.TEAM, ApothecaryType.WANDERING, ApothecaryType.PLAGUE};
		for (int index = 0; index < ids.length; index++) {
			Action action = actions.get(index + 1);
			assertEquals(ids[index], action.id);
			assertEquals(labels[index], action.label);
			assertEquals("apothecary", action.kind);
			assertEquals("home", action.role);
			assertEquals(index < 2 ? "first" : "second", action.targetPlayerId);
			ClientCommandUseApothecary command = (ClientCommandUseApothecary) action.command;
			assertEquals(index < 2 ? "first" : "second", command.getPlayerId());
			assertEquals(true, command.isApothecaryUsed());
			assertSame(types[index], command.getApothecaryType());
			assertSame(index < 2 ? firstState : secondState, command.getPlayerState());
			assertSame(index < 2 ? null : secondInjury, command.getSeriousInjury());
		}
	}

	private String injury(SeriousInjury injury) {
		return presentation.injury(new PlayerState(PlayerState.SERIOUS_INJURY), injury);
	}

	private GameState stateWithInjuredPlayer() {
		GameState state = mock(GameState.class);
		Game game = mock(Game.class);
		Player<?> player = mock(Player.class);
		Team home = mock(Team.class);
		Team away = mock(Team.class);
		when(state.getGame()).thenReturn(game);
		when(game.getTeamHome()).thenReturn(home);
		when(game.getTeamAway()).thenReturn(away);
		doReturn(player).when(game).getPlayerById("injured");
		when(home.hasPlayer(player)).thenReturn(true);
		return state;
	}
}
