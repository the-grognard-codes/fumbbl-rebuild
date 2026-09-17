# Moles Under the Pitch — brand package v4

Version 4 places the mole below the pitch in a stepped soil tunnel, including the email-link illustration and optical favicon. Typography, character contours, colors, export dimensions, and the preview-sheet layout are preserved from v3. Version 3 remains available separately.

Typography reference: `../brand-concepts/primary-logo-approved-direction-v2.png`, selected by the user. The wordmark contours come from artwork generated against that reference; no substitute font or live text is used. Mole artwork is original generated pixel art. The final SVGs contain real vector paths, with a precisely constructed rectangular gridiron and an optical-size favicon. They do not embed PNGs.

All intentional fills and strokes use `#070d16`, `#101c2b`, `#2f7d32`, `#1c5a32`, `#4db2ff`, `#ffe17b`, `#874a2d`, or `#edf5ff`. PNGs have genuine alpha transparency; edge antialiasing introduces small color blends. The generated source studies had baked checkerboards and are retained only under `_sources` for reproducibility, not as deliverables.

## Files

| Purpose | SVG master | Transparent PNG exports |
| --- | --- | --- |
| Primary lockup | `moles-under-the-pitch-logo.svg` | `moles-under-the-pitch-logo.png` — 1400 × 400; `moles-under-the-pitch-logo-700.png` — 700 × 200 |
| Compact lockup | `moles-under-the-pitch-logo-compact.svg` | `moles-under-the-pitch-logo-compact.png` — 640 × 640; `moles-under-the-pitch-logo-compact-160.png` — 160 × 160 |
| Symbol | `moles-under-the-pitch-mark.svg` | `moles-under-the-pitch-mark.png` — 512 × 512; `moles-under-the-pitch-mark-32.png` — 32 × 32 |
| Optical favicon | `moles-under-the-pitch-mark-16.svg` | `moles-under-the-pitch-mark-16.png` — 16 × 16 |
| Google OAuth | Use the symbol master | `oauth-google-app-logo-120.png` — 120 × 120, under 1 MB |
| Microsoft Entra | Use the symbol master | `oauth-microsoft-app-logo-512.png` — 512 × 512 |
| Sign-in card | `auth-card-logo.svg` | Use the primary PNGs if required |
| Email mark | Use the symbol master | `magic-link-email-mark.png` — 256 × 256 |
| Email banner | `magic-link-email-banner.svg` | `magic-link-email-banner.png` — 1200 × 300 |
| Email-link illustration | `magic-link-complete-illustration.svg` | `magic-link-complete-illustration.png` — 640 × 640 |

## Placement

- Keep the transparent canvas padding. Primary lockup: at least 32 units of clear space in its 1400 × 400 viewBox. Compact: at least 32 units in 640 × 640. Symbol: 48 units in 512 × 512. Email banner: 24 units in 1200 × 300. Illustration: 64 units in 640 × 640. Scale these distances proportionally.
- Use the compact lockup at 160 px wide or larger. Use the text-free mark for smaller placements. At 16 px, use the dedicated optical favicon rather than reducing the detailed scene.
- Place directly on dark or light surfaces. Do not recolor, stretch, apply effects, or replace the outlined lettering with a font. The preview sheet demonstrates both backgrounds and actual small export sizes.
- The wordless envelope illustration carries no success/error status. Supply confirmation, expiry, or reuse messaging as accessible page text.
- SVGs include accessible titles and descriptions. When embedded using HTML `img`, supply contextual alternative text or an empty `alt` when adjacent text already names the project.

## Reproduction and verification

`manifest.json` records dimensions, PNG byte sizes, and palette. `PROMPTS.md` records the artwork prompt set and production finishing. `tools/build.mjs` reconstructs the path masters and PNG exports from the three source studies. It requires Node.js and Sharp; set `SHARP_MODULE` to a local Sharp module if the bundled runtime path differs.

Run `node tools/build.mjs` from this directory. Export checks enforce dimensions, alpha-channel presence, and Google's size limit. `verification.json` records the final alpha, XML, palette, and external-dependency checks. Raster source studies and tools are not needed to display any final SVG or PNG.
