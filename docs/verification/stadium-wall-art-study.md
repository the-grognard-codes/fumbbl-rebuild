# Original-style modular stadium walls

Workstream: [#211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211).
Branch: `feature/stadium-hybrid-prototype`; isolated development preview.

## Owner decision

The owner approved the original `stadium-v1.png` **wall art style**, specifically its
color, depth, styling, torches and banners, and requested matching artwork for the
left and right sides of the modular design with the crowd removed entirely for now.
This is approval of the reference style; the new generated assets still await visual review.
The [earlier study](stadium-hybrid-prototype.md) retains the longer requirements and attempts.

## Wall-only revision

The preview now defaults to `study=walls`, centered at midfield, 40° perspective and
zoom 1. Both long sidelines use the same modular construction and measured source atlas.
The shared 26 × 15 pitch, chalk, player layer and input camera remain unchanged.

- Dark grey stone faces retain grey-blue shadows, warm worn edges, deep mortar,
  chips and irregular flagstone surfaces derived from the approved painting.
- Independent horizontal coping slabs sit on vertical front/back walls. Slight
  coping height and overhang differences provide real geometric depth.
- Each sideline spans world x `-2..28`, with a three-square face module length.
  Its pitch-facing edge is at y `-2.45` or `17.45`, keeping at least two squares
  of clear apron outside the existing pitch. The wall is `.48` squares thick
  and `1.25` squares high before coping.
- A separate atlas supplies blue/ivory and rust-red/gold hanging banners, dark
  timber uprights with iron bands, and torch uprights. Whole accessory silhouettes
  use uniform scale; post pivots are measured at the timber shaft rather than the
  center of the full flame/bracket silhouette. Torch/post brackets face the pitch
  from either viewing end.
- Blue banners on the north/left and red on the south/right match the original
  reference in the home camera. This is a wall-art demonstration, not final team
  binding; production banner ownership must be reconciled with canonical team halves.
- Flicker affects the cropped flame pixels only. Reduced motion suppresses it.
- Overhead renders actual horizontal coping, with cropped timber tops and small
  torch markers. It omits upright banner cards and vertical facades instead of
  flattening their perspective art.
- No spectator group, jigsaw crowd, gesture provider or original panorama is
  mounted in this version. Turf samples are confined to the original grass crop.

This revision covers the two straight sidelines. End walls, curved corner transitions,
stone locker-room entrances, benches/equipment, expanded terrain, crowd sections and
their animations remain future work in the stadium workstream. Existing comparison
variants are retained as historical references. The live match renderer is unchanged.
Surface ordering remains the development study's CSS/SVG painter approximation.

## Artwork and prompts

Both new PNGs were produced by the built-in imagegen tool using the approved painting
as the style reference. Original generated RGBA bytes were copied without pixel edits,
resizing, recoloring or background removal. Actual dimensions and visible alpha bounds
were measured rather than assuming the requested sheet layout was followed.

| Canonical file under `assets/game/pitch/stadiums/prototype/` | Purpose |
| --- | --- |
| `reference-wall-materials-v1.png` | 1536 × 1024; two wall-face and two coping materials |
| `reference-wall-materials-v1.provenance.json` | Complete stone prompt, reference hash, original output path and measured regions |
| `reference-wall-accessories-v1.png` | 1254 × 1254; two banners, torch upright and bare timber upright |
| `reference-wall-accessories-v1.provenance.json` | Complete accessory prompt, source references, measured regions and shaft pivots |

The normal asset synchronization script supplies byte-identical browser copies.
See [the asset notes](../../assets/game/pitch/stadiums/prototype/README.md) and
[actual-renderer captures](../../assets/game/references/stadiums/modular-wall-review/README.md).

## Run and verify

From this worktree's `browser-client` directory:

```powershell
npm.cmd run dev:stadium
# Open http://localhost:5174/pitch-preview?variant=stadium-hybrid&study=walls
npm.cmd run build
npm.cmd run assets:check
npm.cmd run review:stadium-walls
```

Choose **Inspect wall** for a close look; drag or use Up/Down to scroll. The angle/end
controls and zoom operate through the existing game camera. **Original artwork** remains
available for direct comparison.

The focused review checks 32 camera/scroll/zoom/compact cases, source alpha and crop
bounds, the pitch apron, all 390 cells, absence of crowd renderers, both wall sides,
banner colors, accessory proportions, inward mirror directions, unique SVG identifiers,
torch flicker and reduced motion. At close lateral pan or high zoom a side can be outside
the camera frustum; visibility assertions apply to centered views rather than forcing
an offscreen wall onto the pitch. Build, asset synchronization and independent rendering
review are also required. Technical checks do not replace the owner's art review.

Completed validation: TypeScript and production build passed; the 27 canonical art
checks and all 210 synchronized asset checks passed; all 32 focused browser cases
passed with zero runtime errors or failed requests. Independent code/render review
approved the final version after fixing the reference banner-side colors. The wall
study stays outside the production JavaScript bundle.

Workflow: [imagegen skill](C:/Users/jaken/.codex/skills/.system/imagegen/SKILL.md) and
[prototype skill](../../.agents/skills/prototype/SKILL.md).
