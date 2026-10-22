# Remove stadium and crowd graphics

Issue: [#340](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/340).
Branch: `feature/remove-stadium-crowd`, based on `11360b70e` (`main`).

## Approved scope

Remove existing stadium architecture, props and crowd graphics as the first step
of the stadium overhaul. Keep the full pitch, players, ball, game controls,
camera/input geometry, mechanics, flow and MUTP colors, typography and themes.
Support desktop and Android browser layouts. Preserve unrelated working-tree
changes. Do not commit, push or deploy.

After visual review on 2026-10-22, the owner accepted the result and authorized
staging and committing all changes, opening a PR, merging after successful CI,
removing the local and remote working branches, and stopping the review server.

## Implementation

The shared `LivePitch` renderer now mounts only the existing turf portion of
`PitchScenery`. Its grass sampling, registration, clipping, tiling and camera
projection remain unchanged. Stadium structures, crowd banks, sideline furniture,
decorative atlas loads and crowd gesture scheduling are no longer mounted.
The retained source painting supplies clipped grass only. Historical art assets
and isolated development studies remain available for future overhaul work.

The same renderer serves live matches, spectator views, replay and recovery.
No game-state, protocol, rules, action, playback or timing code changes.
The working tree was clean before this work.

## Affected checks

- Browser unit tests and production build.
- `projected-pitch-ui.mjs`: all 390 cells; ball, player anchors and input;
  both coach ends; Human/Orc hosts; 30/40/50-degree and overhead cameras;
  travel, zoom, setup, spectator, reduced motion and missing-art fallback.
  Replace removed crowd/gesture assertions with absent scenery and no atlas loads.
- `reactive-decisions-ui.mjs`: all league themes, desktop and Android portrait
  and landscape; preserve decision reachability and countdown behavior.
- `playback-ui.mjs`: live delivery, replay seek and reconnect snapshots retain
  the pitch without restoring scenery; preserve existing dice/movement timing.
- `playback-motion-ui.mjs`: continuous live/replay movement and reduced motion.
- `pending-recovery-ui.mjs` and `reconnect-ui.mjs`: retained exact-request recovery,
  restored skill markers and authentication reconnect.
- Java 21 reactor clean install, including game server, client and state tests.
  The current server requires Java 21 despite the historical Java 8 helper.

## Outcome and evidence

See the [validation outcome](../verification/remove-stadium-crowd.md).
Logs and pitch screenshots are under `.tools/remove-stadium-crowd/`;
theme/viewport captures are under `.tools/reactive-review/`.
