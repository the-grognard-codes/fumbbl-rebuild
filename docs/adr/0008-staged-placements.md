# Stage placement-style actions in memory and make only their confirmation durable

Status: accepted on 2026-11-15.
Approval: [maintainer acceptance](../specs/staged-placements-adr.md#maintainer-acceptance)
Amended: 2026-11-15, adjustment limit ([maintainer decision](../specs/staged-placements-adr.md#amendment-2026-11-15-adjustment-limit))
Date: 2026-11-15
Issue: [#555](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/555)
Request: [staged placements ADR request](../specs/staged-placements-adr.md)
Implementation: [#556](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/556)
Amends: [ADR 0002](0002-bounded-match-transcript.md), [ADR 0004](0004-durable-recovery-journal.md)
Evidence revision: `33d95b7c6`

Today every placement during setup and kick-off events goes through the same durable path as a block or a pass:
- a revision
- a full-state event
- a transcript record
- a recovery checkpoint

In the 2026-11-15 soak, one looping coach turned 1,000 such placements into a 46.8 MB match that exhausted the heap. Placements have no rules consequence until they are confirmed. This ADR therefore **stages** them: each placement updates the in-memory board and is broadcast live to every viewer, and only the confirming action is durable.

## Decision and boundaries

### What is staged

A **staged action** changes player positions within a stage that ends in an explicit confirming action, and:
- rolls no dice and reveals no hidden information
- offers the opponent no decision or reaction
- is either validated, or wholly superseded, by the confirming action

Any action that fails one of these tests is durable. New actions are classified by this rule. A reviewer must reject a staged classification that cannot cite its confirming action.

Staged actions at `33d95b7c6`:

| Stage | Staged actions (code) | Confirming durable action |
| --- | --- | --- |
| Setup | `SetupSession` `place` operation: placements, swaps (`swapTarget`) and moves to reserves (`to: null`) | `SetupSession` `confirm` → `ClientCommandEndTurn(TurnMode.SETUP)` after `checkSetup` |
| Setup | `SetupSession` `formation` operation (applies a saved formation through `SavedFormationDeployment`) | same `confirm` |
| Kick-off event selection (Solid Defence, Quick Snap, Charge) | `KickoffActions` `event-pick:*` select/deselect toggles. These currently increment `revision` and record a `SELECTION` event. | `event-confirm` / `decline-event` → `ClientCommandPlayerChoice` |
| Solid Defence | `KickoffActions.solidDefence` and `legacySolidDefence`: `solid-place:*` (`ClientCommandSetupPlayer`) | `confirm-solid-defence` → `ClientCommandEndTurn(TurnMode.SOLID_DEFENCE, coordinates(...))` after `checkSetup` |
| Quick Snap | `KickoffActions` `event-*` `kickoffMove` one-square moves under `TurnMode.QUICK_SNAP` | `end-event` → `ClientCommandEndTurn(TurnMode.QUICK_SNAP)` |
| High Kick | `KickoffActions` `event-*` `kickoffMove` under `TurnMode.HIGH_KICK` | `end-event` → `ClientCommandEndTurn(TurnMode.HIGH_KICK)` |

**Not staged:**
- Charge movement. Its moves are real actions.
- Kicking, touchback and every other action.

**Charge:** only its selection toggles are staged. Its moves are not.

**Swarming:** the engine has `StepSwarming`, but Browser V2 offers no Swarming actions yet. If it is added, its placements are staged under the rule above.

**Default deployment:** `deployDefaultSetup` places the coach's first saved formation for the role (or the fallback) when a setup step begins. That stays part of the durable action that started the stage. It forms the stage's **base positions**.

### Live delivery: best effort

- **Message shape.** A staged action produces a small `stagedPlacement` message to both coaches and all observers. It carries:
  - `matchId`
  - `baseRevision`, the durable revision the stage belongs to
  - `stageSeq`, a counter that rises within that base revision
  - the players touched during the stage, each as a player ID and square (or reserve)
  - `selectedPlayerIds`, the full current set of staged participants. During kick-off selection an empty list clears the highlight.
- **Revision.** It never increments `revision`.
- **Ordering.** Clients apply a message only if its `baseRevision` equals their current revision and its `stageSeq` is higher than the last one applied. Anything else is dropped.
- **No catch-up machinery.** There are no acknowledgements, retries or gap detection. A missed message is corrected by a later staged message (which carries all touched positions and the current selection), by the confirm, or by a reconnect.
- **Reconnect.** A reconnecting or newly joining viewer receives the current durable state plus the current staged positions and selected participants in its normal state response. No missed messages are replayed.
- **Publication rules.** Publication follows [ADR 0006](0006-single-engine-worker.md): it runs on the engine worker, makes no per-recipient provider or service calls, and needs no JDBC.

### Durability

- **Confirm.** The confirming action is the only durable step in a stage. It produces exactly one revision, one state snapshot, one transcript record and one checkpoint, all holding the final positions.
- **Ending a stage.** Confirming a selection passes its participants to the native command. Declining it clears the selection. Concession ends the match from the confirmed board. While adjustments are pending, the acting coach's unrelated gameplay commands are rejected. The other coach's commands use normal role and action checks. Either coach can use the separate save/resume protocol without clearing the stage.
- **No interim records.** Staged actions write no checkpoint, journal entry, event, transcript record or durable request history.
- **Crash, release or reload before confirm.** Recovery restores the last checkpoint, which holds the stage's base positions. That is as if no staged action ever happened, and the coach starts the stage afresh.
- **Request idempotence.** Each staged request ID is deduplicated in a small in-memory set held by the resident session. It is cleared at confirm and lost on restore, where a retried staged request simply applies to the restored board. The confirming request keeps its existing durable request-history entry.

### Disconnect and clock expiry

- **Disconnect** never makes a durable decision. While the session remains resident, the staged positions stay in memory, so a reconnecting coach resumes where they were. If the session is released, the stage restarts from its base positions.
- **Clock expiry.** When clock enforcement is enabled (see clock scope below), expiry during a stage forces a durable confirmation, in this order:
  1. **Latest staged positions.** If the latest in-memory positions pass the confirming action's legality check (`checkSetup` for setup and Solid Defence; the event rules for Quick Snap and High Kick), confirm them.
  2. **Setup only: first stored formation.** Otherwise, deploy the coach's first stored formation for the role (offense when receiving, defense when kicking), then confirm.
  3. **Setup only: fallback template.** If the team has no stored formation for the role, deploy the built-in fallback: **Chevron Defense** or **5-4-2 Offense** (`TeamFormations.defaults`).
     - **Gaps in the template:** missing jersey numbers, or fewer than 11 available players, are filled by `SavedFormationDeployment.complete`, for human and computer coaches alike. That fields `min(11, available)` players with at least `min(3, available)` on the line of scrimmage, and players who must be set up first.
  4. **Last resort: line of scrimmage.** If every fallback still fails the legality check, move players until three are on the Line of Scrimmage, then confirm.
     - **Three or fewer players.** The BB2025 rule applies: a team that can field only three or fewer players deploys all of them in the Centre Field, directly adjacent to the Line of Scrimmage. They are placed there and confirmed.
     - **The engine already does this.** `SavedFormationDeployment.complete` fills the line of scrimmage (`x = 12` in home coordinates) from the centre-field rows first (`freeSquare` order 7, 6, 8, 5, 9, 4, 10). Confirm in the implementation that this matches the rule.
     - **Always terminates.** No forced concession is needed, because this step always produces a legal setup.
  - **Kick-off events.** In a Solid Defence, Quick Snap or High Kick stage whose staged positions are illegal, the board reverts to the stage's base positions, which were already legal, and the event ends.
- **Clock scope.** The match clock is display-only today; turn and bank time are tracked but not enforced.
  - **Future toggle:** enforcement is planned as a match option that is off until it is introduced.
  - **This ADR:** it defines only what clock expiry does to a staged stage once the toggle exists and is on.
  - **Out of scope:** building the toggle, and enforcing the clock for ordinary turns.

### Replay

Replays and the match transcript record only confirmed states. A replay shows a formation appearing at confirm. Interim placements are not preserved.

### Limits

**Rules limits.** Rules limits still apply to every staged action, for example Solid Defence's player count. A placement that breaks a rules limit is rejected with `INVALID_OPTION` and broadcasts nothing.

**Adjustment limit (amended 2026-11-15).** This is a technical safety net against runaway loops (#553), not a BB2025 rule: the tabletop rules limit which players move, not how often a coach rearranges them.
- **Kick-off events:** each kick-off-event stage allows at most **50 adjustments**. That covers Solid Defence, Quick Snap and High Kick movement, and the selection toggles for those events and Charge.
  - **What counts:** each accepted placement, swap, move to reserves or selection toggle.
  - **Who it applies to:** all coaches, human and computer alike.
  - **Size:** the limit is set high enough that a coach rearranging by hand never reaches it in normal play.
- **Setup:** the setup-stage limit is set by the implementation and stated in its outcome. It must leave room to place a full team and rearrange it.
- **When the limit is reached:**
  1. Further adjustments are no longer offered. Confirm (or decline or end) remains available.
  2. An adjustment sent anyway is rejected with `INVALID_OPTION`, and broadcasts and records nothing. It never ends the stage by itself.
  3. If the positions are illegal when the limit is reached, the board reverts to the stage's base positions, which are always legal. Confirm is then offered. This is the same revert rule that clock expiry uses for kick-off events (above).
- **Where the counter lives:**
  - **Until #556 lands:** the counter lives on the native kick-off step (#553, PR #558) and survives checkpoint restore.
  - **With #556:** staged actions bypass the native step and the recorded events, so the counter moves into the staging layer. Under the [November 17 maintainer decision](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/574#issuecomment-6967747125), the emergency 1,024-decision guard counts durable decisions only. Each stage has its own adjustment limit.

### Budget

- **Engine worker.** Staged actions run on the engine worker, because they mutate native board state. They do no I/O, and they are small next to the 2,000 ms request ceiling.
- **Durable work.** The confirm keeps today's durable cost: one checkpoint per stage instead of one per placement.

### Stored formats

- **Old format retired.** The project is still in build, so this ADR retires the per-placement stored format without a dual reader.
- **Version bump.** The implementation increments the recovery artifact's `runtimeVersion`, and the transcript `formatVersion` if its record shape changes.
- **Older artifacts.** They are refused explicitly with `RECOVERY_UNSUPPORTED`, and are never restored partially.
- **Existing matches.** Dev-local and any other stored matches are cleared when this is deployed. This is the ADR retirement that the "stored formats stay compatible" invariant permits.

## Amendments

- **[ADR 0002](0002-bounded-match-transcript.md), bounded transcript.** The transcript records accepted durable decisions. Staged actions are not decisions, so the transcript records only their confirmation.
- **[ADR 0004](0004-durable-recovery-journal.md), recovery journal.** "A successful checkpoint commits an action and its outcomes together" applies to durable actions. Staged actions have no durable boundary, and recovery returns to the stage's base positions.
- **Turn-sequence ADR (#551).** If ADR 0007 is accepted, staged stages sit inside its setup and kick-off phases. The confirming action is that phase's decision.

## Glossary (`CONTEXT.md`, applied 2026-11-15)

> **Staged placement**:
> A player position change during setup or a kick-off event that every viewer sees live, but that is not recorded until the coach confirms the stage. Recovery and replay ignore it.
> _Avoid_: Provisional move (which names client-side movement forecasts)

> **Match checkpoint**:
> The durable state from which an unfinished match can resume at its last accepted decision. Staged placements are not part of it.

> **Match transcript**:
> The ordered, durable record of accepted decisions, revealed outcomes, board checkpoints, and chat for one match. A confirmed setup or kick-off event appears as its final positions.

## Architecture-map invariant (applied 2026-11-15)

> - **One durable boundary per action.** A successful checkpoint commits a durable action and its outcomes together. Exact retries read the checkpoint and append nothing. Storage admission rejects an action before native execution when it cannot reserve room. **Staged placements have no durable boundary. Only their confirming action does** ([ADR 0002](../adr/0002-bounded-match-transcript.md), [ADR 0004](../adr/0004-durable-recovery-journal.md), [ADR 0008](../adr/0008-staged-placements.md)).

## Alternatives considered

- **Keep placements durable and remove per-event full snapshots (#548 alone).** Smaller, but every placement still costs a checkpoint, a transcript record and a revision. Rejected as the fix for placements; #548 remains for other actions.
- **Coalesce placements into periodic checkpoints.** Rejected: the maintainer does not need interim placements recovered.
- **Keep placements on the client with no server relay.** Rejected: opponents and spectators must see placements live, and the server must validate each one.
- **Record a compact placement list at confirm for replay animation.** Rejected by the maintainer: replays need only the confirmed state.
- **Revert to the base positions on clock expiry.** Rejected: legal work-in-progress positions should be kept. A revert applies only when they are illegal.

## Consequences and known gaps

- **Storage and checkpoint cost:** setup and kick-off events cost one checkpoint and one event per stage, whatever the number of placements. A placement loop can no longer grow history.
- **Live view unchanged:** opponents and spectators still watch every placement.
- **Lost work on restore:** a crash or release mid-stage loses unconfirmed placements. This is accepted.
- **New client contract:** clients handle `stagedPlacement` separately from revisions. A well-formed frame that no longer fits the local stage is ignored in full. Stale checks, playback and the announcement queue key on `revision` only.
- **Clock expiry is specified ahead of its toggle.** When enforcement is introduced, staged stages need a deadline on the worker like `expireReactiveDecision`, and coach-facing presentation of a forced confirmation or revert. Until then, #556 implements the expiry sequence as the forced-confirmation routine and tests it directly, with no clock trigger.
- **Gaps to close in #556:**
  - `deployDefaultSetup`'s hard-coded fallback (3 + 8 players) is replaced by the Chevron and 5-4-2 templates completed by `SavedFormationDeployment.complete`.
  - `complete` currently runs only for computer coaches.
  - `SavedFormationDeployment.complete` must satisfy the three-or-fewer Centre Field rule, and the last-resort "three on the Line of Scrimmage" step must pass `checkSetup`. Both need tests with 1, 2, 3 and 4–10 available players.

## Revisit conditions

- **Durability or ordering.** A rules feature makes a placement-like action reveal information or offer the opponent a decision, or a dispute needs interim placements in a replay.
- **Best-effort delivery.** It proves visibly unreliable for spectators on real networks.
- **Stored formats.** The project leaves build status, and stored-format compatibility becomes mandatory for any further change in this area.
