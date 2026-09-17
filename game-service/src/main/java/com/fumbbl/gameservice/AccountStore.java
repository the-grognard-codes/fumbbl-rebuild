package com.fumbbl.gameservice;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

public final class AccountStore {
	private final String jdbcUrl;
	public AccountStore(String dbPath) {
		jdbcUrl = "jdbc:h2:file:" + dbPath;
		try (Connection connection = connection()) { connection.createStatement().execute("CREATE TABLE IF NOT EXISTS internal_account (account_id VARCHAR(36) PRIMARY KEY)"); connection.createStatement().execute("CREATE TABLE IF NOT EXISTS game_identity (issuer VARCHAR(255) NOT NULL, subject VARCHAR(255) NOT NULL, account_id VARCHAR(36) NOT NULL REFERENCES internal_account(account_id), PRIMARY KEY (issuer, subject))"); } catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}
	public synchronized String accountFor(TokenVerifier.Identity identity) {
		try (Connection connection = connection(); PreparedStatement find = connection.prepareStatement("SELECT account_id FROM game_identity WHERE issuer=? AND subject=?")) {
			find.setString(1, identity.issuer); find.setString(2, identity.subject);
			try (ResultSet rows = find.executeQuery()) { if (rows.next()) return rows.getString(1); }
			String id = UUID.randomUUID().toString();
			connection.setAutoCommit(false);
			try (PreparedStatement account = connection.prepareStatement("INSERT INTO internal_account (account_id) VALUES (?)"); PreparedStatement insert = connection.prepareStatement("INSERT INTO game_identity (issuer,subject,account_id) VALUES (?,?,?)")) { account.setString(1, id); account.executeUpdate(); insert.setString(1, identity.issuer); insert.setString(2, identity.subject); insert.setString(3, id); insert.executeUpdate(); connection.commit(); }
			return id;
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}
	private Connection connection() throws SQLException { return DriverManager.getConnection(jdbcUrl, "sa", ""); }
}
