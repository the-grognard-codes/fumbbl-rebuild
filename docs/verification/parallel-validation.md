# Parallel validation verification

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/238
Spec: [parallel-validation.md](../specs/parallel-validation.md)

Baseline: merged PR #237, commit `169f1dc8e05ef6de8454fc74c3c5cc79a293a543`.

## Required evidence

- Verify the new manifests preserve the previous 26 interaction files, nine hosted browser files, client-path diagnostic, and every native state-test class.
- Run focused tooling checks for missing/duplicate registrations, incomplete or stale reports, incorrect shard assignments, child failure propagation, empty suites, unexpected skips, and cancelled/skipped dependencies.
- Exercise real browser and native shard entry points, then run the complete clean Ubuntu CI matrix and unchanged complementary checks on the PR.
- Review the workflow and scripts against the issue and repository standards. Record observed timings and any remaining limitations before handoff.

## Results

- Compared the browser manifest directly with both package scripts at the baseline: all 26 interaction and all 10 hosted/diagnostic files are preserved.
- `node --test tools/test/validation.test.mjs`: 10 tests passed, including real child failure propagation, a real hosted Node test, and the actual aggregate gate rejecting missing artifacts and cancelled dependencies.
- `tools/validation/test-native-shard.ps1`: 12 self-contained manifest/XML checks passed under both Windows PowerShell 5.1 and PowerShell 7.6.6 without a prior build, including a newly discovered `Test.java`.
- Real interaction shard 4 passed all seven assigned suites, including movement confirmation, route undo, passing, camera positioning, replay, teammate activation, and manual rerolls. It produced the expected execution/timing report.
- Native manifest coverage: 43 classes, 248 tests, seven pre-existing opt-in methods. Prior class timings sum to approximately 102.5–102.6 seconds in each shard, versus approximately 410 seconds serially.
- All unrelated dirty/untracked user files retained their original SHA-256 hashes after branch creation and local checks. The merged local `feat/move-markings-removal` branch was safely deleted after confirming ancestry in `main`.

- Full local native shard 1 `clean verify` passed all reactor modules and exactly its 13 classes / 67 tests, with zero failures or errors and seven exact allowlisted opt-in skips.
- The first Ubuntu run caught a PowerShell 7 integer-type difference during manifest validation. The version guard now accepts both JSON integer representations while still requiring version 1. Workflow lint, secret scan, local lifecycle, and static artifacts passed in that run.
- The next run completed all 12 native tooling checks, then GitHub's PowerShell wrapper propagated the last intentionally failing child process's exit code. The harness now explicitly returns success after checking every expected failure. A local invocation matching GitHub's wrapper verifies the process exit as well as the printed checks.

## Standards review

No actionable standards violations or material maintainability concerns found in the committed CI sharding diff. The reviewer checked runner/gate behavior and confirmed Hosting assembly still builds the current source. Review-only; tests were not repeated. Verdict: APPROVE; zero findings.

Root review added `overwrite: true` to each uniquely named report upload to support rerunning all jobs without artifact collisions. The standards reviewer independently confirmed this approach.

## Spec review

No actionable requirement gap or unsafe green path found. The baseline browser suites, native source/Surefire checks, exact skip allowances, commit-bound reports, aggregate dependency gates, and full local entry points align with the spec. Review-only; expensive suites were not repeated. The issue API was unavailable in that review sandbox; the reviewer used the checked-in spec and baseline workflow. Verdict: APPROVE; zero findings.

## Clean Ubuntu execution evidence

[Checks run 37999420965](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/37999420965), code commit `87548c0e625614c05aeddafe215530fd5568edd2`, passed all jobs and both aggregate gates. The independent lint, secret scan, and CodeQL checks also passed.

Downloaded execution reports confirm all 26 interaction suites and all 10 hosted/diagnostic files. Interaction shard durations were 196.2, 199.1, 139.2, and 134.3 seconds; hosted/diagnostic execution took 91.8 seconds. Static delivery's complete dependency chain, including setup and its gate, finished in 4m39s versus the previous 14m11s.

Native reports confirm 43 classes and 248 tests across the four shards, with only the seven existing opt-in skips. State-test class durations summed to 149.7, 104.2, 105.4, and 106.6 seconds respectively. Full native runner durations were 3m09s–4m59s, including setup and repeated full core verification. The original unsharded Java 21 job took 8m01s; the first sharded attempt required the diagnostic retry below, so that attempt is not a clean end-to-end timing comparison.

## Existing intermittent recovery failure

The first attempt's native shard 2 failed the unchanged `SetupSessionMovementTest.pausedBlitzRetainsSelectedTargetAcrossRecoveryAndStopsAfterDeclinedReroll` at checkpoint restore with `RECOVERY_CORRUPT`, before state tests ran. The same full server suite passed on the other three runners and the local run. One explicit failed-job rerun passed the complete reactor, the assigned 10 state-test classes / 50 tests, and the aggregate native coverage gate.

A read-only audit found that the existing fixture uses a fresh `SecureRandom`-seeded recovery dice stream, leaving kickoff/setup paths nondeterministic. Restore hides several validation exceptions behind `RECOVERY_CORRUPT`, so the exact underlying cause remains unconfirmed. This CI change does not alter production recovery, test assertions, dice setup, or automatic retry policy. The observed failure is recorded on issue #238 for follow-up; if it recurs, diagnose the specific restore validation stage without logging recovery artifacts or weakening the test.

Final check links and updated timings are recorded on [PR #239](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/239) and [issue #238](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/238).

## DEV/PROD validation split

The user accepted fewer independent browser validations before DEV and
authorized implementation, review, merge, branch cleanup, and both DEV builds.
DEV publication is now explicit through `tools/deploy.mjs` so local preflight
precedes publishing. Source selection and the active working tree are preserved.

- Focused Node checks: 32/32 passed across validation, local browser, deployment,
  and local lifecycle tests. They cover release versus workflow commit identity,
  stale/incomplete reports, skipped/cancelled dependencies, preflight before
  service stop, exact-main validation, safe worktree cleanup, main movement,
  passing GitHub Checks, invalid environments/tags, and blocked dispatch.
- Exercised the exact DEV workflow GitHub API filter against an existing
  successful main run; it returns the expected successful run count.
- Root self-review confirmed PROD deployment depends on both the resolved
  release and complete reusable browser validation; checkout and reports use the
  same immutable SHA. No option skips validation. Native/core verification,
  assets/unit/artifact checks, service coverage, and security workflows remain.
- Full GitHub diagnostic execution, independent review results, merge evidence,
  and actual DEV build/deployment outcomes are recorded on issue #238 and PR #239
  as delivery completes. No PROD release is requested as part of verification.

### Standards review of the split

The independent reviewer identified that historical PROD tags do not contain
compatible runner/gate scripts. The runbook now explicitly limits code-based
redeployment to compatible tags and retains Firebase's saved-artifact rollback
for older tags. Existing generated-site rendering during local builds was
confirmed to predate this change. Updated review evidence is linked on the issue.

### Spec review of the split

The independent reviewer found no actionable spec gap in the supported CLI and
PROD release paths. Local DEV execution is an operator trust boundary accepted
by the user; GitHub independently checks its SHA and fast Checks, while PROD
requires actual GitHub browser execution.

CodeQL identified default-branch cache risks in the new browser workflow's
arbitrary direct dispatch. That dispatch was removed; full diagnostic runs go
through Checks for its own commit. Browser validation and manual DEV deployment
also omit npm caching, and browser checkouts retain no Git credentials.

The first updated PR run reproduced the unchanged recovery-test failure already
recorded above. No recovery assertions, production code, or automatic retry
policy were changed.

[Diagnostic browser run 38004877624](https://github.com/the-grognard-codes/fumbbl-rebuild/actions/runs/38004877624)
passed all four interaction shards, every hosted/diagnostic suite, and the
complete browser coverage gate. That is 26 interaction and 10 hosted/diagnostic
files. A later diagnostic run verifies the final cache configuration; its
results are recorded on the issue.

Follow-up Standards review approved the documented legacy-tag limitation and
cache/credential fixes with zero remaining actionable findings. Spec review
approved the supported DEV CLI and exact-release PROD paths with zero findings.
Both were read-only reviews. Findings: Standards 0 remaining; Spec 0.

The pre-merge local preflight completed the hosted suites and interaction shard
1, then was stopped after review commits changed its captured checkout identity.
It is not recorded as a complete passing local run. Requested DEV rebuilds run
fresh preflights from the stable merged checkout; their results are recorded on
the issue with the actual deployment outcome.

CodeQL's execution alert persisted after configured caches were removed, because
runner cache access exists independently of cache steps. The final workflow adds
a trusted-source resolver: only its own workflow SHA or an exact verified main
ancestor may reach browser checkout. Each job starts from its workflow source
and runs that trusted resolver before changing its checkout; a job-output SHA
is never passed directly to the checkout action. Focused rejection tests cover arbitrary
commits, short refs, malformed identities, and missing trusted history; the full
coverage gate requires resolver success. Final scan and runtime evidence are
linked on the issue.

## Local browser parallelism follow-up

The owner requested parallel browser execution after seeing the full sequential
preflight delay in `dev-local`. Local validation now starts up to four asynchronous
shard processes, capped by available CPU count. `FFB_BROWSER_TEST_WORKERS=1..4`
overrides the limit. Installation and the site build still finish before any shard
starts; interaction shards are queued before the shorter hosted group. Each shard
keeps its original suite order and receives a private Vite dependency cache under
the fresh report directory through `browser-test-server.mjs`. Direct local starts,
restarts and remote DEV validation use the same controller.

A failure stops queued work and waits for active children to close normally before
rejecting. The existing exact-inventory, checkout-identity and no-skip report checks
still validate all five reports before success. There is no CLI bypass or passing
result reuse. The completion message includes browser-suite elapsed time.

Focused validation passed 34 tests across browser-local, validation, local lifecycle
and deployment selectors. Tests cover actual overlap and the worker ceiling,
separate cache paths, preparation ordering, invalid limits, fresh/stale/incomplete
reports, and a real failing child with active-child draining and no later dispatch.
Independent read-only review found no actionable concurrency, cleanup, isolation or
coverage defect. Full four-worker browser verification reused installed dependencies
and the built site while the owner's existing build continued; it did not reinstall
dependencies, rebuild shared artifacts or restart services. All browser suites still
ran and produced fresh reports through the production controller and coverage gate.

The initial parallel trial, overlapping the owner's sequential browser preflight,
failed the existing reroll-choice assertion: two sends were observed where one was
expected. Active shards drained and the queued hosted shard did not start. Focused
block-success runs (including repeated cases and delayed second Enter presses) did
not reproduce it. A failure-only assertion message now records the fixture, sent
requests and page errors; expected counts and production behavior remain unchanged.
The failure's cause is unproven and is not claimed fixed.

The subsequent four-worker run passed all 38 registered browser suites, with zero
failures and zero skips, in 406.8 seconds (6m47s). All five fresh reports passed the
existing coverage gate for checkout `39af2fd3c8278d90b091c3b84d89778858028a18` and are
stored in `.tools/validation/local-browser-45pKVq/`; the timing summary is in
`.tools/parallel-local-browser-result.json`. This includes all 56 reroll-choice
cases, the combined rushing/Tackle marker refinement, and the client-path suite
that previously timed out for the owner. All five shards used separate Vite caches.

The earlier complete sequential run in `.tools/validation/client-path-diagnosis/`
recorded 881.5 seconds (14m41s) across the same 38 suites. The observed browser phase
took approximately 54% less time with four workers. These are separate local runs
with different background load, not a controlled benchmark or an estimate for the
entire build. Dependency installation, site preparation and native/service builds
are excluded from the parallel timer. Temporary probe/verification scripts were
removed; no commit, push, service restart or deployment was performed for this
follow-up.
