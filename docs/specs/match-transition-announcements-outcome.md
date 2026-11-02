# Match transition announcements: implementation outcome

Issue: [#408](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/408)
Design: [approved feature specification](match-transition-announcements.md)
Branch: `feature/match-transition-announcements`
Worktree: `.worktrees/match-announcements`
Base: `c487d06dcaa5fc867b1c35c06d17e20857575709`

## Delivered behavior

Browser V2 presents TURNOVER, TOUCHDOWN, and numbered START OF TURN splashes using authoritative native transition events. Each transparent banner dims the pitch, blocks pitch actions, and preserves keyboard focus. The banner and dimming fade in/out over 200 ms using the dice presentation cadence. A 350 ms clear pause follows each banner before queued playback resumes; replay speed scales these transition timings. Reduced motion removes the fade while keeping the pause. Turnover and touchdown default to three seconds; turn start defaults to 1.5 seconds, scaled with replay speed. Game Menu > Game Settings contains the persistent “Keep announcements until dismissed” preference. Held splashes have a top-right close box; timed splashes have no controls. Escape dismissal remains available. The smaller cards contain no Continue button, checkbox, or footer.

Native causes identify the affected player for failed pickup, dodge, rush, jump, blocking knockdown, friendly Throw Team-Mate collision, and a thrown player leaving the pitch. Other confirmed turnovers receive a generic readable explanation. Failed dice alone cannot create an announcement. Scores take precedence over turnovers, and deliberate End Turn only produces the next playable turn announcement.

The presentation queue resolves dice, player injury/removal, movement, and ball changes before announcements. Required choices interrupt held splashes and suppress pending announcements that would delay the response. Initial load, reconnect, hidden-tab recovery, and replay seeking establish a baseline; ordinary playback and rapid computer turns preserve event order. Announcement text and reasons remain in the match log.

The reusable component uses the existing Human and Orc scoreboard helmets, with the blue Human helmet as fallback. Its replaceable icon slot and optional accent colours support future customization; production team-colour lookup remains unwired. Text remains accessible DOM content, with a continuously mounted polite live region and reduced-motion styling.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Confirmed turnover cause; TTM collisions and off-pitch throws | Native tests cover friendly collision and off-pitch throws with/without the ball. The generated native collision fixture is also consumed by the browser test, which verifies both players are prone before the turnover announcement. |
| No false turnover after successful reroll, no-ball failed landing, deliberate end, or reverted END_TURN | Native integration tests cover each case, including pickup responses across resident recovery. |
| Touchdown identity, precedence, and setup boundary | Native own-turn and opposing-turn scores produce one touchdown, without turnover, before setup mutations. |
| Actual numbered turn starts | Native tests cover initial playable starts, regular-mode filtering, adjusted turn numbers, half identity, and duplicate prevention. |
| Action resolution and queued transitions | Native sync-boundary assertions; browser ordering tests; rapid-backlog UI test; existing playback, motion, and provisional movement checks. |
| Pitch dimming, blocking, duration, dismissal, choice priority | Browser UI checks cover focus preservation, Escape/button dismissal, no click-through, automatic durations, persistent holding, and required responses. |
| Reconnect, deduplication, replay, hidden-tab recovery | Stable event identity unit tests and UI cases for delivery retry, reconnect, background catch-up, replay speed, and adjacent seeking. |
| Visual framing, helmets, colour scaffold | Six desktop/mobile screenshots linked below; production uses neutral colours, mobile previews demonstrate optional accents. |
| Accessibility and narrow layouts | Live status text, duplicate log speech suppression, reduced motion, long names, 390px layouts, and scrollable long reasons at 320x480. |
| Durable explanation | Match log tests verify readable team/cause text and duplicate suppression. |
| Scope and repository constraints | No rules changes, audio, team customization storage, new artwork, or production colour lookup. CHANGELOG updated; site/updates.json unchanged. |

## Review and validation

Self-review and an independent review found and corrected malformed event enum acceptance, noncanonical player-state strings affecting sprite poses, and native removal/re-placement ordering. The native tests also exposed a missing confirmed block-knockdown reason; it is now captured at the native END_TURN publication. No remaining review findings were reported.

- Browser type check: passed (`npx.cmd tsc --noEmit`).
- Browser unit suite: **456 passed**, including the real native collision fixture.
- Native pinned focused suite: **40 passed** across common, server, and statetest modules (`tools/target-build.ps1 focused`).
- Final native announcement/recovery integration run: **32 passed** (`tools/target-build.ps1 test -Module ffb-server -Test MatchAnnouncementPresentationTest,SetupSessionMovementTest`).
- Mandatory full browser preflight after the visual refinement: **71 suites passed** across four interaction shards and the hosted-site shard. Reports: `.tools/validation/local-browser-VhVBOg/`. This run validates the uncommitted working files; its commit field identifies the branch base.
- Dev-local Docker build: passed, including **674 native tests passed and five opt-in database tests skipped** (19 common tests; 660 server tests discovered, of which five skipped). These skips require dedicated empty MariaDB schemas and configured test credentials; they are not announcement tests.
- Dev-local startup: passed. Database and Java server healthy; Firebase ADC check passed; Hosting and nginx running; real Java authentication-gate responses verified through the proxy on connection and reconnect; computer player service started.
- Direct Chrome page load: HTTP 200, expected LOCAL-DEV sign-in page, and no uncaught JavaScript errors. An authenticated manual match was not played during this final smoke check.
- Whitespace check: `git diff --check` passed.

An initial full browser run failed an existing Savage Blow SVG rendering assertion while Vite reported source reloads during the run. The isolated failing case, all six affected modes, and the final full preflight passed afterward. No reroll behavior was changed. A reload/readiness race is suspected, not proven.

The next preflight caught an actual Interface-menu overflow: the new preference inherited full-width input styling. Explicit checkbox sizing and a wrapping label fixed it; the existing menu suite passes all six tabs at four viewport sizes. The announcement test now waits for its reset snapshot before publishing another scenario, and screenshots finish entry animations before capture. All six completed previews were visually inspected.

Manual review confirmed that the announcement logic works as intended. The requested visual refinement moves persistence to Game Menu > Game Settings, removes the splash footer, and adds a top-right close box only for held announcements. Banner width, padding, and artwork scale are reduced to fit the smaller content. The updated UI checks exercise the real settings menu, held/timed modes, safe closing, menu Escape priority, and responsive layouts; focused announcement and six-tab menu suites pass.

During this refinement, the existing apothecary suite exceeded its five-second navigation limit during cold Vite compilation. The same test passed with its warmed cache. Giving page navigation 30 seconds also passed from a fresh cache; its UI interaction deadline remains five seconds. This change is limited to test startup reliability.

The threat-settings test now counts only controls in its own section, allowing the new announcement preference in the same tab. Subsequent animation/camera timeouts coincided with Windows Modern Standby: system events recorded sleep/resume intervals at 09:22–09:35 and 09:42–09:53. The prior refinement validation used two workers and a temporary system/display wake request scoped to the command, released in `finally` afterward; no permanent power settings are changed.

### Transparent banner refinement

The solid card background, border, and box shadow are removed. A soft full-pitch dimming layer supports the floating helmet and text, fades with the banner, and clears entirely during the inter-announcement pause. The saved Game Settings option and held-banner close box remain in place.

The mandatory 71-suite browser preflight passed in 546 seconds using four workers with temporary wake protection. All 456 browser unit tests passed. The dev-local rebuild also passed 674 native tests (five opt-in database skips), restarted all services, and confirmed Firebase ADC and proxy reconnect health. Served JavaScript and CSS match the validated build byte for byte. A fresh Chrome session loaded the LOCAL-DEV sign-in page without uncaught errors. Focused UI checks pass for automatic and held announcements, fade opacity, the exact clear interval, double dismissal, rapid queued events across revisions, replay timing, and required-choice/reconnect cancellation during both exit and pause. Self-review verified that pitch actions remain blocked through the pause and that stale timers cannot advance a recovered queue. Desktop previews demonstrate the pitch treatment; narrow previews verify text wrapping, controls, and reduced-motion presentation.

## Visual evidence

| Variant | Neutral desktop | Sample-colour mobile |
| --- | --- | --- |
| Turnover | [1440px](../../.notes/art-preview/match-announcements/turnover-1440.png) | [390px, long name](../../.notes/art-preview/match-announcements/turnover-390.png) |
| Touchdown | [1440px](../../.notes/art-preview/match-announcements/touchdown-1440.png) | [390px](../../.notes/art-preview/match-announcements/touchdown-390.png) |
| Turn start | [1440px](../../.notes/art-preview/match-announcements/turnStart-1440.png) | [390px, long name](../../.notes/art-preview/match-announcements/turnStart-390.png) |

## Manual validation handoff

**Ready at [http://localhost:5000/play](http://localhost:5000/play).** The app is built from this branch's current working files and the services remain running for manual review. The WebSocket proxy listens at `ws://127.0.0.1:22232/browser/v2`.

Latest validation and startup/build evidence: `.tools/match-announcements-banner-final.log`; prior refinement evidence: `.tools/match-announcements-ui-final.log` and `.tools/match-announcements-ui-startup.log`; original server build evidence: `.tools/match-announcements-dev-local.log`. Native focused and integration logs: `.tools/announcement-native-focused.log` and `.tools/announcement-native-integration.log`. Latest browser unit log: `.tools/announcement-banner-unit.log`.

The approved changes are committed locally in the isolated worktree for the requested rebase; the original checkout and its unrelated work are preserved. No branch was pushed, PR opened, merge performed, or remote deployment made. Issue #408 remains open for review and eventual landing.

Suggested manual checks:

1. Open a match, deliberately end a turn, and check that only the next numbered turn splash appears.
2. Trigger a failed pickup/block or score and check the reason/team, board resolution, and log entry.
3. In Game Menu > Game Settings, enable “Keep announcements until dismissed,” dismiss with the top-right close box or Escape, and verify a mandatory choice takes priority. Disable the setting to restore automatic timing.
4. Watch consecutive banners: the pitch should brighten fully for a brief pause between them, including a queued turnover followed by a turn start.
5. Reconnect and seek in a replay; verify old splashes do not reappear as a backlog.

Physical Android and Linux browser testing, and a screen-reader session, were not performed. Automated Windows Chrome checks cover responsive layouts, reduced motion, keyboard interaction, and accessible DOM text.

### Authentication recovery during manual validation

The later Create a game `AUTHENTICATION_FAILED` report was traced to the mounted server ADC returning `SESSION_EXPIRED`. Host/container clocks matched, and the standard local ADC returned `OK`. The existing `node tools/match-review-start.mjs` procedure refreshed the mounted credential from that valid source and restarted the local game server. Its final Firebase credential check returned `OK`, both containers were healthy, and the proxy connection/reconnect smoke test passed. No application code changed; the already-disconnected browser page needs a reload to authenticate again.

## Process retrospective

1. Keep application source stable during the mandatory parallel Vite preflight. Mid-run edits can invalidate UI evidence; final validation should start after implementation changes settle.
2. Use the documented normal Windows credential context for Docker/GitHub and the pinned Maven cache junction. Sandbox failures here were environmental access failures, not application defects.
3. Inspect existing atlas graphics before deciding a reusable asset is absent. Filenames alone did not identify the existing scoreboard helmets.
4. Capture visual previews after finite entry animations complete. The initial desktop screenshots caught partially faded content; capture now finishes animations explicitly.

These are recommendations from the delivery workflow's retrospective; no agent instructions or unrelated tooling were changed.
