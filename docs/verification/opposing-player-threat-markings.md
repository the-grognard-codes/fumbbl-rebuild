# Opposing player threat markings

Branch: `feature/opposing-player-threat-tickets`, working tree based on
`39af2fd3c8278d90b091c3b84d89778858028a18`. Implements approved tickets
[#247](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/247),
[#248](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/248) and
[#249](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/249).
Owner manual validation passed the original behavior and visuals. The requested
combined-warning layout refinement passed automated checks and awaits owner
recheck. The owner authorized staging, committing, opening a PR and merging after
checks pass. Publication status and the final commit are recorded in GitHub.

## Delivered behavior

Selecting an unfinished friendly on-pitch player displays opposing threats during
the selecting coach's regular turn or Charge!. Native presentation data identifies
eligible selected players and players with effective tackle zones. It includes
rooted opponents that retain zones and excludes distracted, prone, stunned and
off-pitch sources. It does not infer activation or distraction from display text.
The field is added only to current live projections; frozen checkpoints, request
history and replay snapshots keep their existing schema.

Empty squares use dark green (`#1d662d`) for one zone, yellow (`#e5cd32`) for two,
orange (`#eb8c24`) for three and red (`#d53737`) for four or more. Every fill uses
50% alpha. One composite color is rendered per square, so additional sources do
not stack opacity. The composited reference cannot establish its original alpha;
50% is the requested maximum and the chosen visual-review starting point for all
four bands. The owner accepted these values during manual review.

Tackle adds one hollow white rounded triangle and red T per empty square using
the existing rushing warning geometry. When a square also has a rushing warning,
the two symbols sit equally either side of its center, with a white `/` between
them. Disabling Tackle recenters the lone rushing marker. Prehensile Tail, Diving Tackle,
Tentacles and Shadowing produce one consistent diagonal pattern with transparent
gaps. Tackle alone and Arm Bar do not produce stripes. These markings indicate
skill presence even if the selected player makes the skill irrelevant. With
colors off, striped squares use thin neutral hatch lines.

Game Menu > Game Settings contains eight persistent, initially enabled controls:
the master, color category, Tackle category, other-skill category and the four
stripe skills. Turning off the master retains the individual choices. Unavailable
storage retains changes in the current session. Markings use the shared ground
projection and do not intercept targeting. Disconnected, pending, paused, stale,
playback and required-decision views suppress them.

## Affected checks and evidence

The meaningful affected tests are the native presentation/session tests, strict
browser decoder and preference tests, square-composition/projection tests, the
new threat/settings browser suite, and existing movement, passing, playback and
Game Menu interaction suites. The new browser suite is registered in the existing
CI interaction inventory.

| Check | Result |
| --- | --- |
| Native `ThreatPresentationTest,SetupSessionMovementTest` | 12 passed, no failures, errors or skips |
| Complete browser unit suite | 261 passed, no failures or skips |
| TypeScript and `npm.cmd run build:play` | Passed |
| Threat/settings browser suite | Passed, both coach views and projections |
| Existing Game Menu, movement range and movement flow browser suites | Passed |
| Existing playback and passing-range browser suites | Passed |
| Complete hosted and interaction browser inventory (timeout follow-up) | 38 suites passed, no failures or skips; report coverage validated |
| Validation tooling/inventory tests | 15 passed |
| Client ChangeList module compilation | Passed in the final native selector |
| Working-tree whitespace check | Passed |

Native command, from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server,ffb-client-logic -Test ThreatPresentationTest,SetupSessionMovementTest -Offline
```

Browser unit and playable-build commands, from `browser-client`:

```powershell
node --experimental-strip-types --test test/*.test.ts
npm.cmd run build:play
```

The browser suite uses controlled public state derived from an existing native
fixture; the additional threat IDs are supplied by the test harness. Native tests
exercise the presentation producer separately. A live game through both rebuilt
services remains part of owner manual validation. The entire Maven reactor was
not run for this scoped change.

Captured home/away overlays and menu layouts are available in the ignored local
directory `.tools/threat-markings-review/`, including `home-perspective.png`,
`home-top.png`, `home-neutral-hatching.png` and `home-settings-1237.png`.
Root visual review checked projected shading and the settings layout. It found
and corrected oversized checkboxes inherited from generic page input styles;
the browser test now asserts compact inline controls as well as narrow layouts.

Final native verification used the repository-pinned Temurin 21.0.11 and Maven
3.9.9 target toolchain and cached dependencies. The initial host-Maven attempt
could not download a plugin in the sandbox; the baseline Java 8 wrapper could not
read the project's current Jetty bytecode. The pinned target run compiled but
hit a sandbox `AccessDeniedException` while closing an existing cached Netty JAR.
The approved offline run outside the sandbox passed all 12 selected tests and
the client-logic compile. No dependency or toolchain versions were changed.

### Local preflight timeout follow-up

The owner reported a 30-second heading timeout in `client-path-ui.mjs` during
`dev-local.mjs --restart`. The failure did not recur in the focused route test,
after its preceding hosted keyboard suite, in three cold Vite-cache runs, or in
the complete hosted preflight after dependency reinstall. Its original cause
remains unverified.

The route test now includes failed resource paths, HTTP status codes and page
errors when an assertion fails. A deliberately blocked entry script confirmed
that this context accompanies the original heading timeout. Healthy behavior,
timeouts and assertions are unchanged; the test does not retry or suppress
failures. Temporary diagnostic scripts were removed. This follow-up changes no
product code and does not restart the local services.

The complete hosted family (10 suites) and all four interaction shards (28 suites)
passed. The repository's `validateReports` check confirmed the exact inventory,
current commit, zero failures and zero skips. Reports are retained locally under
`.tools/validation/client-path-diagnosis/`. The Windows sandbox runner refused to
start the report-check process (error 1909); the approved read-only check outside
the sandbox passed. This verifies the browser suites used by the preflight, not
completion of the helper's service build and restart.

### Combined-warning layout refinement

Following successful owner manual validation, combined rushing/Tackle squares
now place the two existing markers equally either side of the square center,
with a white slash between them. Lone markers retain their centered positions;
disabling Tackle removes the slash and recenters rushing immediately.

The updated geometry selectors passed all 11 tests, including both coach ends,
both projections, every elevation, pan and zoom. The threat/settings browser
suite passed with assertions for centering, slash clearance and toggle behavior.
The existing movement-range browser suite, TypeScript check and playable build
also passed. Self-review checked gating, marker clipping and independent controls,
and visually inspected local captures under
`.tools/threat-markings-centered-review/`. The earlier complete inventory result
predates this refinement; only the affected checks were rerun. No game logic or
native presentation contract changed. Owner recheck of the refined layout is
pending.

## Standards

No actionable documented standards violations were found in the scoped changes.
Java presentation uses an instance service and native state conventions, browser
preferences remain isolated from gameplay, tests and imports follow repository
conventions, and the latest ChangeList and public API document the feature.

One nonblocking naming advisory remains: `decorateSaveResumeState` now also adds
threat guidance and already added clock data. Its comment now explicitly describes
live decoration; the existing public method name is retained to avoid an unrelated
API rename. Initial planning documents and the visual reference are preserved.

## Spec

Review found and fixed four cases: threat metadata conflicted with strict decoding
when a reaction prompt belonged to the opponent; Charge command-bar selection
did not retain the inspected player; Charge deselection left a local selection;
and a full Charge selection still advertised unoffered candidates as eligible.
The final producer checks the projected actor, phase, revision and save state.
Both Charge selection paths preserve their existing single native action and clear
inspection on deselection. Native eligibility respects the current participant
limit. Focused native and browser tests cover these corrections. Final narrow
review found no remaining concrete spec defect.

Review outcome: zero actionable standards findings (one nonblocking naming
advisory); four spec findings corrected, zero open. Owner manual review accepted
the feature's functional behavior and visuals, with a requested refinement to
center combined rushing/Tackle markers around a slash.

## Manual validation

Rebuild the Java game service and browser together. The existing local helper
builds both and runs its required browser preflight:

```powershell
node tools/dev-local.mjs --restart
```

1. On your regular turn, select an unactivated friendly player, then move during
   an unfinished activation. Finish it and clear selection; markings should clear.
   Check a prone eligible friendly player before standing up.
2. Arrange one, two, three and four or more standing opposing neighbors around
   empty squares. Confirm the four colors, 50% shading and clear occupied squares.
   Change an opponent to distracted/prone/stunned; retain a rooted zone source.
3. Inspect each approved skill and combined Tackle/stripe/rushing squares. Check
   one pattern per square, no stripes for Arm Bar or Tackle alone, and distinct T
   and rushing symbols, with a centered pair separated by `/` on shared squares.
   Try both coach ends, all perspective angles, top-down,
   pan, zoom and sideline clipping.
4. Exercise all eight Game Settings controls. Disable colors while leaving skills
   enabled; confirm neutral hatching and independent T symbols. Toggle the master
   and reload or join another game; individual choices should persist.
5. Select and move native Charge! participants, complete their activations and end
   the event. Confirm native participant selection is unchanged and markings clear
   for ineligible players. Check setup, other kickoff events, opponent turn,
   spectator view, replay, disconnect/reconnect, pause/resume and required decisions.
6. Confirm movement perimeters, route confirmation/undo, passing guidance, player
   targeting and keyboard controls remain usable with the overlays enabled.
