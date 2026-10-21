package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRolledAction;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;

import com.eclipsesource.json.JsonObject;

/** The offered source and roll survive a restart independently of the current preference. */
public final class PendingSkillReroll {
	public final String playerId;
	public final int minimumRoll;
	public final ClientCommandUseReRoll command;

	public PendingSkillReroll(String playerId, int minimumRoll, ReRolledAction action, ReRollSource source) {
		this.playerId = playerId;
		this.minimumRoll = minimumRoll;
		this.command = new ClientCommandUseReRoll(action, source);
	}

	public JsonObject toJson() {
		return new JsonObject().add("playerId", playerId).add("minimumRoll", minimumRoll).add("command", command.toJsonValue());
	}

	public static PendingSkillReroll restore(IFactorySource source, JsonObject saved) {
		ClientCommandUseReRoll command = new ClientCommandUseReRoll().initFrom(source, saved.get("command"));
		return new PendingSkillReroll(saved.get("playerId").asString(), saved.get("minimumRoll").asInt(),
			command.getReRolledAction(), command.getReRollSource());
	}
}
