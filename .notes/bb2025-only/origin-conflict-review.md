# Origin compatibility review — 2026-11-03

The BB2025-only removal work can be integrated with the fetched origin changes with one changelog conflict to resolve. No source-code merge conflict or actionable semantic compatibility issue was found. The combined tree has not been compiled or tested.

## Compared states

- Local branch: `refactor/bb2025-only`; HEAD/base `e356636ba0abb75b68d55fe704a6a256c12d4d02`, plus the current uncommitted removals and retained implementations.
- Fetched `origin/main`: `28774643024eff32aaf7a2a6af24c5dfc60f0679`.
- Incoming commits: `d03299574` (BB2025 kickoff selection/redeployment, PR #423), `287746430` (completion records, PR #424).
- Origin changes 33 paths. Two overlap local changes; no incoming additions collide with local untracked files and no incoming modifications target locally deleted files.

## Textual merge rehearsal

The rehearsal compared incoming files with HEAD and the current working files, using Git's three-way file merge for overlapping changes. It wrote only ignored review artifacts; it did not stage, commit, switch branches, or merge into the working tree.

| Path | Result | Required handling |
| --- | --- | --- |
| `CHANGELOG.md` | One conflicting block at Unreleased | Keep both the BB2025-only removal entry and the kickoff selection entry. |
| `ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/kickoff/StepApplyKickoffResult.java` | Clean three-way merge | Keep the local eight `report.bb2025` imports and all incoming kickoff behavior/checkpoint changes. |
| Other 31 incoming paths | No overlap conflict | Preserve incoming feature, tests, documentation and shard registration together. |

Evidence: `.tools/origin-conflict-review/report.json` and `rehearse.mjs`. The resolved changelog preview is `.tools/origin-conflict-review/CHANGELOG.proposed.md`; the combined Java preview is under `.tools/origin-conflict-review/merged/` at its normal repository-relative path.

## Standards review

No actionable standards or architecture compatibility findings. Incoming changes introduce no dependencies on removed editions, moved implementation types, or deleted ruleset APIs. The older-BB2025-checkpoint fallback is not an earlier-edition rules implementation and does not violate the removal scope.

## Spec review

No actionable semantic compatibility findings. The removal requirement to retain BB2025 behavior is satisfied by preserving the complete incoming kickoff feature. Its new enum value and methods introduce no new reflective implementations, so the registration snapshot does not need an update for this feature. Updated kickoff movement, Solid Defence and recovery tests use helpers and contracts retained by the removal work.

Review totals: Standards 0 actionable findings; Spec 0 actionable findings. The separate mechanical finding is the changelog conflict above.

## Verification and limits

- The projected combined source passed the existing old-edition source-audit predicates across 3,083 active text files, plus a check for remaining Java `mixed` imports: zero violations.
- Existing validation evidence covers each change separately. No combined compilation, unit suite, browser suite or live recovery run was performed for this review.
- Product files and the index remained unchanged. The only new tracked-scope artifact is this report; ignored rehearsal files are under `.tools/origin-conflict-review/`.

After authorized integration, first run the source audit and focused Java checks for `Bb2025RegistrationTest`, `KickoffPresentationTest`, `SetupSessionPlacementTest`, `KickoffSelectionMovementTest`, `SetupSessionTest`, `SolidDefenceRedeploymentTest` and `RecoveryScenariosTest`. Run browser unit/type/build checks and the kickoff selection/setup/recovery browser coverage, then complete the repository's required delivery validation on the combined state before landing it.

This review does not authorize or perform staging, committing, publishing, merging or deployment.
