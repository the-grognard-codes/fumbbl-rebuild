# Dev-local maintenance and Node 26

Issue: [#271](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/271).
Verified locally on 2026-10-13 with Node 26.7.0 and npm 11.19.0.

## Decisions

- `tools/dev-local-clear-games.mjs` previews counts by default. Explicit `--apply`
  clears only the verified `ffb-match-review` database's game records at schema 7.
- Apply stops a running game server before deleting in one transaction, verifies
  empty game tables and unchanged retained-table counts, then starts the same
  container. Failures after stopping leave the server stopped for inspection.
- Accounts, saved teams, settings, schema, credentials, ID counters and archived
  backup files remain. No game/client version match is needed for maintenance.
- Browser, computer-player, site, Firebase and CI tooling use Node 26.x. Setup
  pins 26.7.0; Ubuntu's archive checksum comes from the publisher's release file.
  An upgraded Ubuntu setup appends the new managed PATH entry when necessary.
- The Codex toolchain permission-profile parent extends `:workspace` locally,
  while same-name user configuration can supply machine-specific filesystem grants.
- The accidental root npm `nvm` placeholder installation was removed. Module
  package files remain; generated root `node_modules` is ignored.

## Local acceptance

- Live read-only cleanup dry-run passed and found 23 prepared matches, 23 recovery
  records and 46 memberships. It stopped no services and deleted no live games.
- Disposable, network-isolated MariaDB checks verified complete game deletion,
  exact retained rows, repeated apply and rollback after a mid-batch SQL failure.
- The cleanup/lifecycle test selection passed 30 tests. Independent cleanup review
  found no actionable defect.
- Before the Node change, `npm.cmd ci --prefix browser-client --dry-run
  --ignore-scripts --engine-strict --offline` failed with `EBADENGINE`: Node 26.7.0
  did not satisfy `>=24 <25`. The same command passed with `>=26 <27` afterward.
- Node 26 verification passed 272 browser unit tests, 12 site tests, 9 computer
  player tests and 34 local startup/validation/deployment tooling tests (327 total).
- `npm.cmd run build:play --prefix browser-client` passed TypeScript checking and
  the production Vite build. Firebase environment validation passed.
- Windows setup `-CheckOnly` recognized Node 26.7.0. Ubuntu setup passed Bash syntax
  checking; package engines and the browser lockfile agreed on `>=26 <27`.
- Computer-player tests passed outside the sandbox after the first run's Windows
  process inspection was denied. Only that failed test process tree was cleaned up.

Java verification and PR checks are recorded in the linked issue and pull request.
The current reactor uses `tools/target-build.ps1 verify` (Java 21); CI separately
verifies the frozen Java 8 reference. No deployment or live cleanup was executed.
