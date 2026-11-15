# Bounded burst playback (#526)

Part of [#526](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/526).
Stacked on #538 at `ccb65b52e`; merge the DOM/history slice first.

## Presentation contract

Live native playback enters catch-up at eight queued revisions and keeps a 4x
rate through the tail. Every confirmed square and native dice group still
commits in authoritative order. Provisional movement remains at normal speed;
replay uses its selected speed, and reduced motion commits discrete squares.

Announcements have a separate ordered queue. Catch-up never changes their
reading, fade or clear interval: turnover/touchdown read for 3,000 ms, turn start
for 1,500 ms, with a 200 ms fade (zero in reduced motion) and a 350 ms gap.
Replay speed still applies. Native moves and dice continue behind a splash,
including one held until dismissal. Required choices do not snapshot the board,
dismiss a splash or suppress queued announcements. Choices open after that queue
finishes; a held splash waits for the coach. A touchdown plus Star of the Show
offer in the same update presents the touchdown first.

The maintainer's supplied ordering patch is the separate commit `2524ed4e8`
(`docs: revise announcement ordering`). The expanded edge-case matrix is #547,
outside this slice.

## Stated maximum lag and evidence

For a foreground, fully available transcript containing at most the declared
30-revision burst (30 moves, 15 blocking dice groups, three announcements), the
maximum allowed elapsed lag from receipt of its authoritative final revision to
presentation of that revision is **15,000 ms**. The automated test asserts this
board-lag bound independently of its 15,000 ms full input-barrier drain bound;
it also asserts every revision, square and roll, rather than only the end state.
The initial revision gap is at most 30 for this envelope. Arrivals stop during
measurement; neither disabled playback nor hidden-tab recovery is exercised as
a way to meet the bound.

At 4x, scheduled native move/dice delays total 5,250 ms. Full announcement
reading/fade/gap delays total 9,150 ms (8,550 reduced), giving a conservative
serial scheduled-delay budget of 14,400 ms (13,800 reduced). The queues overlap;
the 15-second regression limit also checks browser scheduling overhead on the
declared workload. It is a tested foreground workload bound, not a real-time
guarantee for an arbitrarily stalled browser. Continuous arrivals, arbitrarily
large event lists and unavailable transcripts have no finite universal lag
bound. Until-dismissed announcements do not bound choice availability, but the
test still requires native board catch-up within 15 seconds while held.

Retained resume-round capture on Chrome 157.0.8103.52, 2026-11-15 UTC:

| Mode | Board lag | Full drain | Revisions / rolls / splashes |
| --- | ---: | ---: | --- |
| Normal | 5,707.4 ms | 11,106.3 ms | 30 / 15 / 3 |
| Reduced motion | 4,703.0 ms | 10,156.2 ms | 30 / 15 / 3 |

The [committed numeric evidence](bounded-playback-measurements.json) is emitted
by `test/playback-burst-ui.mjs` with `PLAYBACK_BURST_EVIDENCE`. It supersedes the
inconsistent old 8,042/8,082 and 6,798/6,795 ms observations. Both modes also
present all 31 revisions and 15 rolls behind a held first splash, preserve all
three splashes before the choice, and verify same-update touchdown/cleanup
ordering. Each timed splash's measured reading duration is retained in JSON.

Validation: 540 unit tests; production browser build; burst/held/cleanup tests;
existing announcement duration, dismissal, replay, recovery and responsive
checks. The prior resume round also passed its full Java build; this review correction changes browser presentation only.

Pending user evidence after #489: live backlog depth, board lag, drain time and
AI inter-arrival p50/p90/p99 against #522. The local stack and credentials remain
untouched. This stays Part of #526 until that soak is measured.

Review correction: queued touchdown announcements carry their recorded home/away
scores. Native revision completion and ordinary caught-up refreshes preserve the
presented score while a touchdown is queued; startNextAnnouncement applies it
when that touchdown becomes active. Tests cover both scoring sides behind START
OF TURN through reading/fade/gap, plus immediate authoritative score on reconnect
and replay seek. Recovery/cancel/snapshot paths do not mask the authoritative score.
