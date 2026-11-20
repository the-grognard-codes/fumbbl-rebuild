# Feature: Old World Classic stadium, round four — paint first, overhead only

Date: 2026-11-17. Status: owner confirmed the overhead-only scope and the approval gate; ready for agent.
Supersedes the method of [#566](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/566)
and draft PR [#571](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/571); see the
[two-axis review on #571](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/571#issuecomment-6938352174).
Concept images: [`assets/game/references/stadiums/concept-round-3/`](../../assets/game/references/stadiums/concept-round-3/README.md).
Tracker: [#572](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/572).

## Abstract

Make the Old World Classic stadium look like the concept
`01-old-world-classic-human-home.webp` in the **overhead camera only**, by
painting one complete scene first, getting the owner's approval of that still,
and then cutting it into a few large layers. Code arranges those layers and
does nothing else to the art. Angled cameras are out of scope for this round.

## Objective

Three rounds failed to match the concept. Round three (#571) showed why:

1. **Projection mismatch.** The concept is SNES-style "fake top-down": the
   ground is seen from above, but walls, banners and spectators are drawn
   front-on, so faces show on both sidelines. A perspective camera looking down
   the long axis sees the side stands edge-on and cannot reproduce that. The
   overhead mode then drew literal tops of heads.
2. **Wrong granularity.** Good source sheets were sliced into scan bands and
   reassembled by code, which destroyed the composition that makes the concept
   work: tiered rows, wall occlusion, banners over the wall, torches between,
   benches on a dirt track, depth lighting.
3. **Process.** Measurable geometry was prioritised over the look, comparisons
   were made at mismatched cameras, and eight rounds polished one approach with
   no trigger to change it.

This round fixes the method. Success means the owner looks at the gallery in
overhead view beside the concept and says it matches.

## Context / Existing Behavior

- Overhead (`top-down`) mode in `browser-client/src/pitch-projection.ts` is a
  pure 2D mapping (scale factor 1, no depth): pan and zoom are affine. One
  painted backdrop registered to world squares stays aligned at every pan and
  zoom.
- In overhead mode, home end, the pitch's long axis runs vertically on screen,
  as in the concept: side stands left and right, end walls top and bottom.
- Player sprites are front-facing in overhead mode, which matches the concept's
  "fake top-down" convention.
- PR #571 has reusable gallery scaffolding (`/stadium-mockup` route, controls,
  concept panel, colour presets, provenance checks, `build-stadium-mockup.mjs`)
  and its source sheets (`assets/game/pitch/stadiums/mockup/`), notably the
  architecture sheet (walls, torch pillars, benches, barrels), which is close to
  the concept's style. It also carries the defects listed in the review.
- Live matches show turf only (#340). This round changes nothing in live play.

## In Scope

- A gallery that shows the Old World Classic stadium in overhead view only,
  both coach ends, all zoom levels and full pan.
- One approved painted target still, then a small set of large layers cut from
  it.
- A swappable visiting section and recolourable team cloth, cut from the same
  painting.
- A calmer pitch surface that keeps the turf's character.
- The fixes from the #571 review that apply to the reused scaffolding.

## Out of Scope

- Any stadium rendering at 30/40/50-degree cameras. In the gallery, angled
  cameras show turf only, exactly as live play does today. Angled cameras get
  a separate later decision once the overhead look is accepted.
- Live match integration, other Leagues, saved-colour wiring in live play.
- Crowd animation beyond optional small torch flicker.
- Player sprite, rules, protocol or server changes.

## Functional Requirements

1. **Target still first (gate).** Capture the gallery's overhead view of the
   empty pitch at the native art scale (stated in pixels per square) for the
   home coach end, with the two-square apron and stand area visible. Using that
   capture as the exact layout base and the concept as the style reference,
   generate one complete painted scene: dirt-track apron, stone and timber wall
   with depth, torch pillars, large heraldic banners hanging over the wall,
   benches and barrels along the wall, a dense tiered crowd drawn front-on with
   faces toward the pitch on both sidelines, the end walls and a smaller red
   visiting section. Keep the 26×15 pitch area exactly where the capture puts
   it, with no art over it. Produce three to five candidates, choose the
   closest to the concept, and save all of them with provenance.
2. **Stop for owner approval.** Publish the chosen still and the alternatives
   in the draft PR and the outcome note, then **stop the art pipeline** until
   the owner approves a still. While waiting, do only the requirement 9 fixes
   and gallery work that does not depend on the art. Overnight, if no approval
   arrives, finish with the candidates and the request for approval.
3. **Cut, don't regenerate.** From the approved still, cut these layers at
   their painted size and pixel density, with transparent edges cleaned by hand
   or with a deterministic script, and no resampling:
   - left stand strip and right stand strip (crowd, wall, banners, props on that
     side),
   - far end wall strip and near end strip,
   - visiting-section overlay (the smaller red section) as its own layer,
   - recolour masks for banners, pennants, scarves and bench cloth,
   - the calm turf for the 26×15 playing surface (requirement 6).
   Small additional pieces are allowed only to fix seams. Never slice the crowd
   into rows or bands.
4. **Both coach ends without upside-down people.** Figures must stay upright
   from either end. For the away coach end, place the strips by screen side, not
   by rotating the art: the strip on the screen's left shows the stand that is
   on the left from that end (mirrored horizontally if needed), the far end wall
   art is always at the top and the near end strip at the bottom. Ownership
   follows the world: the home crowd and the visiting section stay at their
   fixed world locations, so from the away end the visiting section appears on
   the other side of the screen. Emblems and lettering that would read wrongly
   when mirrored go in a separate overlay that is never mirrored.
5. **Registration.** Each layer is anchored to world-square coordinates and
   drawn through the overhead projection only, so pan and zoom keep it aligned
   with the grid. Use nearest-neighbour scaling; integer zoom steps should be
   pixel-exact.
6. **Calmer pitch.** The playing surface keeps the concept's painted grass
   character with reduced contrast: fewer and fainter dirt patches, no flowers,
   gentler mottling. Use a painted turf texture derived from the still, not a
   flat colour wash over a tile. Offer at most two presets (calm, balanced) and
   verify readability with both full teams on the pitch (requirement 8).
7. **Recolouring.** Team cloth recolours through the existing team-colour ramps
   using the cut masks. Stone, timber, skin, metal and outlines never change.
   Test the extreme and identical colour pairs.
8. **Gallery.** Reuse the #571 scaffolding, overhead only:
   - **Controls:** coach end, zoom, pan, pitch preset, colour pair, visiting
     team (Orc and Human mirror), and layer toggles.
   - **Concept overlay:** a slider that cross-fades between the concept and the
     render at matched framing, plus the side-by-side view.
   - **Players:** a full 22-player kick-off formation in team colours,
     including the Orc fix from the review.
   - **Angled cameras:** they remain selectable and show turf only.
9. **Fixes carried over from the #571 review:**
   - Exclude unaccepted stadium art from `sync-browser-assets.mjs` delivery.
   - Keep committed review imagery under 25 MB in total.
   - Default test screenshots to an ignored `.tools/` path.
   - Use `orc-blitzer` (or the catalogue lookup) for Orc players.
   - Pass team colours to player art.
   - Fix the `onError` effect dependencies.
   - Add npm scripts for the gallery UI checks and remove the hard-coded
     Chrome path.

## Acceptance Criteria

- An approved target still exists, with its candidates and provenance. The
  owner's approval is recorded in the issue or PR.
- In overhead view at the still's native scale, home coach end, the gallery
  render and the approved still differ only where intended (pitch calming,
  layer seams). Record an automated pixel-difference figure for the area
  outside the pitch.
- At 50%, 100% and 200% zoom and while panning, layers stay aligned with the
  grid, with no gaps or doubled edges.
- From the away coach end every figure is upright, the visiting section is at
  the same world location, and mirrored emblems read correctly.
- Both teams' 22 players render in team colours and read clearly on both pitch
  presets.
- Unaccepted art is absent from `browser-client/public` and `dist-play`.
  Committed review imagery stays under 25 MB.
- Browser unit tests, TypeScript, the production build and the projected-pitch
  and playback UI drivers pass. Live rendering is unchanged.

## Process rules

- **The look gates everything.** Geometry checks stay, but never at the
  expense of the approved still.
- **Change-method trigger.** If two review rounds after the cut do not converge
  on the approved still, stop polishing, record why, and propose a different
  method in the outcome note.
- **Review rounds.** Each round records before/after captures at the matched
  framing, the cross-fade comparison, a written list of the three largest
  differences from the still, and what was changed.
- **Draft PR.** Open a draft PR once requirement 9 is green; push after each
  round. Do not merge, mark ready or deploy.

## Constraints

- Ensure the themes are all supported on Android, Windows, and Linux.
- MUTP colors, typography, style, and themes shall be preserved. Reuse CSS and other UI/UX scaffolding where appropriate.
- Create a new branch from current `origin/main` in its own worktree; port
  reusable code and source sheets from #571 rather than continuing on its
  branch, so its 272 MB of review images do not carry over.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- No `CHANGELOG.md` entry; this is not user-visible.

## Implementation Guidance

- Generate the target still at the native resolution you will ship, or at an
  exact integer multiple, then downscale by that integer with nearest-neighbour
  once. Record which.
- The architecture sheet from #571 is a good style reference to give the
  generator alongside the concept; the crowd sheets are not, because they led
  to the regimented look.
- Keep the layer count small. Fewer, larger, painted layers look like the
  concept; many small code-assembled ones do not.
- If the generator cannot keep the pitch rectangle clean, paint the scene with
  the pitch area masked out and composite the calm turf separately.

## Validation

- Create new or update existing regression tests as required: registration at
  several zoom and pan values, upright figures and world ownership from both
  ends, the delivery exclusion, and player colours.
- Run browser unit tests, TypeScript, the production build, and the
  projected-pitch and playback UI drivers.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
- Write `docs/specs/old-world-classic-stadium-round-four-outcome.md` with the
  candidates, the approval record, round-by-round comparisons, the pixel
  difference figures, remaining differences, and a recommendation for angled
  cameras.
