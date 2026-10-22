package com.fumbbl.ffb.server;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.IJsonOption;
import com.fumbbl.ffb.json.IJsonSerializable;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.net.NetCommandFactory;
import com.fumbbl.ffb.net.commands.ServerCommand;

import java.util.ArrayList;
import java.util.List;

/**
 *
 * @author Kalimar
 */
public class GameLog implements IJsonSerializable {

	private final List<ServerCommand> fServerCommands;
	private List<String> recoveryCommands;
	private long recoveryEpoch;

	private transient int fLastCommitedCommandNr;
	private final transient GameState fGameState;

	public GameLog(GameState pGameState) {
		fGameState = pGameState;
		fServerCommands = new ArrayList<>();
	}

	public void add(ServerCommand pServerCommand) {
		if (pServerCommand != null) {
			synchronized (fServerCommands) {
				if (pServerCommand.isReplayable()) {
					fServerCommands.add(pServerCommand);
				}
			}
		}
	}

	public ServerCommand[] getServerCommands() {
		synchronized (fServerCommands) {
			return fServerCommands.toArray(new ServerCommand[fServerCommands.size()]);
		}
	}

	public ServerCommand[] getUncommitedServerCommands() {
		List<ServerCommand> uncommitedCommands = new ArrayList<>();
		synchronized (fServerCommands) {
			for (ServerCommand serverCommand : fServerCommands) {
				if (serverCommand.getCommandNr() > fLastCommitedCommandNr) {
					uncommitedCommands.add(serverCommand);
				}
			}
		}
		return uncommitedCommands.toArray(new ServerCommand[uncommitedCommands.size()]);
	}

	public int findMaxCommandNr() {
		int maxCommandNr = 0;
		synchronized (fServerCommands) {
			for (ServerCommand serverCommand : fServerCommands) {
				if (serverCommand.getCommandNr() > maxCommandNr) {
					maxCommandNr = serverCommand.getCommandNr();
				}
			}
		}
		return maxCommandNr;
	}

	public void setLastCommitedCommandNr(int pLastCommitedCommandNr) {
		synchronized (fServerCommands) {
			fLastCommitedCommandNr = pLastCommitedCommandNr;
		}
	}

	public int getLastCommitedCommandNr() {
		synchronized (fServerCommands) {
			return fLastCommitedCommandNr;
		}
	}

	public void clear() {
		synchronized (fServerCommands) {
			fServerCommands.clear();
			if (recoveryCommands != null) recoveryCommands.clear();
			recoveryEpoch++;
		}
	}

	/** Browser recovery only: freeze new committed command JSON without changing live engine references. */
	public JsonObject recoveryJsonFrom(int from) {
		synchronized (fServerCommands) {
			if (from < 0 || from > fServerCommands.size()) throw new IllegalArgumentException("Invalid recovery log cursor");
			if (recoveryCommands == null) recoveryCommands = new ArrayList<>();
			for (int index = recoveryCommands.size(); index < fServerCommands.size(); index++)
				recoveryCommands.add(fServerCommands.get(index).toJsonValue().toString());
			JsonArray tail = new JsonArray();
			for (int index = from; index < recoveryCommands.size(); index++) tail.add(JsonObject.readFrom(recoveryCommands.get(index)));
			return new JsonObject().add("commandArray", tail);
		}
	}

	/** A reset invalidates append-only recovery cursors even when the replacement has the same length. */
	public long recoveryEpoch() { synchronized (fServerCommands) { return recoveryEpoch; } }

	/** Preserve the stored prefix verbatim after the caller has validated the native deserialization round trip. */
	public void restoreRecoveryJson(JsonObject saved) {
		synchronized (fServerCommands) {
			JsonArray commands = saved.get("commandArray").asArray();
			if (commands.size() != fServerCommands.size()) throw new IllegalArgumentException("Recovery log boundary mismatch");
			recoveryCommands = new ArrayList<>(commands.size());
			for (JsonValue command : commands) recoveryCommands.add(command.toString());
			recoveryEpoch++;
		}
	}

	public int size() {
		synchronized (fServerCommands) {
			return fServerCommands.size();
		}
	}

	public GameState getGameState() {
		return fGameState;
	}

	// JSON serialization

	public JsonObject toJsonValue() {
		JsonObject jsonObject = new JsonObject();
		JsonArray commandArray = new JsonArray();
		for (ServerCommand serverCommand : getServerCommands()) {
			commandArray.add(serverCommand.toJsonValue());
		}
		IJsonOption.COMMAND_ARRAY.addTo(jsonObject, commandArray);
		return jsonObject;
	}

	public GameLog initFrom(IFactorySource source, JsonValue jsonValue) {
		NetCommandFactory netCommandFactory = new NetCommandFactory(fGameState.getServer().getFactorySource());
		JsonObject jsonObject = UtilJson.toJsonObject(jsonValue);
		JsonArray commandArray = IJsonOption.COMMAND_ARRAY.getFrom(source, jsonObject);
		clear();
		for (int i = 0; i < commandArray.size(); i++) {
			ServerCommand serverCommand = (ServerCommand) netCommandFactory.forJsonValue(source, commandArray.get(i));
			add(serverCommand);
		}
		return this;
	}

}
