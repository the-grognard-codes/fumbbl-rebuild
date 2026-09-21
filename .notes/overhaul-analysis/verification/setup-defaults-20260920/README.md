# Preparation updates and default setup — 2026-09-20

Owner requested automatic creator refresh when the opponent activates, and a
default first-eleven deployment. The owner selected three on the line of
scrimmage and eight one square behind it, rather than all eleven behind the line.

This report covers a bounded implementation. No public deployment, running-server
upgrade, retained database reset, credential change or engine rules rewrite occurred.

## Changed behavior and compatibility

- Successful v2 preparation responses subscribe the connection to that match.
  Successful preparation mutations notify other subscribed, currently authorized
  members with `preparationChanged` and a match ID only. Identity/scope/membership
  are rechecked per recipient, including on duplicate retries. Denied recipients
  get generic `VIEW_UNAVAILABLE` and lose the subscription. Disconnect/replacement
  clears subscriptions; entering play/watch replaces preparation observation.
- The client coalesces notifications into an ordinary authorized preparation load.
  Existing activation handling then opens the shared game view for both players.
  Foreign-selection notifications do nothing; retired sockets cannot update the
  client. A load/notification never resolves a retained uncertain mutation. A
  same-tab reconnect reloads the selected preparation, without an automatic retry.
- New v2 engine activations use private recovery runtime
  `ffb-3.4.0-bb2025-r2.3`. On entry to each side's ordinary SETUP phase, the server
  selects up to eleven eligible players by roster slot. First three are at
  canonical home `(12,6..8)` / away `(13,6..8)`. The other eight are at home X=11
  / away X=14 and Y=`3,4,5,6,8,9,10,11`. Only that side is arranged. Injured,
  knocked-out, banned and otherwise non-movable players are not resurrected;
  extras remain in reserve. Placement uses existing native setup commands.
- Formation placement belongs to the phase-triggering mutation and its revision,
  replay snapshot and durable checkpoint before acknowledgement. It is never
  triggered by a read, retry, restore, or manual adjustment within the same phase.
  No automatic confirmation is submitted. Native legality remains authoritative;
  a required captain outside the first eleven still needs a manual swap before
  confirming. This is a default geometric layout, not a bypass of roster rules.
- `r2.2` remains a supported compatibility path and retains manual setup plus its
  exact artifact version/shape when restored. Unknown versions still fail closed.
  Recovery shape remains format 2, replay format 1, engine version
  `ffb-3.4.0-bb2025-m3d.1`, catalog unchanged, and production DB marker remains 6.
  No native BB2025 rules or dice implementation changed.

The new client and notification-producing server must be deployed as a pair;
older v2 clients reject the new event family. Existing runtime binaries reject
`r2.3` checkpoints. Do not rewrite artifacts or downgrade their version. Drain
active games or retain their compatible runtime before a coordinated cutover.
The playable container/image, Hosting assembly, nginx and DEV/PROD were not
replaced by this implementation. Site/browser build outputs were rebuilt for tests.

## Verification

Windows 11; Temurin 21.0.11+10; Maven 3.9.9 using the target profile and offline
cache; Node 26.7.0; npm 11.19.0; TypeScript 7.0.2; Vite 8.2.2; Playwright 1.62.1;
local Chrome executable. The declared Node 24 CI gate was not run on this host.

Commands from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test DefaultSetupSessionTest,SetupSessionTest,RecoverySessionTest,BrowserV2AdapterTest -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test DefaultSetupSessionTest,RecoveryApplicationTest,BrowserV2AdapterTest -Offline
node --experimental-strip-types --test browser-client/test/v2-client.test.ts

$env:M6_SOURCE_CONTAINER='ffb-local-r2b-database-1'
$env:M6_TARGET_CONTAINER='ffb-setup-test-db-20260920'
$env:M6_EVIDENCE_DIR='.notes/overhaul-analysis/verification/setup-defaults-20260920/marker6-copy'
node tools/m6-provision-copy.mjs
node tools/m6-provision-copy.mjs verify

$env:M6_TEST_JDBC_URL='jdbc:mariadb://127.0.0.1:23320/ffb_local'
$env:M6_TEST_PASSWORD_FILE=(Resolve-Path containers/local/.secrets/db_root_password).Path
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test V2RuntimeIntegrationTest,Marker6SchemaTest,BrowserV2AdapterTest,DefaultSetupSessionTest,RecoveryApplicationTest -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Offline
npm.cmd run test:browser --prefix site
npm.cmd test --prefix browser-client
npm.cmd test --prefix site
node deployment/firebase/scripts/verify-environment.mjs
```

Results:

| Check | Result |
| --- | --- |
| Initial focused Java | 23 passed, no failures/errors/skips |
| Added notification/recovery/halftime selectors | 19 passed, no failures/errors/skips |
| Focused real JDBC/native integration | 24 passed, no failures/errors/skips |
| Final common/server/statetest reactor | 174 + 224 + 158 discovered; 555 passed, 1 skipped, no failures/errors; 2m35s |
| Browser unit tests | 47 passed |
| Site configuration tests | 4 passed; environment verifier passed |
| TypeScript/Vite | Passed |
| Browser automatic start | Passed, 2.456s; two isolated contexts, creator receives join update and both open pitch without Resume play |
| Existing player/spectator UI regression | Passed, 3.117s |
| Scoped whitespace check | Passed; Windows LF/CRLF warnings only |

The skipped Java test is `RecoveryArtifactInspectionTest`: it requires an
explicit `R2_RECOVERY_INSPECT` retained artifact file. The suite still ran native
recovery scenarios and the new real-JDBC reconstruction check. This is not a new
OS-process kill, backup restore, hosted TLS, load/capacity or public-readiness gate.

`DefaultSetupSessionTest` proves both orientations, roster order/eleven-player
limit, legal native confirmation, reserve twelfth player, unavailable-player
exclusion, manual removal/correction, halftime redeployment, exact checkpoint
round-trip, exact retry stability, and retained r2.2 behavior. The unchanged
native setup/recovery/action suites remain the manual-policy parity reference.
`RecoveryApplicationTest` adds both rejected-before-write and committed-but-unknown
checkpoint outcomes at the automatic-deployment transition, followed by fresh
application reconstruction and exact retry. No partially deployed state is
acknowledged. The failure doubles are explicit; they are not MariaDB outage tests.

`V2RuntimeIntegrationTest` uses real JDBC membership, native engine, and checkpoint
storage with a synthetic provider verifier. It checks join/activation notification,
viewer mutation denial, same-state projection, exact retry, default deployment
and reconstruction without another deployment/write. Final synthetic match:
`0ed82be3-d099-3ea9-89e7-59eadc4e4de6`, revision 2 at SETUP. The preceding focused
match `7ed0e8e3-44b8-3aba-b881-0af44b7b686f` is also retained. Browser tests mock
Firebase and WebSocket responses; no real account token or private account/team
data was captured. Real signed-in play of this updated version remains unverified.

## Isolated storage and retained evidence

Created a new MariaDB 11.8.9 test container `ffb-setup-test-db-20260920`, volume
`ffb-setup-test-data-20260920`, published only at `127.0.0.1:23320`.
Image ID starts `2439dcd7d140` (same retained local MariaDB image); container ID
`27a1ca23d505c76b9c259c88d79ba63c5c3bc2406653233e2bb8f013225f2ede`.
The existing root-password file was mounted read-only at
`/run/secrets/db_root_password` and selected with `MARIADB_ROOT_PASSWORD_FILE`;
it was not printed, copied to evidence, or modified. `MARIADB_DATABASE=ffb_local`.
Creation refused any existing fixture name/volume before starting this new one.

The existing target-only copy command verified a distinct empty target, imported
the read-only retained marker-5 reference, applied its existing marker-6 DDL,
and verified source/copied fingerprints before test mutations. Its create-only
manifests are in `marker6-copy/`. Tests then added uniquely identified synthetic
rows only to this target. Container, volume, copied reference rows and synthetic
rows remain retained. The playable database on port 23316 was not a test target.

The first copy attempt stopped before writes because its evidence parent was
absent; after creating the parent, the normal copy and verify passed. The first
new browser scenario exposed a Windows trailing-directory-separator mistake in
its test HTTP server; correcting the path boundary made both scenarios pass.
No product authentication/origin guard was weakened to satisfy either test.
Unrelated concurrent worktree edits, including `browser-client/src/main.tsx`,
were left untouched.
