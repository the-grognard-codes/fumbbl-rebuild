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

The corrected clean Ubuntu matrix is in progress. Final run links and timings are recorded on [PR #239](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/239) and [issue #238](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/238). Timing comparisons include setup and aggregate checks.
