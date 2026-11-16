# Bounded kick-off decisions: outcome

Date: 2026-11-15.
Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/553
Design and parallel-work boundary: [local mirror](bounded-kickoff-decisions.md).
Branch: `codex/553-bounded-kickoff`, based on `33d95b7c6`.
Worktree: `.tools/worktrees/553` in the original checkout.

## Implementation

The policy no longer needs remembered plans to stop Solid Defence redeployment.
Its moves preserve setup zones and the line, and each selected player can move
once before confirmation. Charge checks spent native movement as well as its plan.
Quick Snap retains its existing one-move-per-selected-player native restriction.

Every kick-off selection or editing stage now permits 50 adjustments, for all
coaches. This is a technical safety net adopted by the maintainer in
[ADR 0008, amendment #560](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/560),
not a BB2025 rule. The native counter persists as optional `kickoffAdjustments`,
resets when selection is confirmed into movement, and counts placements, swaps,
legacy reserve moves, selection toggles, Quick Snap moves and High Kick moves.
Existing player and movement rules can end a stage earlier.

After adjustment 50, offers retain only confirm/decline/end. A subsequent
adjustment is rejected as `INVALID_OPTION`, changes no state or durable history,
and never ends the stage. An illegal final Solid Defence edit restores its valid
base positions and still permits confirmation. Completion guidance counts players
actually displaced, with compatibility for historical zero-count states.

The generic guard fires on decision 1,024 (not 1,023), using existing event
snapshots across reacting coaches and stage transitions. An action entering a
new period is not charged to it. `endRunawayPeriod` runs in command acceptance
before the recording method, and retains `DECISION_LIMIT` with the public match
ID and native cleanup. Charge remains a kick-off during forced cleanup, and
half/drive/setup bookkeeping is preserved. Shared projections use a budget
interface rather than the concrete BB2025 step. The emergency guard itself adds
no recovery fields.

The existing computer policy recovery regression passes through acceptance,
duplicate requests, restart, save and resume. The investigated code path carries
memory correctly in that test; the historical null-memory cause was not reproduced.
Removing the kick-off stopping dependency handles that input directly.

## Initial implementation validation (before #558 resume)

The initial command `node --test computer-player/test/kickoff-bounds.test.mjs`
failed with: `Solid Defence kept placing players instead of confirming within six decisions`.
The fixed regression passes and also asserts that no selected player moves twice.

- `npm.cmd test` in `computer-player`: 55 tests passed. The updated focused
  no-memory/Charge regressions pass as well.
- `npm.cmd --prefix browser-client test`: 540 tests passed.
- `npm.cmd --prefix browser-client run build`: TypeScript and Vite passed.
- Focused server selectors: kick-off policy/native integration, computer policy
  recovery, progress presentation, decision counting, Solid Defence redeployment
  and Quick Snap/High Kick movement passed. The final post-review run passed all
  19 cases (14 server and 5 native), including the added Charge emergency exit,
  direct over-limit placement and legacy selected-player checks.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install`:
  full `mvn clean install` passed in 18 minutes 23 seconds: 1,169 cases, zero
  failures/errors, 22 opt-in/environment-gated skips (19 common, 852 server and
  298 native cases). MariaDB integrations, optional workload/runtime probes and
  fixture-dependent recovery checks retain their standard skips. The final
  selected-player guard correction is covered by the subsequent focused run.
- Final local artifacts were refreshed successfully with the pinned Maven/JDK
  and `mvn install -DskipTests` after the final focused checks; completed tests
  were not repeated for packaging.
- Native engine runner, Orc home / Human away, seed 73: full time, 1,691
  accepted decisions, zero rejected actions or stalled responses, 45 duplicate
  checks and 16 restores. Runtime about 117 seconds. The run included a prolonged
  reroll-choice cycle; the match subsequently advanced and finished. That separate
  policy/prompt behavior was not expanded into this fix.
- Human home / Orc away, seed 42: reached 472 decisions, 12 duplicate checks
  and four restores with zero rejected actions, then the random home fixture had
  no setup candidate after a setup refusal. This run did not reach full time.

The engine runs use `computer-player/test/engine-match.mjs` with the current
worktree's compiled classes, Node 26, the configured JDK 21, and test dependencies.
Logs and JSON receipts remain in the worktree's ignored `.tools/553-*` files.
No dev-local service or database was changed.

## Self-review

Checked the diff against the issue and repository conventions. Review addressed
the illegal-formation dead end at the placement cap, historical zero-count
completion projections, native allowance restoration, Charge cleanup mode and
half/drive bookkeeping. Legacy native placements now also reject unselected
players, preventing edits to fixed players from stranding a capped formation.
Browser-generated asset content was unchanged; its build
only rewrote line endings, which were restored.

## Remaining acceptance work

The three-hour soak has not been rerun. Its no-over-bound-turn/event criterion
remains unverified in the hosted stack. No heap-isolation or restart-quarantine
claim is made here: that is #554's independent workstream.

The original checkout's uncommitted soak-review edits are preserved. The user
authorized committing, pushing and opening a PR for review on 2026-11-15. The
three-hour soak remains outstanding; this does not authorize merging or deployment.

## #558 resume: maintainer decisions and review

Source: the [maintainer decisions](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/558#issuecomment-6900484362)
and the amended [ADR 0008 in #560](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/560).
The branch stays based on its original main commit because GitHub reports it
mergeable; no main merge/rebase is authorized without a reported conflict.

Implemented the 50-adjustment contract, no-mutation rejection, native restore and
stage reset, pure recording boundary, shared budget interface and explicit
imports. Restored Solid Defence's movement assertion using a fixture with an
available canonical target. Added exact guard-boundary and period-transition
tests, deduplicated native cleanup, hoisted budget queries, replaced the Charge
flag with a turn mode, centralized action/selection kind names and used a period
value type. The reflection helper remains deferred to #544 as requested.

The new selection regression was run against the old implementation and failed
because toggles were still offered after adjustment 50. An initial test-fixture
error selected Decline instead of a player toggle; it was corrected before the
reported behavioral baseline. Focused server/native validation subsequently
passed. Final focused checks passed 25 cases (18 server, 7 native). `npm.cmd test` in
`computer-player` passed all 56 cases. No client code changed, so browser tests
and the browser build were not rerun on resume, as directed.

### Per-period decision counts

The acceptance runner counts each new accepted decision once against its
pre-decision turn or kick-off event. Exact retries, loads and restores are not
counted. Selection and movement share an event period, and reacting coaches do
not reset a turn. The accounting has a dedicated regression test.

| Seed / fixture | Result | Accepted decisions | Largest turn | Largest kick-off event | Emergency guard warnings |
| --- | --- | ---: | ---: | ---: | ---: |
| 42, Human / Orc | Stopped at known home setup-candidate limitation | 403 | 53 | 8 (Solid Defence) | 0 |
| 73, Orc / Human | Full time, 0-2 | 1,817 | 1,024 | 7 (Quick Snap) | 1 |

Seed 42 had zero rejected actions, 10 duplicate checks and 4 restores. Its
High Kick event had one decision. Seed 73 had zero rejected actions, 49 duplicate
checks and 18 restores. Its longest turn was half 2 / drive 3 / home turn 1 / away
turn 2: the existing reroll-choice cycle reached exactly 1,024 and the emergency
guard ended it. Every other turn in that run had at most 61 decisions. Those
other periods have headroom, but the full run does **not** demonstrate a quiet
guard in all play. The reroll-choice cycle and seed 42's setup-candidate limitation
remain outside this resume's code changes; neither is hidden as a successful
normal-play measurement. The hosted soak is still pending and was not run.

Commands used the configured JDK 21 and the current worktree's compiled native
harness with `node computer-player/test/engine-match.mjs`, seeds 42 and 73,
`--timeout-ms 180000`, and the roster pairs above. Receipts are
`.tools/558-engine-{42,73}.json` and `.tools/558-seeded-status.json`.

### Full-build attempts

Attempt 1: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install`.
Started after checking that no other Maven build was running. **Failed** after 14 minutes 46 seconds: 1,176 cases, one failure, zero errors,
22 standard skips. The only failure was
`SetupSessionTest#selectedChargePlayerCanTakeNativeKickoffTurn`, whose old
whole-native-snapshot assertion did not allow selection to persist the required
native counter. Structural comparison proved that the sole native difference was
`currentStep.kickoffAdjustments`: absent to 1. The test now asserts that value
explicitly and compares every remaining native field unchanged; an exact retry
also leaves the complete native state/counter unchanged. An initial focused
expectation fix exposed JSON member-order-sensitive equality; removing only the
explicitly checked counter from the parsed comparison avoids that test artifact.
Both focused invocations are retained in `.tools/558-charge-snapshot-fix*.log`.

Attempt 2: the same full command, permitted only after the above fix. **Passed**
in 17 minutes 4 seconds: 1,176 cases reported, zero failures/errors, 22 standard
skips (19 common, 857 server, 300 native). The corrected Charge snapshot test
also passed independently before this retry. Both attempts ran sequentially;
no third full build was run. Logs and timestamps are retained in
`.tools/558-full-build-attempt-{1,2}.log` and their matching status JSON files.

Self-review checked the scoped diff against AGENTS.md, #553 and amended ADR 0008.
`git diff --check` passed. GitHub reported the PR mergeable, so the branch was
neither rebased nor merged with main. The hosted soak remains pending.


## #558 second review

Source: [second-round review at `95b116a19`](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/558#issuecomment-6906493921).

1. Solid Defence offers now use `PLAYER_IDS_SELECTED` on the native step for
   movers and swap targets, independently of active flags. The regression applies
   every offered placement independently to the real native step and verifies a
   position change, including both players in swaps. It reproduces the old no-op
   when unselected players retain active flags as in the reviewed soak state.
2. `SetupSession.periodView()` supplies all period fields and the complete Charge
   fallback to both recorded views and the guard. There is one derivation.
3. Offers and accepted selection toggles share `KickoffBudgetLookup`, including
   the case where the allowance lives below an interrupting step. Its regression
   checks current, stacked and absent budgets.
4. Under the [additional maintainer decision](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/558#issuecomment-6906648989),
   `KickoffAdjustmentBudget.completedParticipants()` is ruleset-neutral. The BB2025
   step implements Solid Defence's displaced-selected-player count, Quick Snap's
   native moved-player count, and High Kick movement progress. Other events have
   no participant moves in this step or hand off to a native turn. Presentation
   gets `completed` through the interface without event-specific counting.
   Native progress/restore/swap assertions and the Quick Snap projection exercise
   that method. The interim BB2025 projection helper was removed before commit.
5. A session owns its `DecisionLimit`. It rebuilds lazily once from restored
   events, then reads only appended snapshots. No new checkpoint or wire fields.
   The regression verifies each of 1,023 recorded snapshots is read once across
   repeated guard queries, while retaining exact 1,023/1,024 and transition tests.
6. The separate seed-73 reroll-choice loop already has
   [#561](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/561).
   No duplicate issue was created or existing issue edited. `Refs #553` remains;
   full quiet-guard seeded-match evidence and the hosted soak remain pending.

### Reproduction and validation

The first test fixture used the wrong factory source for native-step restore;
its correction initially failed compilation. Those fixture attempts are recorded
in `.tools/558-round2-red*.log`. With the correct rules factory, a fresh event did
not reproduce the mismatch because it deactivates unselected players. Retaining
the reviewed active flags made the exact symptom fail: `solid-place` left its
mover at `(13,6)`. The fix filters by native selection, so no activation-state
assumption is needed.

The first affected-suite run passed all 21 server cases, then failed native test
compilation because one progress assertion still referenced the removed native
method. The assertion now calls the BB2025 projection helper. Final pre-amendment validation passed 29 focused cases. After the user's
additional maintainer decision, the amended focused selector again passed 29
cases (21 server, 8 native), including generic progress through native restore.
The full-build result is recorded below after completion.

The first full-build attempt for this second review was interrupted when the user
added the maintainer's generic-progress amendment. It is not a validated build of
the final source. Its status/log are `.tools/558-round2-full-attempt-1.*`.
The final-source full build is recorded separately after amended focused checks.
The sandboxed computer-player invocation encountered denied Windows process
inspection and was stopped; the owner-permission rerun passed all 56 tests
(`.tools/558-round2-computer-tests-owner.log`).

Final-source full build: **PASSED** in 17 minutes 33 seconds, 1,179
reported tests, zero failures/errors, 22 standard skips. Module counts:
19 common (0 skips), 860 server (15 skips), 300 native (7 skips).
Command: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 install`.
Started 2026-11-15T22:49:08.1715376-05:00; finished 2026-11-15T23:06:46.3408985-05:00.
Receipt: `.tools/558-round2-full-attempt-2.log` and `.status.json`.
Only one full build completed in this review round; the other was interrupted
for the user's added maintainer decision. The final amended focused suite passed
29 cases and the owner-permission computer-player suite passed 56. Browser
checks and seeded engine runs were not repeated for this revision; no client or
policy code changed. Historical seeded limitations and the pending soak remain
as documented above. Self-review and `git diff --check` passed.
