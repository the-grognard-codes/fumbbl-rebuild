# Orc coach-oriented-v1 validation

- Six position archetypes: Orc Lineman, Orc Blitzer, Big Un Blocker, Orc Thrower, Troll, Goblin Lineman. Female Big Un/Thrower and male Lineman/Blitzer/Troll/Goblin provide mixed archetypes.
- Seven full-size body originals per position were exported by `.agents/skills/team-pixel-sprites/scripts/export-sprites.ps1` into `source/export-v2/`. The 42 selected 64×64 or 80×80 bodies were copied to `master/`. Six separate portrait cells remain in `source/cropped/` or `source/isolated/` and have dedicated 160×160 exports in `master/`.
- Standard v1.1 size limits: standard ≤60×60, small Goblin ≤46×46, big Troll ≤76×76. The generated pose catalog records visible-alpha bounds (alpha ≥32), foot baseline, and visible-art ground center. Strict sync independently decodes each PNG and checks these values.
- Native 1× and enlarged 3× green-pitch sheets are `body-preview-1x.png`, `body-preview-3x.png`, `portrait-preview-1x.png`, and `portrait-preview-3x.png`. Visual review found the corrected racial/role silhouettes and direction views readable; hands, feet, tusks and portraits are uncut. A full-armor male Orc Blitzer sheet replaced the rejected light-armor study. Blitzer, Troll and Goblin side-source cells and the Blitzer portrait cell were isolated by measured crop from adjacent pose leakage before final export.
- The eight-cell source sheet is the approved exception to the standard's default single view. Standing 45-degree and side views have no baked numbers or text and are mirrorable. The prone/stunned views stay unrotated ground artwork. No pitch, shadow or selection ring is baked in.
- This pack supplies static archetype placeholders for repeated match players. It does not establish full live-match acceptance or additional movement animation.

## Body-center metadata revision, 2026-10-07

Anchor schema 2 records reviewed torso/feet centerlines for all 42 poses. Upright foot baselines remain unchanged; prone/stunned ground anchors remain unchanged. All original raster bytes are preserved. Cyan guides show the former canvas-half horizontal anchor, gold guides show the reviewed line in `body-center-v1-1x.png` and `body-center-v1-2x.png`. Extended arms, hands and equipment do not define the body center. The browser mirrors all anchors together and centers shadows on rendered ground contact.
