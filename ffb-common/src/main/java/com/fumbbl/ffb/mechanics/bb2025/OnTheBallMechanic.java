package com.fumbbl.ffb.mechanics.bb2025;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.model.ActingPlayer;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;

import java.util.HashSet;
import java.util.Set;

@RulesCollection(RulesCollection.Rules.BB2025)
public class OnTheBallMechanic extends com.fumbbl.ffb.mechanics.OnTheBallMechanic {
	@Override
	public Set<Player<?>> findPassBlockers(Game game, Team team) {
		Set<Player<?>> passBlockers = new HashSet<>();
		Player<?>[] players = team.getPlayers();
		for (Player<?> player : players) {
			PlayerState playerState = game.getFieldModel().getPlayerState(player);
			if (player.hasSkillProperty(NamedProperties.canMoveWhenOpponentPasses) && playerState.hasTacklezones()) {
				passBlockers.add(player);
			}
		}
		return passBlockers;
	}

	@Override
	public boolean validPassBlockMove(ActingPlayer actingPlayer, int distance) {
		return distance + actingPlayer.getCurrentMove() <= 3;
	}

	@Override
	public String displayStringPassInterference() {
		return "On The Ball";
	}

	@Override
	public String[] passInterferenceDialogDescription() {
		return new String[] { "You may move your players with ON THE BALL skill up to 3 squares."};
	}

	@Override
	public String passInterferenceStatusDescription() {
		return "Waiting for coach to move players with \"On The Ball\".";
	}

	@Override
	public String displayStringKickOffInterference() {
		return displayStringPassInterference();
	}

	@Override
	public boolean hasReachedValidPosition(Game game, Player<?> player) {
		return true;
	}
}
