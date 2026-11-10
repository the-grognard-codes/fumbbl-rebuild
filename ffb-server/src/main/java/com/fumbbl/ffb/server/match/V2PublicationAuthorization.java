package com.fumbbl.ffb.server.match;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/** A single local snapshot for a bounded publication; never a provider verification or an incoming grant. */
public interface V2PublicationAuthorization {
	int MAX_TARGETS = 16;
	enum Family { STATE, CHAT, PREPARATION }
	enum Audience { PLAYER, SPECTATOR, COMPUTER }
	record Target(AuthenticatedPrincipal principal, Audience audience) {
		public Target {
			if (audience == null || (principal == null) != (audience == Audience.COMPUTER)) throw new IllegalArgumentException("Publication identity required");
		}
	}
	record Snapshot(Map<Integer, String> roles) {
		public Snapshot { roles = Map.copyOf(roles); }
		public String role(int slot) { return roles.get(slot); }
	}
	Snapshot authorizePublication(String matchId, Family family, List<Target> targets) throws SQLException;
}
