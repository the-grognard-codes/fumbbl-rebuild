# Cursor square selection marker

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/369

Branch: `feature/369-cursor-square-marker`, created from local `main` with a clean working tree.

## Approved design

One implementation slice covers presentation, input lifecycle and validation.
Reuse the selected-player cyan outline for the canonical empty or occupied square
beneath mouse/trackpad or hovering pen input. This is position guidance, without
implying action legality. Hover never changes selection. Keep the selected-player
outline and draw both squares when different; deduplicate coincident outlines.

Support active/waiting coaches, spectators and replay inspection. Hide outside
the pitch, over UI overlays, while interaction is blocked/recovering, during
dragging and throughout special targeting modes such as kick placement,
follow-up, push/sidestep and equivalent square choices. Restore on returning to
normal interaction even when the pointer stays still. Touch/contact clears the
marker; qualifying pointer hover can restore it on hybrid devices. Preserve
existing kickoff targeting, keyboard navigation, pitch geometry and themes.

No other UI or game-rule/mechanics/sequencing changes. The initial handoff left
publication to owner approval. After visual review, the owner authorized staging
all changes, committing, pushing, opening a PR, waiting for validation CI, merging
to `main`, deleting both working branches and stopping dev-local. Deployment
remains outside the requested scope.

## Affected-test manifest

- New cursor-marker browser regression: empty/occupied squares, selection
  coexistence/deduplication, canonical hit testing, overlays and stationary
  changes, mouse/pen/touch, panning/camera, keyboard, read-only/replay,
  special-mode suppression and restoration.
- Existing projected pitch, follow-up, push/sidestep, kickoff/player selection,
  playback, reconnect and uncertain-request recovery browser regressions.
- Browser unit suite and production build; native Maven reactor verify and
  game-service verify (server build/tests). Inspect rendered pitch evidence.

## Results

Implemented and validated locally. See [the outcome report](cursor-square-marker-outcome.md)
for exact checks, acceptance evidence, native opt-in skips and physical-device
testing limits. The owner approved the visual result and authorized publication
and merge after validation CI passes. Final delivery is recorded on issue #369.
