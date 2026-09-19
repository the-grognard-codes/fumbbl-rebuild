package com.fumbbl.gameservice;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountStoreTest {
	@TempDir Path directory;
	@Test void persistsInternalAccountsAndScopesSubjectByIssuer() throws Exception {
		String path = directory.resolve("accounts").toString();
		AccountStore first = new AccountStore(path);
		TokenVerifier.Identity dev = new TokenVerifier.Identity("https://securetoken.google.com/dev", "same-subject", Long.MAX_VALUE);
		TokenVerifier.Identity prod = new TokenVerifier.Identity("https://securetoken.google.com/prod", "same-subject", Long.MAX_VALUE);
		String account = first.authenticate(dev).accountId();
		assertNotEquals("same-subject", account);
		assertNotEquals(account, first.authenticate(prod).accountId());
		assertEquals(account, new AccountStore(path).authenticate(dev).accountId());
		try (Connection connection = DriverManager.getConnection("jdbc:h2:file:" + path, "sa", "");
			 ResultSet result = connection.createStatement().executeQuery("SELECT COUNT(*) FROM internal_account")) {
			assertTrue(result.next());
			assertEquals(2, result.getInt(1));
		}
	}

	@Test void assignsOnlyDefaultScopesAndAppliesEveryScopeGrantAndRevocation() throws Exception {
		AccountStore store = new AccountStore(directory.resolve("scopes").toString());
		TokenVerifier.Identity identity = new TokenVerifier.Identity("provider-a", "private-subject", Long.MAX_VALUE);
		Principal principal = store.authenticate(identity);
		assertTrue(principal.hasScope(ApplicationScope.PLAYER));
		assertTrue(principal.hasScope(ApplicationScope.SPECTATOR));
		assertFalse(principal.hasScope(ApplicationScope.OWNER));
		assertFalse(principal.hasScope(ApplicationScope.ADMINISTRATOR));
		store.grantScope(principal.accountId(), ApplicationScope.OWNER);
		store.grantScope(principal.accountId(), ApplicationScope.ADMINISTRATOR);
		Principal granted = store.reauthorize(identity, principal.accountId());
		for (ApplicationScope scope : ApplicationScope.values()) assertTrue(granted.hasScope(scope));
		for (ApplicationScope scope : ApplicationScope.values()) store.revokeScope(principal.accountId(), scope);
		assertEquals(AccessRejectedException.Reason.FORBIDDEN, rejection(() -> store.reauthorize(identity, principal.accountId())).reason());
	}

	@Test void rejectsStaleDisabledAndRevokedCredentialsWithoutCreatingRejectedAccounts() throws Exception {
		String path = directory.resolve("lifecycle").toString();
		AccountStore store = new AccountStore(path);
		assertEquals(AccessRejectedException.Reason.EXPIRED, rejection(() -> store.authenticate(new TokenVerifier.Identity("provider-a", "expired", 0))).reason());
		assertEquals(AccessRejectedException.Reason.REJECTED, rejection(() -> store.authenticate(new TokenVerifier.Identity("provider-a", "", Long.MAX_VALUE))).reason());
		try (Connection connection = DriverManager.getConnection("jdbc:h2:file:" + path, "sa", ""); ResultSet rows = connection.createStatement().executeQuery("SELECT COUNT(*) FROM internal_account")) { assertTrue(rows.next()); assertEquals(0, rows.getInt(1)); }
		TokenVerifier.Identity revoked = new TokenVerifier.Identity("provider-a", "revoked", Long.MAX_VALUE);
		String revokedAccount = store.authenticate(revoked).accountId();
		store.revokeIdentity(revoked.issuer, revoked.subject);
		assertEquals(AccessRejectedException.Reason.REVOKED, rejection(() -> store.reauthorize(revoked, revokedAccount)).reason());
		TokenVerifier.Identity disabled = new TokenVerifier.Identity("provider-a", "disabled", Long.MAX_VALUE);
		String disabledAccount = store.authenticate(disabled).accountId();
		store.disableAccount(disabledAccount);
		assertEquals(AccessRejectedException.Reason.DISABLED, rejection(() -> store.reauthorize(disabled, disabledAccount)).reason());
	}

	@Test void safeAuditFieldsExcludeCredentialsProviderIdentifiersAndPrivateData() {
		String token = "header.private.payload";
		String uid = "provider-private-uid";
		String email = "private@example.test";
		String account = "private-account";
		String team = "private-team";
		String fields = SafeAuditFields.authentication(AccessRejectedException.Reason.REVOKED).toString();
		for (String prohibited : new String[] { token, uid, email, account, team }) assertFalse(fields.contains(prohibited));
		assertEquals("{event=authentication, outcome=revoked}", fields);
	}

	private AccessRejectedException rejection(RejectingOperation operation) {
		return assertThrows(AccessRejectedException.class, operation::run);
	}
	private interface RejectingOperation { void run() throws Exception; }
}
