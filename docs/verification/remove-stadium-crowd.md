# Stadium and crowd removal validation

Date: 2026-10-22. Issue: [#340](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/340).
Branch: `feature/remove-stadium-crowd`. [Approved scope](../specs/remove-stadium-crowd.md).

## Result

The shared browser match renderer displays the existing pitch without stadium
architecture, sideline props or crowd graphics. Turf registration, clipping,
tiling and camera projection are unchanged. All 390 canonical squares, players,
ball, selection, routes, dice and controls remain. No rules, protocol, gameplay
flow or playback timing code changed. The current changelist records the removal.

Self-review checked the runtime diff against the scope, confirmed the turf code
was retained, and removed the old crowd/gesture expectations from the affected
browser suite. New assertions cover absent scenery, no stadium atlas requests,
and preservation of turf nodes across accepted movement. Live delivery, replay
seek and restored recovery snapshots explicitly assert the new appearance.

## Checks run

All paths below are relative to the repository root. Browser commands use Node
26.8.1 and headless Chrome on Windows.

| Command | Result |
| --- | --- |
| `npm.cmd test --prefix browser-client` | Passed: 375 tests, no skips. |
| `npm.cmd run build --prefix browser-client` | Passed TypeScript and Vite production build; existing chunk-size warning. |
| `npm.cmd run build --prefix site` | Passed public site and authenticated play production build. |
| `node --experimental-strip-types browser-client/test/projected-pitch-ui.mjs` | Passed, including 48 Human/Orc host/end/angle/travel cases, setup, spectator, input, ball/player anchors, zoom/pan, reduced motion, missing player art and missing turf. Screenshots captured on the first run; final rerun passed after strengthening the accepted-movement assertion. No stadium/crowd atlas requests. |
| `node --experimental-strip-types browser-client/test/reactive-decisions-ui.mjs` | Passed both league themes at 1366x768, 1280x800, Android-emulated 390x844 and 844x390, including reachable decisions and unchanged countdowns. |
| `node --experimental-strip-types browser-client/test/playback-ui.mjs` | Passed live movement/dice, replay seek, reconnect, reduced motion, missing transcript and pending mandatory responses. |
| `node --experimental-strip-types browser-client/test/playback-motion-ui.mjs` | Passed continuous movement; observed 19 intermediate rendered frames. |
| `node --experimental-strip-types browser-client/test/pending-recovery-ui.mjs` | Passed retained exact-request retry after reload and restored skill markers without scenery. |
| `node --experimental-strip-types browser-client/test/reconnect-ui.mjs` | Passed play and builder authentication reconnect/error clearing. |
| `node --test site/test/m5e-result-browser.test.mjs` | Passed all six production-bundle browser cases, including result and read-only replay after reload, replay event/dice/log/chat synchronization. |
| `tools/target-build.ps1 install -JavaHome .tools/remove-stadium-crowd/jdk-21.0.11+10 -Offline` | Passed full clean reactor install in 14:14: 1,104 tests reported, 1,093 executed successfully, 11 existing opt-in cases skipped; no failures/errors. All eight reactor projects succeeded. |
| `git diff --check` | Passed. |

Java module totals: common 175, server 620, client logic 23 and state tests 286.
The 11 skips require an isolated database, retained artifact or explicit opt-in:

| Test class | Skipped cases |
| --- | ---: |
| `Marker6SchemaTest` | 1 |
| `SkillUsePreferenceSchemaIntegrationTest` | 1 |
| `RecoveryJournalMariaDbTest` | 1 |
| `V2PreparationJdbcTest` | 1 |
| `R5CompletedFixtureGeneratorTest` | 1 |
| `R5RestoredContinuationTest` | 1 |
| `RecoveryApplicationTest` | 2 |
| `RecoveryArtifactInspectionTest` | 1 |
| `V2RuntimeIntegrationTest` | 2 |

Individual skipped method names and module totals are recorded in
`.tools/remove-stadium-crowd/java-summary.json`. These opt-in database/runtime
integration paths were not verified; the executed recovery and browser fixture
checks above passed.

## Visual inspection and limits

Inspected the home perspective pitch, away overhead pitch, and Android landscape
match HUD captures. The turf, markings, sprites and ball remain, with a plain
surround instead of the stadium. Representative captures:

- `.tools/remove-stadium-crowd/screenshots/ball-home-occupied-loose-40.png`
- `.tools/remove-stadium-crowd/screenshots/stadium-orc-away-90-mid.png`
- `.tools/reactive-review/old-world-classic-android-landscape.png`

Android checks emulate touch and viewport dimensions; physical Android hardware
and a Linux browser were not run. The existing perspective turf can be absent at
the narrow portrait aspect ratio; the tests retain that pre-existing behavior
and confirm the decision controls remain reachable. No platform-specific code
or shared MUTP CSS, typography or theme definitions changed.

## Build environment diagnosis

The historical `tools/build.ps1 install -Offline` failed because it launches
Java 8, while the current server POM requires release 21 and Jetty uses newer
class files. The default pinned Java 21 installation path was incomplete.
Restored the already-cached Temurin 21.0.11+10 archive into ignored local tooling
and checked its runtime identity; no toolchain settings or product code changed.

The pinned Java 21 build then hit a sandbox `AccessDeniedException` in
`WindowsPath.toRealPath` when closing the cached ClassGraph JAR. A minimized
`ffb-common clean compile -e` reproduced the same filesystem error. The full
local build passed outside the sandbox using the same pinned JDK/profile.
Its log is `.tools/remove-stadium-crowd/java-target-install-unrestricted.log`.
No source repair or build-configuration change was required.

## Owner review and local startup

The owner requested a single dev-local instance after the initial handoff.
Stopped the previous review services, then ran
`node tools/deploy.mjs --environment dev-local` against the current working files.
The mandatory full browser preflight passed all four interaction groups and the
hosted group in 362.2 seconds, with reports in
`.tools/validation/local-browser-hxUkvn/`.
The Docker server build/tests passed, both containers became healthy, the live
proxy authentication/reconnect smoke test passed, and the computer player became
ready. The Play page returned HTTP 200. One managed local stack was verified;
existing game data was retained. Startup log:
`.tools/remove-stadium-crowd/dev-local-start.log`.

The owner accepted the visual result on 2026-10-22 and authorized committing,
opening a PR, merging after CI, removing the working branches and stopping the
review server. Remote DEV and PROD publication were not requested.
