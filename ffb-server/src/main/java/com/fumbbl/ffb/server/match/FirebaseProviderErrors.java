package com.fumbbl.ffb.server.match;

import com.google.firebase.ErrorCode;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuthException;

import java.io.IOException;

/** Classification precedence is explicit: typed transport, identity denial, then SDK/network availability. */
final class FirebaseProviderErrors {
	FirebaseProviderFailure transportFailure(Throwable failure) {
		for (int depth = 0; failure != null && depth < 32; depth++, failure = failure.getCause())
			if (failure instanceof FirebaseProviderFailure known) return known;
		return null;
	}
	boolean isAvailabilityFailure(Throwable failure) {
		FirebaseProviderFailure transport = transportFailure(failure);
		if (transport != null) return transport.kind() == FirebaseProviderFailure.Kind.AVAILABILITY;
		if (failure instanceof FirebaseAuthException auth) {
			AuthErrorCode identity = auth.getAuthErrorCode();
			if (identity == AuthErrorCode.EXPIRED_ID_TOKEN || identity == AuthErrorCode.INVALID_ID_TOKEN
				|| identity == AuthErrorCode.REVOKED_ID_TOKEN || identity == AuthErrorCode.USER_DISABLED || identity == AuthErrorCode.USER_NOT_FOUND) return false;
			ErrorCode code = auth.getErrorCode();
			if (code == ErrorCode.UNAVAILABLE || code == ErrorCode.DEADLINE_EXCEEDED || code == ErrorCode.RESOURCE_EXHAUSTED) return true;
		}
		for (int depth = 0; failure != null && depth < 32; depth++, failure = failure.getCause())
			if (failure instanceof IOException) return true;
		return false;
	}
	boolean credentialRejected(Throwable failure) {
		FirebaseProviderFailure transport = transportFailure(failure); return transport != null && transport.status() == 401;
	}
	FirebaseProviderFailure.IdentityRejection identityRejection(Throwable failure) {
		FirebaseProviderFailure transport = transportFailure(failure);
		if (transport != null) return transport.rejection();
		for (int depth = 0; failure != null && depth < 32; depth++, failure = failure.getCause()) {
			if (failure instanceof FirebaseAuthException auth && auth.getAuthErrorCode() != null) return switch (auth.getAuthErrorCode()) {
				case USER_DISABLED -> FirebaseProviderFailure.IdentityRejection.USER_DISABLED;
				case USER_NOT_FOUND -> FirebaseProviderFailure.IdentityRejection.USER_NOT_FOUND;
				case REVOKED_ID_TOKEN -> FirebaseProviderFailure.IdentityRejection.TOKEN_REVOKED;
				default -> FirebaseProviderFailure.IdentityRejection.NONE;
			};
		}
		return FirebaseProviderFailure.IdentityRejection.NONE;
	}
}
