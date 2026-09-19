package com.fumbbl.ffb.server.match;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.EnumSet;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class V2MatchAccessTest {
	private final String match = "12345678-1234-1234-1234-123456789abc";
	private final String account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
	private final MatchMembershipRepository memberships = mock(MatchMembershipRepository.class);
	private final V2PrincipalDirectory directory = mock(V2PrincipalDirectory.class);
	private final Clock clock = Clock.fixed(Instant.ofEpochMilli(1000), ZoneOffset.UTC);
	private final V2MatchAccess access = new V2MatchAccess(memberships, directory, clock);

	@Test void authenticatedViewerCanBrowseAndWatchWithoutConsentButCannotPlay() throws Exception {
		AuthenticatedPrincipal viewer = principal(2000, ApplicationScope.PLAYER, ApplicationScope.SPECTATOR);
		when(directory.reauthorize(viewer)).thenReturn(viewer);
		when(memberships.activeMatches()).thenReturn(Arrays.asList(match));
		when(memberships.isActive(match)).thenReturn(true);
		assertEquals(Arrays.asList(match), access.browse(viewer));
		access.spectatorSnapshot(viewer, match);
		assertThrows(MatchService.Failure.class, () -> access.playerRole(viewer, match));
		when(memberships.find(match, account)).thenReturn(new MatchMembership(match, account, "away"));
		assertEquals("away", access.playerRole(viewer, match));
	}

	@Test void currentRevocationOrRemovedScopeDeniesBeforeAnyMatchRead() throws Exception {
		AuthenticatedPrincipal cached = principal(2000, ApplicationScope.PLAYER, ApplicationScope.SPECTATOR);
		when(directory.reauthorize(cached)).thenReturn(principal(2000, ApplicationScope.PLAYER));
		assertThrows(MatchService.Failure.class, () -> access.browse(cached));
		when(directory.reauthorize(cached)).thenThrow(new V2PrincipalAuthenticator.Rejected());
		assertThrows(MatchService.Failure.class, () -> access.playerRole(cached, match));
		verifyNoInteractions(memberships);
	}

	@Test void expiredAndMissingIdentityDenyBeforeDirectoryAndMatchReads() {
		assertThrows(MatchService.Failure.class, () -> access.browse(null));
		assertThrows(MatchService.Failure.class, () -> access.browse(principal(1000, ApplicationScope.SPECTATOR)));
		verifyNoInteractions(directory, memberships);
	}

	@Test void inactiveAndCopiedReferenceMatchesStayUnavailable() throws Exception {
		AuthenticatedPrincipal viewer = principal(2000, ApplicationScope.SPECTATOR);
		when(directory.reauthorize(viewer)).thenReturn(viewer);
		assertThrows(MatchService.Failure.class, () -> access.spectatorSnapshot(viewer, match));
	}

	private AuthenticatedPrincipal principal(long expiry, ApplicationScope... scopes) {
		return new AuthenticatedPrincipal(account, EnumSet.copyOf(Arrays.asList(scopes)), expiry);
	}
}
