package com.fumbbl.ffb.net.commands;

import com.fumbbl.ffb.FactoryType.FactoryContext;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.IJsonOption;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.net.NetCommand;
import com.fumbbl.ffb.net.NetCommandId;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
/**
 *
 * @author Kalimar
 */
public abstract class ClientCommand extends NetCommand {

	public FactoryContext getContext() { return FactoryContext.GAME; }

	// JSON serialization

	public JsonObject toJsonValue() {
		JsonObject jsonObject = new JsonObject();
		IJsonOption.NET_COMMAND_ID.addTo(jsonObject, getId());
		return jsonObject;
	}

	public ClientCommand initFrom(IFactorySource source, JsonValue jsonValue) {
		JsonObject jsonObject = UtilJson.toJsonObject(jsonValue);
		UtilNetCommand.validateCommandId(this, (NetCommandId) IJsonOption.NET_COMMAND_ID.getFrom(source, jsonObject));
		return this;
	}

}
