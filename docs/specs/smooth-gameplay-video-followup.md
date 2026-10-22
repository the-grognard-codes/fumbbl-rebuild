# Smooth gameplay: recording follow-up

Parent: [#324](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/324).
Delivery slice: [#327](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/327).
Branch: `feat/smooth-gameplay`, uncommitted working files.

## Observed evidence

The user supplied `archive/gameplay-recordings/game-performance-2026-10-21-111613.mp4`:
36.17 seconds at 2558×1598, showing human play against Bogruk. Local decoding and
10 Hz sampling of the actual synchronization banner found these approximate
visible intervals:

| Start | End | Observed span |
| --- | --- | --- |
| 4.4 s | 5.5 s | 1.1 s |
| 18.6 s | 19.5 s | 0.9 s |
| 25.4 s | 26.1 s | 0.7 s |

The recording confirms substantial waits in ordinary play. It does not supply
wire timestamps, so these spans are not measurements of engine time or request
round trip. Analysis artifacts remain local under
`.tools/smooth-gameplay/video-review/`; the recording was not uploaded elsewhere.

## Reproduction and cause

The existing client receives an authoritative state, then waits for its matching
public movement/dice record. A separately queued transcript read can sit behind
publication, authorization and other requests. The playback hook displays
`Synchronizing match…` and holds presentation during that gap, with a one-second
snapshot fallback. The first implementation pipelined that read but retained the
separate delivery dependency. Earlier native workloads already measured a mean
543 ms reply-to-transcript gap; the recording makes its user impact clear.

A new server regression failed before the fix: the negotiated action emitted
one state message where a durable public record followed by state was required.
The client-side negotiated-delivery test also failed before its implementation.
The new hosted browser regression covers the actual presentation path, asserting
zero synchronization flashes for complete live delivery and correct behavior
when the history push is deliberately omitted.

Ranked hypotheses were separate state/history delivery, server publication/queue
delay, and rendering stalls after data arrives. This change addresses the first
dependency. It does not establish a new native-workload frame-rate or latency
distribution.

## Change

- Play clients opt into `liveTranscript` during v2 authentication. Successful
  negotiation is explicit. Legacy authentication retries once without the new
  option if an older server rejects it; old clients and computer protocol behavior
  remain supported.
- The server sends the existing bounded, canonical public current-revision record
  immediately before its matching accepted state, after the durable checkpoint.
  This covers the actor, other coach, spectators, reconnect snapshots and timed
  decisions. Reads reuse the public transcript projector without restoring an
  engine or performing another remote authorization.
- Normal negotiated actions no longer send a second per-action transcript request.
  Duplicates and overlapping delayed pages merge without losing newer records.
  Conflicting records or backward time/command ordering are rejected. Missing
  predecessors still use paged catch-up; incomplete delivery can still legitimately
  display synchronization.
- Existing queue limits remain 256 KiB and 64 messages. Under one queue lock,
  optional history is admitted only when queued/in-flight frames, history and
  the mandatory state all fit. Otherwise state proceeds alone and the client
  catches up through the existing read path.

## Review and validation

Independent review found a real queue-budget issue in the first implementation:
a valid 240 KiB history record plus a 30 KiB state could close the connection
before its mandatory acknowledgement. A real delayed-delivery regression first
reproduced close code 1013, then passed with atomic queue admission. Review
approved the repaired transport, authorization, durability and client correlation.

Two validation lessons are captured in the regressions: an ordinary completed
action must assert absence of a synchronization flash, and optional multi-frame
delivery must exercise the real bounded queue rather than only a fake connection.

Completed checks before updating dev-local:

- Focused JDK 21 Maven selection: 71 tests, zero failures/errors. Selectors:
  `BrowserV2LiveTranscriptTest,BrowserV2AdapterTest,ActiveMatchPublisherTest,SetupApplicationCheckpointTest,SetupApplicationTranscriptTest,MatchTranscriptTest,BrowserMatchDeliveryTest,BrowserMatchTransportTest,BrowserMatchSocketTest`.
  Exact invocation/evidence: `.tools/live-transcript-final.log`; initial failures
  are retained in `.tools/live-transcript-red.log` and
  `.tools/live-transcript-queue-red.log`.
- `npm.cmd test` in `browser-client`: 369 tests passed, zero failures/skips.
- `npm.cmd run build` and `npm.cmd run build:play`: passed with typecheck.
- `node deployment/firebase/scripts/assemble.mjs --environment local-dev`: passed.
- `node --test --test-name-pattern 'hosted live history' site/test/play-browser.test.mjs`:
  five tests/subtests passed. Actor/spectator normal delivery had zero sync
  flashes; overlap retained newer history; a missing push recovered explicitly.
- `node --test site/test/play-browser.test.mjs`: all 15 tests passed, including
  legacy pipelined history, native dice, membership, two coaches/spectator,
  reconnect and observer checks.
- `git diff --check`: passed.

The standard serial dev-local browser preflight passed in 909.0 seconds:
46 interaction suites (46 reported checks) and 10 hosted suites (30 reported
tests), with zero failures or skips. Reports are in
`.tools/validation/local-browser-nX5Q0R`. Full server rebuild and final health
checks also passed through
`$env:FFB_BROWSER_TEST_WORKERS='1'; node tools/deploy.mjs --environment dev-local`.
Their log is `.tools/live-transcript-dev-local-restart.log`.

- Full Docker JDK 21 Maven build: common 175 tests passed; server 569 tests
  reported, 566 passed and three existing gated integration skips. Zero
  failures/errors. Skips: `SkillUsePreferenceSchemaIntegrationTest`, one case in
  `Marker6SchemaTest`, and `V2PreparationJdbcTest`.
- Startup: review database and server healthy, Firebase ADC OK; the real native
  browser reached the Java authentication gate through nginx on initial
  connection and reconnect (one proxy test passed).
- Final inspection: only `ffb-match-review-server-1` (22234) and
  `ffb-match-review-database-1` (23317) running in Docker; one managed Hosting,
  nginx and computer daemon process. No acceptance-service state remains.
  `GET http://localhost:5000/play` returned 200. Saved database volumes retained.
- The single updated dev-local instance is ready at
  `http://localhost:5000/play`. Refresh existing pages to load the client and
  negotiate the new capability.

Issue reporting: the installed owner-gh tool's authentication check succeeded,
but posting to #327 and the subsequent read to verify the uncertain write both
returned `Invalid installation or unexpected GitHub response`. Remote comment
state is unverified; no write was retried. This local report preserves the
follow-up evidence until repository API access works again.

## Remaining acceptance

The original recording cannot demonstrate the new behavior. A fresh native timing
capture or another user review on the updated instance is still needed to quantify
the improvement and assess remaining frame pacing. Physical Lenovo tablet and
full-match acceptance remain open as previously recorded. No rules, theme or
typography changes, database deletions, staging, commits or pushes are part of
this follow-up.
