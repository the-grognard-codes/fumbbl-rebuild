# R3-C.2 v2 account-membership boundary

Implemented locally on 2026-09-18 as the next small compatibility slice. It
does not expose `/browser/v2`, authenticate a browser, create a database, run a
migration, change `/browser/v1`, or alter an R2 recovery artifact.

R2's `home` and `away` remain trusted internal engine-routing roles. New marker-6
storage associates each role with an application account ID in
`ffb_v2_match_members`; the browser never supplies a role. `V2MatchAccess`
requires a fresh scoped principal before every membership, visibility, browse or
snapshot read. It resolves a player account to its persisted role only after a
`PLAYER` scope check. Browse and spectator snapshots require `SPECTATOR`, a
marker-6 membership record, and locked mutual spectator consent; unavailable and
unregistered matches fail closed as `NOT_FOUND`.

`006-v2-membership.sql` is deliberately not wired into `LocalSchema`. The
accepted marker-5 R2 database, its recovery evidence, and `/browser/v1` remain
unchanged. A future marker-6 copy workflow creates a separate target database;
it must register memberships when v2 matches are created rather than infer them
from R2's fixture labels.

The owner selected a one-active-runtime transition: marker-5 and `/browser/v1`
remain offline recovery-reference material only. Once the v2 route has replaced
its authentication, membership, spectator projection and recovery checks,
marker-6 and `/browser/v2` are the only enabled local development runtime. There
is no v1 alias, redirect or in-place marker-5 upgrade.

## Verification

Host: Eclipse Temurin OpenJDK `21.0.11+10`, Apache Maven `3.9.9`, Windows 11
amd64. Tests are in-memory or mocked JDBC only; no MariaDB database, retained
volume, browser profile, Firebase credential, container, or network service was
touched.

| Command | Result |
| --- | --- |
| `mvn -pl ffb-server -am '-Dtest=SpectatorConsentTest,JdbcSpectatorConsentRepositoryTest,V2MatchAccessTest,JdbcMatchMembershipRepositoryTest' '-Dsurefire.failIfNoSpecifiedTests=false' test` | 11 tests passed, 0 failures, 0 errors, 0 skipped. |
| `mvn -pl ffb-server -am '-Dtest=V2MatchAccessTest,JdbcMatchMembershipRepositoryTest,BrowserV2SpectatorAdapterTest' '-Dsurefire.failIfNoSpecifiedTests=false' test` | 5 tests passed, 0 failures, 0 errors, 0 skipped. |
| `npm.cmd test` and `npm.cmd run build` from `site` | 6 browser-client contract tests passed; static site build passed. |

Known limits: this is an authorization and persistence boundary, not yet a v2
servlet or principal-verifier bridge. `BrowserV2SpectatorAdapter` now defines the
version-2 authenticated browse/watch messages with local doubles, but it is not
yet mounted on a Jetty route or connected to a live `SetupSession`. The copied-
storage tool, player creation path, browser UI and live spectator projection
remain. Those additions must preserve the same authorization-before-read behavior
and use the already-tested R2 engine/recovery format without modifying marker-5
storage.

The Play page now contains a configuration-gated, signed-in spectator surface.
It appears only when `spectatorWebSocketUrl` is secure (`wss://`), authenticates
with a fresh Firebase token, lists only server-returned neutral Home/Away rows,
and renders only the v2 neutral board projection. It has no chat, player/team
names, actions or private match state. No visual browser run was requested or
performed; the site tests use mocked Firebase/WebSocket behavior.
