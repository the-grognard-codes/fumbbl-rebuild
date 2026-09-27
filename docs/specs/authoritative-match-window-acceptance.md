# Authoritative match window: integrated review evidence

2026-09-27. Companion to [the implementation plan](authoritative-match-window-and-gameplay.md) and issue #53.

## Review environment

`http://127.0.0.1:5000/play` serves the local-dev browser build. Its WebSocket endpoint at `127.0.0.1:22232` reaches the isolated `ffb-match-review-server-1` container on 22234. That container and `ffb-match-review-database-1` on 23317 were healthy at the time of review. The retained `ffb-current-dev` server and database on 22231 and 23316 were also healthy and untouched. The review database copied local accounts, scopes and saved teams into a distinct volume, then cleared only the copy's match records. The provisioning script refuses a populated target.

The browser build and server image were built from the same source tree. The real Java v2 auth gate returned `AUTHENTICATION_REQUIRED` through nginx on initial connection and reconnect. The Hosting emulator served the assembled local-dev bundle. Edge Computer Use opened `/play`, read the `LOCAL-DEV` sign-in page, and confirmed the expected redirect to `/login?returnTo=%2Fplay`; no account was signed in by automation.

## Captures and checks

The [approved bottom-ribbon preview](../../browser-client/test-output/pitch-preview/full-route.png) is the presentation reference. Captures of the current browser rendering:

| State | Evidence |
| --- | --- |
| 22 players, spectator, 1920 × 1080 | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/spectator-crowded-1920x1080.png) |
| 22 players, spectator, 1920 × 900 | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/spectator-crowded-1920x900.png) |
| 22 players, spectator, 1920 × 820 | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/spectator-crowded-1920x820.png) |
| 22 players, spectator, 1280 × 660 | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/spectator-crowded-1280x660.png) |
| Coach action ribbon | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/action-ribbon-blitz.png) |
| Block die choice | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/block-die-decision.png) |
| Push choice | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/push-decision-actor.png) |
| Completed result | [capture](../../.notes/overhaul-analysis/verification/authoritative-match-review/result-1920.png) |

The crowded positions come from a native session fixture; its away art is changed to orc only within the visual browser test to inspect both available sprite sets. The native fixture file remains an exact generated snapshot. The browser test asserts that the complete Fit scene and all settled player markers are inside the pitch viewport at each target size, and that the page itself does not scroll. `site/test/play-browser.test.mjs` passed 2/2 in hosted Chrome. The separate real-engine Blitz/browser sequence passed 6/6 with the result browser tests. Four native route tests passed in a JDK 21 container: partial and repeated movement, a failed dodge and team reroll with continuation, both rush squares with a failed rush and continuation, and a safe smart span beside a legal riskier manual path. The isolated Java server image completed its Maven build and test suite, `LocalServerMainTest` passed, and `deployment/game-service/proxy/live-local-test.mjs` passed its real Java auth-gate and reconnect check.

## Limits of this evidence

The visual fixture is a public protocol projection with synthetic crowded positions. Its `HOME`/`AWAY` labels, sample score and empty history are fixture values; they do not establish signed-in match behavior. The two-player Blitz sequence comes from a native-engine fixture and covers actor, other coach and spectator board synchronization, a required die decision, push choice, role isolation and rejected stale commit. It does not substitute for a signed-in two-coach match on the isolated server.

No signed-in two-coach plus spectator run was completed on this review stack. Live chat, route interruption by opponent reactions or skill rerolls, full log families, keyboard and reduced-motion behavior through the deployed stack, and Edge signed-in play remain unverified end to end. Screenshots demonstrate the intended frame and art mapping, but visual approval against the preview remains an owner review decision. Public DEV and PROD services were not changed for this local review.
