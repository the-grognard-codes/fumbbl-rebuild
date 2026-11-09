package com.fumbbl.ffb.server.db;

import org.mariadb.jdbc.Configuration;
import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcRequestConfigurationTest {
	private static final String BASE = "jdbc:mariadb://127.0.0.1:3306/test";
	private static final String CAPS = "connectTimeout=500&socketTimeout=1500&sessionVariables=innodb_lock_wait_timeout=1";
	@Test void pinnedDriverUrlOverridesPropertiesAndNormalizationPreservesShorterEffectiveValues() throws Exception {
		Properties shorter = new Properties(); shorter.setProperty("connectTimeout", "30"); shorter.setProperty("socketTimeout", "40");
		Configuration raw = Configuration.parse(BASE + "?" + CAPS, shorter);
		assertEquals(500, raw.connectTimeout()); assertEquals(1500, raw.socketTimeout());
		JdbcRequestConfiguration configuration = new JdbcRequestConfiguration(BASE + "?" + CAPS + "&useCompression=true", "operator", "secret");
		Properties effective = configuration.properties(30, 40);
		Configuration parsed = Configuration.parse(configuration.url(), effective);
		assertEquals(30, parsed.connectTimeout()); assertEquals(40, parsed.socketTimeout());
		assertTrue(parsed.useCompression());
		assertFalse(parsed.allowLocalInfile());
		assertFalse(parsed.fallbackToSystemTrustStore());
		assertEquals("mysql_native_password", parsed.restrictedAuth());
		assertEquals("innodb_lock_wait_timeout=1", parsed.sessionVariables());
		assertEquals(500, configuration.connectCapMillis()); assertEquals(1500, configuration.networkCapMillis());
		assertEquals("500", configuration.properties(5000, 5000).getProperty("connectTimeout"));
	}
	@Test void encodedOptionsAreDecodedOnceAndOtherSessionVariablesSurvive() throws Exception {
		JdbcRequestConfiguration configuration = new JdbcRequestConfiguration(BASE + "?connectTimeout=500&socketTimeout=1500"
			+ "&sessionVariables=innodb_lock_wait_timeout%3D1%2Csql_mode%3D%27STRICT_ALL_TABLES%2CNO_ZERO_DATE%27&USER=url-user", "fallback", "secret");
		Configuration parsed = Configuration.parse(configuration.url(), configuration.properties(50, 60));
		assertEquals("url-user", parsed.user());
		assertEquals("innodb_lock_wait_timeout=1,sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE'", parsed.sessionVariables());
	}
	@Test void rejectsMissingInvalidDuplicateAndConflictingOptionsWithoutLeakingCredentials() {
		for (String options : new String[] { "", "connectTimeout=500", CAPS.replace("500", "0"), CAPS.replace("500", "-1"),
			CAPS.replace("500", "1.5"), CAPS.replace("1500", "NaN"), CAPS.replace("500", "2147483648"),
			CAPS + "&CONNECTTIMEOUT=100", CAPS + "&sessionVariables=innodb_lock_wait_timeout=1",
			CAPS.replace("innodb_lock_wait_timeout=1", "innodb_lock_wait_timeout=1,INNODB_LOCK_WAIT_TIMEOUT=1"),
			CAPS.replace("innodb_lock_wait_timeout=1", "innodb_lock_wait_timeout=0"), CAPS.replace("innodb_lock_wait_timeout=1", "sql_mode='x'"),
			CAPS + "&pool=true", CAPS + "&transactionReplay=true", CAPS + "&socketFactory=private-factory", CAPS + "&permitRedirect=true",
			CAPS + "&localSocketAddress=private-host", CAPS + "&restrictedAuth=auth_gssapi_client", CAPS + "&allowLocalInfile=true",
			CAPS + "&clientCertificateKeyStoreUrl=http%3A%2F%2Fprivate-host%2Fkeys", CAPS + "&trustCertificateKeyStoreUrl=private-store",
			CAPS + "&fallbackToSystemTrustStore=true", CAPS + "&fallbackToSystemKeyStore=true", CAPS + "&sslMode=verify-full" }) {
			IllegalArgumentException failure = assertThrows(IllegalArgumentException.class,
				() -> new JdbcRequestConfiguration(BASE + "?" + options + "&password=private-password", "user", "private-password"), options);
			assertFalse(failure.toString().contains("private-"));
			assertEquals(null, failure.getCause());
		}
		assertThrows(IllegalArgumentException.class, () -> new JdbcRequestConfiguration(null, null, null));
		assertThrows(IllegalArgumentException.class, () -> new JdbcRequestConfiguration("jdbc:mariadb://address=(pipe=private-pipe)/test?" + CAPS, null, null));
	}
}
