# Old World Classic stadium gallery outcome

Issue [#566](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/566),
branch `codex/566-old-world-classic-mockup`, base `85e2c839b`.

This gallery preserves the third stadium concept round for historical review.
Its assets load through the local development route and are excluded from the
production asset package.

The dev-only gallery, modular art candidates, material pipeline and review
tooling are implemented. **This is not a visually accepted production stadium.**
Generation improved the sources over several rounds, but has not reached the
concept's unified crowd density, corner transitions and lighting quality.
The issue's fallback instruction applies: preserve honest candidates and finish
the geometry, recolouring, provenance and review tooling for owner review.

## Architecture and rationale

See [the investigation](old-world-classic-stadium-architecture.md). One unchanged
production `PitchProjection` supplies the grid, players, ground and raised art.
Independent architecture, crowd, cloth and life layers use fixed square-space
anchors. The visiting crowd is always `north-away`; changing coach end cannot
change ownership. Crowd scan bands are uniformly scaled source crops, not
individual repeated fan cards. Dedicated overhead banks replace upright art.

The full-atlas DOM composition lost wall sections in Chromium. Gallery-only
clipped canvases resolved that observed failure. A finite gallery grass plane
handles horizon-crossing 30-degree views, and clipped chalk segments preserve
visible markings. Production scenery, projection and match mounting are untouched.

## Files and independent configuration

- `browser-client/src/StadiumMockup.tsx`, `stadium-mockup.css`: dev review UI,
  controls, kickoff fixture, overlay specimens, comparison and seam bounds.
- `stadium-mockup.ts`, `stadium-mockup-architecture.ts`,
  `stadium-mockup-crowd.ts`: venue/world crops, fixed section ownership and teams.
- `StadiumMockupSurface.tsx`, `StadiumMockupTurf.tsx`: clipped rendering.
- `StadiumMockupCloth.tsx`, `use-stadium-mockup-colors.ts`,
  `StadiumMockupLife.tsx`: palette ramps, bounded gestures, torch/pennant motion.
- `dev-entry.tsx`: DEV-only lazy `/stadium-mockup` route. No production entry import.
- `assets/game/scripts/build-stadium-mockup.mjs`: source/hash/provenance checks
  and deterministic material indices, called by the existing asset sync pipeline.
- [Canonical inventory and material contract](../../assets/game/pitch/stadiums/mockup/README.md),
  original PNGs, masks and provenance; synchronized browser delivery copies.
- `browser-client/test/stadium-mockup*.{ts,mjs}`: unit, material, gallery and
  actual live-render geometry comparisons.

Run `npm ci`, then `npm run dev -- --port <free-port>` in `browser-client` and
open `/stadium-mockup`. The visitor and cloth palettes change independently of
the architecture. Venue replacement currently means selecting another authored
bundle in the module factory; no second League is implemented or exposed in UI.

## Camera behaviour and screenshot evidence

[Review gallery](../../assets/game/references/stadiums/old-world-classic-mockup/README.md)
contains the round-by-round critique, concept differences and conflict log.
[Latest comparison](../../assets/game/references/stadiums/old-world-classic-mockup/round-8/concept-comparison.png)
and contact sheets show both ends × 30/40/50/90 × near/far; calm/balanced/textured
turf; five colour stress cases; Human mirror; desktop and Android-sized layouts.
Zoom bounds .5/1/2 are exercised across both ends and four angles. These sampled
checks do not prove every continuous camera position or invisible joins.

OS and app reduced motion freeze decorative motion. The authored gesture is
limited to one home-facing Human patch. Torches use a modest stepped brightness
cycle and pennants a one-degree stepped skew; no crowd bank translates or bobs.

## Requirement and tier status

| Requirement | Result |
| --- | --- |
| 1 Concept match | Partial; detailed candidates exist, but owner acceptance and visual cleanup remain. |
| 2 Calm pitch | Implemented: three presets, real 22-player formation, ball/movement/block/assist specimens. |
| 3 Layout/ownership | Implemented fixed slots, two-square apron, home bowl and smaller Orc visitor; corner finish incomplete. |
| 4 Depth/no stretch | Uniform upright crops and shared lens implemented; repeated rows, proportion mismatch and joins remain visible. |
| 5 Modularity | Separate architecture, crowd, props and cloth; Human mirror swaps without venue changes. |
| 6 Recolouring | Existing player ramps with offline masks; protected RGBA/alpha invariance tested. Semantic masks still need artist review. |
| 7 Life | Partial stretch: one gesture orientation, flame/pennant motion and reduced-motion behaviour; no full lighting pass. |
| 8 Review page | All requested control categories and side-by-side concept are present. |
| 9 Contact sheets | Complete final matrix and contact sheets; earlier rounds retain their available evidence. |
| 10 Honest comparison | Gallery README and this report identify differences and acceptance gaps. |

Tier 0 was committed and pushed first. Tiers 1–3 and stretch life were iterated
together in eight recorded capture rounds, rather than as separately published
green tiers. The draft PR was opened at handoff rather than immediately after
Tier 1. The full mandated suite was not rerun at every intermediate art change;
final validation and several live-regression checkpoints are recorded below.
These are process deviations, not claims that the overnight protocol was met
exactly. No historical screenshots are relabelled as a later implementation.

## Validation

- Browser unit suite: **547 passed**, including seven gallery/material tests.
- `npm run assets:check`: **30 tests passed**, source/provenance/material checks
  passed, **585** delivery assets checked.
- TypeScript and production Vite build passed. Mockup identifiers and atlas
  names are absent from `dist-play/game.js` and `game.css`.
- `stadium-mockup-ui.mjs`: 16 captured cameras with all 390 cells and player
  anchors compared to production projection; 24 additional zoom combinations,
  colour/layer/visitor controls, reduced motion and 390px layout checks.
- `stadium-mockup-parity.mjs`: actual live grid homographies, player anchors and
  visible goal/scrimmage endpoints compared with the gallery across 24 cameras.
  CSS transform inspection uses a 0.5px serialization tolerance; gallery SVG and
  player anchors use 0.02px. This is geometry evidence, not a full raster diff.
- `projected-pitch-ui.mjs` passed, including 48 venue/end/angle/travel cases and
  no stadium atlas loading in live play. `playback-ui.mjs` passed authoritative
  replay and reduced-motion playback checks.
- Root reactor `tools/target-build.ps1 install` completed **BUILD SUCCESS** for
  all Java modules, including server and state tests (18m14s). Pinned JDK/Maven,
  local worktree repository. Initial sandbox runs failed on ClassGraph jar
  access; the same isolated build passed with the approved execution scope.
- Independent finish review found missing apron, clipped markings and failure
  coupling. All three were fixed and recaptured. Its remaining art findings are
  recorded above. No live renderer code or shared dev-local service changed.

Windows Chromium was exercised. Android is viewport emulation; physical Android
and Linux execution are unverified. Shared `CHANGELOG.md` and unrelated main
checkout edits were preserved. No deployment, merge or ready-for-review action.

## Exact remaining art and open decisions

1. Curved stone/timber corner transition pieces with authored top views, plus
   richer terrace backing joining side and end banks without empty wedges.
2. Several distinct Human side/end banks at one consistent head/pixel density,
   clean zero-alpha gutters, and verified Dwarf/Halfling variety; equivalent
   cleanup for Orc visitors. Current rows show repetition and alpha backing.
3. Longer hanging banners, stand drapes and separate overhead banner/pennant
   edges, with artist-reviewed cloth masks that exclude all skin/hair/metal.
4. Gesture patches for reverse and overhead views, additional sections, and a
   coherent static torch-lighting pass. Current gesture crop is deliberately small.

Owner decisions: accept/reject the current art direction beside the concept,
choose calm/balanced/textured (calm remains default), and choose the final crowd
head density and banner proportions. These are pending visual decisions, not
reasons to change game geometry or integrate the gallery with live play.

## Next League feasibility

Gothic Horror can reuse the same facade/coping and crowd slots. Author gothic
stone/iron wall spans, corner transitions, torch/lantern pieces and apron furniture
with overhead counterparts. Supply distinct undead crowd banks and reserved
cloth masks at the corrected Human density. Add provenance and measured crops,
select its venue factory independently from the visitor factory, and rerun the
same camera, recolour and review matrix. Do not fork projection, player positions
or game rules. Live integration requires a separate approved issue.

## Process follow-up

The expensive failure was treating loaded full atlases as proof that Chromium
painted them. Keep assembled screenshot review early, including a horizon-crossing
30-degree case, rather than relying on geometry tests. Future art work should
publish its Tier 1 draft before generation and review semantic material masks
before composing hundreds of surfaces. Existing development-gallery typography
and controls were reused; production MUTP styling is untouched. This gallery does
not introduce a product design-system change.
