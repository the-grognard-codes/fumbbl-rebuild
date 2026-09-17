package com.fumbbl.gameservice;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountStoreTest {
	@TempDir Path directory;
	@Test void persistsInternalAccountsAndScopesSubjectByIssuer() throws Exception {
		String path = directory.resolve("accounts").toString();
		AccountStore first = new AccountStore(path);
		TokenVerifier.Identity dev = new TokenVerifier.Identity("https://securetoken.google.com/dev", "same-subject", Long.MAX_VALUE);
		TokenVerifier.Identity prod = new TokenVerifier.Identity("https://securetoken.google.com/prod", "same-subject", Long.MAX_VALUE);
		String account = first.accountFor(dev);
		assertNotEquals("same-subject", account);
		assertNotEquals(account, first.accountFor(prod));
		assertEquals(account, new AccountStore(path).accountFor(dev));
		try (Connection connection = DriverManager.getConnection("jdbc:h2:file:" + path, "sa", "");
			 ResultSet result = connection.createStatement().executeQuery("SELECT COUNT(*) FROM internal_account")) {
			assertTrue(result.next());
			assertEquals(2, result.getInt(1));
		}
	}
}
