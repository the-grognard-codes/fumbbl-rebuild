# Negative player condition markers

Tracking issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/360

Branch: `feature/negative-condition-markers`. Approved after feature review on 2026-10-25.

## Agreed scope

Browser client, BB2025 onward. Show distracted, chomped, rooted, dodgy snack,
greasy cleats and eye gouged from authoritative player state and enhancements.
Do not change game rules or add condition expiration timers.

Use borderless red symbols over the same soft dark radial fade as limited-use
markers (revised after visual review; remove the filled discs and outlines). Distracted
uses differently sized question marks; reserve stars for future stunned markers.
Other symbols: jaws, roots, bitten food, oily boot and injured eye.

Combine conditions and limited-use markers above the player's head and skill
strip, with stable ordering, centered rows and wrapping after three markers.
Keep the existing size and limited-use artwork. Markers follow players and
remain on prone/stunned players. Hide markers off-pitch without modifying state.

Add a default-on, independently saved per-viewer "Show negative condition markers"
checkbox beside the limited-use setting. Both coaches and spectators can use it.
Retain the card heading **Status:** and display posture plus all active negative
conditions, with negative entries red and normal states unchanged. The pitch
toggle does not hide card information. No marker tooltips.

Live play, replay seeking and recovery must use the same projection. Preserve
compatibility with older saved projections lacking condition metadata.

No desktop-client or earlier-ruleset work. No remote deployment is requested.

## Affected checks

- Server: condition source projection, additive posture, application/removal,
  turn persistence, off-pitch state, all viewer roles, replay and recovery,
  including legacy checkpoints. Existing limited-action and card/status tests.
- Browser unit: strict optional protocol metadata, canonical order, preferences,
  combined placement/wrapping, card labels and negative styling classification.
- Browser UI: default and independent toggles, saved preference, all viewer roles,
  all six icons, no tooltips, player card, prone/stunned/off-pitch, moving markers,
  crowded rows, replay seeks and mobile viewport, no intercepted interactions.
- Browser production build and game-server build/tests. Inspect pitch screenshots.

## Results

Implemented and validated locally. See [the outcome report](negative-condition-markers-outcome.md)
for acceptance evidence, exact checks and limits.

The owner approved the Status list, menu and borderless previews, then authorized
the usual implementation workflow. Issue #360 covers one complete vertical slice:
authoritative conditions through browser presentation and regression coverage.
The existing feature branch and completed implementation are retained.

The owner subsequently authorized staging all changes, committing, pushing and
opening a PR, waiting for CI to pass before merging into `main`, deleting the
local and remote working branch after merge, and stopping the review stack.
Final integration evidence is recorded on issue #360 and the linked PR.
