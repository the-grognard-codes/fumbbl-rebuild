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

1. [Smart pitch actions #92](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/92): move/path default, target-based Block/Blitz/Foul, reviewed distant routes, guarded continuation. Status: implemented, PR pending. Browser tests: 110 passed; hosted and main browser bundles built. A Playwright match view test using native Blitz projection frames verified declaration, target retention, route review, fallback to another adjacent square after `NO_ROUTE`, and the offered block after the route Commit. This is browser interaction evidence, not a signed-in end-to-end match.
2. [Setup dragging #93](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/93): setup bench and pitch drags plus Solid Defence pitch drags under server legality. Status: queued.
3. [Pitch pushback #94](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/94): directional arrows for each push decision and chain push, with immediate valid-square selection. Status: queued.

Acceptance evidence and PR links will be recorded here as each slice merges. The final outcome review follows the third merge, then the session retrospective.
