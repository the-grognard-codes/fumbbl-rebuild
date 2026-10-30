package com.fumbbl.ffb.server.net;

import com.fumbbl.ffb.net.NetCommand;
import com.fumbbl.ffb.net.NetCommandId;
/** Native engine command. Browser membership is checked before assigning coach ownership. */
public class ReceivedCommand {
	private final NetCommand command;
	private final Boolean applicationHome;

	/** Unowned commands are confined to trusted diagnostic/engine test fixtures. */
	public ReceivedCommand(NetCommand command) {
		this.command = command;
		applicationHome = null;
	}

	public ReceivedCommand(NetCommand command, boolean home) {
		this.command = command;
		applicationHome = home;
	}

	public Boolean getApplicationHome() { return applicationHome; }
	public NetCommand getCommand() { return command; }
	public NetCommandId getId() { return command.getId(); }
}
