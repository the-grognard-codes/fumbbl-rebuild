# Feature: Modular Blood Bowl Stadium Presentation System

## Abstract

Replace the existing stadium presentation with a visually rich, modular, league-specific stadium system using layered 16-bit-inspired pixel art, animated crowds, reusable spectator sections, and configurable sideline accessories.

The system must reproduce the visual quality, composition, and atmosphere demonstrated in the **approved stadium concept images supplied with this request**.

This is both a visual asset creation project and a rendering architecture project. Neither should be considered complete without the other.

**Implementation strategy:** Establish the architecture and complete one Old World Classic stadium as a vertical slice. Validate it before expanding to Badlands Brawl and the remaining leagues.

## Objective

Create a configurable stadium system capable of assembling a complete game environment from independent visual components:

- League-specific pitch and stadium architecture.
- League-specific environmental decoration and visual effects.
- Team-specific home spectators.
- A smaller, independently configurable visiting-supporter section.
- Animated spectators representing each team's races, colors, and culture.
- Modular sidelines for benches, staff, cheerleaders, and accessories.
- Compatible presentations for top-down and all existing perspective presets.

The implementation must maintain the existing game's camera behavior, playable grid dimensions, and gameplay functionality.

## Visual Design Authority

The attached approved mockups are **primary visual references**, not loose inspiration.

The implementation must aim to reproduce their:

1. Overall stadium composition and proportions.
2. Rich, detailed, SNES-era fantasy pixel-art aesthetic.
3. Chibi-style spectator proportions and expressive faces.
4. Stadium architecture, tiered seating, walls, and decorative details.
5. Detailed pitch textures and environmental atmosphere.
6. Dense, lively crowd composition.
7. Lighting, banners, architectural ornamentation, and color treatment.

The revised mockups showing expanded sidelines and smaller away sections take precedence over the initial concepts.

**Do not substitute generic geometric stadiums, flat-color blocks, simplistic silhouettes, emoji crowds, or minimally detailed procedural graphics for the approved visual style.**

New assets must be visually cohesive with the existing player sprite packs.

If the available asset-generation tooling cannot produce the required artwork, identify that limitation and specify the needed art assets. Do not represent placeholder graphics as visually complete.

## Preliminary Investigation — Required Before Implementation

Inspect the existing codebase and document:

- The current pitch and stadium rendering architecture.
- How top-down and 30/40/50 perspective presets are implemented, including what those values represent.
- Where image scaling, perspective transformations, and scrolling occur.
- The current dimensions and coordinate system of pitch squares.
- How sprites and graphics are loaded, positioned, layered, and animated.
- Whether the existing renderer supports depth ordering, clipping, sprite atlases, and independent animation layers.
- Existing Human and Orc sprite dimensions, proportions, palettes, and visual conventions.
- The league and team classifications in the source reference material.
- Previous stadium implementation attempts and the applicable `/handoff` guidance.

Identify the specific reasons the previous implementation produced stretched crowds, shallow stadium walls, irregular stadium shapes, or jerky animations.

Preserve useful existing systems wherever possible.

**Before building the new visuals, document a proposed architecture that addresses these issues.**

## Architectural Requirements

### 1. Stadium Configuration

Stadiums must be assembled through data-driven definitions rather than hard-coded, team-specific scenes.

A stadium configuration must describe its:

- League identifier.
- Pitch surface and field decoration.
- Stadium structural assets.
- Sideline surface and accessory placement regions.
- Seating sections and crowd placement regions.
- Designated away-supporter section.
- Environmental effects and animations.
- Asset variants or rendering configurations required by supported camera modes.

League-specific additions should be possible through configuration and new assets without changing the shared rendering framework.

The home team's associated league determines the stadium environment.

### 2. Rendering Layers

Provide independent layers or equivalent scene components for:

1. Ground and stadium foundation.
2. Pitch terrain and field markings.
3. Sideline surfaces.
4. Stadium walls, terraces, entrances, and architectural elements.
5. Static crowd seating and background spectators.
6. Animated crowd sprites and accessories.
7. Sideline props, staff, and cheerleaders.
8. Environmental effects such as flames, banners, and lighting.
9. Foreground architecture and occluding elements where necessary.

The exact rendering order should follow the existing engine's depth and occlusion requirements.

Components must align spatially and appear to belong to one cohesive environment.

**Do not create one flattened image containing all components as the final rendering solution.**

### 3. Camera and Perspective Compatibility

The game currently supports top-down and three perspective presets (30/40/50).

Inspect their actual implementations before choosing how stadium assets are rendered.

Requirements:

- No unnatural stretching, skewing, or flattening of spectators, architecture, or props.
- Stadium structures retain believable depth and height.
- Crowd bodies remain proportionate when camera presets change.
- Camera scrolling and panning do not misalign stadium layers.
- Walls, spectators, and accessories retain correct spatial relationships.
- The pitch grid preserves its existing square dimensions and gameplay coordinates.
- Decorative elements do not obscure playable squares.

**Do not apply a perspective transform to an entire flattened stadium image as the sole means of supporting multiple camera angles.**

Instead, evaluate renderer-native scene geometry, depth-aware sprite placement, camera-facing sprites, and view-specific visual assets where appropriate.

Select the approach that best supports visual quality and compatibility with the current game renderer.

Do not assume that one raster image can be transformed into every view without quality loss.

### 4. Stadium Structure

Each stadium must resemble a rounded rectangular or oval sports arena, with crowd stands rising away from the pitch.

Requirements:

- Clearly visible wall height and thickness.
- Consistent perimeter geometry.
- Tiered spectator seating with credible vertical depth.
- No crowd sections protruding irregularly into the playable region.
- Stadium entrances and tunnels near team benches.
- Architectural identity appropriate to the league.
- Clear visual separation between the playing surface, sideline area, and stadium seating.

The stadium structure is predominantly static. Limited environmental animation may be added through separate layers.

### 5. Modular Crowds

Crowds must be constructed independently from stadium architecture.

The crowd system must support configurable spectator populations based on the participating teams.

Create reusable race- or faction-based spectator sprites and small animation groups. A spectator definition should support:

- Race or species.
- Visual variant.
- Clothing colors or team palette.
- Animation type.
- Animation frames and playback timing.
- Position or seating slot.
- Optional accessories such as mugs, flags, scarves, or drums.

Spectators should have the same chibi fantasy styling as the player assets: oversized expressive heads, visible torsos and arms, readable gestures, and carefully controlled pixel-art detailing.

Crowds should appear densely packed without looking like a repeated wall of identical faces.

Represent a variety of skin tones, genders, clothing, facial features, and poses where appropriate for the species and setting.

#### Home and Away Crowd Composition

The home supporters should dominate the stadium.

Reserve one contiguous section on one side of the stadium for visiting supporters, initially targeting approximately **10–20% of visible spectator capacity**.

The visiting section must:

- Occupy a defined, reusable seating region.
- Be visually distinguishable through clothing, banners, species, and accessories.
- Be separated from adjacent home spectators by an architectural feature appropriate to the stadium.
- Be populated according to the visiting team's identity.
- Be replaceable without regenerating the home crowd or stadium.
- Work regardless of the league or race of the visiting team.

The architectural divider belongs between spectator sections; it must not cross or obstruct the pitch.

**Do not create unique crowd images for every possible home-versus-away combination.**

### 6. Crowd Animation

Crowd movement should resemble the subtle animated backgrounds of 1990s fighting games, including Street Fighter-era spectators.

Provide reusable, short animation sequences including:

- Cheering with arms raised.
- Clapping or fist-pumping.
- Drinking from a mug or goblet.
- Waving a flag or pennant.
- Bouncing or celebrating.
- Short idle motions.

Animation should be subtle and visually smooth, generally using a small number of carefully drawn frames per action.

Avoid synchronized movement across the entire crowd.

Use varied starting frames, staggered timing, and occasional idle periods so the crowd appears organically animated.

Prefer sprite-based animation for selected spectators or crowd groups over unnecessarily animating an entire full-resolution stadium texture.

Animation should be performance-conscious, especially when numerous spectators are visible.

### 7. Sidelines and Accessories

Preserve approximately two logical pitch squares of sideline clearance beyond the playable pitch perimeter, subject to verification against the existing layout.

This space must remain visually distinct from the stadium seating and be sufficient for:

- Home and away team benches.
- Coaching staff.
- Medical staff.
- Cheerleaders.
- Water containers, mugs, towels, and equipment.
- Team entrances and locker-room tunnels.
- League-specific decorative accessories.

These accessories should be independently configurable and positioned in stable, nonplayable regions.

Do not bake future staff, cheerleaders, or team-specific accessories into the main stadium background.

Initial implementation may leave some accessory positions unoccupied, but the necessary placement framework and visual space must exist.

### 8. Reusable Asset Contract

Define a documented asset format and naming convention for league-specific stadium components.

At minimum, support:

- Static transparent sprite assets.
- Multi-frame sprite animations.
- Animation metadata.
- Palette or team-color variants where feasible.
- Placement and anchor coordinates.
- Layer and depth metadata.
- Camera-specific variants where required.
- Stadium configuration manifests.

Use a consistent source-pixel density and rendering convention for the asset families.

Preserve hard pixel edges where appropriate, avoiding unwanted smoothing or inconsistent scaling.

Do not recolor skin, faces, or unrelated asset regions when applying team clothing colors.

New stadium bundles must be loadable through the shared system without changes to gameplay logic.

## Initial Stadium: Old World Classic

Complete Old World Classic as the first production-quality demonstration.

Visual identity:

- Medieval Old World fantasy sports venue.
- Detailed stone and timber construction.
- Heraldic banners and pennants.
- Torch-lit stone columns.
- Wooden railings, barrels, benches, and awnings.
- Bright, slightly worn grass pitch.
- Strong architectural depth and tiered seating.
- Lively, densely packed chibi spectators.

The initial home crowd should primarily feature Humans with some Dwarfs and Halflings.

Use the existing Human player sprite pack as the source for the crowd's primary blue clothing palette and visual proportions.

Include varied appearances and crowd behaviors.

The away section must demonstrate a visually distinct visiting crowd that can be substituted independently of the stadium architecture.

The completed stadium must be visually comparable to the approved Old World Classic mockups.

## Second Stadium: Badlands Brawl

After the Old World Classic stadium and modular framework have passed visual review, expand the system with a Badlands Brawl stadium.

Visual identity:

- Brutal, ramshackle fantasy sporting venue.
- Heavy timber, iron reinforcements, crude masonry, and spikes.
- Patched banners, skull trophies, and rough barricades.
- Dirt-heavy pitch with trampled grass.
- Drums, barrels, torches, and improvised seating.
- Chaotic but densely organized spectator sections.

The crowd should primarily feature Orcs, supported by Goblins, Ogres, Trolls, and other appropriate races as established by the source reference material.

Use the existing Orc sprite pack's brown/orange palette and stylization.

The Badlands Brawl implementation must reuse the established framework rather than introducing a second, unrelated rendering solution.

## Out of Scope

- Gameplay rule modifications.
- Changes to movement, blocking, or dice logic.
- Changes to the playable grid.
- Unrelated UI redesign.
- Replacement of player sprite packs.
- Stadium-specific gameplay bonuses or environmental hazards.
- Unique stadium imagery for every possible team matchup.
- Full character-level animation systems for every spectator.

## Implementation Sequence

### Phase 1 — Investigation and Technical Proof

1. Audit the existing renderer, assets, and prior stadium attempts.
2. Document why the previous results failed.
3. Propose the scene layering and asset architecture.
4. Define the stadium asset manifest and reusable crowd section contract.
5. Build a small working rendering demonstration.
6. Verify correct appearance and alignment in top-down and 30/40/50 perspective modes.

Do not proceed by generating a large amount of artwork until the proposed rendering approach is demonstrated to be viable.

### Phase 2 — Old World Classic Vertical Slice

1. Produce the detailed stadium structure and pitch.
2. Implement the widened sidelines.
3. Integrate a predominantly Human home crowd.
4. Integrate a smaller modular visiting-supporter section.
5. Add representative animated spectators.
6. Add selected sideline accessories.
7. Validate artwork, alignment, layering, animation, and camera behavior.

**Stop for visual acceptance after this phase before completing the other stadiums.**

### Phase 3 — League Expansion

After approval, add Badlands Brawl using the same architectural and asset contracts.

Verify that the same visitor-crowd components can be used in both stadium environments without creating matchup-specific stadium images.

## Acceptance Criteria

### Visual Quality

- [ ] The initial stadium closely matches the approved mockups in composition, density, detail, and pixel-art styling.
- [ ] The crowd uses recognizable chibi fantasy spectator sprites, not abstract shapes or head-only rows.
- [ ] The stadium walls have visible depth and the seating tiers rise away from the pitch.
- [ ] Architectural details and environmental decorations are sufficiently rich to establish a distinct league identity.
- [ ] The pitch and stadium are visually cohesive.

### Modularity

- [ ] The home crowd can be changed without replacing the stadium.
- [ ] The visiting crowd can be changed without replacing the home crowd.
- [ ] A smaller, visually distinct away-supporter section is present.
- [ ] Replacing the visiting crowd requires no newly generated combined stadium image.
- [ ] Sideline accessories can be added, removed, or repositioned independently.
- [ ] Stadiums load from reusable configuration definitions.

### Rendering

- [ ] Top-down view renders correctly.
- [ ] Perspective preset 30 renders correctly.
- [ ] Perspective preset 40 renders correctly.
- [ ] Perspective preset 50 renders correctly.
- [ ] No crowd or structure has visibly stretched proportions.
- [ ] North/south scrolling does not cause layer misalignment.
- [ ] No stadium element obscures playable squares.
- [ ] Existing grid positioning and gameplay remain unchanged.

### Animation

- [ ] Multiple spectator animation types are present.
- [ ] Animations appear smooth at their intended playback rates.
- [ ] The entire crowd does not move in synchronization.
- [ ] Crowd animation does not introduce unacceptable rendering overhead.
- [ ] Animated elements retain correct placement while the camera moves.

### Reusability

- [ ] The stadium asset format is documented.
- [ ] Assets use consistent scale, placement conventions, and styling.
- [ ] A second team composition can be demonstrated without regenerating the stadium.
- [ ] The framework supports additional leagues without requiring new core rendering logic.

## Validation and Evidence

Perform automated tests where practical for configuration loading, placement rules, camera transformations, and asset references.

Provide screenshots of the completed Old World Classic implementation in all four camera modes.

Include at least two visiting-team configurations to demonstrate crowd modularity.

Compare the rendered implementation against the supplied concept images, and identify any visible differences in architecture, perspective, proportion, crowd appearance, or pixel-art detail.

Do not declare visual acceptance based solely on successful compilation or passing code tests.

Provide an inventory of created assets, their purposes, and their source files.

## Constraints

- Create a new feature branch using existing repository naming conventions.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions.
- Review applicable `/handoff` guidance.
- Do not commit or push unless explicitly requested.
- Avoid unnecessary dependencies.
- Preserve existing game functionality.
- Do not present placeholder assets as completed production artwork.

## Completion Requirements

At the end of the initial implementation, report:

1. Rendering architecture selected and rationale.
2. Components and asset files created or modified.
3. How stadiums and crowds are independently configured.
4. Behavior verified across each camera preset.
5. Screenshot evidence for manual visual review.
6. Known limitations and work remaining.
7. Steps necessary to add the next league stadium.

**The first milestone is complete only when the Old World Classic stadium demonstrates both the required modular architecture and the desired visual quality.**