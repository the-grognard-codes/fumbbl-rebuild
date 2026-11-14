# Bounded burst playback (#526)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/526

Live playback enters catch-up at eight queued revisions and uses four times
normal pacing until the queue drains. The latch avoids returning to slow waits
for the tail. It changes waiting durations, not authoritative order or recorded
outcomes: every confirmed square, native dice group and announcement still
commits. Catch-up preserves the established required-choice interruption policy, so a
held announcement cannot trap an offered mandatory decision. Normal live cadence below the threshold, provisional movement,
replay speed controls and reduced-motion discrete squares remain unchanged.
Explicit announcement holds continue to wait for the coach.

The automated bound is 15 seconds to drain the fixed 30-revision workload with
30 moves, 15 block-roll groups and turnover/touchdown/turn-start announcements,
with a required choice offered after that burst drains. A separate test
offers a mandatory choice during a held catch-up banner and checks immediate
access. A local run drained in 8,042 ms normally and
6,798 ms with reduced motion, presenting every roll and announcement in order.
Before the fix the normal run exceeded 15 seconds. This bound describes the
declared burst after arrivals stop. Arbitrarily large native event lists,
continuous arrivals, missing transcript, hidden-tab recovery and explicit user
holds do not have an unconditional elapsed-time bound. No presentation is
dropped to meet a revision-count cap.

Validation: browser unit suite 539 passed; browser build passed; burst test and
existing playback/dice/recovery suite passed. Ordinary movement and ball motion
browser checks retained intermediate painted positions. Announcement preference
and recovery checks are recorded in the PR. No server or computer-player source
changed.

This branch is stacked on codex/527-bounded-match-dom (PR #538); review and merge
the DOM/history slice first. No merge is authorized overnight.

Pending user evidence: soak after #489 with backlog depth, drain time and AI
inter-arrival p50/p90/p99 compared with #522. The local stack and interactive
credentials remain untouched.

## Acceptance gap requiring a maintainer decision

#526 asks that required announcements are never skipped; the established
match-transition-announcements contract gives newly offered mandatory choices
priority and cancels active/queued decorative splashes immediately. This branch
preserves choice priority, including during catch-up, rather than allowing a
held splash to consume an expiring reaction deadline. Therefore the universal
never-skipped-announcement criterion is not claimed. A maintainer must decide
whether priority cancellation remains an allowed exception or design deferred
announcement presentation after the decision. The PR stays draft for that
policy gap; the ordered 30-revision burst and its drain bound are validated.
