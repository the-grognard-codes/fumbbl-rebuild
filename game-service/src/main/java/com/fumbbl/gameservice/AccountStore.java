package com.fumbbl.gameservice;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/** Durable provider-identity links and application-owned lifecycle/scope decisions. */
public final class AccountStore implements PrincipalDirectory {
	private final String jdbcUrl;
	public AccountStore(String dbPath) {
		jdbcUrl = "jdbc:h2:file:" + dbPath + ";DB_CLOSE_DELAY=-1";
		try (Connection connection = connection()) {
			connection.createStatement().execute("CREATE TABLE IF NOT EXISTS internal_account (account_id VARCHAR(36) PRIMARY KEY)");
			connection.createStatement().execute("CREATE TABLE IF NOT EXISTS game_identity (issuer VARCHAR(255) NOT NULL, subject VARCHAR(255) NOT NULL, account_id VARCHAR(36) NOT NULL REFERENCES internal_account(account_id), PRIMARY KEY (issuer, subject))");
			connection.createStatement().execute("CREATE TABLE IF NOT EXISTS account_lifecycle (account_id VARCHAR(36) PRIMARY KEY REFERENCES internal_account(account_id), state VARCHAR(16) NOT NULL)");
			connection.createStatement().execute("CREATE TABLE IF NOT EXISTS identity_lifecycle (issuer VARCHAR(255) NOT NULL, subject VARCHAR(255) NOT NULL, state VARCHAR(16) NOT NULL, PRIMARY KEY (issuer, subject))");
			connection.createStatement().execute("CREATE TABLE IF NOT EXISTS account_scope (account_id VARCHAR(36) NOT NULL REFERENCES internal_account(account_id), scope VARCHAR(32) NOT NULL, PRIMARY KEY (account_id, scope))");
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	@Override public synchronized Principal authenticate(TokenVerifier.Identity identity) throws AccessRejectedException {
		requireFresh(identity);
		try (Connection connection = connection()) {
			String accountId = findAccount(connection, identity);
			if (accountId == null) {
				connection.setAutoCommit(false);
				try { accountId = UUID.randomUUID().toString(); insertAccount(connection, accountId, identity); connection.commit(); }
				catch (SQLException e) { connection.rollback(); throw e; }
			} else migrateLegacyLink(connection, accountId, identity);
			return activePrincipal(connection, identity, accountId);
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	@Override public synchronized Principal reauthorize(TokenVerifier.Identity identity, String accountId) throws AccessRejectedException {
		requireFresh(identity);
		if (accountId == null || accountId.isEmpty()) throw new AccessRejectedException(AccessRejectedException.Reason.REJECTED);
		try (Connection connection = connection()) {
			String linked = findAccount(connection, identity);
			if (linked == null || !accountId.equals(linked)) throw new AccessRejectedException(AccessRejectedException.Reason.REJECTED);
			return activePrincipal(connection, identity, accountId);
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	/** Operator-facing persistence seam; no browser protocol exposes this method. */
	public synchronized void grantScope(String accountId, ApplicationScope scope) { changeScope(accountId, scope, true); }
	/** Operator-facing persistence seam; no browser protocol exposes this method. */
	public synchronized void revokeScope(String accountId, ApplicationScope scope) { changeScope(accountId, scope, false); }
	/** Operator-facing persistence seam; disabled accounts cannot authenticate or act. */
	public synchronized void disableAccount(String accountId) { changeAccountState(accountId, "DISABLED"); }
	/** Operator-facing persistence seam; revoked provider identities cannot authenticate or act. */
	public synchronized void revokeIdentity(String issuer, String subject) { changeIdentityState(issuer, subject, "REVOKED"); }

	private void requireFresh(TokenVerifier.Identity identity) throws AccessRejectedException {
		if (identity == null || identity.issuer == null || identity.issuer.isEmpty() || identity.subject == null || identity.subject.isEmpty()) throw new AccessRejectedException(AccessRejectedException.Reason.REJECTED);
		if (identity.expiresAtMillis <= System.currentTimeMillis()) throw new AccessRejectedException(AccessRejectedException.Reason.EXPIRED);
	}
	private String findAccount(Connection connection, TokenVerifier.Identity identity) throws SQLException {
		try (PreparedStatement find = connection.prepareStatement("SELECT account_id FROM game_identity WHERE issuer=? AND subject=?")) { find.setString(1, identity.issuer); find.setString(2, identity.subject); try (ResultSet rows = find.executeQuery()) { return rows.next() ? rows.getString(1) : null; } }
	}
	private void insertAccount(Connection connection, String accountId, TokenVerifier.Identity identity) throws SQLException {
		try (PreparedStatement account = connection.prepareStatement("INSERT INTO internal_account (account_id) VALUES (?)"); PreparedStatement identityLink = connection.prepareStatement("INSERT INTO game_identity (issuer,subject,account_id) VALUES (?,?,?)"); PreparedStatement accountState = connection.prepareStatement("INSERT INTO account_lifecycle (account_id,state) VALUES (?, 'ACTIVE')"); PreparedStatement identityState = connection.prepareStatement("INSERT INTO identity_lifecycle (issuer,subject,state) VALUES (?,?,'ACTIVE')"); PreparedStatement scope = connection.prepareStatement("INSERT INTO account_scope (account_id,scope) VALUES (?,?)")) {
			account.setString(1, accountId); account.executeUpdate();
			identityLink.setString(1, identity.issuer); identityLink.setString(2, identity.subject); identityLink.setString(3, accountId); identityLink.executeUpdate();
			accountState.setString(1, accountId); accountState.executeUpdate();
			identityState.setString(1, identity.issuer); identityState.setString(2, identity.subject); identityState.executeUpdate();
			for (ApplicationScope value : new ApplicationScope[] { ApplicationScope.PLAYER, ApplicationScope.SPECTATOR }) { scope.setString(1, accountId); scope.setString(2, value.name()); scope.addBatch(); }
			scope.executeBatch();
		}
	}
	/** Existing proof accounts predate lifecycle tables; initialize them once with the owner-approved defaults. */
	private void migrateLegacyLink(Connection connection, String accountId, TokenVerifier.Identity identity) throws SQLException {
		if (hasAccountLifecycle(connection, accountId)) return;
		try (PreparedStatement accountState = connection.prepareStatement("INSERT INTO account_lifecycle (account_id,state) VALUES (?, 'ACTIVE')"); PreparedStatement identityState = connection.prepareStatement("MERGE INTO identity_lifecycle (issuer,subject,state) KEY(issuer,subject) VALUES (?,?,'ACTIVE')"); PreparedStatement scope = connection.prepareStatement("MERGE INTO account_scope (account_id,scope) KEY(account_id,scope) VALUES (?,?)")) {
			accountState.setString(1, accountId); accountState.executeUpdate();
			identityState.setString(1, identity.issuer); identityState.setString(2, identity.subject); identityState.executeUpdate();
			for (ApplicationScope value : new ApplicationScope[] { ApplicationScope.PLAYER, ApplicationScope.SPECTATOR }) { scope.setString(1, accountId); scope.setString(2, value.name()); scope.addBatch(); }
			scope.executeBatch();
		}
	}
	private Principal activePrincipal(Connection connection, TokenVerifier.Identity identity, String accountId) throws SQLException, AccessRejectedException {
		if (!"ACTIVE".equals(accountState(connection, accountId))) throw new AccessRejectedException(AccessRejectedException.Reason.DISABLED);
		if (!"ACTIVE".equals(identityState(connection, identity))) throw new AccessRejectedException(AccessRejectedException.Reason.REVOKED);
		Set<ApplicationScope> scopes = scopes(connection, accountId);
		if (scopes.isEmpty()) throw new AccessRejectedException(AccessRejectedException.Reason.FORBIDDEN);
		return new Principal(accountId, scopes, identity.expiresAtMillis);
	}
	private String accountState(Connection connection, String accountId) throws SQLException {
		try (PreparedStatement statement = connection.prepareStatement("SELECT state FROM account_lifecycle WHERE account_id=?")) { statement.setString(1, accountId); try (ResultSet rows = statement.executeQuery()) { return rows.next() ? rows.getString(1) : "ACTIVE"; } }
	}
	private boolean hasAccountLifecycle(Connection connection, String accountId) throws SQLException {
		try (PreparedStatement statement = connection.prepareStatement("SELECT 1 FROM account_lifecycle WHERE account_id=?")) { statement.setString(1, accountId); try (ResultSet rows = statement.executeQuery()) { return rows.next(); } }
	}
	private String identityState(Connection connection, TokenVerifier.Identity identity) throws SQLException {
		try (PreparedStatement statement = connection.prepareStatement("SELECT state FROM identity_lifecycle WHERE issuer=? AND subject=?")) { statement.setString(1, identity.issuer); statement.setString(2, identity.subject); try (ResultSet rows = statement.executeQuery()) { return rows.next() ? rows.getString(1) : "ACTIVE"; } }
	}
	private Set<ApplicationScope> scopes(Connection connection, String accountId) throws SQLException {
		Set<ApplicationScope> values = EnumSet.noneOf(ApplicationScope.class);
		try (PreparedStatement statement = connection.prepareStatement("SELECT scope FROM account_scope WHERE account_id=?")) { statement.setString(1, accountId); try (ResultSet rows = statement.executeQuery()) { while (rows.next()) { try { values.add(ApplicationScope.valueOf(rows.getString(1))); } catch (IllegalArgumentException ignored) { } } } }
		return values;
	}
	private void changeScope(String accountId, ApplicationScope scope, boolean grant) {
		if (accountId == null || scope == null) throw new IllegalArgumentException("account and scope are required");
		try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(grant ? "MERGE INTO account_scope (account_id,scope) KEY(account_id,scope) VALUES (?,?)" : "DELETE FROM account_scope WHERE account_id=? AND scope=?")) { statement.setString(1, accountId); statement.setString(2, scope.name()); statement.executeUpdate(); }
		catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}
	private void changeAccountState(String accountId, String state) {
		try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("MERGE INTO account_lifecycle (account_id,state) KEY(account_id) VALUES (?,?)")) { statement.setString(1, accountId); statement.setString(2, state); statement.executeUpdate(); }
		catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}
	private void changeIdentityState(String issuer, String subject, String state) {
		try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("MERGE INTO identity_lifecycle (issuer,subject,state) KEY(issuer,subject) VALUES (?,?,?)")) { statement.setString(1, issuer); statement.setString(2, subject); statement.setString(3, state); statement.executeUpdate(); }
		catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}
	private Connection connection() throws SQLException { return DriverManager.getConnection(jdbcUrl, "sa", ""); }
}
