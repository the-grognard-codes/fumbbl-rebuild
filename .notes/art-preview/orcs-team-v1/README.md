# Orcs sample team v1

16 unique players: 1 troll, 2 blitzers, 2 big-un blockers, 2 throwers, 6 line orcs, and 3 goblins. Eight men and eight women.

- `sprites/`: transparent PNG exports, fifteen exactly 36x36 and the troll 45x45 (25% larger). Bottom-center alignment. Goblins occupy approximately 25px inside their 36px canvases.
- `team-preview.png`: labeled 6x nearest-neighbor preview with 36px tile boundaries and intentional troll overhang.
- `originals/`: all 16 full-resolution generated sources.
- `manifest.json`: filenames, dimensions, alpha bounds, and alignment.
- `prompts.json`: exact per-player prompts, generated using built-in ImageGen.
- `sources.json`: original image provenance.
- `export.ps1`: repeatable size export and preview creation using System.Drawing, matching the human pack's export method.

Reference: `../orcs-concept-v1.png`. Three-quarter side-facing braced pose follows the lower-left reference. Charcoal, burnt orange, dull steel, brown leather, tan cloth, bone, and olive/moss green follow its palette families. The troll has subtly different muted gray-sage skin, gangly limbs, dirt, sparse hair, and a vacant drooling expression. The reference provides visual swatches, not numeric color values.

Artwork was generated with one built-in image_gen call per player. Large transparent source images were fitted and downsampled to the required dimensions. These are sample sprites derived from generated art, not hand-cleaned native pixel art; fine details soften at 36px.

Verified: all 16 requested roster entries, exact PNG dimensions, transparent corners, nonempty alpha bounds, and visual inspection of each design and the exported team preview. No application code was changed or integration performed.
