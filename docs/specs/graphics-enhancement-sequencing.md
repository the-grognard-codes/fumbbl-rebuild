# Graphical enhancement implementation order

Date: 2026-11-01.

Status: planning reference exported from the discussion; the implementation order is a recommendation, not authorization to implement all stages.

Initial feature: [Prove the shared sprite format](shared-sprite-format-proof.md).

## Recommendation

Establish team-color support first, prove it works on a small animated sample, then develop stadiums and broader animation coverage alongside each other. The strongest dependency is that recoloring must work consistently across every animation frame. Stadiums are more independent, provided their team-colored elements remain separate from their architecture.

Distinguish the order in which technical decisions are settled from the order in which finished features are released. Settle the sprite format early without completing every team before improving stadiums.

The repository already has directional player poses and reviewed placement anchors, plus stadium code that separates league venues from home and away supporters. Current player masters are flattened images; color layers remain design work. See [asset documentation](../../assets/game/README.md) and [stadium documentation](../../assets/game/pitch/stadiums/README.md). Existing stadium implementation does not establish acceptance of its visual quality.

## Recommended sequence

| Stage | Deliverable | Reason |
| --- | --- | --- |
| 1. Prove the shared sprite format | A few representative players with recoloring and short animations | Expose problems before they multiply across the roster |
| 2. Ship team colors | Primary/secondary selection, saved team settings, recolored static poses | Deliver customization and establish colors other features can consume |
| 3. Finish one representative stadium | Distinct league architecture, home/away stands, reserved recolorable areas | Validate the stadium production approach before producing every league |
| 4. Ship core player animations | Movement, possession, common actions and outcomes | Build on the proven sprite format and existing game presentation |
| 5. Expand coverage | Remaining players, actions and league stadiums; richer supporter customization | Expand content once the foundations hold |

Stages 3 and 4 can overlap if artwork and implementation capacity allow. With one shared production pipeline, finish one stadium before attempting comprehensive animation: it provides a visible improvement without waiting for the largest content workload.

## Recoloring before broad animation production

The working interpretation of `16²` is 16 primary choices × 16 secondary choices: 256 ordered combinations, including matching primary and secondary colors. This suggests two curated swatch pickers. An unrestricted RGB picker would create a broader visual-quality problem and remains a separate decision.

Each sprite should distinguish primary uniform regions, secondary uniform regions, and fixed materials such as skin, fur, metal, leather and outlines.

Each selectable color should ideally have a small shading ramp—shadow, base and highlight—so changing blue to yellow preserves the intended pixel-art shading.

| Approach | Benefit | Tradeoff |
| --- | --- | --- |
| Indexed colors with reserved entries for primary/secondary shading | Precise control over pixel colors and shading; suited to the requested aesthetic | Requires disciplined palette authoring and export |
| Separate color masks/layers plus shading | Makes customizable regions explicit and works with layered source art | Every frame must keep masks, shading and transparency aligned |

Indexed color ramps are the preferred first prototype, with masks retained as a candidate. Indexed images associate pixels with palette entries, supporting controlled palette replacement. See [Aseprite color-mode documentation](https://www.aseprite.org/docs/color-mode/).

The crucial decision is the meaning of the color regions. Runtime rendering can then use palette lookup or cached recolored textures. There should be no need for 256 separately authored sprite sets. A browser image displaying an indexed PNG does not by itself provide a runtime palette-swapping API; the proof must demonstrate the actual rendering/export path.

## Test animation early; produce it broadly later

The initial sample should include a normal player, a small player and a big player, with a short idle, movement and contact/fall sequence. Check color extremes, matching colors and opposing teams with similar kits at actual pitch size.

This catches problems a static recoloring demonstration misses: flickering color regions, shifting feet, clipped limbs and inconsistent shading between frames.

Comprehensive animation is likely the largest workload because artwork grows with:

**player designs × authored directions × animation clips × frames**

SNES complexity keeps individual frames simple; it does not eliminate that multiplication. Define a reusable animation vocabulary before making every requested action.

| Game situation | Possible visual building blocks |
| --- | --- |
| Successful dodge | Sidestep → resume movement |
| Failed dodge | Sidestep → lose balance → fall |
| Block/tackle interaction | Attack or brace → impact → recoil, push or fall |
| Pass/catch | Wind-up and release; reach and secure or miss |
| Possession | Carry pose or ball attachment combined with idle/movement |
| Foul | Dedicated strike toward a grounded opponent |

These are proposed reuse opportunities, not requirements that different actions look identical. A complete event-to-animation mapping can provide comprehensive coverage without a unique animation for every rules outcome.

Production animation must follow confirmed game outcomes and support Match replay, reconnect and reduced motion. Existing playback code is a starting point, but these behaviors need explicit validation in the later integration feature.

## Stadium colors can ship later if their regions are planned now

Separate league identity—architecture, materials, terrain, lighting and distinctive props—from team identity—banners, pennants, supporter clothing and stand decorations.

The existing separation of venue and supporter identities supports this direction. Wave one can use default colors. Reserve layers or masks for customizable cloth and supporter regions from the beginning, then connect them to saved team colors in wave two. Otherwise, later recoloring means revisiting flattened crowd and banner artwork across every stadium.

Keep home/away stand ownership independent of camera orientation and halftime changes, consistent with the current stadium documentation.

## Alternative paths

| Path | Best reason to choose it | Main cost |
| --- | --- | --- |
| Colors first | Minimize repeated sprite work and deliver customization | The early result may feel less dramatic |
| Stadiums first | Prioritize screenshots, atmosphere or a public demo | Defers the harder sprite-production questions |
| Animations first | Prioritize making matches feel alive | Highest rework risk unless recoloring is designed into every frame |

Recommended delivery order: **recolorable animated sample → team colors → one finished stadium → core animations → broader content coverage**.
