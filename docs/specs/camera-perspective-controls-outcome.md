# Camera perspective controls outcome

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/357

Design: [camera-perspective-controls.md](camera-perspective-controls.md)

Branch: `feature/357-camera-perspective-controls`, from main
`046b1565b5fdcc12b760685cdf3ff70190cea7a7` (verified against GitHub).
Implementation and self-review are complete. This report captures local
validation before PR publication, including the approved button-size refinement.
The user approved the behavior and appearance, then authorized staging, commit,
PR creation, CI validation, merge into main, working-branch removal and stopping
the local review stack. PR and CI results are recorded on issue #357.

## Delivered behavior

- Live coaches and spectators have two square camera buttons beside Game Menu.
  Replay uses the same controls in its camera toolbar.
- Flip switches Home (from home toward away) and Away, reverses the icon and
  retains elevation and canonical focus. Gameplay ownership stays with the
  caller; projection-aware input still resolves the same canonical squares.
- Angle cycles 30, 40, 50, overhead, then 30. The button displays degrees;
  overhead messages say "Overhead view". Defaults remain 40 degrees and the
  coach's own end, or home for spectators.
- Overhead flip changes the selected end and icon without changing rendered
  geometry. Its message explains when the selection applies. The pending end
  takes effect when leaving overhead and survives recovery.
- Selections persist in tab-scoped session storage by match and caller role.
  Same-match reload/recovery retains them; other matches start with defaults.
  Invalid or unavailable storage falls back safely to defaults/in-memory use.
- Live Debug moves beneath home inducements on the left, opposite the camera
  controls and Game Menu beneath away inducements. Camera changes leave the HUD
  anchored. Duplicate angle/end controls are removed from Debug; unrelated
  navigation and zoom controls remain.
- Buttons retain MUTP styling, keyboard access and status announcements. After
  visual review, both buttons match the rendered Game Menu height and remain
  square, replacing the initially implemented 44-pixel size. Narrow layouts
  reserve a row below the counters.
  While the drive tracker is visible in windows at most 900 pixels wide and
  360 pixels high, supporting docks compact to leave space; explicit dugout
  expansion remains available.
- Added a user-facing entry to the latest ChangeList and registered the new
  camera acceptance suite in the browser validation inventory.

## Self-review and fixes

Reviewed new state, hook and control files and the complete diff against the
approved issue, including input ownership, replay, recovery, keyboard focus,
storage validation and responsive layout. No gameplay or server behavior was
changed. The original working tree was clean; no unrelated changes were
overwritten, staged, committed or published.

Validation exposed and resolved a legacy style overriding the buttons' MUTP
font/colors, turn-counter and phase-tracker collisions in narrow windows, and
compact docks preventing explicit expansion. Existing browser journeys now use
the public cycle button through a shared helper. Route fixtures select their
angle after loading each match, because preferences are now match scoped. A
panning helper incorrectly included viewport borders in client-pixel drags;
correcting that removed a 30-degree tolerance failure. Hosted replay assertions
now use the new controls. The standalone adjustment suite also had stale text
size expectations and an overly short initial navigation timeout; corrected
those assertions without changing product typography or animation behavior.

## Validation evidence

All commands ran in this working tree. Browser report commit fields identify
the branch base because the changes are intentionally uncommitted.

| Check | Result / evidence |
| --- | --- |
| `npm.cmd test --prefix browser-client` | Passed: 393 tests, zero failures/skips; `.tools/camera-browser-unit.log` |
| `node --experimental-strip-types --test browser-client/test/camera-preferences.test.ts` | Passed: 3 focused camera tests, also included in the full unit run |
| `npm.cmd run build --prefix browser-client` | Passed: TypeScript and Vite; `.tools/camera-browser-build.log` |
| `npm.cmd run build:play --prefix browser-client` | Passed; `.tools/camera-browser-build-play.log` |
| `npm.cmd run build --prefix site` | Passed, including final play bundle; `.tools/camera-site-build.log` |
| `node tools/validation/browser-suites.mjs --family interaction --shard 1 --report-directory .tools/camera-validation` | Passed: 16 suites; `.tools/camera-validation/interaction-1.json` |
| Same interaction command with `--shard 2` | Passed: 8 suites; `interaction-2.json` |
| Same interaction command with `--shard 3` | Passed: 10 suites including camera acceptance; `interaction-3.json` |
| Same interaction command with `--shard 4` | Passed: 18 suites; `interaction-4.json` |
| `node tools/validation/browser-suites.mjs --family hosted --shard 1 --report-directory .tools/camera-validation` | Passed: all 10 hosted suites; `hosted-1.json` |
| `node browser-client/test/camera-perspective-ui.mjs` | Passed: both coaches, spectator, replay, icons/messages, overhead invariance, reload, match isolation, canonical input, MUTP and mobile touch/layout, including short-window expansion |
| `node browser-client/test/round-four-ui.mjs` | Passed: opposite-side Debug, public controls, responsive layout and existing HUD/dice behavior |
| `node browser-client/test/drive-phase-tracker-ui.mjs` | Passed: both sides, all viewer roles/events, 1920×1080, 1280×720, 640×330 and 375×300 |
| `node browser-client/test/match-adjustments-ui.mjs` | Passed: log, kick, kick-preview, kick-edge-preview, kick-camera-recovery, quick-snap, status and Debug |
| `node browser-client/test/pending-recovery-ui.mjs` | Passed: retained 50-degree Away view through reload/uncertain-action recovery; exact original gameplay request retained |
| `node browser-client/test/reconnect-ui.mjs` | Passed: play/builder authentication reconnect paths |
| `node browser-client/test/route-check-ui.mjs` | Passed after helper correction: native routes, both ends, all angles and canonical inputs |
| `node --test site/test/m5e-result-browser.test.mjs` | Passed: 6 hosted result/replay tests after selector update |
| `node --test site/test/m5f-keyboard-browser.test.mjs` | Passed: 2 keyboard tests |
| `node browser-client/test/client-path-ui.mjs` | Passed: base `/` and `/play/` |
| `node --test tools/test/validation.test.mjs` | Passed: 15 validation-tooling tests; exact inventory contains 52 interaction and 10 hosted suites |
| `docker build --target build -f containers/local/Dockerfile -t ffb-camera-validation:357 .` | Passed: pinned Linux Java 21 server compilation, tests, package and archive extraction. Common: 175 tests; server: 655 tests, 4 opt-in skips. `.tools/camera-docker-build.log` |
| Java 8 `javac` of ChangeList/VersionChangeList with `ffb-common/target/classes` on the classpath | Passed; output `.tools/camera-changelog/` |
| `git diff --check` | Passed; `.tools/camera-diff-check.log` |

The browser inventory in `tools/validation/browser-shards.json` lists every
suite selected by the four interaction commands and hosted command above.
Reports are in `.tools/camera-validation/`; focused logs use `.tools/camera-*`.

The four skipped native opt-in cases are in
`SkillUsePreferenceSchemaIntegrationTest`, `Marker6SchemaTest`,
`RecoveryJournalMariaDbTest` and `V2PreparationJdbcTest`.

## Visual review and limits

Inspected `.tools/camera-perspective/live-desktop.png`, `live-mobile.png` and
`replay.png` at their actual rendered sizes. New camera controls use existing
theme colors and MUTP typography, and mobile input was exercised with a touch
profile. Physical Android and Linux desktop browser review has not been run;
automated browser runs used Windows Chrome. The native server ran in Linux.

The current renderer intentionally suppresses stadium architecture and crowds
before this feature. Existing pitch turf and players rotate through the shared
camera; this feature does not restore the hidden stadium/crowd artwork, so
visible crowd/stadium rotation cannot be visually verified in this checkout.
When session storage is blocked, reload persistence is unavailable, but camera
controls continue to work in memory. Vite reports its existing large-bundle
warning; both production builds complete successfully.

No remote deployment or authenticated manual game was performed during automated
validation. The user subsequently reviewed and approved the live behavior and
appearance on the local review server.

## Visual review size refinement

The user approved the camera behavior and requested that both buttons match
Game Menu's height while preserving their square aspect ratio. The controls
now observe the actual menu height so responsive font/padding changes and
replay layouts remain aligned. Icons and angle labels scale to fit.

Updated the existing camera browser assertions to check menu-height equality
and square dimensions instead of the superseded 44-pixel target. Passed
`camera-perspective-ui.mjs`, `round-four-ui.mjs` and
`drive-phase-tracker-ui.mjs`; logs are `.tools/camera-menu-size*.log`.
Inspected updated desktop and mobile screenshots. The local-dev Hosting
artifact was rebuilt through
`node deployment/firebase/scripts/assemble.mjs --environment local-dev`,
including TypeScript, play bundle and site build. `git diff --check` passed.
The running local review server serves this refinement; no backend restart
or remote deployment was needed. The full validation results above describe
the preceding feature implementation; this size-only refinement used the
focused checks listed here.

## Process retrospective

- The Windows baseline build points at Java 8 while current server dependencies
  require a newer JVM; the pinned Windows Java 21 directory is missing its
  executables. The repository's pinned Linux Docker build supplied the required
  server evidence. Align those local toolchain pointers in a separate task.
- Initial browser navigation budgets of four/five seconds can fail during cold
  Vite compilation under parallel load. Keep behavior assertions tight while
  giving initial server/module loading a separate budget.
- Camera interactions are now shared across browser and hosted replay tests;
  use their public-control helper when extending these journeys.

The Windows sandbox account later failed process creation with logon error
1909. Scoped, automatically approved outside-sandbox test/read commands allowed
validation to finish. No policy, credential or global agent instructions were
changed.
