package com.fumbbl.ffb.server.local;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Fixed local authority; forwarded headers cannot select an environment or origin. */
public final class BrowserV2TransportPolicy {
	public static final String PROJECT = "dev-moles-under-the-pitch-org";
	public static final String PROD_PROJECT = "molesunderthepitch-dotorg";
	private final Set<String> origins = new HashSet<>(Arrays.asList(
		"http://localhost:5000", "http://127.0.0.1:5000", "http://localhost:5173", "http://127.0.0.1:5173"));
	private final int publishedPort;
	private final String proxyProfile;
	private final String proxyHost;

	public BrowserV2TransportPolicy(String base) {
		this(base, null);
	}

	/** Fixed hosted profiles; the backend must remain native loopback. */
	public BrowserV2TransportPolicy(String base, String proxyProfile) {
		if (proxyProfile != null && !"dev".equals(proxyProfile) && !"prod".equals(proxyProfile))
			throw new IllegalArgumentException("Unknown v2 proxy profile");
		this.proxyProfile = proxyProfile;
		proxyHost = "prod".equals(proxyProfile) ? "game.molesunderthepitch.org" : "game-dev.molesunderthepitch.org";
		if (base == null) throw new IllegalArgumentException("V2 requires a base URL");
		URI uri = URI.create(base);
		if (!"http".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost())
			|| uri.getPort() < 1 || uri.getPort() > 65535 || uri.getRawUserInfo() != null
			|| !"".equals(uri.getRawPath()) || uri.getRawQuery() != null || uri.getRawFragment() != null)
			throw new IllegalArgumentException("V2 requires an explicit loopback base URL");
		publishedPort = uri.getPort();
		if (proxyProfile != null) {
			origins.clear();
			origins.add("prod".equals(proxyProfile) ? "https://molesunderthepitch.org" : "https://dev.molesunderthepitch.org");
		}
	}

	public boolean permits(URI request, String host, String origin) {
		return request != null && "/browser/v2".equals(request.getRawPath())
			&& (!request.isAbsolute() || host != null && host.equals(request.getRawAuthority()))
			&& request.getRawQuery() == null && request.getRawFragment() == null && request.getRawUserInfo() == null
			&& (proxyProfile != null ? proxyHost.equals(host)
				: ("127.0.0.1:" + publishedPort).equals(host) || ("localhost:" + publishedPort).equals(host))
			&& origins.contains(origin);
	}

	public String bindHost(String containerForwarding) {
		if (containerForwarding == null || "false".equals(containerForwarding)) return "127.0.0.1";
		if (proxyProfile != null) throw new IllegalArgumentException("Proxy backend requires native loopback binding");
		if (!"true".equals(containerForwarding) || !new java.io.File("/.dockerenv").isFile())
			throw new IllegalArgumentException("Container forwarding requires the container launcher");
		return "0.0.0.0";
	}

	public String firebaseProject() {
		return "prod".equals(proxyProfile) ? PROD_PROJECT : PROJECT;
	}
}
