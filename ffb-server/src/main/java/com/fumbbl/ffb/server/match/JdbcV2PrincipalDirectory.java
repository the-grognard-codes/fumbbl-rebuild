package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.db.JdbcConnections.CommitNotStarted;

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
	@Override public Snapshot authorizePublication(String matchId, Family family, java.util.List<Target> targets) throws SQLException {
		return new JdbcV2PublicationAuthorization(connections, clock).authorizePublication(matchId, family, targets);
	}

	@Override public AuthenticatedPrincipal authenticate(VerifiedIdentity identity) throws SQLException, V2PrincipalAuthenticator.Rejected {
		requireUnexpired(identity.expiresAtMillis);
		try { return authenticateOnce(identity); }
		catch (CreationOutcomeUnknown failure) {
			try {
				AuthenticatedPrincipal durable = existing(identity);
				if (durable != null) return durable;
			} catch (SQLException readback) { failure.addSuppressed(readback); }
			throw failure;
		}
	}
	private AuthenticatedPrincipal existing(VerifiedIdentity identity) throws SQLException, V2PrincipalAuthenticator.Rejected {
		requireUnexpired(identity.expiresAtMillis);
		try (Connection connection = connections.open()) {
			String account = account(connection, identity);
			return account == null ? null : authorize(connection, identity, account);
		}
	}
	private AuthenticatedPrincipal authenticateOnce(VerifiedIdentity identity) throws SQLException, V2PrincipalAuthenticator.Rejected {
		boolean commitAttempted = false;
		try (Connection connection = connections.open()) {
			String account = account(connection, identity);
			if (account == null) {
				connection.setAutoCommit(false);
				try {
					account = UUID.randomUUID().toString(); create(connection, identity, account);
					commitAttempted = true; connection.commit();
				} catch (SQLException failure) {
					try { connection.rollback(); } catch (SQLException rollback) { failure.addSuppressed(rollback); }
					throw failure;
				}
			}
			return authorize(connection, identity, account);
		} catch (SQLException failure) {
			if (commitAttempted && !(failure instanceof CommitNotStarted)) throw new CreationOutcomeUnknown(failure);
			if ("23000".equals(failure.getSQLState()) && failure.getErrorCode() == 1062) {
				try { AuthenticatedPrincipal durable = existing(identity); if (durable != null) return durable; }
				catch (SQLException readback) { failure.addSuppressed(readback); }
			}
			throw failure;
		}
	}

	@Override public AuthenticatedPrincipal reauthorize(AuthenticatedPrincipal principal) throws SQLException, V2PrincipalAuthenticator.Rejected {
		if (principal == null || principal.issuer() == null || principal.subject() == null) throw new V2PrincipalAuthenticator.Rejected();
		requireUnexpired(principal.expiresAtMillis());
		VerifiedIdentity identity = new VerifiedIdentity(principal.issuer(), principal.subject(), principal.expiresAtMillis(), principal.authenticationTimeMillis());
		try (Connection connection = connections.open()) {
			// One current database snapshot per operation, with no permission cache. The join
			// checks identity ownership and both lifecycle states before returning any scope.
			String sql = "SELECT s.scope FROM ffb_v2_identity i"
				+ " JOIN ffb_v2_account a ON a.account_id=i.account_id"
				+ " JOIN ffb_v2_account_scope s ON s.account_id=a.account_id"
				+ " WHERE i.issuer=? AND i.subject=? AND i.account_id=?"
				+ " AND i.state='ACTIVE' AND a.state='ACTIVE'";
			EnumSet<ApplicationScope> scopes = EnumSet.noneOf(ApplicationScope.class);
			try (PreparedStatement query = connection.prepareStatement(sql)) {
				query.setString(1, identity.issuer); query.setString(2, identity.subject); query.setString(3, principal.accountId());
				try (ResultSet rows = query.executeQuery()) {
					while (rows.next()) try { scopes.add(ApplicationScope.valueOf(rows.getString(1))); }
					catch (IllegalArgumentException ignored) { /* Unknown scopes never grant authority. */ }
				}
			}
			if (scopes.isEmpty()) throw new V2PrincipalAuthenticator.Rejected();
			return new AuthenticatedPrincipal(principal.accountId(), scopes, identity.expiresAtMillis,
				identity.issuer, identity.subject, identity.authenticationTimeMillis);
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
