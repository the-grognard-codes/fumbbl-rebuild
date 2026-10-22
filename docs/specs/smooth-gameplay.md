# Feature: Smooth gameplay
## Abstract
Measure and improve current browser gameplay timing without changing game rules.
## Objective
Remove unexplained confirmation delays, staggered movement and position jumps during normal play. Prioritize immediate feedback and prompt starts over fixed animation duration.
## Context / Existing Behavior
Initial inspection found discrete 190 ms playback beats, separate transcript fetches, and a one-second missing-transcript fallback. A browser frame reproducer then confirmed that a later projected-pitch CSS rule disables movement transitions; the earlier 200 ms transition declaration does not apply. Rebuilding unchanged stadium surfaces also stalls presentation. Historical V1 localhost round trips averaged 5.44 ms; that is not evidence for current V2 gameplay.
## In Scope
- Correlated browser request, authoritative response, event/dice availability and presented-frame measurements; server queue, engine and persistence spans.
- Baseline and post-change distributions and traces for ordinary movement, queued routes, roll boundaries and blocks.
- Evidence-driven event delivery and presentation improvements.
- Bounded provisional movement through the initial previewed route with no forecast checks/reactions; no predicted outcomes.
- Windows browser and physical Lenovo Android tablet acceptance.
## Out of Scope
- Rules/mechanics changes, unrelated UI redesign, Linux performance acceptance, production deployment.
## Functional Requirements
- Immediate pending feedback; at most one unacknowledged mutation.
- Continuous ordered movement; accelerate backlog and mandatory-decision catch-up.
- Provisional movement stops before dodge/rush/pickup/jump/reaction uncertainty; confirmation does not replay already presented motion.
- Route forecasts omit activation rolls. Provisional travel therefore requires the player to be authoritatively active already; a new activation waits for its server result.
- Server remains authoritative; rejection/disconnect/recovery reconcile provisional state without modifying replay history.
- Missing history uses bounded explicit synchronization then authoritative reconciliation. Never invent a path.
- Dice faces and choices come from server outcomes. Decoration never holds mandatory decisions.
- Preserve replay speeds, skip animations, reduced motion, themes and typography.
## Acceptance Criteria
- Provisional p95 ceilings: input feedback <=100 ms; eligible presentation <=100 ms after required authoritative data arrives.
- Measure full end-to-end latency including fetching and playback waiting; establish release thresholds from baseline before performance fixes.
- Report mean, median, p95, maxima and frame stalls with hardware/browser/network conditions and individual slow traces.
- Pass appropriate unit/browser/server validation and inspect live-play, replay and recovery appearance.
- Physical Android acceptance is a separate required evidence item; emulation is not hardware performance evidence.
## Constraints
- New branch from current main; preserve unrelated edits.
- Follow repository conventions; preserve checkpoint-before-ack durability and bounded transcript authorization.
- No staging, commits, pushes, PRs, merges or deployment authorized.
## Implementation Guidance
Baseline first, then select and validate fixes. Local design mirror: docs/specs/smooth-gameplay.md.
## Validation
Focused regression checks followed by relevant browser builds, browser unit/interaction suites, and Maven build/tests. Include duplicates, delayed/missing history, rejection, disconnect, decision interruption, live/replay/recovery and reduced motion.
## Completion Notes
Record findings, fixes, self-review, exact commands, measurements and remaining hardware gaps in docs/specs/smooth-gameplay-outcome.md. Keep issues open pending acceptance.

## Tracking
- Parent: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/324
- Baseline and instrumentation: #326
- Authoritative event delivery: #327 (after #326)
- Playback and provisional movement: #328 (after #326 / #327)
- Windows and physical Android acceptance: #330 (after technical slices)
- Branch: `feat/smooth-gameplay`, based on `b73f7ad8f`.
- Status: implementation and independent review complete; browser validation and
  final server/common build passed. Windows baseline and post-change workloads
  captured; rendering tails leave performance acceptance open. Two final native
  dice fixes have regression coverage but no subsequent full timing workload.
  Physical Lenovo tablet validation is deferred to the user by explicit agreement.
  See `smooth-gameplay-outcome.md` for evidence and remaining acceptance limits.
  The user recording exposed repeated normal-action history waits; negotiated
  data-before-state delivery now has actor, spectator, overlap and gap-recovery
  regression coverage. See `smooth-gameplay-video-followup.md` for this follow-up
  and its validation; the earlier timing distributions predate that correction.
