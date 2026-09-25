# M5c live board checkpoint — 2026-09-25

The `/play/match` page now renders the approved 26×15 SVG pitch over authoritative `/browser/v2` state. Server coordinates position players and ball; state controls prone/stunned treatment and active-player cue. Fit/zoom/pan share one transform. The existing action selector and 390-square setup grid remain available while M5d connects board interactions to action IDs.

The nested state projection is version 2. Each player has a public nullable `art` identity from its frozen roster and position; a missing or unsupported asset renders as a labeled team/slot token. The initial live art map has six Human positions. Unknown rosters and older replay states remain readable without a sprite. The game server and browser must be published together because an older browser decoder rejects version-two states. No database migration is needed.

## Evidence

- [Actor, normal](verification/m5c/actor-normal.png) and [spectator, normal](verification/m5c/spectator-normal.png) show the same two-player board.
- [Actor, crowded](verification/m5c/actor-crowded.png) and [spectator, crowded](verification/m5c/spectator-crowded.png) show the same 22-player setup. `SetupSessionTest.crowdedPitchFixtureUsesEnginePlacementAndFrozenArt` generates [the deterministic fixture](../../browser-client/test/fixtures/m5c-crowded-players.json) from a real engine session and checks its bytes. The hosted browser test sends that fixture to both views and asserts all 22 markers appear.
- Focused server projection and action tests passed (27 tests); browser unit suite passed (71 tests); site build and hosted browser suite passed (3 tests). `git diff --check` passed.

## Open for later slices

- Board clicks select a player or setup square; M5d must bind current server action IDs, legal targets, path, Commit and guarded Space behavior. The existing action control is the working command path.
- The board uses static sprites. Decorative movement/path animation is M5e; action/status sprite sheets are a later content increment.
- Success percentages still lack a server contract and remain in `todo.md`.
- R6 asset provenance and human visual review of the integrated GUI remain release checks. These screenshots are Chromium desktop evidence, not Firefox, Safari, iPad or screen-reader acceptance.
