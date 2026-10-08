# In-game art

The loose ball uses the original 16×20 pixel-grid vector asset `ui/ball-v1.svg`. Its warm leather, ivory laces, dark outline and restrained gold highlights follow the MUTP match reference. `ui/ball-v1.provenance.json` records authorship and the source hash; the asset sync delivers it unchanged. Possession and the synchronized highlight remain native-state-driven presentation.

This is the source of truth for browser match art. It excludes the public site's branding assets. Legacy desktop artwork is included only when deliberately promoted with provenance, as with the five weather sprites in `ui/weather/`.

| Path | Purpose |
| --- | --- |
| `standards/` | Current art direction and export geometry. |
| `references/` | Approved concepts, pitch layout study, and historical prompts. These are references, not runtime sprites. |
| `teams/<roster-id>/team.json` | Accepted art version and position-to-variant inventory. Roster IDs match the game catalog. |
| `teams/<roster-id>/source/` | Full-size originals, prompts, provenance, and the historical exporter for the accepted pack. |
| `teams/<roster-id>/master/` | Accepted native-size transparent sprites. |
| `teams/<roster-id>/qa/` | Native and enlarged review sheets and checks. |
| `teams/<roster-id>/poses/<version>/` | Independent archetype pose catalog, seven body views and a dedicated portrait per position. Existing random player variants remain in the flat `master/`. |
| `ui/` and `pitch/` | Canonical match UI art, font licenses, and pitch SVGs. |
| `archive/` | Earlier 36px/48px packs and ZIP deliveries retained for provenance. |

`browser-client/public/assets/game/` is the generated delivery copy. Run `npm --prefix browser-client run assets:sync` after changing a canonical asset, then `npm --prefix browser-client run assets:check` to verify every delivered file against its source. Browser development and build scripts sync first. The site build copies this delivery tree under `/assets/game/`.

The accepted Human and Orc packs retain their original generation records in `source/64px-chibi-v1/`. Their `manifest.json` files describe image geometry; `team.json` records which image variants belong to each roster position. Browser component mappings still select those variants and can move to a shared asset catalog in the later team factory work.

The Human and Orc `coach-oriented-v1` pose packs use the authoritative `team.json` `posePack` pointer. Each pack's `catalog.json` maps position IDs to five standing originals, face-up prone, face-down stunned, and a separate 160px portrait. Bounds describe visible alpha (threshold 32). Anchor schema 2 records a visually reviewed `bodyAnchor`: its horizontal torso/feet centerline excludes extended arms, weapons and transparent padding; its vertical coordinate retains the visible body extent midpoint. `footAnchor` uses the same horizontal line and the standing baseline. `groundAnchor` retains the visible-art center for prone/stunned poses. Top-down upright bodies use `bodyAnchor`, perspective upright bodies use `footAnchor`, and ground poses use `groundAnchor`. Shadows follow rendered feet or the ground-pose center in either view. The 2026-10-07 metadata review preserves all source and master pixels; per-pack `qa/body-center-v1` sheets show old cyan and reviewed gold guides. The historical promotion helper refuses to overwrite these reviewed anchors. The browser resolver in `browser-client/src/player-art.ts` mirrors only the five standing views needed for eight screen directions. Off-pitch and unknown states retain a portrait/text marker path. Names and jersey numbers stay outside the artwork.

The requested multi-pose sheet overrides standard 1.1's one-pose default. `source/prompts.json` records exact selected built-in image generation prompts and viewed reference roles; `source/sheets/`, `source/export-v2/originals/`, and `source/sources.json` retain originals and hashes. The PowerShell sprite exporter created all body masters. `scripts/build-coach-pose-pack.py` promotes those exports and scales the dedicated portrait sources. `qa/` contains 1× and 3× green-pitch review sheets and validation notes. The versioned ZIP beside each pack preserves this delivery. `assets:sync` generates `browser-client/src/generated-player-art.ts` and copies only the catalog and native masters to `/assets/game/`; `assets:check` verifies the exact inventory, decoded PNG alpha bounds, anchors and delivery hashes.

New teams should use the [team sprite standard](standards/team-sprite-standard.md) and the repository's `team-pixel-sprites` skill. Color layers and broader factory automation remain design work; the current masters are flattened sprites.
