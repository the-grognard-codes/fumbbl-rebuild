# Browser pitch interactions

Agreed 2026-09-29 for the hosted browser match. Work runs as three separately reviewed and merged slices from current `main`. The game server remains the authority for legal actions, routes, placement, and push squares. Merging to `main` triggers the automatic DEV Hosting deployment after checks pass.

## Decisions

- Clicking a coach-owned player and an empty square prepares Move or a movement path. Clicking a standing opponent prepares adjacent Block or distant Blitz. Clicking a prone opponent prepares Foul.
- The selected action waits for Commit. Once committed, an adjacent target attack continues through server-offered action stages without another click, unless a required prompt or changed legality intervenes.
- A distant Blitz or Foul retains its target across activation, then pauses for review and a second Commit of the server route. The attack continues if the route reaches the target and the server still offers it.
- Setup allows reserve-to-pitch, pitch-to-reserve, and pitch-to-pitch dragging. Solid Defence allows pitch repositioning. Invalid and occupied drops do nothing.
- Push and chain push choices use arrows on server-offered pitch squares. Clicking a valid square sends that push immediately. Other decisions keep their dialogs.
- The existing keyboard and click controls remain available, and spectators cannot mutate a match.

## Slices and acceptance

1. [Smart pitch actions #92](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/92): move/path default, target-based Block/Blitz/Foul, reviewed distant routes, guarded continuation. Status: merged in [PR #95](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/95). Browser tests: 110 passed; hosted and main browser bundles built. A Playwright match view test using native Blitz projection frames verified declaration, target retention, route review, fallback to another adjacent square after `NO_ROUTE`, and the offered block after the route Commit. The full site browser suite and all PR checks passed. This is browser interaction evidence, not a signed-in end-to-end match.
2. [Setup dragging #93](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/93): setup bench and pitch drags plus Solid Defence pitch drags under server legality. Status: merged in [PR #96](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/96). Browser unit tests: 112 passed; hosted and main browser bundles built. A Playwright match view test dragged reserve-to-pitch, pitch-to-pitch, pitch-to-reserves, rejected an occupied drop, and verified a Solid Defence selection followed by the server-offered placement. The full site browser suite passed (10 tests). Java 21 verification passed on rerun after an unrelated existing route test failed once and passed locally on the prescribed toolchain. This uses mocked match transport and server-offered actions, not a signed-in end-to-end match.
3. [Pitch pushback #94](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/94): directional arrows for each push decision and chain push, with immediate valid-square selection. Status: validation complete, awaiting PR. Browser unit tests: 113 passed; hosted and main browser bundles built. The real-engine Blitz browser fixture clicked a push square on the pitch with no modal, and a second Playwright test clicked a push arrow, received a chain-push projection, then selected its new arrow with Enter. All 10 site browser tests passed. A screenshot review confirmed arrow placement and direction. These tests use mocked match transport with server-offered projection frames.

Acceptance evidence and PR links will be recorded here as each slice merges. The final outcome review follows the third merge, then the session retrospective.
