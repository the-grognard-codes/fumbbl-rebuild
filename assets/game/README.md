# In-game art

This is the source of truth for browser match art. It excludes the public site's branding assets and the legacy desktop client's `ffb-resources` icons.

| Path | Purpose |
| --- | --- |
| `standards/` | Current art direction and export geometry. |
| `references/` | Approved concepts, pitch layout study, and historical prompts. These are references, not runtime sprites. |
| `teams/<roster-id>/team.json` | Accepted art version and position-to-variant inventory. Roster IDs match the game catalog. |
| `teams/<roster-id>/source/` | Full-size originals, prompts, provenance, and the historical exporter for the accepted pack. |
| `teams/<roster-id>/master/` | Accepted native-size transparent sprites. |
| `teams/<roster-id>/qa/` | Native and enlarged review sheets and checks. |
| `ui/` and `pitch/` | Canonical match UI art, font licenses, and pitch SVGs. |
| `archive/` | Earlier 36px/48px packs and ZIP deliveries retained for provenance. |

`browser-client/public/assets/game/` is the generated delivery copy. Run `npm --prefix browser-client run assets:sync` after changing a canonical asset, then `npm --prefix browser-client run assets:check` to verify every delivered file against its source. Browser development and build scripts sync first. The site build copies this delivery tree under `/assets/game/`.

The accepted Human and Orc packs retain their original generation records in `source/64px-chibi-v1/`. Their `manifest.json` files describe image geometry; `team.json` records which image variants belong to each roster position. Browser component mappings still select those variants and can move to a shared asset catalog in the later team factory work.

New teams should use the [team sprite standard](standards/team-sprite-standard.md) and the repository's `team-pixel-sprites` skill. Color layers and broader factory automation remain design work; the current masters are flattened sprites.
