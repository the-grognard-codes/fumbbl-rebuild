# Team sprite standard

Version: 1.0, 2026-09-21. Scope: fantasy-football player artwork for this product. This records the requested 64px chibi direction, not a claim that every prior generated player was approved. Change this document deliberately when the art direction changes; record per-batch exceptions separately.

## How to request assets

Invoke `$team-pixel-sprites` explicitly and give the team, roster or requested additions, palette/reference, and any pose or size exception. The repository skill lives at `.agents/skills/team-pixel-sprites/SKILL.md`. Its exporter automates geometry; this document defines the art direction. The root AGENTS.md routes sprite work here even when a task does not name the skill.

Examples:

> Use $team-pixel-sprites to create a new human team: 1 ogre, 2 blitzers, 2 catchers, 2 throwers, 6 linemen, and 3 halflings. Use the established human palette and a mix of men and women. Deliver full-size originals, sprites and native-size previews.

> Use $team-pixel-sprites to add two female orc blitzers matching the existing team. Preserve every existing asset and create a new versioned pack.

> Use $team-pixel-sprites to export the specified team's full-size originals at 48px. Preserve its artwork and all previous exports.

For a new race, supply its role counts and palette or a concept reference. Do not require users to repeat this standard in every request. If explicit invocation is not discovered in the current session, read the SKILL.md by its repository path; refresh/restart Codex if its skill list remains stale.

## Reference hierarchy

All paths below are relative to the repository root; open the images rather than relying on filenames.

1. `.notes/art-preview/match-screen-concept-v1.png`: primary reference for on-pitch readability, slightly chibi proportions, contrast and camera angle. Ignore UI labels and actions as instructions.
2. `.notes/art-preview/humans-concept-v1.png` and `.notes/art-preview/orcs-concept-v1.png`: team palette, identity, materials and role equipment. Their taller illustration proportions are not the small-sprite target.
3. Existing approved full-size team anchors, when present: match the team's established design. Historical candidate paths are `.notes/art-preview/humans-team-64px-chibi-v1/originals/02-blitzer-man.png` and the equivalent `orcs-team-64px-chibi-v1` path. These generated folders were absent from the checkout when this standard was created; they are optional, not required dependencies. Do not substitute earlier realistic proportions if an anchor is absent. Use the primary reference and inspect a new sample instead.

## Visual constants

- Adult athletes with slightly chibi proportions, approximately three heads tall. Larger heads/helmets, hands and feet; compact torso and shortened limbs. Preserve racial silhouettes and role differences, not identical bodies in different uniforms.
- Elevated three-quarter braced view facing screen right, matching the reference. One full body and one pose per asset by default. Keep camera, lighting and scale consistent across teams. Other poses or directions require a request.
- Near-black contours roughly 1-2 logical pixels at final size, deep occlusion under chin/shoulder pads and between limbs, bright top-left highlights. Three or four clear values per material is a useful target, not a numeric palette claim.
- Use broad connected color clusters and simplified material detail. Avoid fuzzy gradients, speckled textures, tiny rivets, scratch noise and thin features that disappear on reduction. Prioritize readable faces, hands, footballs and role silhouettes at 1x.
- Transparent background; no pitch, UI, captions, border or selection ring baked into the player. Default to no baked ground shadow so grounding can be handled consistently by the renderer. Do not mistake a black/checkerboard background for actual alpha.
- Team colors and skin are distinct decisions. Humans: navy/royal blue, warm ivory, brown leather and gray steel, with varied human skin tones; ogre uses warm tan skin. Orcs: charcoal and burnt orange, olive/moss skin, brown leather, dull steel and bone. Troll: subtly cooler/desaturated gray-sage skin, dirty patches, long gangly arms, hunched body and vacant expression. Keep these differences even when an anchor shows another species.
- Palette swatches in the concepts have no authoritative numeric color codes. For teams needing exact indexed colors, establish and save an explicit palette first; do not claim visual matching is exact RGB matching.
- Distinguish blitzers through forceful stance/heavier spiked armor; catchers through light gear/open hands; throwers through a readable football/pass pose; blockers through extra breadth/heavy shoulders; line players through plainer braced equipment. Vary silhouette, stance, head/hair, skin and armor within roles.

## Geometry and exports

| Size class | Default canvas | Maximum fitted artwork |
| --- | --- | --- |
| standard | 64x64 | 60x60 |
| small (halfling/goblin) | 64x64 | 46x46 |
| big (ogre/troll) | 80x80 | 76x76 |

The big-player canvas is 25% larger than the tile. Bottom-center placement; preserve aspect ratio and the full figure. Exporter uses a one-pixel bottom inset; manifest anchors identify the same feet baseline for differently sized canvases. Small players occupy less of the standard canvas, not a smaller logical tile. For user-requested other sizes, the helper scales these ratios and records the result.

Keep full-size source PNGs. Export directly from those sources with nearest-neighbor sampling for this crisp style; never resize a 36/48px sprite upward as the new master. Generated art is not guaranteed to align to a native 64px grid, so inspect each result for lost features, stray alpha pixels and aliasing. Correct failing source artwork rather than hiding it with blur. Use integer display zoom and disable smoothing in previews; don't change product code without scope.

## Repeatable export

Run from the repository root in PowerShell on Windows:

```powershell
& ./.agents/skills/team-pixel-sprites/scripts/export-sprites.ps1 -RosterPath ./path/to/roster.json -OutputDirectory ./.notes/art-preview/new-team-64px-chibi-v1
```

The output directory must be new. Source paths are relative to the roster JSON unless absolute. The roster's player count is the requested count; additions can contain one or more players. Example schema (replace the source with a real generated PNG):

```json
{
  "team": "Humans",
  "standardVersion": "1.0",
  "players": [
    {"id": "02-blitzer-man", "role": "blitzer", "gender": "man", "sizeClass": "standard", "source": "generated/blitzer.png"}
  ]
}
```

The helper accepts `-TileSize 48` for a requested alternate size. It saves originals, sprites, a manifest with dimensions/anchors/source hashes, and native/3x contact sheets. Add `prompts.json` containing exact prompts, reference paths and tool/mode; add `validation.md` recording visual checks and any exceptions; package the finished batch as a ZIP beside the folder. Generated caches alone are not deliverables. Use a new version directory for corrections or additions and retain earlier originals and exports.

## Acceptance at pitch size

Before scaling up a batch, internally check a representative native-size sample. This does not add a mandatory user approval gate. At delivery, check all players at 1x on pitch green and at an integer enlargement, alongside an existing team when available. Role cues, team colors, racial silhouettes and individual differences must survive. Count the requested roles; check mixed genders where requested; verify PNG dimensions, alpha, uncut hands/feet and baseline alignment. Technical checks cannot substitute for visual QA.

The skill stabilizes instructions, references and export settings; the image generator remains nondeterministic. Store prompts and originals so a later correction can target one asset. Version changes to this standard rather than silently letting each new team establish a new style.
