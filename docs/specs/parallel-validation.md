# Parallel validation and deployment gates

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/238
Implementation PR: https://github.com/the-grognard-codes/fumbbl-rebuild/pull/239
Status: implemented and reviewed; final delivery evidence tracked on the issue.

## Problem and acceptance criteria

PR #237 took approximately 14m11s for Static delivery, including 12m42s in browser validation. Java 21 target verification took 8m01s, including 6m51s in `ffb-statetest`. The interaction scripts and native test classes ran serially.

Preserve every existing suite and case while reducing elapsed time through isolated runners. Keep the `Static delivery` and `Java 21 target verification` check names. Reject missing, duplicated, misassigned, failed, skipped, cancelled, or stale shard executions. Retain full local validation commands and publish per-suite timings for future balancing.

The user subsequently accepted fewer independent browser validations before DEV. Full browser execution is mandatory locally for DEV local and DEV remote, and on GitHub for PROD releases. PR/main retain all complementary fast checks. DEV publication is explicit through the project CLI so the local preflight precedes publication; merging only runs checks. Source selection, the active branch, and working files remain unchanged. DEV remote validates exact committed main in a temporary detached worktree; PROD validates and deploys the exact resolved release commit. This scope update is recorded on issue #238.

Mandatory DEV local execution is enforced by the supported project CLI. GitHub does not independently certify a developer's local pass, an explicitly accepted trust boundary; direct low-level DEV workflow dispatch is operator-trusted. Historical PROD tags without compatible validation scripts fail the new release gate; Firebase saved-release rollback remains available. The runbook states this limitation rather than silently weakening release validation.

## Decisions

The Checks workflow uses four Java 21 jobs. The reusable Full browser validation workflow uses four interaction jobs and one hosted job, required by PROD and optionally requested through manual Checks dispatch. Local DEV runs those same manifests sequentially. Shard assignments live in `tools/validation/browser-shards.json` and `native-shards.json`. A large class or suite remains intact. GitHub shards have isolated filesystems, process state, ports, and browser/JVM; suites inside each shard remain sequential.

Each Java job performs full `clean verify` of the target reactor. Only `ffb-statetest` uses a module-specific Surefire includes file; the other modules retain all their tests and packaging checks on every shard. Plain `target-build.ps1 verify` still runs the entire suite. Repeated compilation and core-module tests cost some runner time, but keep the build independent and avoid sharing partially installed Maven artifacts between jobs.

Static assets, browser/site unit tests, environment checks, and both DEV and PROD Hosting assembly/verification run in the static checks job. The hosted browser job builds the site and runs all nine previously registered hosted files plus the client-path diagnostic. All 26 existing interaction files run once across the four interaction jobs. Java 8 baseline, local review lifecycle, computer player, game-session service, shell checks, workflow lint, secret scan, and CodeQL coverage remain unchanged.

Existing dependency caches remain in fast Checks and native jobs. The reusable browser and manual DEV workflow omit npm caching to prevent input-selected source from writing a default-branch cache. There is no cache of test results or compiled product output. Native shards run on every Checks trigger. All browser shards run for every PROD validation and requested full diagnostic run; there are no path-based shortcuts. Browser installation stays explicit on GitHub. Local runs install lockfile dependencies and ensure matching Chromium, reusing installed browser binaries while creating fresh execution reports.

## Coverage and failure behavior

Browser inventory discovery rejects any new `*-ui.mjs` or `*-browser.test.mjs` harness that lacks an assignment. Seven existing harnesses that were already outside CI have explicit standalone entries with reasons; this change neither removes a CI harness nor claims those standalone harnesses are CI coverage. Native discovery uses Surefire's default Java test filename conventions and requires every discovered class to appear exactly once across four shards.

The native validator reads the actual Surefire XML after a clean build. It checks the exact assigned classes, testcase counts, failures, errors, duration, and skip identities. Seven pre-existing opt-in methods in five classes require isolated database or fixture inputs. Their exact testcase names and existing assumption reasons are allowlisted; any other skip fails. Those exceptions remain visible in timing reports. Native methods are not disabled or changed by this work.

Browser runners record each completed script and its duration. For hosted Node tests, the runner also requires observed TAP totals with positive test counts, all tests passing, and no skipped, cancelled, or TODO tests. A standalone interaction script's `tests: 1` means one completed assertion-bearing script, not one fixture case; the script continues to execute its full existing fixture/camera/coach matrix.

Reports identify the checkout commit and contain exactly the assigned suites. GitHub reports are uploaded as artifacts with 14-day retention and unique names that replace their own reports on rerun. Matrix `fail-fast` is disabled. Native and full browser aggregate jobs run with `always()` and require successful dependencies, every expected report, the validation commit, and complete unique execution. Missing artifacts, failed uploads, skipped jobs, cancellation, and partial execution cannot pass. Release browser identity uses `VALIDATION_COMMIT` because a manual PROD dispatch can have a different workflow SHA from its release tag. The runner verifies actual checkout identity before execution.

`Static delivery` on PR/main instead requires the static-checks job and complete browser inventory registration. Its message explicitly describes static assets, unit tests, Hosting artifacts, and inventory, without claiming browser execution. It does not accept fabricated browser reports as a shortcut.

DEV local validation finishes before stopping services, including direct `dev-local.mjs --start` and `--restart` calls. DEV remote validates a detached checkout of remote main, removes only that generated worktree, rejects a moved main or missing/failed Checks run, and dispatches the exact SHA. The DEV workflow verifies current main and successful Checks again before deployment. An ongoing main Checks run may be watched. No CLI option skips validation. PROD requires an existing `moles-v*` tag; deployment depends on the release resolver and successful reusable browser workflow, then rechecks checkout identity and verifies the assembled artifact before publishing. Production approval and existing OIDC identities remain.

## Browser interaction coverage

Playwright drives Chromium against the actual React/CSS client and built public site. Tests click pitch squares and controls, drag players, press keys, change cameras and viewports, inspect DOM geometry and artwork, and assert outgoing commands. Existing scenarios cover both coaches, spectator views, setup, movement/Blitz confirmation, route edits and undo, passing, dice, reroll resources, prompts, logs, chat, replay, reconnect, and exact retries.

Many scenarios use committed native-exported JSON fixtures with controlled WebSocket/Firebase responses. This gives repeatable browser behavior without a live database. The native Java suite exercises the real engine separately. Both layers continue to run; sharding changes scheduling rather than scenario contents.

## Local commands

From the repository root:

```powershell
node --test tools/test/validation.test.mjs tools/test/browser-local.test.mjs tools/test/deploy.test.mjs tools/test/dev-local.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validation/test-native-shard.ps1

# Full local suites retain their existing entry points.
npm.cmd run test:interaction --prefix browser-client
npm.cmd run test:browser --prefix site
./tools/target-build.ps1 verify

# A single shard, useful when diagnosing a failure.
node tools/validation/browser-suites.mjs --family interaction --shard 2
./tools/validation/native-shard.ps1 -Shard 2 -JavaHome '<exact target JDK directory>'

# Deployment entry points; local preflight is mandatory for DEV.
node tools/deploy.mjs --environment dev-local
node tools/deploy.mjs --environment dev-remote
node tools/deploy.mjs --environment prod --release-tag moles-v1.2.3

# Optional full GitHub browser execution without deployment.
gh workflow run maven-verify.yml --ref main -f full_browser_validation=true
```

Install browser dependencies and Chromium as usual before browser runs. Hosted tests require a current site build; `npm run test:browser` builds it automatically. The workflow does the same. Use `pwsh` in place of `powershell` on Linux. Do not run native shards concurrently in the same checkout because each performs `clean verify`; CI gives them separate runners.

To rebalance, move whole suites/classes between the manifest's four arrays using the aggregate timing table. Keep the manifest inventory checks and focused tooling tests passing. New optional skip allowances require an explicit review of the method and reason.

## Verification handoff

Implementation and validation evidence: [parallel-validation.md](../verification/parallel-validation.md).

The user authorized review, commit/push, updating the active PR, merge after checks, removing only the local feature branch, rebuilding DEV local with current working files, and publishing committed main to DEV remote. No PROD release or branch-protection changes are requested. CLI and chat usages are documented in [deployment usage](../../deployment/README.md).
