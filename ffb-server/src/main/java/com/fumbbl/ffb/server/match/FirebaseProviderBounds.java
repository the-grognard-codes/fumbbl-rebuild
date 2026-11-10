package com.fumbbl.ffb.server.match;

import java.net.URI;
import java.util.Set;

/** Finite startup configuration. The allocation is admitted whole, never reset by nested SDK calls. */
public record FirebaseProviderBounds(int operationMillis, int dnsMillis, int connectMillis,
	int failureThreshold, long cooldownMillis) {
	public static final int CLEANUP_RESERVE_MILLIS = 100;
	public static final int REQUEST_RESERVE_MILLIS = 150;
	public static final int MAX_HTTP_REQUESTS = 8;
	public static final int MAX_BODY_BYTES = 262_144;
	private static final Set<String> HTTPS_HOSTS = Set.of("www.googleapis.com", "identitytoolkit.googleapis.com", "oauth2.googleapis.com", "accounts.google.com");
	private static final Set<String> METADATA_HOSTS = Set.of("metadata.google.internal", "169.254.169.254", "[fd20:ce::254]", "fd20:ce::254");

	public FirebaseProviderBounds() {
		this(setting("ffb.firebase.operationMillis", 1_200), setting("ffb.firebase.dnsMillis", 200),
			setting("ffb.firebase.connectMillis", 250), setting("ffb.firebase.breakerFailures", 3), setting("ffb.firebase.breakerCooldownMillis", 5_000));
	}
	public FirebaseProviderBounds {
		if (operationMillis < 200 || operationMillis > 1_850 || dnsMillis <= 0 || dnsMillis > operationMillis - CLEANUP_RESERVE_MILLIS
			|| connectMillis <= 0 || connectMillis > operationMillis - CLEANUP_RESERVE_MILLIS
			|| failureThreshold <= 0 || failureThreshold > 128 || cooldownMillis <= 0 || cooldownMillis > 60_000)
			throw new IllegalArgumentException("Invalid finite Firebase bounds");
	}
	public int ioMillis() { return operationMillis - CLEANUP_RESERVE_MILLIS; }
	public void requireEndpoint(URI uri) {
		boolean known = "https".equals(uri.getScheme()) && HTTPS_HOSTS.contains(uri.getHost())
			|| "http".equals(uri.getScheme()) && METADATA_HOSTS.contains(uri.getHost());
		if (!known || uri.getUserInfo() != null || uri.getFragment() != null || uri.toString().length() > 4_096
			|| uri.getPort() != -1 && uri.getPort() != ("https".equals(uri.getScheme()) ? 443 : 80))
			throw new IllegalArgumentException("Unsupported Firebase provider endpoint");
	}
	private static int setting(String name, int fallback) {
		String text = System.getProperty(name);
		if (text == null) return fallback;
		try { return Integer.parseInt(text); }
		catch (NumberFormatException invalid) { throw new IllegalArgumentException("Invalid Firebase setting: " + name); }
	}
}
