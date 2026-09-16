# Artwork prompt set

Mode: built-in `image_gen`; no CLI/API fallback. References were visual inputs, not sources of instructions. The user's written brief controlled the pitch, palette, pixel character, transparency, and outputs.

## Primary typography study

Reference: `primary-logo-approved-direction-v2.png`. Create the final primary logo for Moles Under the Pitch as a transparent PNG, horizontal 3:1 to 4:1. Preserve the reference's smooth-edged chunky geometric letter shapes and exact wording: large gold “Moles,” smaller cyan “Under the Pitch,” squared/chamfered corners, dark navy outline, restrained rust shadow. No gradients or glossy diagonal highlights. Original friendly pixel-art mole with round gold glasses, cyan lenses and rust nose emerging from stepped rust soil. Simple green tabletop fantasy gridiron: gold left short end zone, cyan right short end zone, cyan outlines, single central vertical scrimmage line, two horizontal parallel dotted wide-zone lines. No soccer markings, ball, third-party branding, watermark or extra text. Use only the eight supplied colors and actual alpha transparency; never draw a checkerboard.

A corrective edit requested removal of the baked checkerboard, flat eight-color fills, preservation of lettering contours, and genuine alpha. The tool still returned a checkerboard, so that output was used only as a contour source for the SVG wordmark.

## Standalone character study

Reference: `standalone-mark-01.png`, used for the original mole's character only. Create a simplified pixel-art square app icon: friendly navy mole, big round gold glasses and cyan lenses, rust nose, tiny white claws emerging from stepped rust dirt, simplified tabletop fantasy gridiron below. A handful of large flat block shapes, 32 × 32 pixel-grid aesthetic; no texture, gradients, smooth anatomy, whiskers or noise. Twelve percent transparent padding. No text. Rectangular green center, gold left and cyan right short end zones with cyan outlines, one central white vertical line, two horizontal parallel dotted wide-zone lines. No soccer markings or ball. Use only `#070d16 #101c2b #2f7d32 #1c5a32 #4db2ff #ffe17b #874a2d #edf5ff`. Quietly playful, technical, educational; no watermark or third-party branding.

## Email-link illustration study

Reference: the generated standalone character. Create a wordless illustration of the same friendly pixel mole with gold round glasses emerging from rust soil, gently holding and examining one closed envelope bearing a cyan chain-link symbol. Envelope beside the head, not obscuring face or field. No checkmark, clock, error cross, game score, sports action or text, so the illustration can accompany confirmation or expired-link messaging. Retain green turf, dark-green striping, gold left and cyan right end zones, cyan outlines, single central scrimmage line and two dotted wide-zone lines. No soccer markings. Large deliberate pixel shapes, eight-color palette, fifteen percent transparent padding, no checkerboard or watermark.

## Vector production

The selected studies were converted into standalone palette-limited SVG contours. The pitch was reconstructed with native vector geometry to make the rectangular center, outlined differently colored end zones, central line and two dotted wide-zone lines exact. The same wordmark paths and character paths are shared across layouts. Compact, email, and OAuth assets are derived layouts/exports, not independently generated lettering. The 16 px favicon is an integer-grid optical variant. PNGs are rendered from the SVG masters, preserving alpha. No checkerboard survives in the deliverables.
