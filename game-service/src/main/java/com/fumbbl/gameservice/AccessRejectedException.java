package com.fumbbl.gameservice;

/** Deliberately data-free failure suitable for protocol and audit decisions. */
public final class AccessRejectedException extends Exception {
	public enum Reason { EXPIRED, DISABLED, REVOKED, FORBIDDEN, REJECTED }
	private final Reason reason;

	AccessRejectedException(Reason reason) { this.reason = reason; }
	public Reason reason() { return reason; }
}
