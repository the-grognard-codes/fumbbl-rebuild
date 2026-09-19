package com.fumbbl.ffb.server.match;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.EnumSet;
import java.util.UUID;

/** Marker-6 MariaDB identity, lifecycle and scope authority. Caller must verify Firebase before invoking it. */
public final class JdbcV2PrincipalDirectory implements V2PrincipalDirectory {
	public interface Connections { Connection open() throws SQLException; }
	private final Connections connections;
	private final java.time.Clock clock;

	public JdbcV2PrincipalDirectory(Connections connections, java.time.Clock clock) { this.connections = connections; this.clock = clock; }

	@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws SQLException, V2PrincipalAuthenticator.Rejected {
		requireUnexpired(identity.expiresAtMillis);
		try (Connection connection = connections.open()) {
			String account = account(connection, identity);
			if (account == null) {
				connection.setAutoCommit(false);
				try { account = UUID.randomUUID().toString(); create(connection, identity, account); connection.commit(); }
				catch (SQLException failure) { connection.rollback(); throw failure; }
			}
			return authorize(connection, identity, account);
		}
	}

	@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws SQLException, V2PrincipalAuthenticator.Rejected {
		if (principal == null || principal.issuer() == null || principal.subject() == null) throw new V2PrincipalAuthenticator.Rejected();
		requireUnexpired(principal.expiresAtMillis());
		VerifiedIdentity identity = new VerifiedIdentity(principal.issuer(), principal.subject(), principal.expiresAtMillis(), principal.authenticationTimeMillis());
		try (Connection connection = connections.open()) {
			String account = account(connection, identity);
			if (!principal.accountId().equals(account)) throw new V2PrincipalAuthenticator.Rejected();
			return authorize(connection, identity, account);
		}
	}

	private void requireUnexpired(long expiration) throws V2PrincipalAuthenticator.Rejected {
		if (expiration <= clock.millis()) throw new V2PrincipalAuthenticator.Rejected();
	}

	private AuthenticatedPrincipal authorize(Connection connection, VerifiedIdentity identity, String account) throws SQLException, V2PrincipalAuthenticator.Rejected {
		if (!state(connection, "SELECT state FROM ffb_v2_account WHERE account_id=?", account, null, "ACTIVE")
			|| !state(connection, "SELECT state FROM ffb_v2_identity WHERE issuer=? AND subject=?", identity.issuer, identity.subject, "ACTIVE")) throw new V2PrincipalAuthenticator.Rejected();
		EnumSet<ApplicationScope> scopes = EnumSet.noneOf(ApplicationScope.class);
		try (PreparedStatement query = connection.prepareStatement("SELECT scope FROM ffb_v2_account_scope WHERE account_id=?")) { query.setString(1, account); try (ResultSet rows = query.executeQuery()) { while (rows.next()) try { scopes.add(ApplicationScope.valueOf(rows.getString(1))); } catch (IllegalArgumentException ignored) { } } }
		if (scopes.isEmpty()) throw new V2PrincipalAuthenticator.Rejected();
		return new AuthenticatedPrincipal(account, scopes, identity.expiresAtMillis, identity.issuer, identity.subject, identity.authenticationTimeMillis);
	}

	private String account(Connection connection, VerifiedIdentity identity) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement("SELECT account_id FROM ffb_v2_identity WHERE issuer=? AND subject=?")) { query.setString(1, identity.issuer); query.setString(2, identity.subject); try (ResultSet rows = query.executeQuery()) { return rows.next() ? rows.getString(1) : null; } }
	}
	private void create(Connection connection, VerifiedIdentity identity, String account) throws SQLException {
		try (PreparedStatement a = connection.prepareStatement("INSERT INTO ffb_v2_account(account_id,state) VALUES (?,'ACTIVE')"); PreparedStatement i = connection.prepareStatement("INSERT INTO ffb_v2_identity(issuer,subject,account_id,state) VALUES (?,?,?,'ACTIVE')"); PreparedStatement s = connection.prepareStatement("INSERT INTO ffb_v2_account_scope(account_id,scope) VALUES (?,?)")) {
			a.setString(1, account); a.executeUpdate(); i.setString(1, identity.issuer); i.setString(2, identity.subject); i.setString(3, account); i.executeUpdate();
			for (ApplicationScope scope : new ApplicationScope[] { ApplicationScope.PLAYER, ApplicationScope.SPECTATOR }) { s.setString(1, account); s.setString(2, scope.name()); s.addBatch(); } s.executeBatch();
		}
	}
	private boolean state(Connection connection, String sql, String first, String second, String expected) throws SQLException {
		try (PreparedStatement query = connection.prepareStatement(sql)) { query.setString(1, first); if (second != null) query.setString(2, second); try (ResultSet rows = query.executeQuery()) { return rows.next() && expected.equals(rows.getString(1)); } }
	}
}
