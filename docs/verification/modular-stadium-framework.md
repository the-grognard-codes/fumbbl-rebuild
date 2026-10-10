# Modular stadium, crowd and accessories implementation

Implemented 2026-10-09 on `codex/modular-stadium-framework`, starting from main `c4d411846`. The attached feature request and the 2026-10-08 requirements handoff govern this work, together with the [settled art/geometry brief](../../assets/game/references/stadiums/human-reference-revision/README.md). No commit, push, deployment or persistent preview was requested or performed. Unrelated site working-tree edits were preserved.

## Result

The existing merged jigsaw framework supplies both complete venue bundles, fixed world slots, two sideline locker-room portals, recessed benches/mugs/pavilion, team partitions, fire and flags. This implementation fills the remaining gaps rather than introducing a competing layout:

- Thirteen newly generated production PNGs: four mixed crowd view sheets, four peak gesture sheets, four intermediate gesture sheets and one independent perspective/overhead sideline accessory atlas.
- Old World Classic supporters are predominantly Humans with Dwarfs and Halflings, varied light/medium/dark skin and genders, and blue/ivory clothing. Badlands supporters mix tusked Orcs, Goblins, tan/brown Ogres and blue-grey Trolls in orange/russet/brown clothing. Dense inward-facing front, back, side and corner paintings remain independent of venue architecture.
- Authored intermediate frames replace repeated two-state blinking. Random visible sections use rest/intermediate/peak/intermediate/rest, with a short peak hold; whole banks stay still. Reduced motion freezes decorative effects. Failed intermediate images retain healthy base and peak images; failed peak files disable section overlays.
- Camera-facing crowd planes use equal horizontal/vertical source pixel scales, including end banks. Finer renderer subdivisions improve side joins, and the exposed corners follow a four-square radius in perspective and overhead. The shared physical piece dimensions, pitch coordinates and projection are preserved.
- Horizontal wall caps expose actual thickness outside the apron. Spare jerseys and rolled/loose towels join each team's bench area using separate view-correct regions and team palettes.

Home League still selects architecture and shared props. Participating teams select their own supporters, bench details and accessories. All 390 playable cells, the two-square apron, two entrances and canonical midfield partitions stay registered. No rules, transport, input or unrelated UI code changed.

## Art and extensibility

Canonical originals are in [the jigsaw asset directory](../../assets/game/pitch/stadiums/jigsaw/). Source and browser PNG bytes match; dimensions and SHA-256 values are verified by the catalog. Original versions remain preserved. One rejected overhead trial is retained under `source/` and excluded from public delivery.

The [exact prompts and parent references](../../assets/game/pitch/stadiums/jigsaw/source/mixed-crowd-prompts.json) record built-in `image_gen.imagegen` generation/editing. The [updated authoring contract](../../assets/game/pitch/stadiums/jigsaw/source/README.md) describes shared slots, optional ordered frames, accessory views, source validation and future-family onboarding. New families extend these catalogs and reuse the measured geometry.

## Verification and self-review

| Check | Result |
| --- | --- |
| `npm.cmd run assets:check --prefix browser-client` | 27 asset tests passed; 204 public assets checked, including source hashes and generated catalogs |
| Focused stadium presentation, gesture and jigsaw unit files | 15 tests passed |
| `npm.cmd run build --prefix browser-client` | TypeScript and production Vite build passed; existing large-chunk advisory remains |
| `node --experimental-strip-types browser-client/test/projected-pitch-ui.mjs` | Passed 48 hosting/end/angle/travel combinations, fixed ownership, 390 cells, near crowd occlusion, input, setup, pan/zoom, ball/dice alignment, motion and reduced motion |
| Missing-art paths in that browser test | Healthy scenery/input retained when peak, intermediate, whole stadium or player art failed |
| `node tools/stadium-piece-review.mjs .tools/stadium/feature-final` | 28 assembled captures; zero page errors; both leagues and viewing ends |
| `git diff --check` | Passed |

The first camera test run found a stale assertion for the previous overhead filename. It now resolves current files from the canonical catalog. A source-pixel aspect test also identified the end-bank calibration discrepancy; all perspective crowd planes now preserve source proportions. Both corrected checks passed on the final implementation.

Self-review covered catalog compatibility, independent home/team ownership, rounded masks and seams, wall-cap placement, bench accessory bounds, local gesture clips, reduced motion, source failure isolation and unchanged game input. The isolated browser test observes subtle fire/flag motion, at most one gesture section, stable base transforms and no decorative gameplay intents or per-frame DOM updates. It makes no sustained hardware performance claim.

The [review gallery](../../assets/game/references/stadiums/mixed-crowd-review/README.md) contains representative assembled views. These were visually inspected against the approved reference; crowded shoulders, species/palette distinctions, elevated near backs, overhead crowns, wall caps and accessories are present. A static reference and a travelling match camera have different framing; outer stands may crop.

The owner's manual review of the rebuilt game remains outstanding. No fresh authenticated native match, reconnect/replay or full match through halftime was run in this session; this visual-only change uses the existing frozen identity seam. Java gameplay suites and unrelated browser drivers were not rerun. Technical results do not establish owner acceptance of the final appearance.
