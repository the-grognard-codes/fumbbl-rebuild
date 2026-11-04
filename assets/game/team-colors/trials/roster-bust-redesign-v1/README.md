# Remaining roster portrait redesign trial

Status (2026-11-04): final review approved; promoted to production sources and masks. The trial notes below describe the preserved review-stage artifacts. See ../../v1/approved-art.json for promotion provenance.

Ten new portraits generated with built-in image_gen, using each original portrait
as the authority for identity, complexion, eye color and equipment. The approved
v3 Blitzer portraits supplied only chibi proportions and rendering direction.
Human positions: Lineman, Catcher, Thrower, Ogre, Halfling.
Orc positions: Orc Lineman, Big Un Blocker, Orc Thrower, Troll, Goblin Lineman.

Each comparison includes the existing reference, new team palette, magenta/lime,
black/white and flat material mask at native 160px and 2x. Roster overview sheets
show all five new positions at native size. The approved Blitzers are preserved
in the separate blitzer-bust-redesign-v3 trial.

Full generated originals, normalized export sources, manifests and exact prompts:
assets/game/teams/human/batches/roster-bust-redesign-v1/
assets/game/teams/orc/batches/roster-bust-redesign-v1/

Source alpha <=8/255 was normalized to zero only in export copies. The existing
PowerShell exporter fits each portrait within 150px on a 160px transparent canvas,
using nearest-neighbor sampling. Portraits deliberately use a shared canvas size,
regardless of body-sprite size class.

Offline masks use the deliberate magenta/lime authoring keys, component cleanup,
and explicit secondary assignments for Catcher wings and Big Un chest panels.
Native material indices are saved with source hashes. No runtime inference.
Skin, hair, bone, metal and leather remain fixed. All 256 supported palette pairs
preserve fixed RGB and every exported alpha byte; validation.json records shading
coverage and transparency. Visual review checked the native roster sheets and
2x comparisons, including skin-tone distinctions and special-material boundaries.

Rebuild: node assets/game/scripts/build-roster-bust-trial.mjs
These are review candidates. Production assets, body sprites and helmets have
not been replaced. Generated rendering follows the source complexions; this is
not a claim of pixel-identical skin colors across newly generated artwork.
