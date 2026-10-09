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
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/validation/test-native-shard.ps1`: 11 self-contained manifest/XML checks passed without a prior build.
- Real interaction shard 4 passed all seven assigned suites, including movement confirmation, route undo, passing, camera positioning, replay, teammate activation, and manual rerolls. It produced the expected execution/timing report.
- Native manifest coverage: 43 classes, 248 tests, seven pre-existing opt-in methods. Prior class timings sum to approximately 102.5–102.6 seconds in each shard, versus approximately 410 seconds serially.
- All unrelated dirty/untracked user files retained their original SHA-256 hashes after branch creation and local checks. The merged local `feat/move-markings-removal` branch was safely deleted after confirming ancestry in `main`.

Full local native shard verification and independent review are in progress. The complete PR run will verify all isolated Ubuntu shards and unchanged complementary checks. Timing comparisons will include setup and aggregate checks.
