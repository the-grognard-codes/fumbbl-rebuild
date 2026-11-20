# Bounded burst playback (#526)

Part of [#526](https://github.com/the-grognard-codes/moles-under-the-pitch/issues/526).
PR #541 targets `main` after #538 merged. The integration includes the animated
splashes from #569 and computer parking from #575.

## Presentation contract

Live native playback enters catch-up at eight queued revisions and keeps a 4x
rate through the tail. Every confirmed square and native dice group still
commits in authoritative order. Provisional movement remains at normal speed;
replay uses its selected speed, and reduced motion commits discrete squares.

Announcements have a separate ordered queue. Turnover and touchdown each get
3,000 ms before exit and turn start gets 1,500 ms. The animated exit takes
200 ms in both motion modes. Reduced motion uses an opacity fade in place of
the animated collapse. The clear gap is 350 ms, or 125 ms with the shade held
between consecutive cards. Catch-up leaves all three phases at 1×. Each replay
card uses the speed selected when it starts. The other animated splash kinds
keep their #569 timings.

Native moves and dice continue behind a splash, including one held until
dismissal. Required choices open after earlier cards and their gaps clear.
A touchdown and Star of the Show offer in the same update present the touchdown
first. The touchdown score is revealed when its card starts. Reconnect and
replay seek show the authoritative score immediately.

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

At 4×, scheduled native move/dice delays total up to 5,250 ms. With three
unchained splashes, reading, fade and gap delays total 9,150 ms in both
motion modes. A conservative serial budget is 14,400 ms. In the browser the
two queues overlap, and the test measures both bounds from the time the final
authoritative revision is published to the harness. Board lag ends at the first
commit of that revision. Full drain ends when it is committed and the input
barrier has cleared. The test's 15-second bound applies to the stated
foreground workload with available history. A held card can postpone input
indefinitely and the test still requires the native board to catch up within 15 seconds.

Integrated capture on Chrome 157.0.8103.79 on November 20, 2026.

| Mode | Board lag | Full drain | Revisions / rolls / splashes |
| --- | ---: | ---: | --- |
| Normal | 6,045.6 ms | 11,261.6 ms | 30 / 15 / 3 |
| Reduced motion | 4,824.0 ms | 10,792.4 ms | 30 / 15 / 3 |

Both results stay within the independent 15-second bounds. The three
reduced-motion exits add 600 ms to the scheduled splash time relative to the
previous zero-fade implementation.

The [committed numeric evidence](bounded-playback-measurements.json) is emitted
by `test/playback-burst-ui.mjs` with `PLAYBACK_BURST_EVIDENCE`. It includes the
reading, fade, and clear gap for each card. Both modes also present all 31
revisions and 15 rolls behind a held first splash, preserve all three splashes
before the choice, and verify same-update touchdown and cleanup ordering.

Validation passed for 559 browser unit tests, the production browser build,
fixed bursts, held and same-update choices, announcement animation and score
timing, playback cadence and motion, reconnect, and bounded match DOM growth.

## Combined soak evidence

Use the disposable branch that combines #559, #543, and #541. Record the exact
head SHA of each PR and the combined build SHA with the run. Capture peak
client revision backlog under real computer bursts, board lag to the final
presented revision, and full drain to input availability. Report computer
revision inter-arrival p50, p90, and p99 from authoritative arrivals during
computer turns. Include sample counts and distinguish timed from held splashes
when reporting drain.

The #522 baseline reached 30 queued revisions, with computer inter-arrival
p50 of 138–156 ms, p90 of 1,255–1,846 ms, and p99 of 10,101–14,072 ms. Computer
work after #575 may include a wake-up, reload, and decision before publication.
The eight-revision entry threshold is preserved pending measurements of that
arrival pattern. The combined live soak remains pending. [#522 baseline](gameplay-soak-review.md) · [Combined soak handoff](https://github.com/the-grognard-codes/moles-under-the-pitch/pull/559#issuecomment-7031175823)
