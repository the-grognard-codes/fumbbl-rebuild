package com.fumbbl.ffb.server.match;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Exactly one SQL execution for all current identities, scopes, roles and match metadata. */
final class JdbcV2PublicationAuthorization implements V2PublicationAuthorization {
	private final JdbcV2PrincipalDirectory.Connections connections;
	private final Clock clock;
	private final ComputerOpponentService computers = new ComputerOpponentService(null);
	JdbcV2PublicationAuthorization(JdbcV2PrincipalDirectory.Connections connections, Clock clock) { this.connections = connections; this.clock = clock; }
	@Override public Snapshot authorizePublication(String matchId, Family family, List<Target> targets) throws SQLException {
		if (targets.size() > MAX_TARGETS || family == null) throw new IllegalArgumentException("Publication target bound");
		List<Integer> humans = new ArrayList<>(); boolean computer = false;
		for (int slot = 0; slot < targets.size(); slot++) {
			Target target = targets.get(slot);
			if (target.audience() == Audience.COMPUTER) computer |= family == Family.STATE;
			else if (target.principal().expiresAtMillis() > clock.millis()) humans.add(slot);
		}
		if (humans.isEmpty() && !computer) return new Snapshot(Map.of());
		StringBuilder sql = new StringBuilder();
		if (!humans.isEmpty()) {
			sql.append("SELECT t.slot,m.role,MAX(s.scope='PLAYER') AS player_scope,MAX(s.scope='SPECTATOR') AS spectator_scope,")
				.append("NULL AS document_json,NULL AS document_version,NULL AS computer_account,0 AS registered FROM (");
			for (int index = 0; index < humans.size(); index++) {
				if (index > 0) sql.append(" UNION ALL ");
				sql.append("SELECT ? AS slot,? AS account_id,? AS issuer,? AS subject");
			}
			sql.append(") t JOIN ffb_v2_identity i ON i.issuer=t.issuer AND i.subject=t.subject AND i.account_id=t.account_id AND i.state='ACTIVE'")
				.append(" JOIN ffb_v2_account a ON a.account_id=i.account_id AND a.state='ACTIVE'")
				.append(" JOIN ffb_v2_account_scope s ON s.account_id=a.account_id")
				.append(" LEFT JOIN ffb_v2_match_members m ON m.matchid=? AND m.account_id=a.account_id GROUP BY t.slot,m.role UNION ALL ");
		}
		sql.append("SELECT -1,NULL,0,0,").append(computer ? "p.document_json,p.document_version" : "NULL,NULL")
			.append(",away.account_id,EXISTS(SELECT 1 FROM ffb_v2_match_members registered WHERE registered.matchid=?)")
			.append(" FROM ffb_local_schema marker LEFT JOIN ffb_prepared_matches p ON p.match_id=?")
			.append(" LEFT JOIN ffb_v2_match_members away ON away.matchid=? AND away.role='away'");
		Map<Integer, String> playerRoles = new HashMap<>(); Map<Integer, Boolean> players = new HashMap<>(), spectators = new HashMap<>();
		boolean registered = false, computerAllowed = false, metadata = false;
		try (Connection connection = connections.open(); PreparedStatement query = connection.prepareStatement(sql.toString())) {
			int parameter = 1;
			for (int slot : humans) {
				AuthenticatedPrincipal principal = targets.get(slot).principal();
				query.setInt(parameter++, slot); query.setString(parameter++, principal.accountId());
				query.setString(parameter++, principal.issuer()); query.setString(parameter++, principal.subject());
			}
			if (!humans.isEmpty()) query.setString(parameter++, matchId);
			query.setString(parameter++, matchId); query.setString(parameter++, matchId); query.setString(parameter, matchId);
			try (ResultSet rows = query.executeQuery()) {
				int count = 0;
				while (rows.next()) {
					if (++count > MAX_TARGETS + 1) throw new SQLException("Publication result bound");
					int slot = rows.getInt(1);
					if (slot == -1) {
						if (metadata) throw new SQLException("Duplicate publication metadata");
						metadata = true; registered = rows.getBoolean(8);
						if (computer && computers.memberId().equals(rows.getString(7))) {
							String encoded = rows.getString(5);
							try {
								BoundedJsonStorageCodec codec = new BoundedJsonStorageCodec(BoundedJsonStorageCodec.PREPARED_ENCODED_LIMIT, BoundedJsonStorageCodec.PREPARED_DECODED_LIMIT);
								MatchDocument document = encoded == null ? null : new MatchJson().decode(codec.decode(encoded), rows.getInt(6));
								computerAllowed = document != null && matchId.equals(document.matchId) && computers.coach(document) != null;
							} catch (RuntimeException corrupt) { computerAllowed = false; }
						}
					} else {
						if (!humans.contains(slot) || players.put(slot, rows.getBoolean(3)) != null) throw new SQLException("Invalid publication result slot");
						spectators.put(slot, rows.getBoolean(4)); String role = rows.getString(2);
						if ("home".equals(role) || "away".equals(role)) playerRoles.put(slot, role);
					}
				}
			}
		}
		Map<Integer, String> grants = new HashMap<>();
		if (!metadata) return new Snapshot(grants);
		for (int slot = 0; slot < targets.size(); slot++) {
			Target target = targets.get(slot);
			if (target.audience() == Audience.COMPUTER) { if (computerAllowed && family == Family.STATE) grants.put(slot, "away"); }
			else if (target.principal().expiresAtMillis() > clock.millis()) {
				if (target.audience() == Audience.SPECTATOR && family != Family.PREPARATION && registered && Boolean.TRUE.equals(spectators.get(slot))) grants.put(slot, "spectator");
				else if (target.audience() == Audience.PLAYER && Boolean.TRUE.equals(players.get(slot)) && playerRoles.containsKey(slot)) grants.put(slot, playerRoles.get(slot));
			}
		}
		return new Snapshot(grants);
	}
}
