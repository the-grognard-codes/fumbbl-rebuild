# Humans sample team v1

16 unique player sprites: 1 ogre, 2 blitzers, 2 catchers, 2 throwers, 6 linemen, 3 halflings. Eight men and eight women.

- `sprites/`: final transparent PNGs. Fifteen are exactly 36x36; the ogre is 45x45, the permitted 25% larger canvas. Bottom-center alignment. Halflings occupy approximately 25px of their 36px canvas.
- `team-preview.png`: labeled 6x nearest-neighbor preview, with 36px tile boundaries. Ogre overhang is intentional.
- `originals/`: all 16 full-resolution generated sources.
- `manifest.json`: filenames, canvas dimensions, alpha bounds, and alignment.
- `prompts.json`: built-in ImageGen prompt specification and roster variations.
- `sources.json`: provenance of the generated originals.
- `export.ps1`: repeatable size export and preview creation using System.Drawing.

Reference: `../humans-concept-v1.png`. View follows its bottom-left braced three-quarter side-facing pose. Colors follow the reference's navy/royal blue, warm ivory, brown leather, tan skin and gray steel palette families; the reference does not specify numeric color values. Grass is used only behind the preview, not in sprite PNGs.

Artwork was generated using the built-in image_gen tool, one call per player. The generator returned large transparent illustrations; these were fitted and downsampled for the required PNG dimensions. These are sample sprites derived from generated art, not hand-cleaned native pixel art. Very fine details are reduced at 36px.

Verified: roster count, exact PNG dimensions, transparent corners, nonempty alpha bounds, and visual inspection of all designs and the exported team preview. No application code was changed or integration performed.
