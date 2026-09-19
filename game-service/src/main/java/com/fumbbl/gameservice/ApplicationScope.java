package com.fumbbl.gameservice;

/** Application permissions are assigned by this service, never by an identity provider claim. */
public enum ApplicationScope {
	PLAYER,
	SPECTATOR,
	OWNER,
	ADMINISTRATOR
}
