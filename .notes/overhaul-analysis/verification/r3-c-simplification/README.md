# R3-C consolidation — local development evidence

Implemented and locally verified, 2026-09-18. This record supersedes the earlier experimental
spectator-only runtime design, not its historical test evidence.

Owner decision: authenticated viewing is enabled by default. PLAYER and SPECTATOR
are default application grants; persisted match membership grants game control.
The shared player game state is visible to spectators. Provider identity, account
metadata, saved-team documents, private recovery/dice/history and chat are not
part of the shared game state. A future spectator toggle is deferred.

One marker-6 MariaDB runtime serves `/browser/v2`, using R2 engine/recovery and one
bounded communication worker. The H2 session proof and marker-5 reference remain
offline reference material. No retained database, backup or evidence was deleted.

## Implementation boundary

- One Firebase principal bridge, MariaDB account/scope store, preparation service
  and R2 runtime. No spectator account system, consent service, independent
  spectator socket, or spectator renderer remains in the active path.
- PLAYER/SPECTATOR are default grants for newly authenticated accounts. Current
  scopes and Firebase disabled/revoked state are refreshed for requests and
  recipient delivery. Membership grants home/away engine control; watch grants
  no command authority. Superseded sockets are terminal (1008), including queued
  reauthentication attempts.
- Players and spectators receive the same public state except callerRole. The
  React GameView is shared; spectator controls cannot submit game decisions.
  Frozen Human validation and native R2 recovery/replay formats are unchanged.
- Account saved-team format 2 explicitly versions the owner namespace. Legacy
  local-owner format-1 rows remain unchanged; imports create owned copies.
- Preparation uses one-hour transferable bearer invitations hashed at rest,
  atomic slot assignment and exact-intent metadata. Creator release is limited
  to a disconnected opponent before activation. Release/reissue rotate codes.
- The site retains brand-package-v4 assets and existing Inter/Chakra typography.
  Firebase assembly no longer overlays the old v1 client on `/play`.
  DEV/PROD artifacts have no configured game endpoint; local configuration uses
  `ws://127.0.0.1:22227/browser/v2`. No artifact was deployed.

The original H2 proof and v1 diagnostic client remain offline references, not
additional authorities for the current UI. The unused historical consent DDL
is retained but is not provisioned. The future spectator toggle and R4 mutual
save-for-later/abandonment policies remain backlog items.

## Environment and fixtures

Windows 11; Eclipse Temurin Java 21.0.11+10; Maven 3.9.9; Node 26.7.0;
npm 11.19.0; MariaDB 11.8.9. Browser package lock versions: React 19.2.8,
Vite 8.2.2, TypeScript 7.0.2, Playwright 1.62.1. Firebase Admin 9.4.3.
The installed Chrome executable was used headless. Node 26 is outside the
package's declared Node 24 range; a Node 24 CI run remains outstanding.

Source: `ffb-local-r2b-database-1`, volume `ffb-local-r2b_database` (marker 5).
New target: `ffb-m6-simplification-db-20260918`, volume
`ffb-m6-simplification-data-20260918`, loopback `127.0.0.1:23316` (marker 6).
Image: `sha256:2439dcd7d14010ecd1ff7a4e1c5abe8e208c34fe35290744deeeaac3569043c3`.
Docker Desktop and the previously stopped source database were started for the
copy. No source game server was started. Both database volumes are retained.
No existing credential was changed. Tests read the existing root password file
without printing its content; no public account/provider was provisioned.

Fixtures are uniquely named synthetic UUID accounts, legal eleven-lineman Human
teams and new matches. The native test uses two independently authenticated
player connections and a third viewer. Its provider verifier is explicitly a
local double; engine, JDBC, membership and recovery are real.

## Commands and results

Commands ran from the repository root unless a prefix is shown. `mvn` denotes
`C:\Users\jaken\AppData\Local\Programs\apache-maven-3.9.9\bin\mvn.cmd`.
Database checks set `M6_TEST_JDBC_URL=jdbc:mariadb://127.0.0.1:23316/ffb_local`
and `M6_TEST_PASSWORD_FILE` to the absolute existing
`containers/local/.secrets/db_root_password` path.

| Check | Command / selector | Result / retained evidence |
| --- | --- | --- |
| Focused contracts first | `mvn -pl ffb-server -am test '-Dtest=BrowserV2AdapterTest,BrowserV2RouteTest,LocalSchemaTest,Marker6SchemaTest,FirebaseV2PrincipalAuthenticatorTest,JdbcV2PrincipalDirectoryTest,V2MatchAccessTest,V2PreparationServiceTest,BrowserSavedTeamJsonTest,BrowserMatchTransportTest,BrowserMatchDeliveryTest' '-Dsurefire.failIfNoSpecifiedTests=false'` | 57 passed at that stage; `java-focused-final.log`; subsequent full suite covers the final source |
| Common/server regression and real invitation/schema checks | `mvn -pl ffb-server -am test` with M6 env | 174 common + 210 server, no failures/skips; `java-server-full.log` |
| Native shared-state/recovery and Firebase contracts | `mvn -pl ffb-statetest -am test '-Dtest=FirebaseV2PrincipalAuthenticatorTest,V2RuntimeIntegrationTest,RecoveryApplicationTest,RecoverySessionTest,SpectatorProjectionTest' '-Dsurefire.failIfNoSpecifiedTests=false'` with M6 env | 7 verifier + 11 native tests, no failures/skips; `java-native-final.log` |
| Additional log/replacement contract | `mvn -pl ffb-server -am test '-Dtest=BrowserV2AdapterTest' '-Dsurefire.failIfNoSpecifiedTests=false'` | 5 passed; `java-log-hygiene.log` |
| Browser state/protocol/retry | `npm.cmd test --prefix browser-client` | 44 passed; `browser-recovery-final.log` |
| Reference browser build | `npm.cmd run build --prefix browser-client` | Passed; existing >500kB reference chunk warning; `browser-build-final.log` |
| Shared site build | `npm.cmd run build --prefix site` | TypeScript/Vite/site pass; game.js 307.81kB, gzip 79.26kB; `site-build-final.log` |
| Endpoint and sign-in invitation | `npm.cmd test --prefix site` | 2 passed; `site-tests-final.log` |
| Built-site browser | `npm.cmd run test:browser --prefix site` | 1 scenario/3 isolated browser contexts passed; `site-browser-complete.log` |
| Artifact configuration | `node deployment/firebase/scripts/verify-environment.mjs`; `node deployment/firebase/scripts/assemble.mjs --environment dev`; `node deployment/firebase/scripts/verify-hosting-artifact.mjs --environment dev`; assembly again with `--environment local` | Passed locally; `site-assembly.log`, `site-local-assembly.log`; no publish/deploy |

The real JDBC invitation test covers acceptance, exact join retry, self-join,
non-invitee after acceptance, old/revoked/expired codes, exact expiry equality,
creator release and release retry after disconnect permission changes. Scope,
missing membership, disabled/revoked/stale identity and rejected authentication
without provisioning are covered by the named contract tests. Jetty tests mount
the actual route surface on an ephemeral loopback port and cover absent routes,
origins, query rejection, text upgrade and binary close 1003.

The native integration checks equal public state, spectator command denial with
unchanged checkpoint, native coin choice and spectator broadcast, fresh-runtime
watch-first recovery, and exact accepted retry with byte-identical checkpoint.
Final fixture: `a2be1939-9157-36dd-a784-78c3ba4c80dc`, revision 1 after coin choice.
Browser tests mock Firebase and the wire server; they are not a live-provider,
real-JVM end-to-end test. Screenshot `spectator-site.png` was visually inspected.
Log hygiene test captures stdout/stderr and wire errors for synthetic token,
UID, email, private-account and private-team sentinels; none are emitted.

Early failing logs are retained: a stale format expectation, incomplete mocked
state, native fixture compilation and a test peer that rejected null broadcast
request IDs were corrected. An earlier optional retained-artifact inspection
skipped because `R2_RECOVERY_INSPECT` was unset (`java-recovery.log`); it is not
counted as a pass. Existing R2 real SIGKILL evidence was not rerun or relabeled.

## Copy and preservation evidence

With `M6_SOURCE_CONTAINER`/`M6_TARGET_CONTAINER` set to the containers above and
`M6_EVIDENCE_DIR=.notes/overhaul-analysis/verification/r3-c-simplification/marker6-copy-20260918`:

```powershell
node tools/m6-provision-copy.mjs
node tools/m6-provision-copy.mjs verify
```

Both passed before additive tests. Create-only preflight/copy/verified manifests
bind exact container IDs and distinct data mounts, dump checksum, schema columns
and indexes, and original document fingerprints. Separate attempts with a
nonempty target and identical source/target were refused before writes (the
`copy-*-refused.log` files). No database/backup volume or evidence was reset.

After tests, `node .notes/overhaul-analysis/verification/r3-c-simplification/verify-retained.mjs`
confirmed all 26 original copied records and all source fingerprints unchanged;
36 target records include retained additive fixtures (`retained-after-tests.json`).
Do not rerun the original exact-copy verifier after additive fixtures and mistake
expected extra records for corruption, or clear the target to make it pass.

## Known limits / remaining gates

No live Firebase credentials/provider validation, real browser-to-JVM Firebase
end-to-end acceptance, public TLS/origin acceptance, load/capacity acceptance or
deployment was performed. Firebase lifecycle lookups run on the one engine
communication worker; their latency is unmeasured. The target now has
`ffb_m6_runtime@%`, granted only `SELECT`, `INSERT`, `UPDATE` and `DELETE` on
`ffb_local` (verified 2026-09-18). It uses the existing ignored local
`db_password` secret rather than creating or exposing a new plaintext credential;
the runtime configuration must select this user, never root or an old database
account. Approved Firebase environment credentials are still required, not a
fallback to old storage.

2026-09-19: the target-only `ffb-local-m6` runtime was built and started on
`127.0.0.1:22231`; it mounts the Java ADC file and all configuration/secrets
read-only, except for its newly created `ffb-local-m6_marker6_backup` volume.
The DEV-auth static artifact is served locally on `127.0.0.1:5000` for manual
three-account acceptance. This is a setup milestone, not proof of live Firebase
authentication until the three user-driven browser sessions are recorded. See
[the live loopback runbook](../../../../containers/local/marker6-live-acceptance.md).
No active or retained match was upgraded or adopted into v2 membership.
No public-service readiness or R4 abandonment/retention gate is claimed.

2026-09-19 loopback repair: Docker remains published only as 127.0.0.1:22231. The in-container connector accepts Docker forwarding, so a localhost:5000 origin received 101 Switching Protocols and an unavailable path received 404. The replacement Docker build passed 174 common and 214 server tests without failures; the target database and backup volume were retained.

2026-09-19 owner acceptance: three independently authenticated DEV browser
profiles created a match, accepted both player slots, activated it, and attached
an authenticated spectator. This confirms the intended shared state/read-only
watch path at loopback. It does not inspect bearer-bearing browser frames and
does not claim public deployment, TLS, capacity, or a completed R3-D/R3-E gate.

## 2026-09-19 Human team-builder correction

The authenticated `/play` page already requested the frozen Human catalog and
contained `TeamDraftEditor`, but it placed the builder after the saved-team
controls inside a collapsed disclosure. The visible first step is now **Build a
Human team**, with a `Load basic 11-lineman starter` convenience action. This
only pre-populates client input; the existing authoritative `validateTeam` and
`savedTeam` requests still validate and persist it. The exact equivalent raw
fixture is `browser-client/examples/human-starter-draft.json` (11 Human
linemen, two rerolls and one apothecary; validated total 700000). No Orc
fixture was added because `RosterCatalog` exposes the frozen Human roster only.

| Check | Command / selector | Result |
| --- | --- | --- |
| Browser contracts | `npm.cmd test --prefix browser-client` | 44 passed |
| Play production bundle | `npm.cmd run build:play --prefix browser-client` | Passed; `game.js` 309.42 kB, gzip 79.52 kB |
| Local Hosting assembly | `node deployment/firebase/scripts/assemble.mjs --environment local-dev`; `node deployment/firebase/scripts/verify-environment.mjs` | Passed; built artifact contains the visible builder and starter action |
| Fixture structure | PowerShell `ConvertFrom-Json` assertion for roster `human`, 11 players and two rerolls | Passed |

`BrowserSavedTeamJsonTest.checkedInHumanStarterDraftIsAcceptedByTheFrozenCatalog`
was added to bind the checked-in fixture to the authoritative server validator.
It was not rerun in this shell: the previously recorded Maven executable
`C:\Users\jaken\AppData\Local\Programs\apache-maven-3.9.9\bin\mvn.cmd` and
both `mvn`/`mvn.cmd` commands were absent. This is a verification limitation,
not a claim of a passing Java run.
