# Rebase integration review — 20 October 2026

Branch `feature/block-assist-visibility` now points to main
`f10f348200bd45f4e813e701c5547f951bbcce55`, incorporating optional skill-use
preferences (#322). The feature had no commits to replay: its work was saved,
the branch rebased/advanced from `926dc8ea9`, and its uncommitted work restored.
Nothing was committed or pushed. The existing local-dev services were not
rebuilt or restarted during this rebase.

Preservation: named stash
`c648dcb263b1f3395be176d8ae07b7f9d5490330` is retained as a safety copy, together
with a file manifest in `.git/block-assist-rebase-backup-20261020.json`.
The pre-validation content audit accounted for all 109 original files: 103
unchanged Git blobs and six intentional integration/test differences, zero
missing files. See [the audit](rebase-preservation.json). Later validation
regenerated screenshot evidence; original design/mockup content remains present.

## Conflict resolution and review

Only `ChangeList.java` had a textual conflict; all three upstream/feature entries
were retained. Automatic merges in `SetupPanel.tsx`, `GameState.java`,
`SetupSession.java` and `browser-shards.json` preserve both features' additions.
The restored index was cleared so all feature work remains unstaged.

Root self-review and an independent read-only integration review found no
actionable semantic conflict in policy configuration, skill menu controls,
block sync observation, freezing, replay metadata or recovery restoration.
No production behavior adjustment was required beyond preserving both sides.

Added `BlockVisibilityTest.optionalDodgePromptPreservesFrozenBlockThroughRecoveryUntilTargetMoves`
for the combined lifecycle absent from the isolated optional-step tests. It
executes a real native block, pauses for optional Dodge, verifies shared frozen
context, restores a checkpoint after changing account policy, takes both possible
answers and verifies clearing when the target moves. An initial test-only lookup
omitted the public action's revision prefix; it was corrected before the passing
rerun.

## Validation

Pinned JDK 21.0.11+10/Maven 3.9.9/mockito5 and workspace Node 26.12.0 were used.

- `rebase-native.log`: 63 tests passed, no failures/errors/skips:
  `BlockVisibilityTest` (9), `BlockHighlightJsonTest` (2),
  `OptionalBlockSkillUseTest` (7), `OptionalReactionSkillUseTest` (9),
  `OptionalRerollSkillUseTest` (9), `SetupSessionMovementTest` (23),
  `SetupApplicationSkillUsePreferencesTest` (4). Command:
  `tools/target-build.ps1 test -JavaHome .tools/jdk-21.0.11+10 -Module ffb-server -Test <these selectors>`.
- `rebase-browser-unit.log`: all 356 browser unit tests passed.
- `rebase-browser-build.log`: `tsc --noEmit` and the production Play build passed.
- `rebase-*-ui.log`: block visibility, optional skill settings, playback and
  reconnect UI suites all passed.
- `rebase-reactor-verify.log`: 26 additional tests passed, no failures/errors/skips:
  `MultipleBlockActionsTest` (2), `FollowUpActionsTest` (1),
  `CoreTurnActionsTest` (13), `DiceProjectionTest` (1), `PushbackArtworkTest` (1),
  `RecoveryScenariosTest` (7), `RerollChoicesTest` (1). Pinned Maven `verify` used
  `-pl ffb-statetest,ffb-client-logic -am -Dtest=<these selectors>
  -Dsurefire.failIfNoSpecifiedTests=false`. Server JAR/ZIP, client-logic and
  state-test packaging succeeded. Total focused native checks: **89 passed**.
- Final `git diff --check`, empty unmerged-file list and empty staged-file list
  passed. `origin/main` is an ancestor of HEAD; zero feature commits were added.

This is targeted rebase validation; the full repository suite and opt-in
database/runtime checks were not repeated.
