package com.fumbbl.ffb.server.match;

import java.sql.SQLException;

/** Marker-6 membership store. Existing marker-5 fixture memberships are never inferred or rewritten. */
public interface MatchMembershipRepository {
	MatchMembership find(String matchId, String accountId) throws SQLException;
	boolean hasMatch(String matchId) throws SQLException;
	void insert(MatchMembership membership) throws SQLException;
	default String accountForRole(String matchId, String role) throws SQLException { return null; }
	default java.util.List<String> activeMatches() throws SQLException { return java.util.Collections.emptyList(); }
	default boolean isActive(String matchId) throws SQLException { return activeMatches().contains(matchId); }
}
