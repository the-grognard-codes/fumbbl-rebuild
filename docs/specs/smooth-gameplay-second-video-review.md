# Remaining gameplay hangs: second recording

Reviewed 2026-10-21 on `feat/smooth-gameplay`, under #324, #326, #327 and #330.
Source: `archive/gameplay-recordings/game-performance-2026-10-21-144702.mp4`
(39.8 seconds, 2544 × 1596). Recording and derived diagnostic assets stay local.

## Findings

The hardware expectation is reasonable: target consistent 60 Hz presentation
(about 16.7 ms per frame) and immediate input feedback. A discrete GPU does not
accelerate blocking authorization, persistence, JavaScript or action scheduling.
Passing functional tests has not established this performance target.

The clip contains route presentation in the opening seconds, block and dice
decisions in its middle, and a failed pickup followed by a reroll and turnover
near the end. At approximately 33.75 seconds the failed pickup and reroll choice
are visible. By 37.2 seconds the display says "WAITING FOR THE OTHER PARTICIPANT"
and shows the next side's turn. These are decision/turn boundaries, not evidence
of a frozen graphics device. They do not explain all hesitation earlier in the
clip. Click-to-result durations cannot be established precisely from these still
samples, and player inactivity is not a measurement of browser FPS.

A 30 Hz decoded-frame scan found no whole-screen unchanged interval exceeding
150 ms under its pixel threshold. Cursor movement and codec differences can
mask an application freeze: this is only a screening result, not proof that the
main thread or GPU did not stall. No GPU-bound cause is established.

Follow-up: the [foreground native trace](smooth-gameplay-foreground-trace.md)
now reproduces this delay class and measures checkpoint serialization, shared
queue contention and presentation separately. This supplies evidence for those
new runs, not exact attribution of the original recording's individual pauses.

## Ranked causes and discriminating evidence

1. **Waiting in the action pipeline.** Prediction: the long interval lies before
   the relevant response/history arrives, while the browser continues presenting
   other content. Code still performs synchronous remote Firebase lifecycle
   checks during reauthorization; request-scoped reuse does not remove the first
   lookup for a later request. Native decisions and publication use the ordered
   engine worker. Viewer work can therefore delay later requests. Local hosting
   does not make Firebase Auth local. Earlier captures and the post-cache accepted
   save probes (405/398 ms RTT, about 170 ms authorization) establish real costs,
   but predate this recording and cannot assign its individual pauses.
2. **Presentation/decision gating.** Prediction: the necessary data has arrived,
   but movement or decision visibility waits. The final failed-pickup decision
   is visibly offered; its stationary interval must be separated from processing
   time. A fresh trace must identify response receipt, transcript receipt,
   playback commit and decision visibility for the same revision.
3. **Main-thread/rendering bursts.** Prediction: long animation-frame gaps or
   expensive render/layout work overlap the pause after the required data exists.
   The limited rendering-only experiment below did not reproduce a long hang.
   It does not clear the full hosted UI, long transcript, AI activity or the
   user's foreground Chrome configuration.

No request timing lines were available from the running server for the
18:46–18:49 UTC recording window. There is no correlated browser trace for the
clip. Consequently, an exact causal attribution or a new native latency
distribution would be unsupported. Chrome GPU-status inspection was blocked by
browser URL policy; no workaround was attempted. Hardware acceleration remains
unverified.

## Checks performed

- Decoded metadata, overview sheet, selected full-resolution frames and detailed
  quarter/ fifth-second sheets using the local Chrome video decoder.
- `node .tools/smooth-gameplay/video-review-144702/review.mjs --scan-motion`:
  30 Hz pixel-difference scan over the recording; raw samples retained in
  `motion-scan.json` beside that script.
- Read only allowlisted `FFB_BROWSER_TIMING` server log lines for the recording
  window; none available. No credentials or match payloads captured by this read.
- `node .tools/smooth-gameplay/video-render-probe-144702.mjs`: one headless
  Chrome page at 2544 × 1596, current pitch/playback components, retained public
  synthetic-team native snapshot with derived one-square moves; two warmups
  excluded and 12 moves measured. Median first changed marker geometry 77.1 ms,
  maximum 96.7 ms; maximum measured frame gap 40.1 ms; no page errors. This
  bypasses networking and the full hosted page. rAF/geometry are presentation
  opportunities, not physical display measurements. Raw samples:
  `.tools/smooth-gameplay/video-review-144702/render-isolation/report.json`.
- Read current browser warnings/errors: none captured by the browser tool.
- No production source changes, server restarts, database edits, commits or
  pushes in this review. No global build/test rerun: only diagnostic scripts and
  documentation changed.

## Next diagnostic requirement

Capture one quiet foreground native gameplay run with both browser measurements
and server request timings enabled. Keep one dev-local instance. Correlate input,
send, ingress queue, remote authorization, engine apply, checkpoint, state/history
receipt, DOM commit, first movement and decision visibility. Include read-only
preview requests and AI/publication work, which can occupy the same queue even
when the visible symptom follows a mutation. Record frame/long-task timings
throughout; do not infer renderer health from request latency.

Use that trace to build a failing reproduction for the actual remaining hang
before changing scheduling, caching or animation durations. Authentication and
checkpoint-before-ack guarantees must remain intact. Performance acceptance,
full-match validation and the user's physical tablet check remain open.
