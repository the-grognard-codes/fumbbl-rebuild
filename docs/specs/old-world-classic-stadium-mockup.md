# Feature: Old World Classic stadium mockup gallery (stadium round three)

Date: 2026-11-16. Owner decisions: review gallery only, so nothing is mounted
in live matches; the long-form request and its concept images are the visual
authority; the pitch must be less busy than the concepts. Work runs unattended
overnight; follow the [overnight iteration protocol](#overnight-iteration-protocol)
and take the work as far as it will go.
Long-form request: [modular-stadium-brainstorming.md](modular-stadium-brainstorming.md).
Concept images: [`assets/game/references/stadiums/concept-round-3/`](../../assets/game/references/stadiums/concept-round-3/README.md).
Planning reference: [graphics enhancement sequencing](graphics-enhancement-sequencing.md), stage 3.
Tracker: [#566](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/566).

## Abstract

Build the Old World Classic stadium, the Human home League's venue, as the first
production-quality vertical slice of the modular stadium system described in the
long-form request. It must look like the approved concept image
`01-old-world-classic-human-home.webp`. Show it in an isolated development review
page around the unchanged pitch at every camera view, with an independently
replaceable visiting section and recolourable team cloth, so the owner can
accept or reject the look before any live integration.

## Objective

**This is the third round of stadium work with Codex.** Rounds one (#198) and two
(#211 and its jigsaw revisions) were rejected on visual quality, and the crowd
was later removed from live play (#340). This round succeeds only if the owner,
looking at the review page beside the concept image, says it matches. Passing
tests is necessary but nowhere near sufficient. Spend most of the night on the
art and on side-by-side comparison with the concept.

## Authority order

When sources disagree, follow the earlier entry and record the conflict and the
resolution in the outcome report:

1. Game invariants: the 26×15 pitch, its 390 squares, goal lines, line of
   scrimmage, player coordinates, input geometry and the production camera
   (30/40/50 degrees, overhead, travel, zoom, both coach ends).
2. The owner's notes of 2026-11-16: the pitch is less busy than the concepts;
   gallery only.
3. The concept images in `concept-round-3/`, led by
   `01-old-world-classic-human-home.webp`, and the long-form request.
4. The earlier brief
   [`human-reference-revision/README.md`](../../assets/game/references/stadiums/human-reference-revision/README.md)
   and its references, only where they do not conflict with 1–3. It records
   useful hard-won geometry (apron width, shared footprint, layer separation,
   upright heads during travel, section ownership that never changes with
   camera or half).

## Context / Existing Behavior

- **Getting the concept images.** If `assets/game/references/stadiums/concept-round-3/`
  is not in your base commit, take it, together with this spec's local mirror, from
  the docs branch:
  `git fetch origin && git checkout origin/claude/overnight-specs -- assets/game/references/stadiums/concept-round-3 docs/specs/old-world-classic-stadium-mockup.md`.
  Commit them on your branch. Open and study all four images before starting.

- Live matches show turf only: [remove-stadium-crowd.md](remove-stadium-crowd.md)
  (#340) unmounted stadium architecture and crowds from `LivePitch`;
  `PitchScenery` mounts only the turf.
- Read before starting and learn why earlier rounds were rejected:
  [league-stadium-mvp.md](league-stadium-mvp.md) (#198),
  [modular-stadium-bowl.md](modular-stadium-bowl.md) (#211),
  `docs/verification/stadium-jigsaw-revision.md`,
  `docs/verification/stadium-jigsaw-retrospective.md`, and the review galleries
  under `assets/game/references/stadiums/` (`human-v1`, `human-v2`,
  `hybrid-prototype-review`, `mixed-crowd-review`, `modular-wall-review`,
  `human-reference-revision/jigsaw-review`). The long-form request names the
  failures to avoid: stretched crowds, shallow stadium walls, irregular stadium
  shapes and jerky animation.
- Asset process, provenance and `assets:sync` / `assets:check`:
  [`assets/game/pitch/stadiums/README.md`](../../assets/game/pitch/stadiums/README.md);
  piece contract `assets/game/pitch/stadiums/jigsaw/source/README.md`; existing
  atlases `old-world-classic-v2/v3.png`, `catalog.json`, `modular-catalog.json`.
- Team colours with shading ramps shipped (#443, `ColorRampPicker.tsx`,
  `TeamColorArtProvider.tsx`); player sprites already recolour through it.
  Human player sprites set the crowd's blue palette and proportions.
- Reusable study components and routes: `StadiumJigsaw.tsx`,
  `StadiumWallStudy.tsx`, `StadiumHybridPrototype.tsx`,
  `OriginalStadiumStudy.tsx`, `CrowdGestureProvider.tsx`, `PitchScenery.tsx`,
  and the route table in `dev-entry.tsx`.
- Projection: the production `PitchProjection`; `projected-pitch-ui.mjs` checks
  all 390 cells.

## In Scope

- Tier 0 investigation and architecture note required by the long-form request.
- Old World Classic architecture: stone and timber walls with real depth, tiered
  standing crowd, torch-lit stone columns, wooden railings, heraldic banners and
  pennants, barrels, benches and awnings on the apron, far end wall, corners.
- A calmer Old World Classic turf for the 26×15 playing surface; the apron keeps
  full concept-level detail.
- A dense chibi home crowd (mainly Humans, some Dwarfs and Halflings, blue
  clothing from the Human sprite palette) and a smaller, visually distinct,
  independently replaceable visiting section (Orc for the demonstration, plus
  one more visiting variant if time allows).
- Overhead counterparts for every upright piece.
- Reserved recolourable cloth regions, demonstrated with colour pairs.
- The review page, contact sheets, a side-by-side comparison with the concept,
  sources, provenance, an asset inventory and a region contract.

## Out of Scope

- Mounting anything in `LivePitch`, spectator, replay or recovery views.
- Other League venues (the other three concepts are style references for the
  framework only; a Tier 4 feasibility note is allowed).
- Wiring saved team colours to the stadium in live matches.
- Player sprites, rules, protocol or server changes.

## Functional Requirements

1. **Match the concept.** Reproduce `01-old-world-classic-human-home.webp`'s
   composition and proportions, rich SNES-era fantasy pixel art, chibi
   spectators with expressive faces, wall depth, banners, torchlight, colour
   treatment and density. No generic geometric stadiums, flat-colour blocks,
   simplistic silhouettes, emoji crowds or thin procedural graphics.
2. **Less busy pitch.** Inside the 26×15 playing surface, keep the turf's
   character but reduce dirt patches, flowers, mottling contrast and decorative
   markings well below the concept. Players, the ball, movement guidance,
   block/assist markers and square highlights must read clearly at every camera.
   Verify by rendering real player sprites in a kick-off formation plus the
   movement and highlight overlays on the turf, at 30 degrees and overhead, and
   include those captures in every review round. Provide the turf's busyness as
   a tunable (for example a detail-strength constant) with two or three
   presets on the review page so the owner can choose.
3. **Layout from the concept.** Long sidelines carry the home stand behind a
   stone and timber wall, with torches, banners and benches on an apron between
   wall and pitch; a far end wall closes the bowl. The visiting section is
   smaller than the home crowd, as in the concept, and sits in a fixed world
   location. Section ownership never changes with camera, viewing end or half.
   Choose the apron width so benches and props sit outside the pitch with clear
   space (the earlier two-square apron is the starting point).
4. **Depth, not stretch.** Walls and tiers must read as deep, raised structures
   at 30/40/50 degrees. Crowd art is authored at the target pixel density and
   never stretched to fill space; heads stay upright during travel and zoom;
   ground and upright layers reproject once per frame with no gaps, popping or
   disappearing near stands. Explain in the Tier 0 note how this avoids the
   earlier rounds' stretched crowds and shallow walls.
5. **Modular layers.** League architecture (walls, columns, end wall, apron
   props, torches) and team identity (crowd sections, banners, pennants, bench
   cloth) are separate assets with fixed world anchors. A visiting section can
   be swapped without touching the architecture; a second League could reuse the
   same slots. Large authored pieces, not many tiny repeated fan cards.
6. **Recolourable cloth.** Banners, pennants, scarves, jerseys, bench stripes
   and stand drapes take a team's primary and secondary colour, each with
   shadow/base/highlight, at runtime without redrawing. Prefer indexed palette
   ramps; fall back to masks only if the export path cannot keep indices, and
   record why. Document the region contract beside the assets. Stone, timber,
   skin, metal and outlines never recolour.
7. **Restrained life.** A few spectators gesture briefly (raise a mug, shout,
   wave a scarf); torches flicker and pennants move in small stepped frames.
   Groups never slide or bob. Everything freezes under reduced motion. No
   jerky animation: frame timing is steady and phases are staggered.
8. **Review page.** A dev route `/stadium-mockup`, outside the production `play`
   bundle, renders the stadium around the unchanged pitch with the production
   `PitchProjection`. Controls: visiting team (Orc, a second variant if made,
   Human mirror), coach end, camera 30/40/50/overhead, near/mid/far travel, zoom,
   pitch-busyness preset, colour-pair presets (team defaults, identical colours,
   white/black, yellow/purple, two similar blues on opposing sides, random),
   reduced motion, layer toggles (architecture, crowd, props, cloth, gestures,
   players), a seam-debug overlay, and a **concept overlay** that shows the
   concept image beside or semi-transparently over the render at the closest
   matching camera.
9. **Contact sheets.** Save under
   `assets/game/references/stadiums/old-world-classic-mockup/`: both coach ends
   × four camera modes × near/far travel; three colour-pair variants; the
   busyness presets with players on the pitch; and a side-by-side with the
   concept image for every review round.
10. **Honest comparison.** That folder's README lists visible differences from
    the concept (architecture, perspective, proportion, crowd appearance and
    density, pixel-art detail, lighting) and the conflict log from the authority
    order. Never describe the work as visually accepted; label placeholders.

## Tiers

Complete tiers in order. Each tier ends green, committed and pushed.

- **Tier 0 — Investigation and architecture note.** Write
  `docs/specs/old-world-classic-stadium-architecture.md` covering every item in
  the long-form request's "Preliminary Investigation" section, the specific
  causes of earlier rounds' rejection, and the proposed rendering and asset
  architecture. Do not wait for approval; proceed overnight and let the owner
  review it in the morning.
- **Tier 1 — Geometry and review page.** World layout, review page with all
  controls and overlays, existing art as clearly labelled placeholders, pixel
  parity of pitch and player anchors with the live renderer.
- **Tier 2 — Architecture and turf.** Walls with depth, columns, torches, end
  wall, corners, apron props and benches as large authored pieces with overhead
  counterparts; the calmer turf with busyness presets; provenance and
  `assets:check`.
- **Tier 3 — Crowds and cloth.** Dense chibi home crowd and the smaller Orc
  visiting section in perspective and overhead, recolourable cloth and the
  region contract.
- **Tier 4 — Life and polish (stretch).** Gestures, torch flicker, pennant
  wind, lighting pass (torch warmth on stone), a second visiting variant, a
  one-page feasibility note for one other concept venue on the same slots.
- **Tier 5 — Iterate on the art until stopped.** Repeat the review loop.

## Acceptance Criteria

- The review page loads and every control combination renders without gaps at
  joins, stretched crowds, sideways heads during travel, or supporters changing
  sections.
- Pitch squares, goal lines and player anchors on the review page are
  pixel-identical to the live renderer at the same camera (automated check).
- With players and overlays on the turf, the chosen default busyness preset is
  visibly calmer than the concept, and the captures show it.
- `assets:check` passes with source hashes and provenance for every new piece.
- Contact sheets, concept side-by-sides, the comparison README and the Tier 0
  architecture note exist.
- Live rendering is unchanged: `projected-pitch-ui.mjs` and `playback-ui.mjs`
  pass with no scenery and no stadium atlas loads.
- Browser unit tests, TypeScript and the production build pass; the review
  route is absent from `dist-play`.

## Overnight iteration protocol

This work runs unattended. Do not stop at the acceptance criteria.

1. Open a **draft PR** once Tier 1 is green; push after every tier and every
   iteration that passes checks. Keep the PR description updated with a tier
   checklist, the latest concept side-by-side and remaining ideas.
2. Run a **visual review loop** after each art tier and continuously in Tier 5:
   capture the standard views (both ends, 40 degrees and overhead, near and
   far, with players on the pitch); put each beside the concept image;
   critique in writing against requirements 1–7 plus: pixel density matches
   the concept with no blurry upscales or mixed resolutions, strong dark
   outlines and clustered pixels, crowd density without visible repetition,
   walls read as deep, the pitch stays the calm focal point, joins invisible,
   colour extremes look intentional. Fix the three weakest items, regenerate or
   edit the art, and capture again. Record every round (before/after, critique)
   in the outcome report. At least three rounds per art tier; Tier 5 has no
   upper limit.
3. Keep every generated candidate's provenance, including rejected ones and why.
   Deliver only accepted candidates.
4. Never leave a commit that breaks earlier tiers or live rendering.
5. If a decision belongs to the owner, record the question with captures of the
   options, pick the one closest to the concept (except pitch busyness, where
   pick the calmer one), and continue.
6. If image generation is unavailable or cannot reach the concept's quality,
   record the limitation and the exact art assets still needed, then continue
   with geometry, the region contract, recolouring and tooling. Never present
   placeholders as finished.
7. Before your session ends, finish the current iteration, push, and write
   `docs/specs/old-world-classic-stadium-mockup-outcome.md`, covering the
   long-form request's seven completion items (architecture and rationale,
   files, independent configuration, camera behaviour, screenshot evidence,
   limitations, steps to add the next League), plus requirement status, review
   rounds, the asset inventory, validation evidence and open questions.

## Execution environment

See the shared [execution environment](#execution-environment-shared) section.
This issue uses only a Vite dev server on a free port for the review page. It
must not start, stop or restart the shared dev-local stack.

## Execution environment (shared)

Three Codex sessions (#565, #566, #567) run at the same time on the owner's
main PC.

- **Use your own new git worktree**, for example
  `git worktree add ../fumbbl-rebuild-wt/<issue> -b <branch> origin/main`.
  Never work in the main checkout or in another session's worktree. Install
  `browser-client` dependencies inside your worktree.
- **dev-local is a single shared stack** (fixed ports 5000, 22232 and 22234,
  one shared state file). Only #565 may start or use it. Others must not start,
  stop or restart it.
- **Ports.** Pick free ports for Vite and any test servers. If a test driver
  hard-codes a port, add an environment-variable override instead of racing for
  it.
- **Maven.** Build from the root reactor (`mvn clean install`, or
  `mvn -pl <module> -am …`) so modules resolve from your worktree, not from
  another branch's snapshot in the shared `~/.m2`.
- **Load.** Builds and UI drivers from three sessions compete for CPU and RAM.
  If a timing-sensitive test fails, rerun it once before debugging, and note
  contention in the outcome report.
- **Shared files.** Only #565 edits `CHANGELOG.md`. Do not edit files that
  belong to another issue's scope.

## Constraints

- Ensure the themes are all supported on Android, Windows, and Linux.
- MUTP colours, typography, style and themes are preserved. Reuse existing
  projection, asset pipeline and review-page scaffolding.
- Keep the review page out of the production `play` bundle.
- Preserve unrelated working-tree changes. Follow repository conventions.
- No `CHANGELOG.md` entry; this is not user-visible.

## Implementation Guidance

- Generate art with the same process and provenance recording as earlier
  stadium atlases (exact generation request, reference roles, accepted output,
  hash, dimensions), giving the concept image as the leading reference. Keep
  broad transparent gutters. Author at the target pixel density; do not
  resample accepted originals.
- Reuse `StadiumJigsaw.tsx` geometry and the modular catalog where they fit;
  if you replace them, say why in the Tier 0 note.
- Reuse the player-sprite recolouring path for cloth.
- Get crowd variety from several distinct section pieces per team plus per-slot
  flips and palette variation, not from many tiny repeated cards.

## Validation

- `assets:check`, browser unit tests, TypeScript, the production build, and the
  projected-pitch and playback UI drivers every tier.
- Inspect the review page in a real browser at desktop and Android sizes.

## Delivery authority

Create branch `codex/566-old-world-classic-mockup` from current `origin/main`
in a new worktree. Commit, push and keep a draft PR referencing #566 updated
throughout. Do not merge, mark the PR ready, or deploy; the owner reviews in
the morning.

## Completion Notes

- Unit, browser and game-server build tests should be performed after code changes are complete.
- Failures in these tests should prompt one or more debug session rounds until the code is clear, a roadblock is encountered, or user input is needed.
