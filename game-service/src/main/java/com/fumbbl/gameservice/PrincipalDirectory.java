package com.fumbbl.gameservice;

/**
 * Application authorization boundary. Implementations receive only a successfully verified
 * identity; they derive internal accounts and scopes rather than accepting client profile data.
 */
public interface PrincipalDirectory {
	Principal authenticate(TokenVerifier.Identity verifiedIdentity) throws AccessRejectedException;
	Principal reauthorize(TokenVerifier.Identity verifiedIdentity, String accountId) throws AccessRejectedException;
}
