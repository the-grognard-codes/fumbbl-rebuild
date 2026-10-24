# Feature: Limited-use action tags

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/342
Branch: `feature/limited-action-tags`

## Abstract

Show a gold action icon above each player who consumes a limited team action during the current turn.

## Objective

Let coaches see which allowances were spent and which players spent them, without reopening action menus.

## Context / Existing Behavior

The reviewed artwork existed only in a throwaway prototype. Live play had neither a marker renderer nor its Interface setting. Existing native allowance flags usually did not identify the player who consumed them.

## In Scope

- Reuse the approved action-menu artwork, tinted MUTP gold over a black circular radial fade with no border or tile.
- Record authoritative confirmed declarations and confirmed planned routes in durable per-turn player metadata.
- Render shared tags in live play, spectator views, replay snapshots/seeking and recovered games.
- Add the default-on local Interface setting and regression coverage.

## Out of Scope

- Changes to game mechanics, sequencing, action eligibility or unrelated UI.
- New raster artwork, animation or the rejected light-blue alternative.
- Old-game migration or remote application deployment.

## Functional Requirements

- Cover Blitz, Pass, Hand Off, Foul, Throw Bomb, Throw Team-mate, Kick Team-mate, Punt and Secure the Ball, including their normal movement/Hail Mary variants.
- Record the confirmed declarer at allowance consumption, including failed Bone Head/Really Stupid rolls and Bloodlust continuations. Previews and free/reactive actions such as Dump-Off and Pile Driver do not acquire tags.
- Additional allowances can mark another player even if the normal team allowance is already spent. Retain the original confirmed tag during alternative-action continuations; no confirmed case requires stacking different tags on one player.
- Center the icon slightly above the player's head and allow the fade to overlap skill markers. Follow movement and pushes and keep the tag in every on-pitch status.
- Hide tags when players leave the pitch. Clear all metadata on every turn boundary, including departed players, special kickoff windows, touchdown/setup and terminal phases.
- Offer Show limited action tags in Game Menu > Interface > Pitch and interface. Default on, persist locally, and update immediately in live play and replay.

## Acceptance Criteria

- Explicit declarations and confirmed planned routes show the correct player's consumed allowance; cancelled previews remain unchanged.
- Both coaches and spectators see the same server-owned tags, and replay/recovery preserve them at the correct revision.
- Trait failure and alternative action handling retain the original consumed declaration.
- Every turn-end path removes tags without looking up departed player objects.
- The actual pitch matches the approved gold/black-fade design and the setting fits short/mobile viewports using existing MUTP controls.

## Constraints

Support the existing browser client on Android, Windows and Linux using standard SVG/CSS. Preserve MUTP styling, approved icons and unrelated working-tree changes. Work on a new isolated branch. Preserve the existing AI scheduling fix. Publication, CI-gated merge and branch cleanup were explicitly authorized after the validation handoff. Old-game compatibility is not required; the user will manually clear old games, and the implementation must not delete their data.

## Implementation Guidance

Use native TurnData metadata for copy/serialization/recovery, record ownership through the browser PlayerActivation consumption boundary, and project an optional strict per-player action kind into public snapshots. Use the shared LivePitch renderer and ActionGlyph atlas. Track action-window resets independently of numbered turns so special kickoff windows cannot reapply expired tags.

## Validation

Affected-test manifest:

- Browser limited-action-tags unit/protocol/preference tests and limited-action-tags-ui live/coach/spectator/replay/recovery/status/mobile checks.
- Existing skill-markers-ui and game-menu-events-ui integration checks.
- Native LimitedActionTagsTest declaration/planned-route/replay/recovery/lifecycle/failed-trait checks and PlayerActivationAllowanceTest canonical variants, additional allowance, free action and unnumbered-window checks.
- Existing PlayerActivationRecoveryTest and SetupSessionMovementTest; full native common/server package and test suite.
- Full browser unit and interaction/hosted inventory via supported dev-local rebuild preflight.
- Java 8 changelog compile and retained computer-player regression suite.

## Completion Notes

Implemented, self-reviewed and validated locally. The single dev-local instance is running the feature at http://localhost:5000/play. See [the outcome report](limited-use-action-tags-outcome.md) for exact checks, evidence and manual-review instructions. The user accepted validation and authorized publication, CI-gated merge, branch cleanup and final dev-local shutdown.
