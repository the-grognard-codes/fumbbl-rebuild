# Dice effects: visual approval studies (#374)

Preserved visual studies on `feature/dice-effects-preview`. Round four was
approved on 2026-10-28 and integrated into production pitch rendering. These
standalone pages make no requests to a match service. Their review server has
been stopped; the commands below are retained for future reference.

## Open

From `browser-client`, run `npm run mockups:dice-effects` (`npm.cmd` on Windows).

- Current round four: http://127.0.0.1:5182/pitch-preview?round=4
- Preserved round three: http://127.0.0.1:5182/pitch-preview?round=3
- Preserved round two, MUTP: http://127.0.0.1:5182/pitch-preview?round=2&variant=MUTP
- Round two, result colors: http://127.0.0.1:5182/pitch-preview?round=2&variant=RESULT
- Preserved round one: http://127.0.0.1:5182/pitch-preview?round=1&variant=MUTP

Original URLs without `round` still show round one. Its `Review.tsx`,
`OutcomeGraphic.tsx`, `review.css` and previous image evidence are preserved.

## Round four: narrower split, gurney plop and longer fade

The shoulder-pad artwork stays, with the original +/-3 px split restored instead
of round three's +/-5 px. The round-two wheeled gurney returns, carrying the
round-three football player with helmet, uniform and cleats. New upper/lower
body groups hinge at the waist on contact (14/-6 degrees), then settle flat.
**Plop** freezes the contact pose at 1,340 ms; **Settled** shows the resting pose.

Entrance is now **200 ms**, another 75 ms above the previous 125 ms. The native
620 ms tumble, 200 ms exit, 2,400/4,800 ms visibility, 1,000 ms group spacing and
chosen mixed palette are unchanged. Entrance is additional to visibility, so
ordinary exit now spans 2,600-2,800 ms and emphasized exit 5,000-5,200 ms.

The fourth round lives in separate view/art/CSS files. Run
`node prototypes/dice-effects/round-four-checks.mjs` for evidence under
`.notes/art-preview/dice-effects-round-four/`, including contact/resting gurney
captures. Checks cover the 200 ms fade, original narrow split, restored wheels,
hinged impact/flat recovery, other timing/palette/layout/accessibility behavior
and hashes for all ten preserved first/second/third-round sources.

## Round three: chosen look and slower baseline

The user selected the original polygon tumble and the previous 0.5x presentation,
with another 25 ms added to the slowed entrance. This pace is now baked into
**1x · chosen timing**; no speed adjustment is needed after opening the page.

| Element | Round-three wall-clock time |
| --- | --- |
| Materialization | 125 ms (50 / 0.5 + 25) |
| Native tumble | 620 ms (310 / 0.5); same source keyframes and easing |
| Evaporation | 200 ms; same approved shape |
| Ordinary / emphasized visibility | 2,400 / 4,800 ms, excluding fades |
| Group spacing | 1,000 ms |
| Armor action / bonk / stretcher | 1,000 / 960 / 1,200 ms, starting after the tumble |
| Star / result pulse cycle | 3,000 ms |

`RoundThreeReview.tsx` drives the unchanged native clock adapter at half speed.
`round-three.css` scales the other phases explicitly; only entrance receives
the extra 25 ms. Frame buttons and the timeline report wall-clock milliseconds.
The optional review-speed control scales this new baseline for inspection.

`RoundThreeOutcomeGraphic.tsx` replaces chainmail with curved, front-laced
football shoulder pads inspired by the user's supplied equipment photograph;
there is no copied branding. The split increases from +/-3 to +/-5 px and opens
around the center of the pads. The stretcher is sagging canvas between two
carrying poles, with no wheels or legs; the placed player has a football helmet,
uniform and cleats. The first two rounds remain unchanged for comparison.

The chosen palette is fixed: MUTP blue/navy/yellow for armor, stun, KO and the
generic stretcher; only BH, MNG, NI, stat reduction and death retain their earlier
result-specific fill/outline/accent colors. Centered casualty typography stays.

Run `node prototypes/dice-effects/round-three-checks.mjs` for desktop/mobile
evidence under `.notes/art-preview/dice-effects-round-three/`. It verifies
effective timing, native effect fidelity, the mixed palette, wider pad split,
absence of wheels, label centering, sequences/controls/static motion, and hashes
for all seven preserved first/second-round art, view and adapter source files.

## Round two changes

The user approved the evaporation and effect placement/choreography, requested
fantasy-football equipment and centered casualty labels, and clarified that the
existing production polygon tumble must not be replaced. The first study's
different dice motion remains available as an alternative for later selection.

`RoundTwoReview.tsx` defaults to the actual `PolygonDie` animation with an outer
50 ms materialization. There is no added translation or rotation wrapper in this
mode. `NativeReviewDie.tsx` captures the real component's body/lift effects and
copies their keyframes/timing unchanged onto the same targets, solely to let the
shared review clock pause/seek/loop them independently of its completion timer.
Production `PolygonDie.tsx` and its CSS are unchanged.

The comparison panel shows the original motion without the fade, the original
motion with it, and the first study's motion at the same instant. **Dice motion**
also switches the pitch/catalogue between the two choices. **Mid tumble** freezes
150 ms; **Entrance midpoint** freezes the 50 ms materialization halfway through.

`RoundTwoOutcomeGraphic.tsx` supplies split chainmail with individual links,
gridiron helmets with face cages, ear protection, studded shoulder pads/laced
jerseys, a helmeted casualty on the stretcher, and a helmeted death skull. The
original motion classes and approved evaporation are reused unchanged. BH,
MNG, NI and -1 are centered by rendered font bounds after the font loads.

Run `node prototypes/dice-effects/round-two-checks.mjs` for the second-round
evidence under `.notes/art-preview/dice-effects-round-two/`. It compares captured
native effects with their original keyframes/timing, compares faded/unfaded
poses, measures result-label centering, and verifies preserved first-round file
hashes, in addition to the usual timing/layout/reduced-motion checks. The
`round-one-preservation.json` in that folder records the pre-revision hashes.

The floating palette selector and left/right keys update the URL. Arrow keys
inside controls keep their normal behavior. These are the two palette groups
explicitly requested, rather than the generic prototype skill's three different
page layouts. Both use the same geometry, motion, pitch, dice and typography.
The dedicated review server is the only route host; production builds do not
include the study or its selector.

## Review

- Select each outcome to watch it at actual size on the real projected turf,
  alongside existing human/orc player sprites and the current PolygonDie art.
- **Show preceding rolls** illustrates 500 ms spacing and overlapping 2,400 ms
  retention. NI/stat samples include an undetermined casualty stage before the
  serious-injury result. These are authored visual examples, not rules fixtures.
- **Ordinary dice** shows D6, D8, D16 and block geometry with a 1,200 ms window.
- Entrance is 50 ms; the illustrated two-axis tumble ends at 310 ms. The full
  visibility window starts after entrance and includes the remaining tumble.
  Emphasized exit is 2,450–2,550 ms after reveal; ordinary exit is 1,250–1,350 ms.
- Pause and scrub the timeline, or use the entrance/settled/exit phase buttons.
  Phase buttons inspect the first group; later groups retain their own offsets.
- The enlarged views use exactly the same artwork at 2.7×. Narrow inspection
  columns wrap the graphic below its dice without changing the native artwork.
- Armor breaking, bonk and stretcher play once then hold. Stun stars swirl;
  BH/MNG/NI/-1/skull gently pulse. One complete study loop is 4,400 ms.
- Static/reduced motion shows every selected sample without motion or expiry.
  It is an inspection sheet, not a recovered game history. The OS preference
  activates it automatically and cannot be overridden while enabled.

## References and provenance

New SVG paths in `OutcomeGraphic.tsx` are hand-authored review extensions of
`assets/game/ui/injury-icons-v1.svg`: outlined armor/body/skull, small impact
marks and restrained shading. The stretcher and shorthand motifs are new SVG
geometry/text. Existing source art and production icons remain untouched.
No ImageGen/bitmap replacement or new dependency was needed.

- Static site: `site/src/assets/site.css`, brand-package-v4 `manifest.json`.
- Browser menu: `browser-client/src/player-action-menu.css`, `coach-match.css`.
- MUTP core: blue #4db2ff, dark blue #101c2b, yellow #ffe17b; existing menu
  blue borders, navy background and pale highlights complete the set.
- The second palette retains the outline style but uses cool blue armor,
  yellow stun, amber KO, green stretcher/BH, amber MNG/NI and rose stat/death.

## Validation and limits

Run `npm exec -- tsc --project prototypes/dice-effects/tsconfig.json` to include
the prototype in strict typechecking (the normal build deliberately excludes it).
Run `node prototypes/dice-effects/review-checks.mjs` for browser evidence. It
starts an ephemeral server, saves captures/checks under
`.notes/art-preview/dice-effects`, and closes the browser/server on completion.

The shared clock drives paused CSS animations for exact frame inspection. Real
integration must implement teardown, chosen-die lifetimes, report-to-outcome
mapping, replay speed/skip, seek and recovery in the production lifecycle, with
their own regression tests. This page does not prove those future behaviors.

Parent design: [#373](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/373).
After visual approval: [#375](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/375)
then [#376](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/376).
The review assets remain unapproved until the user selects/accepts the animation
and palette. No commits, pushes, PRs or deployment are authorized.
