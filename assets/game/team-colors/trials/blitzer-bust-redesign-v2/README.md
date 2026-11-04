# Rich-shading Blitzer portrait trial

Built-in image generation; not promoted to production. Two recreated portraits
based on the existing Human woman and Orc man Blitzers. The flat first trial was
rejected; this revision restores dimensional shading while simplifying painted
panel boundaries and eliminating scattered wear.

Sources: `assets/game/teams/{human,orc}/batches/blitzer-bust-redesign-v2/originals`.
Native exports: 160x160 RGBA, nearest-neighbor, fitted to 150px with the existing
PowerShell exporter. This is a portrait-specific override of the body-sprite size.
Original full-resolution generated alpha is retained in the source PNGs.

Material authoring uses deliberate magenta/lime source keys with offline hue
classification and removal of isolated sub-10-pixel components, followed by visual
review. Saved explicit material indices are hash-bound to each native source.
No runtime color detection is involved. These remain candidate masks for review.

Each portrait uses all 16 primary shade levels and 15 secondary levels. Automated
checks across all 256 palette pairs verify fixed RGB and every alpha byte remain
unchanged. Native and 2x previews include the prior reference, team palette,
magenta/lime, black/white and flat material mask. Visual checks caught and corrected
hair highlight classification and yellow-green secondary highlight omissions.

Rebuild: `node assets/game/scripts/build-blitzer-bust-trial.mjs` from repo root.
Production sprite packs, mappings and portraits are unchanged.
