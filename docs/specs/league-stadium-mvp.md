# League stadium MVP: Old World Classic and Badlands Brawl

Date: 2026-10-07.

Design status: confirmed by the owner after the stadium-only grilling discussion.
Testing status: existing-seam approach confirmed by the owner on 2026-10-07.
Tracker: [#198](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/198).
Implementation status: the initial MVP slices merged, but the owner rejected the assembled visual result. The earlier retrospective does not establish visual acceptance. The current revision is tracked in [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211) and [the modular bowl spec](modular-stadium-bowl.md).

This is the historical initial plan. Later owner decisions supersede its 1.5-square margin, broad foreground cutaway and small reusable fan approach: use a two-square clear apron, retain the near crowd, exactly two sideline locker-room portals and consistent large jigsaw pieces with random section gestures.

This document is the durable design and art-direction mirror for the stadium workstream. It covers only stadium structure, supporters, surroundings, and their presentation framework. The original discussion's other gameplay, logging, chat, ball, and player-alignment changes belong to their separate workstream.

## Problem Statement

The current surroundings approximate the desired match atmosphere, but three pitch borders can appear gray instead of continuing the pitch color, crowd sections overlap at corners, and the scene does not provide a consistent sideline margin. Generic supporters and one fixed stadium treatment do not communicate the participating teams or the home team's venue identity.

The stadium must become a complete visual layer that stays registered to the travelling pitch camera. Coaches need a readable pitch in perspective and top-down view, while supporters, stands, and sideline objects form a coherent place around it. The owner also needs the decisions and asset contracts recorded so future team leagues can receive new stadiums without repeating this design exercise or rebuilding the scene.

## Solution

Deliver two complete MVP visual families: **Old World Classic**, demonstrated by Human home teams, and **Badlands Brawl**, demonstrated by Orc home teams. Either Human or Orc can be the home or away Match team. The home team's League selects the physical venue and shared furnishings; each participating team supplies its own supporter, banner, and bench-area treatment.

Build a continuous four-sided stadium with terraces, retaining walls, rails, gates or tunnels, team bench areas, a small pavilion, banners, and restrained cups/mugs or tankards. Keep approximately 1.5 world squares of sideline space around every pitch edge. Preserve a clear inner portion, place small props toward the outside, and accommodate large furniture in recessed areas. The ground color continues the pitch instead of exposing unwanted gray border strips.

Use view-appropriate art and one shared world projection. Perspective automatically cuts away obstructing raised foreground sections while retaining visible ground and low boundaries. Top-down shows the complete enclosure with overhead structure, prop, and supporter artwork. The pitch remains large and readable; outer stands may be cropped rather than forcing a stadium-wide zoom-out.

Give the scene restrained ambient motion resembling an old Super Nintendo background: minor supporter movements, flickering torches, and pennants moving in the wind. Record interchangeable venue and team asset families, provenance, scene placement, and review evidence so later leagues can extend the same presentation framework.

### Confirmed decision record

| Topic | Confirmed requirement |
| --- | --- |
| Scope ownership | Stadium work is separate from the original gameplay and logging round. |
| Venue selection | The home Match team's League determines physical stadium structure. |
| MVP content | Complete Human and Orc crowd, stadium, bench, and sideline details; both home/away assignments work. |
| League identities | Human belongs to Old World Classic; Orc belongs to Badlands Brawl. |
| League overlap | Future selection for teams eligible for multiple leagues belongs to team-factory onboarding. It is not part of this MVP. |
| Supporter layout | Each team occupies its own end stand and the adjoining halves of both sidestands. |
| Supporter permanence | Sections stay in their stadium locations throughout the match, including halftime. A camera change only changes their screen position. |
| Theme responsibilities | Home League owns architecture and shared furnishings; each team owns supporters, banners, and bench-area decorations. |
| Pitch appearance | Keep the playing surface and markings consistent for this revision. Continue its color into the border. |
| Stadium completeness | Continuous enclosure on all four sides, with a camera-dependent foreground cutaway in perspective. |
| Margin | About 1.5 world squares total from pitch edge to the start of the normal stadium boundary; not an additional 1.5-square completely empty buffer. |
| Prop placement | Inner sideline portion remains clear; small objects sit near the outer edge; benches and pavilion use recessed areas. |
| Top-down artwork | Overhead bench/tent tops, terrace rows, and supporters' heads and shoulders, at the same world locations used in perspective. |
| Framing | Prioritize readable pitch and visible sideline space; outer stadium edges may crop. |
| First furnishings | Terraces, retaining walls/rails, gates or tunnels, two team bench areas, one small pavilion, banners, and restrained drink-related clutter. |
| Prop behavior | Benches and props are decorative in this revision. |
| Human reference | Approved earlier stone/timber/torch stadium and crowd artwork, adapted into the new complete layer. |
| Orc direction | Battered stone, rough timber, riveted iron, angular rails, ragged banners, heavy wooden benches, patched pavilion, dented tankards, and braziers. |
| Orc inspiration | Vanilla-era World of Warcraft Orc areas, especially the Barrens and Orgrimmar, interpreted through MUTP art direction. |
| Animation | Restrained ambient motion, with a Super Nintendo background feel; occasional crowd movement, torch flicker, moving pennants. |
| Extensibility | League venue profiles and participating-team supporter/decor profiles are independently replaceable. |

### Art direction

#### Shared MUTP treatment

- Keep the established fantasy-football pixel-art language. Stadium, supporters, props, and player sprites must look as though they belong to the same game.
- Favor readable silhouettes, deliberate pixel clusters, restrained shading, and recognizable materials. Avoid smoothing that turns native pixel art into blurred illustrations.
- Use the reference's visual richness at scene scale, but keep signs, ornament, props, and movement subordinate to players, the ball, markings, and action overlays.
- Retain the project's navy/cyan/gold interface identity. League architecture and team decorations may have their own palettes without changing interface colors or playing-surface semantics.
- Build view-specific artwork for raised scenery and props. Overhead view must read as overhead rather than compressing upright illustrations into a strip.
- Work from shared world footprints, anchors, and scale. Do not bake camera geometry, pitch lines, players, names, scores, or the HUD into stadium artwork.
- Make buildings and supporters a coherent environment, with purposeful entrances, corner transitions, benches, and pavilion placement. Repeating modules must not produce doubled fans, overlapping walls, or obviously pasted corner joins.
- The accepted reference is an art-direction source. Its older fixed-background composition does not override the accepted travelling-camera contract.

#### Old World Classic / Human set

| Element | Direction |
| --- | --- |
| Architecture | Fantasy masonry, stone retaining walls, timber fixtures, continuous terraces, and practical rails. |
| Materials and details | Stone courses, timber beams, leather/canvas accents, metal fittings, and torches. |
| Palette | Existing Human blue/ivory accents with brown timber/leather and steel details. Keep team-color decorations distinct from shared masonry. |
| Supporters | Human silhouettes and faces consistent with the earlier approved crowd and existing Human player art. Clothing and banners identify their team. |
| Bench area | Timber benches and Human-style team decorations, positioned outside the clear inner sideline. |
| Pavilion | Small canvas pavilion in a recessed area, coordinated with the shared venue treatment. |
| Small props | Empty cups or ale mugs, a few practical fixtures, and restrained drink-related litter. |
| Lighting/motion | Restrained torch flicker, pennant movement, and minor supporter motion. |

#### Badlands Brawl / Orc set

| Element | Direction |
| --- | --- |
| Architecture | Battered stone, rough timber, heavy defensive silhouettes, layered construction, riveted iron, and angular rails. |
| Materials and details | Crude heavy joinery, dark iron fittings, rough walls, ragged banners, and suitably placed braziers. |
| Palette | Existing Orc charcoal/burnt-orange armor palette, olive supporter skin, and green accents; maintain separation from grass and playable overlays. |
| Supporters | Distinct Orc silhouettes, larger rougher forms and recognizable tusked features consistent with existing Orc art. Team identity remains clear at native viewing size. |
| Bench area | Heavy wooden benches with iron fittings and Orc team decorations. |
| Pavilion | Patched canvas with rough supports; a recognizable Orc counterpart to the Human furnishing. |
| Small props | Dented tankards and restrained rough sideline details. |
| Inspiration | Vanilla Barrens atmosphere and Orgrimmar's layered, hard-edged, spiked fortress shapes, adapted to the approved MUTP pixel language. |
| Lighting/motion | Minor crowd movement, brazier/torch flicker, and ragged pennants moving gently in the wind. |

The league source establishes affiliations, not architectural specifications. The material and furnishing treatments above are approved design interpretations. Warcraft references are inspiration for silhouettes, materials, and atmosphere; the delivered assets must be newly authored for MUTP.

### MVP asset inventory and responsibility

| Asset family | Old World Classic / Human | Badlands Brawl / Orc | Composition responsibility |
| --- | --- | --- | --- |
| Shared ground/border | Pitch-colored margin and venue-facing edges | Same playing-surface treatment with Orc venue-facing details | Home League venue; playable pitch stays consistent. |
| Raised structure | Terraces, retaining walls, rails, entrances, corner joins | Orc counterparts with rough timber/iron and defensive forms | Home League. |
| Ground-level boundaries | Low walls/rails and entrance bases | Rougher low rails/walls and entrance bases | Home League; retained where visible during foreground cutaway. |
| Supporters | Human fan variants, team clothing, overhead variants | Orc fan variants, team clothing, overhead variants | Each participating team independently. |
| Team banners/pennants | Human treatment and team identity | Orc treatment and team identity | Participating team; venue can supply mounting hardware. |
| Bench-area furnishing/decor | Human timber bench treatment and decorations | Heavy Orc bench treatment and decorations | Separate team-area composition using the relevant team set. |
| Shared pavilion | Human canvas pavilion, supports, overhead art | Patched Orc pavilion, rough supports, overhead art | Home League shared furnishing. |
| Small sideline props | Cups/mugs and modest Human details | Dented tankards and modest Orc details | Venue props follow the home League; team-area details follow that team. |
| Fire fixtures | Torches and associated small animated frames | Torches/braziers and associated small animated frames | Home League, with an appropriate team-area variant where needed. |
| Corners/end caps | Continuous Human joins without duplicated supporters | Continuous Orc joins without duplicated supporters | Home League structure plus fixed team supporter-section ownership. |

All applicable structure and prop families need perspective-facing and overhead treatment, whether supplied as separate images or as genuinely view-correct modular compositions. Record that choice per family. This is an inventory of visual roles, not a required count of individual image files.

### Mixed-team composition examples

| Match assignment | Venue and shared furnishings | Home supporter/bench section | Away supporter/bench section |
| --- | --- | --- | --- |
| Human home, Orc away | Old World Classic architecture, Human shared pavilion and venue details | Human crowd, banners, and bench-area treatment | Orc crowd, banners, and bench-area treatment |
| Orc home, Human away | Badlands Brawl architecture, Orc shared pavilion and venue details | Orc crowd, banners, and bench-area treatment | Human crowd, banners, and bench-area treatment |

These assignments stay the same for both coach views, spectators, reconnects, and Match replay. Viewing from the away end must not change which venue was selected.

## User Stories

1. As a coach, I want the home team's League to select the stadium, so that the match has a recognizable venue identity.
2. As a Human home coach, I want an Old World Classic stadium, so that the venue matches my team's League.
3. As an Orc home coach, I want a Badlands Brawl stadium, so that the venue matches my team's League.
4. As a coach, I want Human-home/Orc-away and Orc-home/Human-away matches to both work, so that the MVP represents either hosting arrangement.
5. As an away coach, I want my team represented inside the home venue, so that my supporters and team area remain recognizable.
6. As a coach, I want Human and Orc supporters to have distinct artwork, so that the participating teams are visible in the crowd.
7. As a coach, I want supporters to use their team's clothing and banners, so that their allegiance is clear.
8. As a coach, I want each team to occupy an end stand and adjoining sidestand halves, so that supporter sections have an understandable layout.
9. As a coach, I want supporter sections to remain in their original seats, so that halftime does not rearrange the stadium.
10. As a coach, I want the stadium to surround all four pitch edges, so that the match feels situated inside a complete venue.
11. As a coach, I want clean wall and crowd joins at corners, so that the surroundings do not contain overlapping fans or broken boundaries.
12. As a coach, I want pitch-colored ground on every border, so that gray strips do not interrupt the scene.
13. As a coach, I want approximately 1.5 squares of sideline space, so that stadium structure does not crowd the playing surface.
14. As a coach, I want the inner sideline portion kept clear, so that pitch edges and action targets remain easy to read.
15. As a coach, I want small props near the outer sideline, so that the venue has visual interest without obstructing play.
16. As a coach, I want large benches and the pavilion in recessed areas, so that those furnishings fit without narrowing the playable view.
17. As a coach, I want Human-themed benches, canvas, torches, and cups, so that Old World Classic surroundings feel coherent.
18. As a coach, I want Orc-themed heavy benches, patched canvas, iron, tankards, and braziers, so that Badlands Brawl surroundings feel distinct.
19. As a coach, I want my team's bench area to retain its team treatment in an opposing venue, so that the shared stadium does not erase team identity.
20. As a coach, I want the pavilion and shared fixtures to follow the home League, so that the physical venue has a consistent overall design.
21. As a coach, I want raised foreground stands cut away automatically, so that I can see players and pitch squares in perspective.
22. As a coach, I want ground and low visible boundaries retained during a cutaway, so that the stadium remains spatially understandable.
23. As a coach, I want the far crowd and structure to remain visible when the near structure is hidden, so that the enclosure still reads as a stadium.
24. As a coach, I want overhead scenery in Top-down view, so that benches, tents, supporters, and terraces read correctly from above.
25. As a coach, I want scenery to occupy the same world locations in every view, so that switching views does not move the venue.
26. As a coach, I want both Coach views to show the same venue from opposite ends, so that stadium identity is independent of the viewer.
27. As a coach, I want the surroundings to travel and scale with the pitch camera, so that pans and zooms do not detach them from the field.
28. As a coach, I want the pitch to remain large and readable, so that showing more stadium does not make gameplay harder.
29. As a coach, I want the immediate sideline margin visible even when outer stands crop, so that the edge of the field remains coherent.
30. As a coach, I want benches and supporters to remain decorative, so that clicking scenery cannot accidentally submit a game action.
31. As a coach, I want faint ambient movement, so that the stadium feels alive without competing with decisions or dice.
32. As a coach, I want torches and pennants to animate in a restrained pixel style, so that the scene resembles a Super Nintendo background.
33. As a coach, I want reduced-motion preferences respected, so that scenery remains comfortable to view.
34. As a spectator, I want either viewing end to retain the same home-selected venue and supporter assignments, so that changing perspective does not change the match setting.
35. As a reconnecting coach, I want the same venue and team decorations restored, so that presentation remains consistent with the Match team.
36. As a Match replay viewer, I want the original participating-team identities to drive the scene, so that later Saved team edits do not restyle recorded matches.
37. As an asset author, I want the Human and Orc material, palette, supporter, and prop briefs preserved, so that revisions stay within the approved direction.
38. As an asset author, I want documented footprints, anchors, view variants, and animation roles, so that new artwork can replace existing families predictably.
39. As an asset author, I want canonical originals, provenance, and review sheets retained, so that future changes can be traced and reproduced.
40. As an asset author, I want the scene reviewed at actual pitch scale, so that attractive enlarged art is also readable during a match.
41. As a developer, I want venue and team decoration selection separated, so that additional leagues do not require rebuilding mixed-team scenes.
42. As a developer, I want theme selection based on frozen Match team identity, so that empty setups, reconnects, and replays are not dependent on visible players.
43. As a developer, I want theme inputs to work through the established match projection contract, so that scenery does not introduce another game-state source.
44. As a developer, I want additions to respect strict projection decoding and versioning, so that asset work does not silently break existing clients or fixtures.
45. As a developer, I want canonical asset synchronization and integrity checks retained, so that development, packaged play, and the site show the same art.
46. As a future league designer, I want an extension checklist and acceptance matrix, so that I can add another stadium without repeating the original interview.
47. As a future team-factory designer, I want league selection treated as an explicit team identity concern, so that teams eligible for several leagues are not assigned a venue by guesswork.
48. As a reviewer, I want both hosting arrangements captured from both ends and supported camera modes, so that visual acceptance covers the actual feature rather than one favorable screenshot.

## Implementation Decisions

1. **Keep the existing rendering architecture.** Extend the shared React DOM/SVG pitch scene under the accepted coach-oriented camera decision. This feature does not require a renderer migration, full 3D player models, or a new camera system.

2. **Use domain identity correctly.** A Match team is the frozen copy of the Saved team used for a match. Resolve presentation from that frozen identity, not from current Saved team edits, the acting team, the viewer, a team-name guess, or whichever player is visible first.

3. **Make League the venue key.** Old World Classic and Badlands Brawl are the first venue profiles. Roster identity selects Human versus Orc supporter and team-area art. Do not generalize the two current examples into a rule that every future venue is selected directly by roster/race.

4. **Bound the MVP league resolution.** Human and Orc currently each have one League in the catalog. Resolve those affiliations using the frozen roster/catalog identity for this MVP. Selecting one of several eligible leagues and persisting that choice through team-factory onboarding is a later feature. Its future authoritative choice must be frozen on the Match team rather than resolved from a subsequently edited catalog.

5. **Provide team-level presentation inputs.** The current active projection carries player art identities but not team-level League. Make both seats' resolved League and roster identity available to the shared scene, including empty/setup positions. Prefer a minimal authoritative presentation addition sourced from Match team/catalog identity. Review strict public projection decoding and versioning when adding fields; do not insert unversioned unknown keys or introduce a parallel mutable team store. The exact compatible schema revision belongs to implementation review.

6. **Separate composition responsibilities.** A venue profile owns structure, terrace layout, boundaries, shared pavilion, and venue props. A participating-team profile owns supporter art, banners, and bench-area treatment. Compose both team profiles into one home-League venue. Neither viewing end nor active turn changes those selections.

7. **Keep placement separate from artwork.** Use shared scene roles for stands, corners, entrances, supporter sections, team areas, and furnishing recesses. Asset packs replace the art for those roles without duplicating camera math, supporter allocation, or the pitch's interaction model.

8. **Describe asset contracts in manifests/catalogs.** Record accepted version, visual role, view variants, world footprint, placement anchor, ground/raised layer, depth or height treatment, cutaway eligibility, animation frames/state, provenance, and fallback behavior. Reuse existing asset-catalog conventions instead of creating an unrelated delivery pipeline. No fixed native stadium-image dimensions were approved; choose and record sizes against actual pitch-scale review.

9. **Deliver a complete visual family.** Each of the two MVP profiles must supply the structure, supporter, bench, sideline, corner, pavilion, and applicable motion roles in the inventory. A palette-swapped generic stadium or a new crowd over the same undifferentiated structure does not satisfy the paired-family requirement.

10. **Maintain the canonical pitch.** The playing surface remains 26 by 15 with 390 squares, existing end zones and markings, and identical square identities in both Coach views. The approximately 1.5-square margin lies outside the playable Pitch; it creates no legal squares or gameplay rules.

11. **Measure padding in world space.** Extend pitch-colored ground around all four edges. Position the normal boundary roughly 1.5 canonical squares from the pitch edge, with the inner portion clear. Reserve recesses for large objects rather than forcing them into that narrow strip. Allow normal perspective foreshortening; screen-pixel padding need not be equal at different depths.

12. **Keep corners explicit and continuous.** Give corner/end modules clear ownership of geometry and supporter placement. Adjacent sidestand/endstand modules must not draw the same seating area twice, overlap fans, leave gray gaps, or produce inconsistent boundary widths.

13. **Keep supporter sections fixed.** Allocate each team its end stand and adjoining halves of both sidestands in canonical stadium coordinates. Do not swap sections on turn changes, touchdowns, halftime, camera rotation, reconnect, or replay scrubbing.

14. **Project the whole environment together.** Turf, boundary ground, prop footprints, rails, structure, banners, torches, and supporters share the active pitch projection and longitudinal camera travel. In perspective their world-parallel boundaries converge consistently; in Top-down view edges remain parallel and scale stays uniform. The HUD remains in screen space.

15. **Retain all supported cameras.** Preserve the 40-degree default, the existing 30- and 50-degree perspective options, and 90-degree orthographic Top-down view. Preserve zero yaw, opposing coach orientations, zoom/pan behavior, and retained camera position when switching views.

16. **Use suitable layers and depth treatment.** Distinguish ground/border, low fixtures, raised structure, supporters, team decorations, and restrained motion. Render enough world/depth information for a complete stadium rather than treating the surroundings as one fixed backdrop behind travelling players. Avoid opaque scenery covering playable cells or decision/actor overlays.

17. **Apply camera-dependent cutaways.** Hide only raised near-side sections that obstruct the playing view. Retain visible ground and low boundaries; preserve the far structure and crowd. Base the choice on the active camera side, not on a permanent home-side visibility flag. Keep hidden sections from consuming pointer input.

18. **Use genuine overhead treatment.** Top-down shows a complete enclosure with overhead terrace rows, supporter heads/shoulders, benches, pavilion, and ground props. Preserve their footprints and identities when switching from perspective. Do not collapse raised tiers into overlapping upright imagery.

19. **Preserve readable framing.** Keep immediate sideline space visible with the usable pitch width at ordinary desktop framing. Do not automatically refit to all outer stadium corners as the camera travels or expose a new Full 26-by-15 viewing mode. Cropping outer stands is permitted; covering essential playable content is not.

20. **Keep scenery decorative.** Benches, tent, cups, banners, crowd, and fixtures do not replace functional dugout controls or become action targets. Their layers must not intercept pitch selection, movement, pan/zoom, or game decisions.

21. **Keep ambient motion subordinate.** Use small pixel-art movement, torch/brazier flicker, and gently moving pennants. Avoid a continuously synchronized crowd wave or motion large enough to distract from the pitch. Permit stable/static animation phases for reproducible screenshots and respect the existing reduced-motion behavior.

22. **Keep motion local.** Ambient animation is presentation state; it must not change match decisions, checkpoints, transcript records, legal actions, or command IDs. Match-event celebration/cheering behavior is a later extension.

23. **Use the established canonical asset pipeline.** Keep accepted art and source/provenance in the canonical in-game asset collection. Produce the generated runtime delivery copy through the existing synchronization workflow and verify inventory/content integrity. Do not maintain a second hand-edited runtime asset set.

24. **Preserve reusable originals and review material.** Retain generation/authoring instructions, relevant reference roles, original outputs, accepted native exports, manifests, and review captures. State whether a view variant is an independent export or an approved modular composition. Keep transparent surroundings where isolated modules require them.

25. **Make missing content fail safely.** A missing theme or optional prop must not make the pitch unusable. Record deterministic fallback behavior and an actionable diagnostic without silently changing the Match team's League. Both complete MVP families are required; fallback is not acceptance for missing Human/Orc assets.

26. **Retain match/replay consistency.** The same participating-team identity should select the same venue and sections across live coaches, spectators, reconnects, and Match replay. Support older checkpoints/transcripts through the existing compatibility approach when extending presentation metadata; avoid accidental checkpoint-format changes for decorative work.

27. **Record user-visible delivery.** Implementation includes the repository-required change-list entry and verification evidence. This specification does not itself implement, commit, deploy, or close earlier issues.

### Checklist for adding another League later

1. Establish the League identity and the authoritative selected League of a Match team. Resolve multi-League eligibility in onboarding before assuming a theme for an ambiguous team.
2. Define the venue's architecture, materials, palette, entrances, boundary/corner treatment, shared furnishings, and appropriate ambient motion in a league art brief.
3. Identify participating-team supporter and bench/decor families separately from league architecture. Teams sharing a League can still have different supporters and team-area details.
4. Fill the same visual-role inventory, including overhead variants, cutaway metadata, ground anchors, footprints, and corner joins. Reuse placements and projection behavior.
5. Retain reference roles and asset provenance; generate/author new MUTP artwork, review at native match scale, and register the accepted profile version.
6. Synchronize and check delivery through the existing canonical pipeline. Confirm failure/fallback behavior without accepting incomplete mandatory profile content.
7. Review the new venue both as a home host and with an opposing visiting-team set, from both viewing ends and the supported camera modes.
8. Check corner ownership, sideline clearance, player/overlay visibility, reduced motion, camera travel, input, reconnect, and replay identity. Keep evidence linked to the profile version.
9. Update this feature's issue/local mirror or create the next League's implementation issue, retaining links to the reusable framework and the new art-direction brief.

## Testing Decisions

Testing approach was confirmed by the owner. It reuses existing rendered-pitch and real-server presentation seams; it does not introduce a new test-only rendering implementation.

1. **Primary visual/interaction seam: the real shared pitch scene in its existing Playwright presentation harness.** Parameterize the existing Human/Orc fixture for both hosting assignments. Exercise the actual scene, projection, supporter/decor composition, and input from each viewing end. Prior art already covers camera modes, scenery registration, reduced motion, and screenshot capture.

2. **Authoritative identity acceptance: the existing real-server match-window presentation harness.** Use two prepared matches with actual frozen Match teams: Human home/Orc away and the reverse. Confirm home League and both team profiles in the rendered window, not only in fabricated per-player art data. Reuse the existing coach/spectator/replay presentation acceptance convention for stable identity.

3. **Boundary contracts only when changed.** If the active/replay presentation projection gains team-level identity, use existing decoder/projection contract tests to cover version compatibility, both seats, empty setup positions, and the preserved frozen identity. Avoid unit tests that merely repeat manifest values or private rendering structure.

4. **Good tests assert externally visible behavior.** Check the selected physical venue, recognizable team sections, actual margins/corners, camera registration, visible playable content, input accessibility, and restored identities. Prefer canonical geometry invariants and rendered captures over brittle private component or CSS implementation assertions.

5. **Core geometry matrix.** Cover two hosting assignments, two viewing ends, four supported modes (30/40/50-degree perspective and 90-degree Top-down), and near/mid/far camera positions. This yields 48 deterministic core view cases. Review artwork especially in the default 40-degree and Top-down modes; use the complete matrix to catch clipping, corner, and projection failures.

6. **Representative framing cases.** Reuse existing desktop viewport, resize, zoom, and panning fixtures. Check both touchlines, immediate sideline space, end-zone boundaries, corner joins, and permitted outer-stand cropping. Do not claim new mobile/full-stadium framing guarantees.

7. **Interaction regression.** Verify scenery cannot intercept selecting a player or square, movement/decision input, first left-click after a pan, zoom, or camera switching. Preserve all 390 canonical square identities and existing player/ball/overlay alignment; this feature does not change their art.

8. **Motion and static evidence.** Inspect short clips or live observation for subtle torch, pennant, and crowd movement. Freeze a documented phase for comparable screenshots. Check reduced-motion rendering remains readable and that no ambient motion mutates match state or forces camera movement.

9. **Asset QA.** Verify required roles and view variants exist for both families, exports load, transparency/pixel scaling are appropriate, and canonical/runtime assets match. Review native-scale and enlarged contact sheets plus in-pitch captures, with readable team silhouettes and corner transitions.

10. **Reconnect/replay identity.** Confirm viewing-end changes, active-team changes, halftime, reconnect, and replay do not replace the home venue or move supporter sections. Use existing transcript/replay evidence rather than adding a new replay model.

11. **Bounded performance observation.** Reuse existing foreground presentation observations to detect unnecessary surfaces, unbounded crowd elements, expensive full-scene rerenders, or obvious animation stutter. Record what was measured and its limits; a short local capture does not establish sustained hardware-wide GPU performance.

12. **Build/check scope.** Run the affected browser TypeScript, unit/contract, build, focused presentation, and canonical asset checks. Run focused native tests if projection/catalog integration changes. Broaden only for required project checks or concrete regressions; record exact unverified areas.

### Acceptance checklist

- [x] Human home selects Old World Classic; Orc home selects Badlands Brawl, independent of viewing end or active team.
- [x] Both Human-home/Orc-away and Orc-home/Human-away scenes have complete venue, supporter, bench, and sideline families.
- [x] Both teams have visibly appropriate supporters, banners, and bench-area treatment inside the home venue.
- [x] Each supporter section occupies its assigned end and sidestand halves and stays fixed across match/view changes.
- [x] All four boundaries form a complete enclosure with continuous corner joins and no duplicated crowd areas.
- [x] Pitch-colored ground continues around all four edges; unwanted gray border strips are gone.
- [x] Normal stadium boundaries sit approximately 1.5 world squares outside the playable Pitch, with clear inner space and recessed large furniture.
- [x] Human and Orc materials, silhouettes, palettes, and prop treatments match their approved briefs at real pitch scale.
- [x] Perspective cutaways expose playable content from either end while retaining appropriate low/far scenery.
- [x] Top-down shows overhead art and a complete enclosure at the same canonical world footprints.
- [x] Scenery travels/scales with the pitch at 30/40/50 degrees and remains parallel/equal-scale at 90 degrees.
- [x] Default width-fit framing prioritizes readable pitch and immediate sidelines while permitting outer stadium cropping.
- [x] Scenery does not consume gameplay input or alter canonical square/player/action identities.
- [x] Minor crowd movement, fire flicker, and pennants achieve the restrained SNES-background feel and respect reduced motion.
- [x] Live coaches, spectators, reconnects, and Match replay retain consistent venue and team-section identities.
- [x] Asset catalogs, source/provenance, overhead/perspective variants, and canonical/runtime delivery integrity are recorded and verified.
- [x] Review evidence covers both hosting assignments, both ends, supported cameras, near/mid/far positions, and representative framing/motion cases.
- [x] Required user-facing change-list entry and issue/local verification records accompany implementation.

## Out of Scope

- The other items from the original large change round: current-game listing/concession, browser launch/reconnect fixes, Throw/Kick Team-mate flow, reroll UX, ball animation/art, player centering/shadows, movement-risk overlays, chat labels, and game-log changes.
- Artwork for additional leagues or supporter races beyond the complete Human and Orc MVP families.
- Multi-League team selection, onboarding UI, saved-team customization, and team-factory automation. Do not resolve a future ambiguous League by arbitrary precedence.
- Individually commissioned named-team stadium overrides or a coach-facing venue editor.
- Different legal pitch dimensions, new square identities, altered surface/weather mechanics, goalposts, or changed end-zone markings.
- Functional benches, replacing gameplay dugout controls, interactive scenery, and match-event-driven crowd reactions or celebration sequences.
- A new renderer, full 3D engine, adjustable yaw, an added Full 26-by-15 mode, or camera changes outside the existing supported controls.
- A requirement to keep the entire outer stadium visible at once, new mobile layout guarantees, or broad hardware performance certification.
- Implementation, commits, deployment, issue closure, or modification of earlier issue state as part of writing this specification.

## Further Notes

### Relationship to accepted architecture and prior work

The accepted coach-oriented pitch decision requires shared world projection for pitch, boundaries, crowd, and stands, opposing coach orientations, width-fit travelling cameras, and selectable orthographic Top-down view. This specification refines the environment into complete, interchangeable layers without changing that accepted contract.

Related tracker context:

- [Stadium end-zone enclosure and cheerleader clearance (#156)](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/156). This spec continues its scenery concerns, preserves a clear inner strip behind end zones, and does not implement cheerleader artwork or functional gameplay there. Its existing state is not changed by this spec.
- [Taller stands and separate crowd layers (#179)](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/179). Earlier scene work is the baseline, not proof of acceptance for the new Human/Orc profile framework.
- [Live view versus accepted camera reference (#111)](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/111). Continue checking visual quality against the approved camera/art direction rather than relying only on projection math.

Current gaps found during read-only discovery: fixed stadium art and generic blue/rust supporters; no current stadium/team profile resolver; insufficient team-level League in active projection; border turf and walkway treatment that does not meet the new consistent margin; corners shared by side/end crowd; and no explicit near-side cutaway. The earlier fixed painted backdrop has documented depth/repetition limitations. It remains useful art provenance, not a completed modular environment.

### Source and art-reference library

The repository links below are pinned to the design-discovery commit so future file moves do not erase the reference. They identify durable reference artifacts, not required implementation file locations.

- [BB2025 The Teams: league affiliation definitions](https://bloodbowlbase.ru/bb2025/core_rules/the_teams/). Human is Old World Classic; Orc is Badlands Brawl. Some future teams can belong to more than one League and must select one.
- [Approved earlier Human stadium artwork](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/49ab7bafae27eb259a091ef370470823e41ccc56/docs/adr/references/0003-angled-pitch-v2/art/stadium.png).
- [Earlier stadium in a full-pitch presentation reference](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/49ab7bafae27eb259a091ef370470823e41ccc56/docs/adr/references/0003-angled-pitch-v2/full-pitch/perspective-55-home.png).
- [Human art and palette review sheet](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/49ab7bafae27eb259a091ef370470823e41ccc56/assets/game/teams/human/qa/team-preview.png).
- [Orc art and palette review sheet](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/49ab7bafae27eb259a091ef370470823e41ccc56/assets/game/teams/orc/qa/team-preview.png).
- [Accepted travelling coach-view and Top-down decision](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/49ab7bafae27eb259a091ef370470823e41ccc56/docs/adr/0003-coach-oriented-angled-pitch.md).
- [Canonical in-game asset/provenance conventions](https://github.com/the-grognard-codes/fumbbl-rebuild/blob/49ab7bafae27eb259a091ef370470823e41ccc56/assets/game/README.md).
- [Blizzard: WoW Classic City Tour, Orgrimmar](https://worldofwarcraft.blizzard.com/en-us/news/23156369/wow-classic-city-tour-orgrimmar). Supports the layered, hard-edged, spiked fortress inspiration; adapting it into stadium materials and furniture is the approved MUTP interpretation.
- [Blizzard: Inside the WoW Classic demo](https://worldofwarcraft.blizzard.com/en-us/news/22548005/dev-watercooler-inside-the-world-of-warcraft-classic-blizzcon-demo). Establishes the original pre-Cataclysm Barrens as the intended era reference.
- [Blizzard: WoW Classic travel guide](https://worldofwarcraft.blizzard.com/en-us/news/23156366/wow-classic-getting-around-azeroth). Additional Classic Barrens/outpost context.

The Human reference, paired Orc treatment, League-based selection, overhead variants, cutaway, sideline interpretation, and animation direction were explicitly confirmed in the discussion. The testing approach above was explicitly confirmed after the specification draft was presented. The original draft established the design and testing scope; delivery evidence below and the retrospective record the completed implementation and its verification limits.

## Delivery evidence

- Slice 1: [PR #200](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/200), merged. Frozen team presentation, compatible native recovery/replay, canonical Human venue, margins/recesses/cutaways and shared projection. Required CI passed.
- Slice 2: [PR #203](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/203), merged. Complete Orc atlas, independent mixed-team composition and accepted Human/Orc v2 gutters. Native identity/recovery regression, production-scene and authenticated native 48-case matrices, role reconnects, spectator end changes and completed replay passed. Required CI passed; earlier v1 captures are historical.
- Slice 3: [PR #205](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/205), merged. Sparse crowd movement, fire flicker, team pennants and genuine overhead pennant composition; reduced motion; fixed seats/anchors and unchanged native revision/commands. All 194 browser units, production build, 176-asset check, 15 interaction scripts, focused matrix/motion review and authenticated native 48 cases plus ten restoration journeys passed. All 11 CI checks passed.
- [Final retrospective](../verification/league-stadium-mvp-retrospective.md): all 48 stories mapped to functional and visual evidence, intent assessment, severity-ordered environment improvements and explicit limits. This follow-up runs the existing asset check before CI rebuilds and preserves generated-catalog LF bytes on Windows. Source/provenance and current review media are retained under assets/game/pitch/stadiums and assets/game/references/stadiums/{human-v2,orc-v2}.
- Verification limits: no full native 16-turn halftime playthrough, additional-League/onboarding implementation, mobile/sustained hardware performance certification or deployment. Shared half-two behavior and actual frozen native identity/reconnect/replay were checked separately. Short passive frame data retain unexplained outliers; see the retrospective and motion-review.json.
