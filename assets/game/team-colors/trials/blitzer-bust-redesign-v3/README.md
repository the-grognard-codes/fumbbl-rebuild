# Chibi proportion revision (v3)

Status (2026-11-04): final review approved; promoted to production sources and masks. The trial notes below describe the preserved review-stage artifacts. See ../../v1/approved-art.json for promotion provenance.

Built-in image edits of the approved rich-shading v2 sources. Requested slightly
larger heads and eyes while preserving identity, palette, dimensional shading,
armor and material design. Full prompts are in prompts.json.

Full generated originals remain in each roster's versioned batch. Export copies
normalize alpha <=8/255 to zero to remove nearly invisible background residue;
all other source pixels remain unchanged. Native exports use the existing sprite
exporter at 160px, nearest-neighbor, maximum fitted size 150px.

Rebuild review: node assets/game/scripts/build-blitzer-bust-trial.mjs --v3

Human: 16 primary and 16 secondary shades. Orc: 15 primary and 15 secondary shades.
All 256 palette pairs preserve fixed-material RGB and exported alpha. Inspected
both native and 2x views. Review includes original production reference, revised
team palette, magenta/lime, black/white and explicit material mask.

Production artwork and v2 review remain unchanged. This is a candidate for review.
