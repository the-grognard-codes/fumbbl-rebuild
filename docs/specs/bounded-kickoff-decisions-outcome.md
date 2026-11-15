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

Solid Defence permits at most twice the selected count in placement edits,
including corrections and swaps. The native counter survives checkpoints. The
action projection then offers only confirmation; an over-limit direct native
placement ends the event. An illegal last edit restores the original valid
formation instead of leaving the coach stuck. Completion guidance counts selected
players actually displaced, with compatibility for historical zero-count states.

The generic 1,024-decision guard reads existing event snapshots, including
selection decisions and reacting coaches. It ends the native period and emits
`DECISION_LIMIT` with the public match ID. It introduces no new stored envelope
or recovery fields. Charge stays a kick-off sequence during forced cleanup, and
half/drive/setup transitions retain normal session bookkeeping.

The existing computer policy recovery regression passes through acceptance,
duplicate requests, restart, save and resume. The investigated code path carries
memory correctly in that test; the historical null-memory cause was not reproduced.
Removing the kick-off stopping dependency handles that input directly.

## Reproduction and validation

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
