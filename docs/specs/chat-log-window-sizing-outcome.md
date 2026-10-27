# Chat and game-log window sizing outcome

## Delivery

- Working branch: `feature/chat-log-window-sizing`, from `main` at `2b6f715af`.
- [Sizing and linked layout #366](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/366).
- [Chat scrolling and unread notifier #367](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/367), dependent on #366.
- Approved design: [local requirements mirror](chat-log-window-sizing.md).
- User approved the completed implementation and authorized staging, commit, PR creation, merge after CI, and feature-branch cleanup on 2026-10-27. The initial working tree was clean. Final PR/merge evidence is recorded on issues #366 and #367.

## Requirements and implementation

| Requirement | Result |
| --- | --- |
| Independent minimized/default/maximized states | Implemented; controls step between adjacent states and omit unavailable directions. |
| Dugout button appearance and dimensions | Shared arrow component and existing dugout control styles. |
| Text-size controls to the left, separated from window controls | Implemented, including narrow layouts; hidden when minimized. |
| Fixed responsive width, title-bar-only minimization | Implemented. Unread chat adds the approved title-bar bubble. |
| Separate left/right stacks with preserved gap and dugout view | Measured independently; dugout height does not depend on the history size selection. |
| Maximize to remaining space, clear resources/menu/buttons | Measured rendered bounds, including overflowing resource counts, clock End Turn, camera and Debug controls. Recalculates on resize and DOM/resource changes. |
| Lightweight independent size persistence | Two validated local preferences; storage failures retain in-memory behavior. |
| Hidden messages and events continue updating | Components remain mounted; only their body display/scroll effects are suspended. |
| Chat freeze, unread notification, read-to-bottom clearing | Implemented, including minimizing at the bottom and arriving messages while reading older entries. |
| Game log restores at latest entries without notifier | Implemented; restoring clears the previous reading anchor and follows the latest entries. |
| Replay layout unchanged; live recovery supported | Controls scoped to stacked live overlay history; replay retains tabs. Reload and recovery checks listed below. |
| User-facing change entry | Added to latest `VersionChangeList` in `ChangeList.java`. |

## Self-review

Reviewed the diff against the approved state transitions, scroll semantics, independent dugout layout, observer cleanup, storage failure behavior, replay scope, accessibility and MUTP styling. Fixed Debug clearance found during visual inspection and released removed elements from resize observation. Added rendered resource-count and End Turn bounds to avoid relying on parent boxes when controls overflow them.

Existing chat typography assertions still expected 12/14/18px; updated them to the current 10/12/14px design without changing typography. Updated the HUD test from the obsolete shared flex-container position to each actual dugout/window pair.

## Validation manifest and results

- `npm run build` in `browser-client`: passed TypeScript checking and Vite production build.
- `npm test` in `browser-client`: 420 tests passed, no failures or skips. Includes geometry bounds and independent, invalid and unavailable preference storage.
- `node test/chat-ui.mjs`: passed new state transitions, independent persisted sizes, reload, replay tabs, hidden arrivals, frozen positions above/at bottom, visible bottom-follow, unread clearing, reduced motion, and existing draft/send/keyboard/touch behavior.
- `node test/dugout-ui.mjs`: passed existing three-state controls and reserve selection.
- `node test/coach-hud-ui.mjs`: passed 324 combinations (nine history-size pairs by nine dugout-size pairs across 1280x720, 375x660, 640x330 and 375x300), with the accepted Debug exception below. Checks actual gap, unchanged dugout mode/height, viewport bounds, surrounding controls and header-button clipping. Existing HUD tests also cover 1920x1080, 1920x900 and 1920x820.
- `node test/reconnect-ui.mjs`: passed play/builder reauthentication and stale-error clearing.
- `node test/pending-recovery-ui.mjs`: passed ordinary action behavior and exact retained retry after reload/unknown outcome.
- Java 21 / Maven 3.9.9: `mvn -f game-service/pom.xml clean verify` with workspace-local Maven repository: passed, 29 tests, no failures or skips.
- `node tools/deploy.mjs --environment dev-local`: complete browser preflight passed initially in 355.0 seconds and after credential recovery in 323.3 seconds. The latest run, including the tracker review fixes below, passed in 335.0 seconds and the entire restart exited successfully. Latest reports: `.tools/validation/local-browser-P3TmZC/` (earlier passing runs: `local-browser-FYarvi`, `local-browser-ZywFUZ`); 54 interaction scripts and 10 hosted suites (30 hosted test cases), no failures or skips. Includes live decisions, movement, menus, playback, completed replay and current-match paths.
- Main Maven reactor: passed `-Pmockito5 clean install` on Java 21 in 17m57s. 1,163 test cases reported: 1,152 passed, no failures/errors, 11 existing opt-in integration/fixture tests skipped. All eight reactor projects succeeded.

| Maven module | Reported tests | Skipped |
| --- | ---: | ---: |
| ffb-common | 175 | 0 |
| ffb-server | 674 | 4 |
| ffb-client-logic | 23 | 0 |
| ffb-statetest | 291 | 7 |

The skipped cases require isolated MariaDB/JDBC targets or retained runtime fixtures: `Marker6SchemaTest`, `SkillUsePreferenceSchemaIntegrationTest`, `RecoveryJournalMariaDbTest`, `V2PreparationJdbcTest`, `R5CompletedFixtureGeneratorTest`, `R5RestoredContinuationTest`, two JDBC cases in `RecoveryApplicationTest`, `RecoveryArtifactInspectionTest`, and two cases in `V2RuntimeIntegrationTest`. Their opt-in environment/fixture coverage remains unverified. In-memory/native recovery and browser recovery checks above passed.

Build invocation details: `.tools/apache-maven-3.9.9/bin/mvn.cmd` with `-Dmaven.repo.local=C:/Users/jaken/Git-Hub/fumbbl-rebuild/.tools/repository`. Main reactor uses Java 21 and `-Pmockito5 clean install`. Java 8 cannot compile the current Jetty 12 dependency. Sandboxed Java 21 compilation hit a ZIP-filesystem `AccessDeniedException` on workspace dependency paths; required Maven runs were repeated outside the sandbox.

Local logs: `.tools/chat-log-unit.log`, `.tools/chat-log-maven.log`, `.tools/chat-log-service.log`, `.tools/chat-log-dev-local-ready.log` (successful restart), `.tools/chat-log-dev-local-final.log` (earlier run stopped at authentication). Visual evidence: `.tools/chat-log-evidence/` contains normal and maximized desktop, narrow and short-viewport screenshots; inspected final desktop and 375x300 images in the actual match HUD.

## Accepted exception and verification limits

The user explicitly deferred Debug overlap at 375x300 CSS pixels to upcoming minimum-display requirements work. Two minimized bars plus their gap need 66px, but only 48px remain between Debug and confirmation. Tests retain every other geometry assertion at that viewport and exempt only Debug collision. The exception is recorded on #366 and in the design mirror.

Browser checks ran on Windows Chromium/Chrome, with touch emulation for mobile interaction and reduced-motion emulation. Physical Android and Linux desktop UI were not directly tested. Existing theme assets, colors and typography are reused; no theme-specific art changed.

## Local review environment

Visual review completed at **http://localhost:5000/play**. The supported dev-local restart exited 0 after complete fresh browser validation, Hosting assembly, Docker rebuild, Firebase ADC verification, proxy checks and computer-player startup. After user approval, `node tools/dev-local.mjs --stop` exited 0 and stopped the managed review services, retaining database volumes.

Startup initially encountered expired Google Application Default Credentials; two automatic browser attempts failed OAuth state validation. After the user refreshed ADC in their terminal, `node tools/match-review-start.mjs` succeeded and the supported restart completed. Credential values were not printed or copied into the report/issues.

Inventory verified before the requested shutdown:

- `/play` responds HTTP 200.
- One Hosting listener on port 5000, one nginx proxy listener on 22232, and one game-server listener on 22234.
- No listeners on review ports 5173/5174; none of the standard review ports were occupied before initial startup.
- Exactly one `ffb-match-review-server-1` and one `ffb-match-review-database-1`, both healthy.
- One managed computer-player process, running and recorded in `.git/dev-local-state.json`.
- Proxy initial connection and reconnect both reached the real Java v2 authentication gate; the supported proxy test passed (1 test, zero skips), without submitting credentials.

## Retrospective

Repository workflow requested `.agents/skills/retro/SKILL.md`; reviewed this session using its environment-improvement categories and the writing-for-agents guidance. Suggested follow-ups, without changing tooling or instructions here:

1. Align root build guidance with the current Java 21 target launcher (`tools/target-build.ps1`). Starting from the documented Java 8 command fails on the current Jetty dependency; direct Maven also defaulted to an inaccessible `C:/.m2` repository before the workspace-local path was supplied.
2. Repair the installed WinGet `rg.exe` link, which cannot execute in this environment. `git grep`/`git ls-files` provided the scoped fallback throughout this change.
3. Consider checking ADC validity before the expensive dev-local browser/build gate, while still checking it at startup. An expired credential currently appears late and failed renewal forces another complete browser run through the supported restart command.

## Visual review follow-up: drive tracker and side isolation

User review identified tracker overlap and the opposite side changing tracker height. Reproduced both in `node test/drive-phase-tracker-ui.mjs` before the fix: expanding the opposite window shrank the tracker from about 220px to 65px; after scoping its measurements, maximizing the same-side history still overlapped the tracker.

Fixed the tracker to measure only its own history/dugout and to reserve height against the default history size. History then treats the rendered tracker as an overhead obstruction. This makes sizing flow from tracker to history, without a circular size dependency. The existing change-list entry now explicitly includes drive-tracker clearance.

Expanded the existing full-GameView browser regression to check both receiving sides at 1680x1380, 1280x720, 375x660 and 640x330: opposite history minimize/maximize, opposite dugout expansion, unchanged own-side rectangles, preserved tracker view, same-side tracker clearance, expanded same-side dugout clearance at larger sizes, and bounded layout settling. Existing four-layout/event/viewer/reload/handoff checks remain.

The user explicitly deferred expanded-dugout tracker clearance at 640x330 to upcoming minimum-display requirements. Its legacy short-screen CSS permits a 134px expanded dugout; all the controls, tracker and history title bar cannot fit without reducing that view. The regression retains compact-dugout clearance and side-isolation checks there. This is additional to the previously accepted 375x300 Debug exception.

Follow-up verification completed:

- Browser unit tests: 420 passed, zero failures/skips (`.tools/chat-log-tracker-unit.log`).
- TypeScript/Vite production build: passed (`.tools/chat-log-tracker-build.log`).
- Affected Java modules: 175 common + 23 client-logic tests passed, zero failures/skips (`.tools/chat-log-tracker-maven.log`).
- Focused `drive-phase-tracker-ui.mjs`, `chat-ui.mjs` and `pending-recovery-ui.mjs`: passed. The expanded tracker test includes its existing four-layout, event, viewer, refresh and ordinary-play checks.
- Complete browser gate: all 64 registered suites passed in 335.0 seconds; reports in `.tools/validation/local-browser-P3TmZC/`.
- Required Docker server build: passed; 175 common tests and 674 server tests, with the existing four opt-in server database cases skipped and no failures/errors.
- Supported dev-local restart: exited 0; ADC verified, proxy initial/reconnect test passed, computer player ready (`.tools/chat-log-tracker-dev-local.log`).
- Final `/play` HTTP 200 and single-instance inventory verified: one listener each on 5000/22232/22234, no 5173/5174 listeners, healthy server/database containers and one managed computer player.
- Self-review and `git diff --check`: passed. Inspected receiving-home and receiving-away maximized screenshots in `test-output/game-phase-tracker/`.

Visual review approved. Publication and merge after successful CI are authorized; final PR/merge records live on issues #366 and #367. Dev-local was stopped at the user's request, with database volumes retained.
