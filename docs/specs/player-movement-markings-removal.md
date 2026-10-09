# Remove player movement range and risk markings

Branch: `feat/move-markings-removal`. Review baseline: `c4d411846`.

The owner's rollback request supersedes the range and risk presentation criteria
in [#230](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/230) and
[#231](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/231), as well as
the Dodge/Rush presentation criteria in the route and Blitz tickets.

Remove full own-player and opponent range shading, adjacent movement highlights,
planned-route square shading, Dodge/Rush targets, additional movement risk badges,
risk legends and forecast descriptions. Remove UI range requests and their state,
props and response handlers. Remove the unused risk presentation module and CSS.
Retain coordinate-only accessible route descriptions and debug route details.

Preserve the behavior delivered by
[#232](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/232),
[#233](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/233) and
[#234](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/234):

- Select a player, plan movement and confirm activation and movement once.
- Plan adjacent and distant movement with route lines and unnumbered waypoint dots.
- Undo the latest waypoint and generated span with right-click; retain right-drag
  panning, keyboard controls, cancellation and repeated-confirm safeguards.
- Preview a target-based Blitz and confirm movement and the native block once.
- Keep native legality, forecasts used to validate plans, mandatory roll decisions,
  game logs, playback and movement interruptions.

Passing guidance, player selection, attack targets, kickoff and setup guidance,
stadium artwork and unrelated working-tree changes remain in scope only for
regression checks. The native range API and strict wire decoders remain compatible;
the UI no longer calls the range API or renders any movement forecast markings.

## Acceptance evidence

Automated evidence and the self-review results are recorded in
[the verification handoff](../verification/player-movement-markings-removal.md).
The owner accepted the change after local review and authorized staging, commit,
PR creation and merge once checks pass. The scope remains the live match UI.
