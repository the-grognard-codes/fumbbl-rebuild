# M6 Human skill expansion

This five-skill slice preceded the [full core registry](m6-core-skills-2026-09-25.md).
Its version and twelve-skill count below describe the earlier slice.

Status: implemented and verified on `codex/m6-orc-content` on 2026-09-25; no service or site deployment. The owner chose skills on the existing Human roster while other team sprites are unavailable. The public builder derives skill choices from the server catalog.

The [BB2025 Skills & Traits table](https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/) identifies Guard and Mighty Blow as Elite Strength skills, Wrestle as General, and Sidestep and Sure Feet as Agility. The Java BB2025 skill factory confirms each canonical name and category. The current exhibition preset still applies [Matched Play](https://bloodbowlbase.ru/bb2025/core_rules/matched_play/) costs and limits: one purchased skill per player, eight points, at most two Secondary purchases, and at most four copies of each Elite purchase.

| New Human purchase | Category | Elite | Example Primary recipient | Example Secondary recipient |
| --- | --- | --- | --- | --- |
| Guard | Strength | Yes | Blitzer | Lineman |
| Wrestle | General | No | Lineman | Halfling |
| Sidestep | Agility | No | Catcher | Lineman |
| Sure Feet | Agility | No | Halfling | Lineman |
| Mighty Blow | Strength | Yes | Blitzer | Lineman |

The updated catalog is `bb2025-human-2026-09-24.1`, with twelve selectable skills. Base skills cannot be repurchased, including an Ogre's Mighty Blow. The server remains the authority for points, categories, duplicates and Elite limits. New skills are mapped from frozen teams to native engine skills. The earlier `bb2025-human-2026-09-08.1` catalog stays readable in frozen match and result records; account saved teams may be cleared at activation under the owner's authorization. No account data was cleared during this branch work.

Verification:

- Focused Java tests: `BrowserTeamJsonTest`, `FrozenTeamEngineConverterTest`, `MatchServiceTest`, `OrcContentMappingTest` — 35 passed. They cover new Primary/Secondary purchases, duplicate base Mighty Blow, Elite limit, native skill mapping, and reading an old frozen Human match.
- Browser `npm.cmd test` — 67 passed. `npm.cmd run build` and `npm.cmd run build:play` passed. The versioned team request schema accepted one valid and rejected ten invalid documents.
- Static site build and check passed; four site client tests passed. The signed-in browser builder test displayed all five choices, selected Wrestle, validated and saved that player, then verified Play selection.
- Offline Java 21 `mvn clean install` passed all eight reactor modules. The server reported 249 tests with two skipped; the match scenario module reported 176 with seven skipped. No failures or errors.

The native engine has the five skill implementations, and this slice verifies selection, legality, conversion and existing match-suite behavior. It does not include separate controlled dice scenarios for every new skill effect or a deployed two-account match. Those are the next release checks before claiming full gameplay acceptance.
