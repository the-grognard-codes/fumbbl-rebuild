# Human stadium hybrid rendering study

Workstream: [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211).
Branch: `feature/stadium-hybrid-prototype`.
Base: `3a9a27d78` (main). This is a limited development prototype, awaiting visual review.

## Latest revision: restore the original artwork

On 2026-10-11 the owner requested further revision of the group-card study and asked to
apply the wall and crowd from the earlier live-match screenshot. The exact source remains
at `assets/game/pitch/stadium-v1.png` (1672 × 941); SHA-256
`ce5bfcc65cb95ff167914b1c58a18e572a7b09398af50441996e8f87389a0112` matches its recorded provenance.
The source pixels were not regenerated or edited.

The development preview now defaults to **Original artwork**, centered at midfield with
40° perspective and zoom 1. It restores the full painted stone/timber walls, packed
spectators, blue/red banners and torches. Source registration, half-plate longitudinal
overlap and outer crowd extensions were recovered from the original renderer in
`e8cb1fb7c`. The restored plates use the current camera's source-space clipping so an
above-horizon viewport edge does not make the whole stadium disappear. Pitch lines,
390 cells and sample players remain independent layers using the shared game camera.

This restores an appearance baseline. The old scene is baked perspective artwork with
static spectators; it does not supply interchangeable Human/Orc crowd sections, separate
props, new stair entrances or crowd animation frames. Repeated paintings and outer crowd
tiles remain visible, and projecting painted depth at a different camera angle can still
distort it. Those are limitations of the original incarnation, not solved by restoring it.
An overhead selection uses existing modular overhead walls/crowds and labels that fallback,
rather than flattening the perspective painting. Gesture/group controls are disabled for
the static source. The hybrid, structure and current-rendering comparisons remain available.

The group-card art has not received owner acceptance. Future modular work must preserve
the original painting's material, connected pixel clusters and spectator character while
addressing the previously recorded raised-bowl, upper-body visibility and local-motion
requirements. This revision remains in the isolated feature preview; it does not alter
the live match renderer or merge the prototype into main.

Build and TypeScript passed after this revision. The expanded browser review passed
61 cases, including 27 original-art camera/scroll/zoom cases, both ends, all supported
angles, compact 30°, unique repeated-plate mask identifiers and the explicit overhead
fallback. All 390 pitch cells remained present, with no runtime errors or failed asset
requests. Hybrid local gestures and reduced-motion checks also passed. The production
JavaScript bundle contains neither development study renderer.

## Question

Can a painted Human side section joined to one rounded corner retain intact spectator
proportions during camera travel when the bowl has real raised surfaces and the crowd
uses whole-group images at defined world positions?

The agreed hybrid approach retains six logical crowd sections for the full bowl. This
study authors only one Human side half and its adjacent home corner. It does not rebuild
the whole stadium, produce Orc variants, or change game rules, input geometry or pitch art.

## Requirements carried forward

- The reference remains the approved raised, wraparound Human bowl in
  `assets/game/references/stadiums/human-reference-revision/live-behavior-target.png`.
- A modest reduction in crowd density exposes most front-row upper bodies and the upper
  chest of patrons behind them. Retain packed, standing spectators rather than isolated
  individual player-like sprites or thin strips of cropped heads.
- Stone walls and coping need visible thickness and subtle depth variation.
- The side and corner use matching dimensions, rises and join positions so other venue
  and crowd families can reuse the layout.
- Crowd ownership follows the teams; structure follows the home League. Only the Human
  test pieces are created here. The full-bowl plan still has three logical sections per team.
- Benches and loose equipment belong on the field side of the stadium wall.
- Locker-room access is a stone doorway with stairs descending into darkness, with
  flickering wall torches. This study includes one doorway by the tested bench; the full
  stadium retains exactly two sideline entrances.
- Default target views are 40° and overhead, both viewing ends, near/mid/far camera focus
  and zoom. 30° and 50° are stress checks, not accepted bespoke artwork.
- A few spectators cheer and drink within a randomly chosen group; the terraces and
  remaining groups do not move. Respect reduced motion.
- The existing 26 × 15 / 390-cell pitch and its projection stay the reference for size.
  Pitch texture and chalk improvements remain a separate workstream.

## What was built

- Three raised terrace ranks and a faceted quarter-circle corner share the same world
  join at `(-2, -2)`, rise values and radial widths. Side floors are split into short
  surfaces for painter ordering rather than one giant floor sheet.
- Wall faces, annular terrace tops and individual coping surfaces use the existing
  camera's clipped projective surface transforms. The wall texture reuses approved art.
- Forty-two intact six-person group cards occupy measured world anchors. They preserve
  their source aspect ratio with uniform screen scale, use directional artwork and have
  independent ranks/elevations. No crowd image is divided into scanline strips.
- One generated atlas supplies rest, anticipation and cheer/drink states from front,
  back, opposing three-quarter views and overhead. It is prototype artwork; identity,
  directional coverage and pixel registration require owner review before production.
- The bench and mugs are inside the wall. A simple stone stair opening and two torches
  test placement and visibility.
- Comparison views show hybrid crowd, structure only and current jigsaw rendering using
  the same camera. The production route keeps its existing preview.

## Run and review

From this worktree:

```powershell
cd browser-client
npm.cmd ci
npm.cmd run dev:stadium
```

Open `http://localhost:5174/pitch-preview?variant=stadium-hybrid`.
The default is `study=original`. Use `study=hybrid`, `study=structure`, or `study=current`
for shareable comparison URLs.
Drag or press Up/Down to scroll, use the wheel or slider to zoom, switch viewing ends and
camera angles, choose **Inspect join** for a closer view, and enable group bounds to
inspect image scale and registration.
No running game server, account credentials or match mutations are required.

## Limits and production decision

This uses the application's current CSS/SVG projection with ordered surfaces, not a new
WebGL depth-buffer renderer. Sorting whole surfaces remains an approximation at overlaps;
the experiment must be judged for occlusion as well as image proportions. The current
comparison includes the original bench recess breaks; its different wall layout is expected.

Each group has finite depth extent but its members are still painted onto one card.
Directional images switch at quadrant boundaries without blending. The 40° art is also
used for 30°/50° stress checks. Those limitations are explicitly part of the review.

The group sheet intentionally repeats one set of six people to test rendering before
commissioning the larger bespoke side/end illustrations. Its repetition is not the final
art direction. The overhead row also requires visual review for head/shoulder orientation.

The full six-section U-shaped crowd, Orc artwork, production integration and final artistic
acceptance are pending. This branch is the primary source for the experiment, and should
remain separate from main until its rendering and visual result are reviewed.

## Validation

- TypeScript and the production browser build pass. The prototype entry is gated by
  `import.meta.env.DEV` and is omitted from the production JavaScript bundle.
- All 27 canonical art checks and 206 synchronized asset checks pass.
- All 29 focused camera, scenery, jigsaw and gesture regression tests pass.
- The initial `npm.cmd run review:stadium` recorded 34 browser camera/comparison/scroll/zoom cases:
  both ends, 40° and overhead, 30°/50° stress checks, focus 0/13/26, and compact
  689 × 605 viewports. It preserves 390 cells and source aspect ratios, verifies drag
  and wheel behavior, and observes no runtime errors or failed requests.
- Both intermediate and peak gesture frames appear, only one group changes at a time,
  and reduced motion interrupts a running gesture and suppresses torch animation.
- [Representative captures and results](../../assets/game/references/stadiums/hybrid-prototype-review/README.md)
  show the real renderer alongside the current implementation.
- An independent code review found no actionable issues in the final projection,
  measured atlas, directional selection, motion handling or development-only route.

The visual review found improved intact upper-body proportions, a continuous raised
side/corner join and visible pitch-side furniture. Repeated identities, exposed terrace
floor and discrete directional transitions remain prototype limitations. Artistic owner
acceptance is pending; successful technical checks do not imply a final reference match.
The approved reference used for generation is byte-identical to the owner's latest
attached bowl reference (SHA-256 `549c148e5d7881bf5d38d393256b015cb7fb0b17de94707835c12d089ac099c9`).

## Artwork provenance

`assets/game/pitch/stadiums/prototype/human-groups-v1.png` was generated using the built-in
imagegen tool with the approved reference as style input. The complete prompt, measured
regions and original filename are saved in adjacent `provenance.json`; the browser copy
is generated through the repository's normal asset synchronization script.

Workflow: [prototype skill](../../.agents/skills/prototype/SKILL.md) and built-in imagegen.
