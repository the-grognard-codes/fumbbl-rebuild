---
name: Moles Under the Pitch
description: The Pixel Pitch — framed surfaces, clear controls, and readable fantasy-football artwork.
colors:
  pitch-blue: "#4db2ff"
  pale-gold: "#ffe17b"
  action-gold: "#e6a83f"
  turf-green: "#2f7d32"
  deep-turf: "#1c5a32"
  soil-rust: "#874a2d"
  chalk-white: "#edf5ff"
  night-navy: "#070d16"
  panel-navy: "#101c2b"
  site-panel: "#111f2e"
  input-navy: "#07111d"
  steel-frame: "#40637e"
  hud-frame: "#426c9b"
  hud-text: "#d9e9f7"
  hud-cyan: "#49e6ff"
  pale-blue: "#bdeaff"
  button-ink: "#101823"
  button-edge: "#fff0a8"
typography:
  display:
    fontFamily: '"Chakra Petch", Inter, sans-serif'
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0.015em"
  headline:
    fontFamily: '"Chakra Petch", Inter, sans-serif'
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.015em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: '"Press Start 2P", monospace'
    fontSize: "0.68rem"
    fontWeight: 800
    lineHeight: 1.45
  navigation:
    fontFamily: '"Press Start 2P", monospace'
    fontSize: "0.62rem"
    fontWeight: 400
    lineHeight: 1.7
  spectate-control:
    fontFamily: '"Spectate Chakra", sans-serif'
    fontSize: "0.9rem"
    fontWeight: 800
    lineHeight: 1.4
  hud-body:
    fontFamily: "MUTP, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.35
  hud-label:
    fontFamily: "MUTP, sans-serif"
    fontSize: "11px"
    fontWeight: 700
  hud-confirm:
    fontFamily: "MUTP, sans-serif"
    fontSize: "15px"
    fontWeight: 700
rounded:
  square: "0px"
  action-tile: "2px"
  hud-panel: "4px"
  builder-card: "0.5rem"
spacing:
  action-gap: "3px"
  half: "0.5rem"
  control-gap: "0.75rem"
  section: "1rem"
  page: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.action-gold}"
    textColor: "{colors.button-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "0.85rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.pale-gold}"
    textColor: "{colors.button-ink}"
  button-secondary:
    backgroundColor: "#172b3e"
    textColor: "{colors.pale-blue}"
    typography: "{typography.spectate-control}"
    rounded: "{rounded.square}"
    padding: "0.6rem 1rem"
  input-builder:
    backgroundColor: "{colors.input-navy}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.square}"
    padding: "0.5rem"
  navigation:
    textColor: "#c1e9ff"
    typography: "{typography.navigation}"
  card-public:
    backgroundColor: "{colors.site-panel}"
    textColor: "{colors.chalk-white}"
    rounded: "{rounded.square}"
  chip-count:
    backgroundColor: "{colors.input-navy}"
    textColor: "#77d8ff"
    rounded: "{rounded.square}"
    padding: "0.1rem 0.6rem"
  panel-hud:
    backgroundColor: "rgb(9 23 38 / 30%)"
    textColor: "{colors.hud-text}"
    typography: "{typography.hud-body}"
    rounded: "{rounded.hud-panel}"
    padding: "5px 10px"
  button-confirm:
    backgroundColor: "#091726db"
    textColor: "#45e7ff"
    typography: "{typography.hud-confirm}"
    rounded: "{rounded.square}"
    padding: "1px 14px"
---

# Design System: Moles Under the Pitch

## Overview

**Creative North Star: "The Pixel Pitch"**

MUTP uses crisp pixel artwork, dark framed surfaces, and clear controls around
fantasy-football. Its original mole-under-gridiron mark, established palette,
and readable player silhouettes carry the identity. The character is welcoming
and lightly tabletop-fantasy inspired. Keep the description understated.

Buttons, panels, and inputs are **tactile and legible**. Public pages allow more
space around content; the match HUD uses compact controls and translucent
supporting panels to keep the pitch visible. These are related treatments,
not a requirement to make every screen use identical typography or density.

**Key Characteristics:**
- Crisp pixel artwork and approved outlined logo lettering.
- Dark surfaces with visible frames, warm actions, and cool information accents.
- Structural framed layers: offset shadows on public pages, inset framing in play.
- Distinct typography roles for site reading, pixel controls, and the match HUD.

This is an extraction of the implemented system, confirmed on 2026-11-06.
[PRODUCT.md](PRODUCT.md) governs product purpose and binding brand commitments.
The existing homepage's education-first copy and older screenshot content are
not current positioning guidance. This document records appearance, not that copy.
The frontmatter contains reusable observed values; it does not introduce CSS
custom properties or a new theme into the application.

## Colors

The palette combines cool blue/navy framing with warm gold actions and green turf.
Plain descriptive names refer to the normative frontmatter tokens.

### Primary
- **Pitch Blue** defines brand framing and interactive accents; **HUD Cyan**
  retains its existing match-indicator role.
- **Pale Gold** identifies emphasis, selection, focus, and the primary hover state.
- **Action Gold** supplies the public site's filled primary buttons.

### Secondary
- **Turf Green** and **Deep Turf** belong to the field and approved brand artwork.
- **Soil Rust** belongs to the mole's underground setting and warm artwork accents.

### Neutral
- **Night Navy**, **Panel Navy**, **Site Panel**, and **Input Navy** separate page,
  panel, and field surfaces. **Chalk White** is the general light text color.
- **Steel Frame** is a supporting site/editor border; **HUD Frame** is the match
  frame. **HUD Text** and **Pale Blue** serve their existing text and heading
  roles. **Button Ink** and **Button Edge** complete the
  primary button's contrast and outline.

**The Palette Scope Rule.** The eight-color logo palette is fixed by
[brand package v4](site/src/assets/brand-package-v4/README.md). UI variants may use
the other extracted interface colors. Team-kit choices use the separate
[team-color system](docs/specs/team-colors.md); neither interface nor team art
authorizes recoloring the logo. Sidecar tonal ramps are generated preview aids,
not additional approved production colors.

## Typography

The site pairs **Chakra Petch** headings with **Inter** reading text and
**Press Start 2P** navigation and selected controls. The match HUD uses the locally
served **Chakra Petch Bold** under the `MUTP` alias; spectating also uses a local
`Spectate Chakra` alias. Preserve the existing division of roles.

### Hierarchy
- **Display:** the frontmatter display treatment with the site's responsive
  `clamp(2rem, 4.8vw, 3.8rem)` size and a 15-character headline measure.
- **Headline:** the headline treatment with `clamp(1.25rem, 2.4vw, 1.75rem)` sizing.
- **Body:** the body treatment for public reading and supporting explanations.
- **Label / Navigation:** short pixel labels; navigation has its own smaller scale.
- **HUD Body / Label / Confirm:** compact local-font treatments for game state,
  supporting headings, and the central confirmation action.

**The Lettering Rule.** Use HTML text for editable names, controls, and game
state. Keep the approved logo wordmark as artwork; do not recreate it by typing
the name in one of the interface fonts. Earlier Alegreya/Barlow preview guidance
in the [font inventory](assets/game/ui/fonts/README.md) is not a global font policy.

## Layout

Public header, footer, and main content use a centered maximum width of 72rem
with a total 2rem viewport allowance. Reading pages narrow to 52rem; the builder
uses 78rem, while the base application wrapper uses 80rem. The public intro uses
two columns and becomes one column at 42rem. Builder layouts collapse at 760px;
the match HUD has 900px, 600px, and short-height 480px adaptations. Preserve the
individual surface rules rather than inferring one universal breakpoint.

Spacing combines rem-based page rhythm with pixel-based HUD gaps. The extracted
steps are recurring values, not evidence of a universal spacing grid. Public
panel padding is responsive (`clamp(1.25rem, 4vw, 2.25rem)`). The game's icon
actions use 42px squares and 3px gaps, with 44px controls for coarse pointers.

The live pitch occupies the match window. Score, resources, chat/log, inspection,
and action controls surround or overlay it. Keep controls readable in screen
space and preserve canonical pitch targeting and both coach orientations. The
formation selector aligns with the history-panel bottoms on wider views;
phone layouts stack the setup controls beneath history.

## Elevation & Depth

Depth is structural framed layers. Public buttons and panels use hard, unblurred
offset shadows; hovering a primary button reduces its shadow while the pointer
target stays fixed. The match HUD uses thin inset/outset borders and translucent
navy backing. Score panels use stronger backing than the adjustable support
panels, whose recorded default opacity is 30%.

The public background has a fine square grid and a subtle scanline overlay.
These are background texture, not information-bearing marks. Dialogs are an
existing exception to the hard-shadow treatment: the formation editor uses a
soft surrounding shadow and dark backdrop to separate modal work.

**The Readable Layer Rule.** Support-panel opacity affects the backing, not the
text, player art, or controls. Preserve foreground legibility while the pitch
remains visible. Exact shadows and motion values are recorded in the sidecar.

## Shapes

Square edges dominate public buttons, fields, navigation, and information panels,
generally with visible 3px borders. Builder recruitment, roster, and resource
cards retain their separate builder-card radius. HUD action tiles use the smaller extracted corner
radius and thin frames; support panels use the HUD-panel radius and 2px borders.
Circular players, formation chits, and indicators retain their game-specific
meaning. They do not establish a pill shape for general controls.

Keep the approved pixel/chibi artwork crisp. Follow the
[sprite standard](assets/game/standards/team-sprite-standard.md) and current
accepted asset packs rather than imposing one export size on every asset.
Preserve logo proportions and transparent clear space; use its optical small-size
variants as specified by the brand package.

## Components

### Buttons
Tactile and legible. Public primary buttons use the primary component tokens,
a pale edge, and a warm hard shadow. Hover uses the recorded hover colors and
shorter shadow without moving the pointer target. Secondary spectator controls
use the cool framed variant. Disabled controls retain their existing reduced
opacity and interaction guards; exact opacity varies by surface.

### Inputs
Square dark fields with visible steel-blue borders. Builder inputs use the
recorded input treatment and a gold focus-visible outline with 2px offset.
Public fields without a scoped focus rule retain browser focus behavior;
do not document universal focus coverage that the current code does not provide.

### Navigation
Compact pixel labels wrap within the shared framed header. Current/hovered links
use gold and the existing rust text shadow. Preserve active-page semantics and
the account menu's keyboard and short-screen behavior. The logo is an image,
not a text-based reconstruction.

The extracted navigation and label sizes describe the current implementation;
they are not minimum legibility or touch-target standards. The
[public-site critique](.impeccable/critique/2026-11-06T18-45-52Z__site-src.md)
identifies small navigation targets for a focused usability pass while retaining
the approved pixel font and framed treatment. Its 2026-11-06 live follow-up
verifies the support calculator's pointer/keyboard behavior and existing
disclosure, while distinguishing source-backed auth recovery concerns from the
successful sign-in observed after the owner's provider handoff.

### Panels and Cards
Public information panels use the site-panel treatment, responsive inset space,
visible borders, and a hard offset shadow. Match support panels use the HUD-panel
treatment and local font. The formation editor is a bounded, scrollable modal
with a responsive two-group layout, not a new card system for the whole product.

### Counts and Game Actions
Spectating counts use small rectangular framed tags. Match confirmation remains
a distinct cyan-outlined action with its existing pending/disabled states. Keep
actual labels and outcomes in live text. The sidecar supplies eight representative
standalone components with their observed states; it is a preview catalog, not
a replacement runtime component library.

### Motion
The icon action menu uses a short 180ms ease-out response; chat unread state
uses the existing 1.8s pulse. Both have reduced-motion alternatives. Preserve
existing dice/announcement timing and user settings rather than deriving new
gameplay animation rules from these small interface examples.

## Do's and Don'ts

### Do
- Preserve the approved mole-under-gridiron identity, logo artwork, and typography roles.
- Use the public-site and HUD variants in their existing contexts.
- Keep match controls legible over the pitch and preserve canonical interaction behavior.
- Use live text for labels, game state, and accessible explanations.
- Follow canonical asset, team-color, and sprite documentation for their respective scopes.
- Preserve observed focus, disabled, reduced-motion, and responsive behavior.

### Don't
- Recolor, stretch, apply effects to, or retype the approved logo.
- Treat historical concepts, old font previews, or asset wishlists as current implementation.
- Force the logo palette onto every team kit or replace approved pixel art with a new style.
- Make the entire product use one font, radius, density, or shadow treatment.
- Reuse outdated homepage positioning instead of the confirmed product purpose.
- Claim accessibility conformance or physical-device coverage from these extracted styles.

Sources: [site styles](site/src/assets/site.css),
[application styles](browser-client/src/play-brand.css),
[match HUD](browser-client/src/coach-match.css),
[action menu](browser-client/src/player-action-menu.css),
[spectating](browser-client/src/spectate.css),
[builder layout](site/src/assets/builder-layout.css), and
[formation editor](browser-client/src/FormationManager.css). Format follows the
[DESIGN.md specification](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md).
