# Training retention and setup recovery outcome

Historical validation snapshot. For the consolidated current-main proposal, see
[training integration](training-showcase-integration.md).

Implemented locally on `codex/training-retention-setup` for #591 and #592. Changes are uncommitted and not deployed. Worktree: `C:\Users\jaken\Git-Hub\fumbbl-rebuild\.tools\training-retention`.

## Changes

Simulation mocks are stub-only and released on match close; normal verification mocks still record calls. Compact results flush after every game. Optional trajectories default to a 64 MiB raw-byte run budget; diagnostics use 16 MiB, retaining failure tails and successful seeds divisible by 100. Both budgets are divided across workers. Capped trajectories are explicitly incomplete and excluded from PPO. Cleanup previews first, requires explicit apply, and protects compact evidence, checkpoints, recent/active runs and `keep-details` pins. Existing experiments were not deleted.

Bogruk and Gobbo repair available-player positions after rejection of a saved formation before trying reserve substitutions. The shared code serves normal computer opponents and synthetic harness games.

## Validation

- All 82 computer-player Node tests passed, including both normal WebSocket transport paths and directory-link cleanup safety on Windows.
- Ten focused Java tests passed: TrainingEngineHostTest (2), ComputerPolicyRecoveryTest (2), ComputerPolicyStateTest (6). The common/server reactor build also succeeded.
- Four Python tests passed across data loading and PyTorch learning checks.
- Four full games completed in 102.6 seconds using one reused JVM with a 768 MiB heap and recycle limit 50. Seeds 42 and 43 include the formerly failing setup and timeout cases. Peak sampled Java heap was approximately 410 MiB; this is not a continuous peak measurement or a long-run guarantee.
- The deliberately small 16 MiB raw trajectory budget retained 16,768,374 bytes and reported 2,317 dropped rows. All affected episodes were marked incomplete for PPO.
- Two additional games deliberately stopped at 20 decisions. Both reported `decision_cap`, persisted compact match shards immediately, and saved diagnostic tails (7,533 compressed bytes combined).
- Cleanup tests cover preview/apply, pinning, age/grace protection, active runs, checkpoints, changed files, traversal, linked directories and pruning markers. No existing experiment cleanup was applied.
- `git diff --check` passed.

Artifacts: `.tools/training/2026-11-21T01-50-47-374Z-30560` (full games) and `.tools/training/2026-11-21T01-56-37-841Z-13644` (intentional caps), relative to this worktree.

## Review and limitations

Self-review corrected trajectory reader discovery of `matches-index.json`, retained authoritative completeness flags, and ensured row-limit truncation also excludes episodes from PPO. Cleanup rechecks indices, checksums and pins before deletion; learners must pin older batches before concurrent maintenance.

No browser/UI assets changed; the browser build was not repeated. Normal-play recovery was tested through the real worker's WebSocket transport and Java policy recovery checks, not a manually played browser match. No long soak, training-quality claim, merge or deployment occurred. Existing running UI processes keep their configured repository root: point a new run at this worktree to use these changes.
