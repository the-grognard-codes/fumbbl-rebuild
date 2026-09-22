# orcs team - 48px v1

All 16 players exported directly from the full-size artwork in ../orcs-team-v1/originals/. Existing 36px sprites and their 45px big-player variants are preserved unchanged.

- sprites/: fifteen transparent 48x48 PNGs plus a 60x60 ogre/troll, retaining the 25% allowance.
- Small players: halflings/goblins retain their smaller proportions (33px maximum fitted artwork inside a 48px canvas).
- team-preview.png: labeled 4x nearest-neighbor preview with 48px tile outlines.
- manifest.json: canvas dimensions, alpha bounds, and bottom-center alignment.
- export.ps1: repeatable export from full-size originals with bicubic downsampling, matching the previous export method.
- sources.json: original generation provenance; export uses the local full-size originals first.

Verified all 16 dimensions and transparent corners per team, nonempty alpha bounds, both team previews, and SHA-256 equality of all 32 previous sprite files. No new artwork generation or application integration was required.
