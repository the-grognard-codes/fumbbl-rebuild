package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PublicationAuthorization;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/** Explicit batch-authority double for protocol/projection tests; never delegates to incoming checks. */
final class PublicationTestGrants {
	void allow(V2MatchAccess access, Function<V2PublicationAuthorization.Target, String> grants) throws Exception {
		when(access.publication(anyString(), any(V2PublicationAuthorization.Family.class), anyList())).thenAnswer(call -> {
			List<V2PublicationAuthorization.Target> targets = call.getArgument(2); Map<Integer, String> roles = new HashMap<>();
			for (int slot = 0; slot < targets.size(); slot++) { String role = grants.apply(targets.get(slot)); if (role != null) roles.put(slot, role); }
			return new V2PublicationAuthorization.Snapshot(roles);
		});
		when(access.publicationRole(any(V2PublicationAuthorization.Snapshot.class), any(V2PublicationAuthorization.Target.class), anyInt())).thenAnswer(call -> {
			String role = call.<V2PublicationAuthorization.Snapshot>getArgument(0).role(call.getArgument(2));
			if (role == null) throw new MatchService.Failure("VIEW_UNAVAILABLE");
			return role;
		});
	}
}
