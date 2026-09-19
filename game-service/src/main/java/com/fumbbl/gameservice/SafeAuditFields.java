package com.fumbbl.gameservice;

import java.util.LinkedHashMap;
import java.util.Map;

/** Produces log-safe security fields: no bearer token, provider subject, email, account or team data. */
public final class SafeAuditFields {
	private SafeAuditFields() { }
	public static Map<String, String> authentication(AccessRejectedException.Reason outcome) {
		Map<String, String> fields = new LinkedHashMap<String, String>();
		fields.put("event", "authentication");
		fields.put("outcome", outcome.name().toLowerCase());
		return fields;
	}
}
