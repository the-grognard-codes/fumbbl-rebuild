package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Only typed codes cross this boundary; provider response bodies and identity fields are never retained. */
public final class FirebaseProviderFailure extends IOException {
	public enum Kind { AVAILABILITY, DENIED, ADMISSION, CIRCUIT_OPEN, POLICY }
	public enum IdentityRejection { NONE, USER_NOT_FOUND, USER_DISABLED, TOKEN_REVOKED }
	private final Kind kind;
	private final int status;
	private final IdentityRejection rejection;
	FirebaseProviderFailure(Kind kind) { this(kind, 0, IdentityRejection.NONE, null); }
	FirebaseProviderFailure(Kind kind, Throwable cause) { this(kind, 0, IdentityRejection.NONE, cause); }
	private FirebaseProviderFailure(Kind kind, int status, IdentityRejection rejection, Throwable cause) {
		super("Firebase dependency rejected: " + kind.name(), cause); this.kind = kind; this.status = status; this.rejection = rejection;
	}
	public Kind kind() { return kind; }
	public int status() { return status; }
	public IdentityRejection rejection() { return rejection; }
	static FirebaseProviderFailure response(int status, byte[] body) {
		return response(status, body, false);
	}
	static FirebaseProviderFailure response(int status, byte[] body, boolean identityLookup) {
		IdentityRejection rejection = IdentityRejection.NONE;
		if (identityLookup && (status == 400 || status == 404)) try {
			JsonValue value = JsonObject.readFrom(new String(body, StandardCharsets.UTF_8)).get("error");
			if (value != null && value.isObject()) {
				String message = value.asObject().getString("message", "");
				rejection = switch (message) {
					case "USER_NOT_FOUND" -> IdentityRejection.USER_NOT_FOUND;
					case "USER_DISABLED" -> IdentityRejection.USER_DISABLED;
					case "TOKEN_REVOKED", "ID_TOKEN_REVOKED" -> IdentityRejection.TOKEN_REVOKED;
					default -> IdentityRejection.NONE;
				};
			}
		} catch (RuntimeException ignored) { /* Unrecognized response never grants authority or records recovery. */ }
		return new FirebaseProviderFailure(status == 408 || status == 429 || status >= 500 && status <= 599 ? Kind.AVAILABILITY : Kind.DENIED,
			status, rejection, null);
	}
}
