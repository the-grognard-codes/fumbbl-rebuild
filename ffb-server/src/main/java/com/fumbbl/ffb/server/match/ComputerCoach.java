package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

/** Immutable policy identity, pinned when a computer match is created. */
public final class ComputerCoach {

	public final String opponentId;
	public final String policyVersion;
	public final long seed;

	public ComputerCoach(String opponentId, String policyVersion, long seed) throws IllegalArgumentException {
		if (!(ComputerOpponentService.BUGMAN_ID.equals(opponentId) && "random-v1".equals(policyVersion)
			|| ComputerOpponentService.BOGRUK_ID.equals(opponentId) && "bogruk-v1".equals(policyVersion))
			|| seed < 0 || seed > 0xffffffffL) throw new IllegalArgumentException("Unsupported computer policy");
		this.opponentId = opponentId;
		this.policyVersion = policyVersion;
		this.seed = seed;
	}

	public ComputerCoach(JsonObject value) throws IllegalArgumentException {
		this(value.getString("opponentId", null), value.getString("policyVersion", null), value.get("seed").asLong());
		if (value.size() != 4 || value.getInt("version", -1) != 1)
			throw new IllegalArgumentException("Unsupported computer identity");
	}

	public JsonObject json() {
		return new JsonObject().add("version", 1).add("opponentId", opponentId)
			.add("policyVersion", policyVersion).add("seed", seed);
	}
}
