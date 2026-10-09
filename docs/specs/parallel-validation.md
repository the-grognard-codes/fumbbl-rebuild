# Parallel validation without reducing coverage

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/238

## Problem and acceptance criteria

PR #237 took approximately 14m11s for Static delivery, including 12m42s in browser validation. Java 21 target verification took 8m01s, including 6m51s in `ffb-statetest`. The interaction scripts and native test classes ran serially.

Preserve every existing CI suite and case while reducing elapsed time through isolated runners. Keep the required `Static delivery` and `Java 21 target verification` check names. Reject missing, duplicated, misassigned, failed, skipped, cancelled, or stale shard executions. Retain full local validation commands and publish per-suite timings for future balancing.

## Decisions

The Checks workflow uses four browser interaction jobs, one hosted browser job, and four Java 21 jobs. Shard assignments live in `tools/validation/browser-shards.json` and `native-shards.json`. The initial balance uses the previous CI timings; a large class or suite remains intact. Each job has its own filesystem, process state, ports, and browser/JVM. Suites within each shard run sequentially, including native classes. This avoids shared-state races from adding thread parallelism to existing tests.

Each Java job performs full `clean verify` of the target reactor. Only `ffb-statetest` uses a module-specific Surefire includes file; the other modules retain all their tests and packaging checks on every shard. Plain `target-build.ps1 verify` still runs the entire suite. Repeated compilation and core-module tests cost some runner time, but keep the build independent and avoid sharing partially installed Maven artifacts between jobs.

Static assets, browser/site unit tests, environment checks, and both DEV and PROD Hosting assembly/verification run in the static checks job. The hosted browser job builds the site and runs all nine previously registered hosted files plus the client-path diagnostic. All 26 existing interaction files run once across the four interaction jobs. Java 8 baseline, local review lifecycle, computer player, game-session service, shell checks, workflow lint, secret scan, and CodeQL coverage remain unchanged.

Dependency caches remain in use. There is no cache of test results or compiled product output. Every shard runs for every applicable workflow trigger; there are no path-based shortcuts. Browser installation stays explicit in browser jobs.

## Coverage and failure behavior

Browser inventory discovery rejects any new `*-ui.mjs` or `*-browser.test.mjs` harness that lacks an assignment. Seven existing harnesses that were already outside CI have explicit standalone entries with reasons; this change neither removes a CI harness nor claims those standalone harnesses are CI coverage. Native discovery uses Surefire's default Java test filename conventions and requires every discovered class to appear exactly once across four shards.

The native validator reads the actual Surefire XML after a clean build. It checks the exact assigned classes, testcase counts, failures, errors, duration, and skip identities. Seven pre-existing opt-in methods in five classes require isolated database or fixture inputs. Their exact testcase names and existing assumption reasons are allowlisted; any other skip fails. Those exceptions remain visible in timing reports. Native methods are not disabled or changed by this work.

Browser runners record each completed script and its duration. For hosted Node tests, the runner also requires observed TAP totals with positive test counts, all tests passing, and no skipped, cancelled, or TODO tests. A standalone interaction script's `tests: 1` means one completed assertion-bearing script, not one fixture case; the script continues to execute its full existing fixture/camera/coach matrix.

Reports identify the checkout commit and contain exactly the assigned suites. They are uploaded as artifacts with 14-day retention. Each job has a unique artifact name and replaces its own report on rerun; rerunning all jobs cannot fail on an artifact-name collision. Matrix `fail-fast` is disabled so other shards finish and failures remain diagnosable. Aggregate jobs run with `always()` and require all dependency results to be `success`, all expected report files, the current commit, and complete unique execution. A missing artifact, failed upload, skipped job, cancellation, or partial run cannot produce a green required check. The aggregate job summary lists suite durations and opt-in skips.

## Browser interaction coverage

Playwright drives Chromium against the actual React/CSS client and built public site. Tests click pitch squares and controls, drag players, press keys, change cameras and viewports, inspect DOM geometry and artwork, and assert outgoing commands. Existing scenarios cover both coaches, spectator views, setup, movement/Blitz confirmation, route edits and undo, passing, dice, reroll resources, prompts, logs, chat, replay, reconnect, and exact retries.

Many scenarios use committed native-exported JSON fixtures with controlled WebSocket/Firebase responses. This gives repeatable browser behavior without a live database. The native Java suite exercises the real engine separately. Both layers continue to run; sharding changes scheduling rather than scenario contents.

## Local commands

From the repository root:

```powershell
node --test tools/test/validation.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validation/test-native-shard.ps1

# Full local suites retain their existing entry points.
npm.cmd run test:interaction --prefix browser-client
npm.cmd run test:browser --prefix site
./tools/target-build.ps1 verify

# A single shard, useful when diagnosing a failure.
node tools/validation/browser-suites.mjs --family interaction --shard 2
./tools/validation/native-shard.ps1 -Shard 2 -JavaHome '<exact target JDK directory>'
```

Install browser dependencies and Chromium as usual before browser runs. Hosted tests require a current site build; `npm run test:browser` builds it automatically. The workflow does the same. Use `pwsh` in place of `powershell` on Linux. Do not run native shards concurrently in the same checkout because each performs `clean verify`; CI gives them separate runners.

To rebalance, move whole suites/classes between the manifest's four arrays using the aggregate timing table. Keep the manifest inventory checks and focused tooling tests passing. New optional skip allowances require an explicit review of the method and reason.

## Verification handoff

Implementation and validation evidence: [parallel-validation.md](../verification/parallel-validation.md).

The new PR will remain open for review. No product deployment or change to branch-protection rules is required.
