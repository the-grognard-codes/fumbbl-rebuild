# Playback build timeout follow-up — 2026-10-17

Reported failure: `browser-client/test/playback-ui.mjs:120`, waiting 30 seconds for four decorative dice to be visible simultaneously during parallel browser validation. The adjacent `[hosted 1] site/test/m5d-blitz-browser.test.mjs` output was an interleaved shard label; the stack identified the playback assertion.

## Diagnosis

The standalone playback suite initially passed. A reduced real-browser reproduction published revision 14's three successful dodges and one rush, with movement through 23/24/25/24. Blocking the renderer for 450ms after each of the first three committed moves reproduced the timeout twice.

A targeted mutation observer confirmed every native roll appeared in order: `[5, 4, 6, 2]`. By movement completion only `[6, 2]` remained. `DiceStream` independently retains each group for 1200ms and starts queued groups at 350ms intervals. Four groups normally overlap for only 150ms; delayed React commits or a loaded browser can consume that interval or spread arrival times so it never occurs. The test's real-time all-four assertion was invalid under that load. No evidence showed dropped native outcomes or an erroneous stream reset.

Red reproduction evidence: [playback-slow-render-repro.log](playback-slow-render-repro.log). The original standalone result is [playback-timeout-repro.log](playback-timeout-repro.log).

## Fix

Only the streaming portion of `browser-client/test/playback-ui.mjs` changed. It pauses the installed Playwright clock before publishing the reports, waits for each React movement commit, and advances the movement/decorative timers explicitly. It observes all four native faces at the intended overlap, then explicitly advances continuation and expiry. Timing constants come from `dice-stream.ts`. The clock resumes before the remaining scenarios.

Existing reduced-motion regression work in this file and `use-pitch-playback.ts` was preserved. No application code, gameplay, animation durations, retention durations or timeouts changed. No skipped/weakened assertion or timeout increase was used.

## Verification

- `node browser-client/test/playback-ui.mjs`: passed standalone after the fix, and again concurrently with the reported hosted Blitz suite. [Standalone log](playback-timeout-fixed.log), [concurrent log](playback-concurrent-fixed.log).
- The minimized test with the controlled clock, 4× CPU throttling and 450ms real waits between movement commits passed, showing `[5, 4, 6, 2]` at inspection. [Log](playback-slow-render-fixed.log). The temporary reproduction script and observer were removed after verification.
- `node --test site/test/m5d-blitz-browser.test.mjs`: **1 passed**, including both players and spectator. [Log](playback-hosted-blitz.log).
- `node --experimental-strip-types --test browser-client/test/dice-stream.test.ts browser-client/test/pitch-playback.test.ts`: **5 passed**, no skips/failures. [Log](playback-unit-fixed.log).
- The complete interaction shard containing playback was run with `node tools/validation/browser-suites.mjs --family interaction --shard 4 --report-directory .notes/player-skill-markers/playback-shard-verification`. **All 12 suites passed**, no failures/skips. [Log](playback-shard4-fixed.log), [machine-readable report](playback-shard-verification/interaction-4.json).

No commit, push, deployment or managed debug-stack restart was performed.
