# Feature: Dice effects and visible duration

## Abstract

Make pitch dice arrive and evaporate smoothly, emphasize injury outcomes with
small animated graphics, and retain important rolls longer. Browser client only;
the Java desktop client and game rules are outside scope.

## Objective

Improve result readability and visual emphasis with the chosen half-speed
presentation while preserving native results and decision lifetimes. The third
review supersedes the initial timing with the values below.

## Context / Existing Behavior

Dice groups currently expire 1,200 ms after reveal, including their tumble.
Selectable response dice remain until their decision resolves. Live, replay,
seek and recovery have distinct presentation lifecycles.

## In Scope

- Review-only animated previews before production implementation.
- Directional materialization (200 ms) and evaporative disappearance (200 ms).
- Armor break, stunned stars, KO bonk, casualty stretcher, BH, MNG, NI, -1,
  and death/skull outcome graphics about the size of existing pitch dice.
- Live coach/spectator, replay, reduced motion, skipping, seeking and recovery.

## Out of Scope

- Rules/mechanics, Java client changes, standalone effects without displayed dice.
- Unrelated UI changes, deployment, commits, pushes and PRs.

## Functional Requirements

1. First present looping previews on a representative pitch at actual and
   enlarged sizes, with both MUTP and result-specific color versions. Obtain
   explicit visual approval before production coding. Review-only code is allowed.
2. Preserve existing die geometry/art and the actual PolygonDie tumble's
   keyframes, axes and easing. Apply the fade outside the die, with the selected
   half-speed presentation baked into default timing: 200 ms entrance
   (50 / 0.5 + 25 + 75), 620 ms tumble (310 / 0.5), 200 ms evaporation (100 / 0.5).
   Fade durations are additional to the visibility window; tumble counts within
   it. Preserve previous preview rounds as references. Scale other action/pulse
   durations to the same 0.5x presentation; only entrance receives the additional
   25 ms from round three and 75 ms from round four.
3. Hold ordinary groups 2,400 ms and qualifying groups 4,800 ms independently:
   successful armor breaks, all injury rolls, and all casualty/serious-injury
   stages, including Decay and replacement rolls. Reveal groups 1,000 ms apart,
   corresponding to the earlier 500 ms cadence at the chosen half speed.
4. Do not expire selectable response dice before their decision resolves.
5. Place each outcome next to its settled dice and remove it with that group.
   Wrap the outcome below its group on narrow screens without shrinking text/dice.
6. Show the stretcher when injury dice indicate casualty, then the specific
   outcome only at the stage that determines it. Respect authoritative reports,
   omitted injury parts and ruleset differences. MNG is a missed-game-only
   result; NI marks niggling injury; -1 marks any stat reduction; death is a skull.
7. Animate preliminary and apothecary/reroll replacement results separately;
   never present a preliminary result as permanent or reveal future results early.
8. Armor breaking, bonk and stretcher play once then hold their final image.
   Stun stars swirl; shorthand and skull pulse gently. Reduced motion uses static
   symbols without tumble, flashing, evaporation or other movement.
   Armor is a front-laced football shoulder-pad set inspired by the supplied
   photograph, split down the middle with the original narrow separation.
   Restore the prior wheeled gurney; retain the newer football-uniformed player,
   helmet and cleats, with a slight waist bend as they plop down, then settle flat.
9. Scale motion/retention with replay speed. Skip animations bypasses decorative
   motion and extra holds. Seek/reconnect/visibility recovery restore static
   current dice/outcomes without replaying history or leaving stale timers.
10. Use the static-site and browser action-menu MUTP palette below for armor,
    stun, KO and the generic casualty stretcher. Only casualty types BH, MNG, NI,
    stat reduction and death use the colors from the prior result-specific
    palette. Palette, native motion and round-four art/timing are approved.
    No permanent palette chooser is requested.

## Acceptance Criteria

- The first slice exposes every requested effect and both palettes, actual-size
  pitch context, enlarged inspection, real-time looping and reduced-motion samples.
- Users explicitly approve the previews before the production slices start.
- Production lifecycle, reported outcome mapping, readability, timing and recovery
  satisfy requirements 2-10, with focused regression coverage.
- No animations alter rules, input availability or authoritative results.

## Constraints

- Support browser layouts on Android, Windows and Linux; preserve MUTP styling.
- New working branch from current main; preserve unrelated work.
- Do not stage, commit, push, deploy or open a PR without separate authorization.
- A user-facing ChangeList entry is required with production gameplay changes.

## Implementation Guidance

Extend existing SVG/code-native injury icons and existing PolygonDie rendering.
Keep throwaway previews under browser-client/prototypes, outside production routes.
No ADR is needed: this is a reversible presentation change.

Palette sources:

- Static site: `site/src/assets/site.css`, especially header/nav/button colors.
- Brand palette: `site/src/assets/brand-package-v4/manifest.json`.
- Browser UI: `browser-client/src/player-action-menu.css` and `coach-match.css`.
- Core MUTP blue/navy/yellow: #4db2ff / #101c2b / #ffe17b, with existing
  menu shading, blue borders and pale foregrounds where appropriate.

## Validation

Preview slice: typecheck preview sources; browser checks at desktop/mobile widths,
both palettes, looping/phase inspection, reduced motion and no app mutations;
inspect screenshots. Run browser build/unit checks and game-server build checks
after code changes as requested, recording exact commands and limitations.

Production slices: focused dice-stream/playback/outcome tests, browser rendering
and timing assertions, live/replay/reconnect/seek/skip/reduced-motion checks,
browser builds and required Java checks. Physical Android/Linux validation must
be reported honestly if those environments are unavailable.

## Completion Notes

Stop owned temporary review servers after validation. After production coding
is complete, start a fresh dev-local instance for manual testing. At the preview
approval gate provide a runnable review surface; do not claim gameplay completion.

## Tracking

- Parent: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/373
- [x] #374: animated previews and visual approval (2026-10-28).
  https://github.com/the-grognard-codes/fumbbl-rebuild/issues/374
- [x] #375: production dice effects/lifecycle, implemented locally.
  https://github.com/the-grognard-codes/fumbbl-rebuild/issues/375
- [x] #376: production outcome mapping/animation, implemented locally;
  validation and manual-test startup recorded in the outcome report.
  https://github.com/the-grognard-codes/fumbbl-rebuild/issues/376

Working branch: `feature/dice-effects-preview`, based on main `0eabe30d2`.
All issues remain open until their approval, validation and landing requirements
are satisfied. Outcome evidence: `dice-effects-visible-duration-outcome.md`.

Round four was explicitly approved on 2026-10-28 with authorization to integrate
it into the live game, stop review servers and start one dev-local instance.
Production integration, self-review and validation are complete. Review servers
were stopped; one dev-local instance was provided at http://localhost:5000/play.
The user accepted manual testing and authorized commit, PR/CI, merge into main,
working-branch cleanup and dev-local shutdown; the PR records final delivery.
The following preview history records the decisions leading to that approval;
the outcome report contains current production delivery and validation status.

Round-two feedback: evaporation and effect placement/choreography are approved.
Revise main symbols to fantasy-football equipment (chainmail, football helmets,
face cages and pads), center BH/MNG/NI/-1 within their boxes, and show the true
original polygon tumble with the 50 ms fade. Preserve round-one sources/images.
Second-round review: http://127.0.0.1:5182/pitch-preview?round=2&variant=MUTP
(also `variant=RESULT`). Artwork and final motion/palette selection await review.

Round-three feedback supersedes the earlier timing and selection notes above.
Native polygon tumble is selected; shoulder pads replace chainmail, the stretcher
uses cloth/poles with a helmeted uniformed player and cleats, the fixed palette
is MUTP except casualty types, and the chosen 0.5x pace is the new default with
25 ms extra entrance time. Requirements 2/3/8/10 now reflect these decisions.
Current review: http://127.0.0.1:5182/pitch-preview?round=3
Preview checks/typechecking pass; revised art and timing await visual approval.

Round-four feedback: keep the shoulder pads but restore the narrower original
split; restore the previous wheeled gurney with the newer football player bending
slightly at the waist on landing; increase entrance by 75 ms to 200 ms. Other
timing and mixed-palette selections stand. Requirements 2 and 8 reflect this.
Current review: http://127.0.0.1:5182/pitch-preview?round=4
Revised preview checks/typechecking pass; all previous rounds remain available.
