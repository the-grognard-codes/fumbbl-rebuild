# Helmet redesign review v1

Status (2026-11-04): final review approved; promoted to production sources and masks. The trial notes below describe the preserved review-stage artifacts. See ../../v1/approved-art.json for promotion provenance.

Two AI-generated helmet candidates based on the existing Human and Orc splash artwork. Production assets are unchanged.

Open index.html for existing reference, new team palette, magenta/lime, black/white, and material mask at 320px and 2×. Human uses navy/ivory; Orc uses black/orange. Gray mask regions retain the generated original material, including steel, bronze, padding, rivets, and all spikes. The entire Orc center band is secondary except its hardware and forward-facing spike.

Full generated sources and extracted references are in sources/. Exact built-in imagegen prompts are in prompts.json. Exports fit the visible artwork within 300px on a transparent 320px canvas; source alpha at or below 8/255 is normalized only in export copies. Original generated files are retained intact.

Rebuild from the repository root with:

```
node assets/game/scripts/prepare-helmet-trial.mjs
node --experimental-strip-types assets/game/scripts/build-helmet-trial.mjs
```

Material assignments are authored offline from the temporary magenta/lime keys, with small disconnected selections removed, then saved as explicit shade indices bound to the exported source SHA-256. These scripts do not alter runtime recoloring or production packs.

Human uses 16 primary and 15 secondary shade levels; Orc uses all 16 for both materials. Validation checks every supported palette pair (256) for unchanged fixed-pixel RGB and alpha. Review includes visual inspection of metal boundaries, dark interiors, transparency, and black/white recoloring. These are review candidates pending art approval.
