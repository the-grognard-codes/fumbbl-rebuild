package com.fumbbl.ffb.server.db;

import org.mariadb.jdbc.Configuration;
import org.mariadb.jdbc.export.HaMode;
import org.mariadb.jdbc.export.SslMode;
import org.mariadb.jdbc.util.options.OptionAliases;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;

/** Validated operator caps. URL query options are decoded once into a single effective source. */
public final class JdbcRequestConfiguration {
	private final String url;
	private final Properties options = new Properties();
	private final InetAddress address;
	private final int port;
	private final int connectCapMillis;
	private final int networkCapMillis;

	public JdbcRequestConfiguration(String configuredUrl, String user, String password) {
		try {
			if (configuredUrl == null) throw invalid();
			int query = configuredUrl.indexOf('?');
			url = query < 0 ? configuredUrl : configuredUrl.substring(0, query);
			if (!url.matches("jdbc:mariadb://(?:\\[[0-9a-fA-F:.]+\\]|[A-Za-z0-9._-]+)(?::[0-9]+)?/[^?#]*")) throw invalid();
			if (user != null) options.setProperty("user", user);
			if (password != null) options.setProperty("password", password);
			Set<String> names = new HashSet<>();
			if (query >= 0) for (String parameter : configuredUrl.substring(query + 1).split("&", -1)) {
				int equal = parameter.indexOf('=');
				if (equal <= 0) throw invalid();
				String name = decode(parameter.substring(0, equal));
				name = OptionAliases.OPTIONS_ALIASES.getOrDefault(name.toLowerCase(Locale.ROOT), name);
				String lower = name.toLowerCase(Locale.ROOT);
				if (!names.add(lower)) throw invalid();
				String canonical = switch (lower) {
					case "connecttimeout" -> "connectTimeout";
					case "sockettimeout" -> "socketTimeout";
					case "sessionvariables" -> "sessionVariables";
					case "user" -> "user";
					case "password" -> "password";
					case "restrictedauth" -> "restrictedAuth";
					case "allowlocalinfile" -> "allowLocalInfile";
					case "fallbacktosystemkeystore" -> "fallbackToSystemKeyStore";
					case "fallbacktosystemtruststore" -> "fallbackToSystemTrustStore";
					default -> name;
				};
				options.setProperty(canonical, decode(parameter.substring(equal + 1)));
			}
			connectCapMillis = positive(options.getProperty("connectTimeout"));
			networkCapMillis = positive(options.getProperty("socketTimeout"));
			validateSession(options.getProperty("sessionVariables"));
			if (options.containsKey("restrictedAuth") && !"mysql_native_password".equals(options.getProperty("restrictedAuth"))) throw invalid();
			if (options.containsKey("allowLocalInfile") && !"false".equals(options.getProperty("allowLocalInfile"))) throw invalid();
			// GSSAPI can use JAAS/files/credential services outside socket I/O. LOCAL INFILE
			// can read a file or URL during connection initSql. Neither is a runtime repository requirement.
			options.setProperty("restrictedAuth", "mysql_native_password");
			options.setProperty("allowLocalInfile", "false");
			for (String fallback : new String[] {"fallbackToSystemKeyStore", "fallbackToSystemTrustStore"}) {
				if (options.containsKey(fallback) && !"false".equals(options.getProperty(fallback))) throw invalid();
				options.setProperty(fallback, "false");
			}
			// These alternate transports/credential sources can hide retries or unbounded local I/O.
			for (String name : names) if (Set.of("socketfactory", "credentialtype", "tlssockettype", "serversslcert",
				"serverrsapublickeyfile", "keystore", "truststore", "localsocket", "localsocketaddress", "pipe").contains(name)) throw invalid();
			Configuration parsed = Configuration.parse(url, copy());
			if (parsed == null || parsed.haMode() != HaMode.NONE || parsed.addresses().size() != 1
				|| parsed.pool() || parsed.transactionReplay() || Boolean.TRUE.equals(parsed.permitRedirect())) throw invalid();
			if (parsed.keyStore() != null || parsed.trustStore() != null || parsed.serverSslCert() != null) throw invalid();
			// Current approved database profiles use loopback TCP. Verified TLS requires a
			// separately supported startup cache for certificate material, not per-call file reads.
			if (parsed.sslMode() != SslMode.DISABLE && parsed.sslMode() != SslMode.TRUST) throw invalid();
			options.setProperty("permitRedirect", "false");
			// Resolve only during startup. The factory returns a connected socket, so Connector/J
			// cannot perform DNS on the worker. The original hostname remains available for TLS.
			address = InetAddress.getByName(parsed.addresses().getFirst().host);
			port = parsed.addresses().getFirst().port;
		} catch (SQLException | UnknownHostException | IllegalArgumentException failure) {
			// Neither a raw URL nor a driver parsing exception (including its cause) is safe to log.
			throw invalid();
		}
	}

	String url() { return url; }
	InetAddress address() { return address; }
	int port() { return port; }
	int connectCapMillis() { return connectCapMillis; }
	int networkCapMillis() { return networkCapMillis; }
	Properties properties(int connectMillis, int networkMillis) {
		if (connectMillis <= 0 || networkMillis <= 0) throw invalid();
		Properties result = copy();
		result.setProperty("connectTimeout", Integer.toString(Math.min(connectCapMillis, connectMillis)));
		result.setProperty("socketTimeout", Integer.toString(Math.min(networkCapMillis, networkMillis)));
		result.setProperty("socketFactory", JdbcDeadlineSocketFactory.class.getName());
		return result;
	}
	private Properties copy() { Properties copy = new Properties(); copy.putAll(options); return copy; }
	private String decode(String value) { return URLDecoder.decode(value, StandardCharsets.UTF_8); }
	private int positive(String value) {
		if (value == null || !value.matches("[0-9]+")) throw invalid();
		int parsed = Integer.parseInt(value);
		if (parsed <= 0) throw invalid();
		return parsed;
	}
	private void validateSession(String session) {
		if (session == null) throw invalid();
		Set<String> assignments = new HashSet<>();
		int start = 0;
		char quote = 0;
		boolean escaped = false, lock = false;
		for (int index = 0; index <= session.length(); index++) {
			char next = index == session.length() ? ',' : session.charAt(index);
			if (escaped) { escaped = false; continue; }
			if (quote != 0) {
				if (next == '\\') escaped = true;
				else if (next == quote) quote = 0;
				continue;
			}
			if (next == '\'' || next == '"' || next == '`') { quote = next; continue; }
			if (next == ';') throw invalid();
			if (next != ',') continue;
			String assignment = session.substring(start, index).trim();
			int equal = assignment.indexOf('=');
			if (equal <= 0) throw invalid();
			String name = assignment.substring(0, equal).trim().toLowerCase(Locale.ROOT)
				.replace("`", "").replaceFirst("^@@(?:session\\.)?", "");
			if (!name.matches("[a-z_][a-z_0-9]*") || !assignments.add(name)) throw invalid();
			if ("innodb_lock_wait_timeout".equals(name)) {
				if (positive(assignment.substring(equal + 1).trim()) != 1) throw invalid();
				lock = true;
			}
			start = index + 1;
		}
		if (quote != 0 || !lock) throw invalid();
	}
	private IllegalArgumentException invalid() {
		return new IllegalArgumentException("Invalid db.url: require one TCP endpoint, positive integral connectTimeout/socketTimeout (ms), and one sessionVariables innodb_lock_wait_timeout=1 (s); unsupported transport/retry options are forbidden");
	}
}
