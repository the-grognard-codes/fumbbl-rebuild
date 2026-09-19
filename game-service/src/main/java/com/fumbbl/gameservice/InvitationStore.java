package com.fumbbl.gameservice;

import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;

/** Durable bearer-invitation records for the process-local session proof. */
public final class InvitationStore {
	private static final long PENDING_TTL_MILLIS = 60L * 60L * 1000L;
	private final String jdbcUrl;
	private final Clock clock;
	private final SecureRandom random = new SecureRandom();

	public InvitationStore(String dbPath) { this(dbPath, Clock.systemUTC()); }
	InvitationStore(String dbPath, Clock clock) {
		jdbcUrl = "jdbc:h2:file:" + dbPath + ";DB_CLOSE_DELAY=-1";
		this.clock = clock;
		try (Connection connection = connection()) {
			connection.createStatement().execute("CREATE TABLE IF NOT EXISTS game_invitation (code VARCHAR(32) PRIMARY KEY, creator_account VARCHAR(36) NOT NULL, claimed_account VARCHAR(36), state VARCHAR(16) NOT NULL, expires_at BIGINT, created_at BIGINT NOT NULL)");
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	public synchronized Invitation create(String creatorAccount) throws InvitationException {
		requireAccount(creatorAccount);
		try (Connection connection = connection()) {
			for (int attempts = 0; attempts < 10; attempts++) {
				String code = code();
				try (PreparedStatement insert = connection.prepareStatement("INSERT INTO game_invitation(code,creator_account,claimed_account,state,expires_at,created_at) VALUES (?,?,NULL,'PENDING',?,?)")) {
					insert.setString(1, code); insert.setString(2, creatorAccount); insert.setLong(3, clock.millis() + PENDING_TTL_MILLIS); insert.setLong(4, clock.millis()); insert.executeUpdate();
					return new Invitation(code);
				} catch (SQLException collision) { if (!duplicateKey(collision)) throw collision; }
			}
			throw new IllegalStateException("unable to allocate invitation");
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	/** Claims a pending bearer code, or permits only its original claimant to reconnect. */
	public synchronized void claim(String code, String account) throws InvitationException {
		requireCode(code); requireAccount(account);
		try (Connection connection = connection()) {
			connection.setAutoCommit(false);
			try {
				Record record = required(connection, code);
				if ("PENDING".equals(record.state) && record.expiresAt <= clock.millis()) { setState(connection, code, "EXPIRED"); connection.commit(); throw new InvitationException("invitation_expired"); }
				if ("PENDING".equals(record.state)) { claim(connection, code, account); connection.commit(); return; }
				if ("ACCEPTED".equals(record.state) && account.equals(record.claimedAccount)) { connection.commit(); return; }
				connection.commit();
				if ("EXPIRED".equals(record.state)) throw new InvitationException("invitation_expired");
				if ("REVOKED".equals(record.state)) throw new InvitationException("invitation_revoked");
				throw new InvitationException("session_full");
			} catch (SQLException | InvitationException e) { connection.rollback(); throw e; }
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	/** Checks a bearer code before the process-local session claims its slot. */
	public synchronized void requireJoinable(String code, String account) throws InvitationException {
		requireCode(code); requireAccount(account);
		try (Connection connection = connection()) {
			Record record = required(connection, code);
			if ("PENDING".equals(record.state) && record.expiresAt <= clock.millis()) { setState(connection, code, "EXPIRED"); throw new InvitationException("invitation_expired"); }
			if ("PENDING".equals(record.state)) return;
			if ("ACCEPTED".equals(record.state) && account.equals(record.claimedAccount)) return;
			if ("EXPIRED".equals(record.state)) throw new InvitationException("invitation_expired");
			if ("REVOKED".equals(record.state)) throw new InvitationException("invitation_revoked");
			throw new InvitationException("session_full");
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	/** Reissues a still-unclaimed code and invalidates the old bearer code immediately. */
	public synchronized Invitation reissue(String code, String creatorAccount) throws InvitationException { return replace(code, creatorAccount, false); }
	/** Reissues an accepted code only after its claimed opponent is disconnected and being released. */
	public synchronized Invitation releaseAndReissue(String code, String creatorAccount) throws InvitationException { return replace(code, creatorAccount, true); }

	public synchronized void discard(String code) {
		try (Connection connection = connection(); PreparedStatement delete = connection.prepareStatement("DELETE FROM game_invitation WHERE code=?")) { delete.setString(1, code); delete.executeUpdate(); }
		catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}

	private Invitation replace(String code, String creatorAccount, boolean acceptedRequired) throws InvitationException {
		requireCode(code); requireAccount(creatorAccount);
		try (Connection connection = connection()) {
			connection.setAutoCommit(false);
			try {
				Record old = required(connection, code);
				if (!creatorAccount.equals(old.creatorAccount)) throw new InvitationException("not_session_creator");
				if (acceptedRequired != "ACCEPTED".equals(old.state)) throw new InvitationException(acceptedRequired ? "opponent_not_releasable" : "invitation_not_pending");
				setState(connection, code, "REVOKED");
				Invitation replacement = insertPending(connection, creatorAccount);
				connection.commit();
				return replacement;
			} catch (SQLException | InvitationException e) { connection.rollback(); throw e; }
		} catch (SQLException e) { throw new IllegalStateException("database unavailable", e); }
	}
	private Invitation insertPending(Connection connection, String creatorAccount) throws SQLException {
		for (int attempts = 0; attempts < 10; attempts++) {
			String replacement = code();
			try (PreparedStatement insert = connection.prepareStatement("INSERT INTO game_invitation(code,creator_account,claimed_account,state,expires_at,created_at) VALUES (?,?,NULL,'PENDING',?,?)")) {
				insert.setString(1, replacement); insert.setString(2, creatorAccount); insert.setLong(3, clock.millis() + PENDING_TTL_MILLIS); insert.setLong(4, clock.millis()); insert.executeUpdate(); return new Invitation(replacement);
			} catch (SQLException collision) { if (!duplicateKey(collision)) throw collision; }
		}
		throw new SQLException("unable to allocate invitation");
	}
	private Record required(Connection connection, String code) throws SQLException, InvitationException {
		try (PreparedStatement query = connection.prepareStatement("SELECT creator_account,claimed_account,state,expires_at FROM game_invitation WHERE code=?")) {
			query.setString(1, code);
			try (ResultSet rows = query.executeQuery()) { if (!rows.next()) throw new InvitationException("session_not_found"); return new Record(rows.getString(1), rows.getString(2), rows.getString(3), rows.getObject(4) == null ? Long.MAX_VALUE : rows.getLong(4)); }
		}
	}
	private void claim(Connection connection, String code, String account) throws SQLException {
		try (PreparedStatement update = connection.prepareStatement("UPDATE game_invitation SET state='ACCEPTED',claimed_account=?,expires_at=NULL WHERE code=? AND state='PENDING'")) { update.setString(1, account); update.setString(2, code); if (update.executeUpdate() != 1) throw new SQLException("invitation claim changed"); }
	}
	private void setState(Connection connection, String code, String state) throws SQLException {
		try (PreparedStatement update = connection.prepareStatement("UPDATE game_invitation SET state=? WHERE code=?")) { update.setString(1, state); update.setString(2, code); update.executeUpdate(); }
	}
	private void requireAccount(String account) throws InvitationException { if (account == null || account.isEmpty()) throw new InvitationException("rejected"); }
	private void requireCode(String code) throws InvitationException { if (code == null || !code.matches("[0-9a-f]{32}")) throw new InvitationException("session_not_found"); }
	private String code() { byte[] bytes = new byte[16]; random.nextBytes(bytes); StringBuilder value = new StringBuilder(32); for (byte part : bytes) { value.append(Character.forDigit((part & 255) >>> 4, 16)); value.append(Character.forDigit(part & 15, 16)); } return value.toString(); }
	private boolean duplicateKey(SQLException exception) { return "23505".equals(exception.getSQLState()); }
	private Connection connection() throws SQLException { return DriverManager.getConnection(jdbcUrl, "sa", ""); }

	public static final class Invitation { public final String code; Invitation(String code) { this.code = code; } }
	public static final class InvitationException extends Exception { public final String code; InvitationException(String code) { this.code = code; } }
	private static final class Record { final String creatorAccount; final String claimedAccount; final String state; final long expiresAt; Record(String creatorAccount, String claimedAccount, String state, long expiresAt) { this.creatorAccount = creatorAccount; this.claimedAccount = claimedAccount; this.state = state; this.expiresAt = expiresAt; } }
}
