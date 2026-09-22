# Orc team - 64px chibi v1

16 newly generated player designs, with the established roster and eight men / eight women. This is new artwork, not an enlargement of the earlier sprites.

Larger heads, helmets, hands and feet; shorter limbs; broad highlights, deep occlusion shadows and strong dark contours. The main visual reference is ../match-screen-concept-v1.png. Team colors are retained. The troll retains its dirty gray-sage skin, gangly arms and vacant expression.

- originals/: 16 full-size transparent PNG source artworks.
- sprites/: fifteen 64x64 transparent PNGs; troll 80x80, retaining the 25% large-player allowance.
- Small players retain smaller silhouettes within their 64px canvas (46px maximum fitted artwork).
- team-preview.png: labeled 3x nearest-neighbor view with 64px tile outlines.
- pitch-preview-native.png: both teams at 1x against a pitch-colored background.
- manifest.json: canvas dimensions, alpha bounds and bottom-center alignment.
- prompts.json: generation specifications and any correction prompt; built-in image_gen used for each new player.
- sources.json: source generation provenance.
- export.ps1: reproducible nearest-neighbor exports directly from originals, with transparent margins.

Export sizes are exact. Source artwork is AI-generated pixel-style art, not hand-authored on a strict 64px grid. Nearest-neighbor reduction preserves sharp color transitions instead of blending fine details. In-game presentation should disable image smoothing and use integer zoom factors.

Verification: 16 originals and sprites per team, correct 64/80px canvas sizes, transparent corners, nonempty alpha bounds, visual inspection of enlarged and native-size team previews. SHA-256 checks confirmed all 123 files from the prior 36px and 48px packs are unchanged. No application code or game integration was changed.

