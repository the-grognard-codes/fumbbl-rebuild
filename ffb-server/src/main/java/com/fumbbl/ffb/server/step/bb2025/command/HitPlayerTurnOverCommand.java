package com.fumbbl.ffb.server.step.bb2025.command;

import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.step.DeferredCommand;
import com.fumbbl.ffb.server.step.DeferredCommandId;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;

import com.eclipsesource.json.JsonObject;

@RulesCollection(RulesCollection.Rules.BB2025)
public class HitPlayerTurnOverCommand extends DeferredCommand {
	private String hitPlayerId;
	private String thrownPlayerId;

	public HitPlayerTurnOverCommand() { }

	public HitPlayerTurnOverCommand(String hitPlayerId, String thrownPlayerId) {
		this.hitPlayerId = hitPlayerId;
		this.thrownPlayerId = thrownPlayerId;
	}

	@Override
	public void execute(IStep step) {
		Game game = step.getGameState().getGame();
		Player<?> hit = game.getPlayerById(hitPlayerId);
		Player<?> thrown = game.getPlayerById(thrownPlayerId);
		if (hit != null) step.getGameState().observeTurnoverReason(
			(game.getActingTeam().hasPlayer(hit) ? "Team-mate " : "Player ") + hit.getName()
				+ " was hit by thrown player " + (thrown == null ? "a team-mate" : thrown.getName()) + ".");
		step.publishParameter(new StepParameter(StepParameterKey.END_TURN, true));
	}

	@Override protected DeferredCommand initChildMember(IFactorySource source, JsonObject json) {
		hitPlayerId = json.getString("hitPlayerId", null);
		thrownPlayerId = json.getString("thrownPlayerId", null);
		return this;
	}

	@Override protected JsonObject addChildMember(JsonObject json) {
		return json.add("hitPlayerId", hitPlayerId).add("thrownPlayerId", thrownPlayerId);
	}

	@Override
	public DeferredCommandId getId() {
		return DeferredCommandId.HIT_PLAYER;
	}

}
