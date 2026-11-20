# Feature: Count turn time only while the coach can decide

Issue: #588

## Abstract

A coach's turn clock and reserve should run like a chess clock: only while that coach has priority and can make a decision. Time spent waiting on the opponent's decisions, or watching the coach's own action resolve on the pitch (a player moving square by square, block dice, splashes), should not count.

## Objective

Make turn time measure decision time rather than wall-clock time since the turn started. Coaches should not lose turn allowance or reserve to presentation they cannot interact with, and the same rule should apply to timed reactions.

## Context / Existing Behavior

- **Allowances:** each turn has a 120-second allowance, backed by a 600-second reserve per coach (`ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupSession.java:122-123`; the browser mirrors them as `TURN_MS` and `RESERVE_MS` in `browser-client/src/match-clock.ts:3-4`).
- **How the server measures it:** the server projects the clock from wall time. In `SetupSession.clockProjection()` (`SetupSession.java:723-735`), elapsed time is `now - turnTimeStarted` whenever the turn timer is running. Time beyond the allowance is charged to the active coach's reserve.
- **Opponent reactions already pause it:** `ReactiveDecision` stops the turn timer while the opponent owns a timed reaction and restarts it afterwards (`ReactiveDecision.java:145-151`, using `UtilServerTimer.startTurnTimer` and `stopTurnTimer`). The reaction has its own 30-second allowance, starting when the server offers it (`ReactiveDecision.java:25`, `133-134`).
- **Save/resume pauses it:** suspension pauses the clock and resume rebases `turnTimeStarted` (`SetupSession.java:693-698`).
- **Resolution time is still charged:** the server resolves a committed action instantly, but the browser then presents it over several seconds. Movement steps, the ball, dice groups and splashes play in `browser-client/src/use-pitch-playback.ts`, and while playback is active the coach's controls are disabled (`playbackActive` in `GameView.tsx`). The server clock keeps running throughout, so a coach's own long move, block or failed dodge is charged as decision time.
- **The same applies to opponent-turn presentation:** a timed reaction offered at the end of a burst of opponent actions starts its 30 seconds when the server offers it, possibly while the browser is still presenting earlier revisions.
- **The browser display:** it extrapolates the server projection locally and only pauses for save/resume (`browser-client/src/LiveMatchScoreboard.tsx:114-122`, `match-clock.ts:6-16`).

## In Scope

- A server-authoritative definition of when a coach's turn clock and reserve run: only while that coach holds priority, meaning the next accepted decision is theirs and their presentation of the committed state has finished.
- Excluding the presentation time of committed actions from turn time, bounded so that a client cannot stretch the pause.
- Applying the same start rule to timed reactions, so their 30-second allowance begins when the choice can be made.
- Keeping the existing pauses: opponent reactions, save/resume suspension, and computer matches' parking.
- A browser display that matches the server rule, with no visible jumps when a projection arrives.

## Out of Scope

- Changing the 120-second turn allowance, the 600-second reserve or the 30-second reaction allowance.
- The one-hour human-decision deadline for abandoning computer matches, which measures absence rather than turn time.
- Replay presentation and replay speed controls.
- Spectator-only presentation, which never affects a coach's clock.

## Functional Requirements

- **When the clock runs:**
  - A coach's turn clock runs only while that coach has priority and the server is waiting for their decision.
  - It stops when the server accepts one of their decisions, and resumes when their presentation of the resulting committed state has finished, or when the presentation bound below expires, whichever comes first.
  - It does not run while the opponent owns any decision. That includes timed reactions, as today, and also untimed opponent decisions within the coach's turn, if any exist.
- **Bounding the pause:**
  - The server bounds each resolution pause by a deterministic presentation budget derived from the committed transcript records: movement steps, ball steps, dice groups and visible splashes, at normal live speed.
  - A browser acknowledgement can end the pause early but can never extend it beyond that budget.
- **Timed reactions:** a reaction's allowance starts when the deciding coach's presentation reaches the revision that offers it, within the same budget rule, not when the server first offers it.
- **Reconnects and missing acknowledgements:** a reconnecting coach, or one whose browser never acknowledges, is charged according to the budget alone. Coaches gain no time by disconnecting.
- **Coaches who reduce presentation:** reduced motion and hidden splashes shorten presentation, so they shorten that coach's pause.
- **Durability:** the clock state stays deterministic and recoverable. Checkpoints and journal entries record enough clock state that a restored match reproduces the same remaining allowance and reserve.
- **Computer coaches:** a computer coach's time is not charged to the human coach.

## Acceptance Criteria

- **Own resolution is free:** in a live match, a coach who commits a long move (say ten squares, a dodge and a block with dice) loses no turn time while the browser presents it. The clock resumes when presentation finishes, within the server budget.
- **Opponent decisions are free:** while the opponent makes any decision, the active coach's clock and reserve don't change.
- **Reactions start when visible:** a reaction offered at the end of a burst of opponent actions shows its full 30 seconds when the choice becomes actionable in the browser, and the server's deadline matches that, within the budget bound.
- **The pause can't be stretched:** a browser that never acknowledges presentation is charged after the server budget, so blocking the acknowledgement gains no more time than the budget allows.
- **Recovery preserves the clock:** saving, resuming, restarting the server and recovering a match all leave the remaining allowance and reserve unchanged.
- **No jumps:** the scoreboard clock and the server projection agree to within one second, with no backwards jumps after an action resolves.

## Constraints

- Preserve the MUTP colours, typography, style and themes. Reuse the existing scoreboard and clock components.
- Create a new branch for this work.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions (AGENTS.md), including BB2025-only rules and the `bb2025` and `common` package split.
- Do not commit or push unless explicitly requested.
- The server stays authoritative for every deadline. A client message can only shorten a pause, never extend one.
- Keep recovery checkpoints and the transcript format compatible, or version them explicitly as staged placements did.

## Implementation Guidance

- **Model priority on the server.** Give `SetupSession` an explicit owner of priority (coach, opponent, or none during presentation), and derive `clockProjection()` from accumulated decision time rather than `now - turnTimeStarted`.
- **Derive the presentation budget from the same beats the browser plays.** The `playbackBeats` inputs in `pitch-playback.ts` and the timing constants in `presentation-timing.ts` are the reference. Consider a small shared table so the server and browser cannot drift apart.
- **Acknowledging presentation:** a browser message stating that presentation has settled at revision N is the natural acknowledgement. Check that the existing `presentationRevision` bookkeeping in `use-pitch-playback.ts` can supply it, and accept at most one acknowledgement per revision.
- **Reuse the reaction timer.** The `ReactiveDecision` pause and resume calls are the closest existing pattern; extend them rather than adding a second timer.
- **Interaction with #541:** the bounded-playback catch-up and the splash queue it rebuilds determine the presentation length. Any budget table must match its timings.

## Validation

- Create new or update existing regression tests as required.
- **Server unit tests:** decision time versus presentation time for move, block, dodge, a failed action leading to a turnover, and a touchdown; the opponent-reaction pause; the presentation budget bound with no acknowledgement; and an early acknowledgement.
- **Recovery tests:** remaining allowance and reserve are the same after checkpoint restore, journal replay and save/resume.
- **Browser tests:** the scoreboard clock holds during playback and splashes and resumes at the acknowledged revision, the reaction countdown starts at full allowance when actionable, and there are no backwards jumps.
- **Soak:** in a computer match, measure the active coach's charged time against wall time across a full match.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
