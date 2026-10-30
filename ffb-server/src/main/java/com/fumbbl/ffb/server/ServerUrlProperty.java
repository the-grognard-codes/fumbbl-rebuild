package com.fumbbl.ffb.server;

import com.fumbbl.ffb.util.StringTool;

import java.util.Properties;

import static com.fumbbl.ffb.server.IServerProperty.FUMBBL_BASE;
import static com.fumbbl.ffb.server.IServerProperty.FUMBBL_PORT;
import static com.fumbbl.ffb.server.IServerProperty.SERVER_BASE;
import static com.fumbbl.ffb.server.IServerProperty.SERVER_PORT;
public enum ServerUrlProperty {

	FUMBBL_NAMEGENERATOR_BASE(FUMBBL_BASE, FUMBBL_PORT, "fumbbl.namegenerator.base");

	private final String baseKey;
	private final String portKey;
	private final String pathKey;

	ServerUrlProperty(String pathKey) {
		this(SERVER_BASE, SERVER_PORT, pathKey);
	}

	ServerUrlProperty(String baseKey, String portKey, String pathKey) {
		this.baseKey = baseKey;
		this.portKey = portKey;
		this.pathKey = pathKey;
	}

	public String url(Properties properties) {
		String path = get(properties, this.getPathKey());
		if (path.startsWith("http")) {
			return path;
		}

		path = stripLeadingSlash(path);

		StringBuilder url = new StringBuilder();

		String base = stripTrailingSlashes(get(properties, this.getBaseKey()));

		url.append(base);

		String port = get(properties, this.getPortKey());

		if (base.split(":").length < 3 && StringTool.isProvided(port)) {
			url.append(":").append(port);
		}

		appendIfNotEmpty(url, path);


		return url.toString();
	}

	private static void appendIfNotEmpty(StringBuilder url, String prefix) {
		if (StringTool.isProvided(prefix)) {
			url.append("/").append(prefix);
		}
	}

	private static String stripTrailingSlashes(String input) {
		while (input.endsWith("/")) {
			if (input.length() == 1) {
				input = "";
			} else {
				input = input.substring(0, input.length() - 1);
			}
		}
		return input;
	}

	private static String stripLeadingSlash(String input) {
		while (input.startsWith("/")) {
			if (input.length() == 1) {
				return "";
			}
			input = input.substring(1);
		}
		return input;
	}

	public String getBaseKey() {
		return baseKey;
	}

	public String getPortKey() {
		return portKey;
	}

	public String getPathKey() {
		return pathKey;
	}

	private String get(Properties props, String key) {
		String value = props.getProperty(key);
		return StringTool.isProvided(value) ? value : "";
	}
}
