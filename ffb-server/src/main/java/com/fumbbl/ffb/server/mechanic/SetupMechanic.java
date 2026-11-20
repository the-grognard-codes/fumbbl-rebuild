package com.fumbbl.ffb.server.mechanic;

import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.server.GameState;

import java.util.List;

public abstract class SetupMechanic implements Mechanic {
	@Override
	public Type getType() {
		return Type.SETUP;
	}

	public abstract boolean checkSetup(GameState pGameState, boolean pHomeTeam);

	public abstract boolean checkSetup(GameState pGameState, boolean pHomeTeam, int additionalSwarmers);

	/** Check setup legality without publishing the native error dialog. */
	public abstract List<String> setupErrors(GameState gameState, boolean homeTeam, int additionalSwarmers);

	public abstract void pinPlayersInTacklezones(GameState pGameState, Team pTeam);

	public abstract void pinPlayersInTacklezones(GameState pGameState, Team pTeam, boolean pinBallAndChain);


}
