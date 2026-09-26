# BB2025 Human and Orc exhibition catalogs

Current catalog `bb2025-exhibition-2026-09-25.1`, ruleset `BB2025`, preset
`exhibition-1150`, with selectable `human` and `orc` rosters. The owner selected **1,150,000 gold** on 2026-09-07
(local time). This budget is a project preset choice, not a universal rule.
The catalog is immutable for this version. Previous Human-only catalog versions
`bb2025-human-2026-09-08.1`, `bb2025-human-2026-09-24.1`, and `bb2025-human-2026-09-25.1` remain
readable in frozen matches.
Account saved teams may be cleared at activation under the owner's authorization;
there is no implicit draft migration.
The browser and Java tests share `test/fixtures/catalog-v1.json` and
`test/fixtures/catalog-orc-v1.json` as pinned Human and Orc wire fixtures.
The Java catalog verifies every declared skill against the BB2025 engine
factory and category, failing startup if a mapping is unresolved.

## Source and legacy comparison

The owner authorized [Blood Bowl Base BB2025](https://bloodbowlbase.ru/bb2025/teams/)
as the project's current rules source. Read on 2026-09-08 UTC. The previous
repository-only provenance blocker is resolved by that explicit authorization.
No live FUMBBL export, synthetic fixture or artwork concept supplied recruitment
values. Runtime startup does not fetch the website.

The complete six-position data is pinned in the wire fixture and shown by the
DOM catalog table. Source: [Human roster](https://bloodbowlbase.ru/bb2025/teams/Human/).

| Legacy Human XML field | BB2025 source comparison / adapter decision |
|---|---|
| `id`, position IDs | Local stable identifiers; old external/LRB6 IDs are not retained as authority |
| `quantity`, `cost` | Direct current roster values; no conversion of old prices |
| Lineman | Limit 16, 50K; target armour 9; Primary G, Secondary ADS |
| Catcher | Limit changes 4 → 2; cost 70K → 75K; ST 2 → 3; PA 4+, AV 8+ |
| Thrower | Cost 70K → 75K; PA 2+ → 3+; AV 9+ |
| Blitzer | Limit 4 → 2; cost 90K → 85K; gains Tackle; AV 9+ |
| Halfling Hopeful | New local position; limit 3, 30K |
| Ogre | Limit 1, 140K; AG 4+, AV 10+; explicit Loner 3+ |
| `movement/strength/agility/passing/armour` | MA/ST remain counts; AG/PA/AV are current target numbers, not arithmetic conversions from LRB6 |
| `skillList`, `value` | Explicit current IDs; Loner parameter 3; Mighty Blow modifier 1; other parameter values 0 mean not parameterized |
| `normal`, `double` categories | Replaced with explicit Primary/Secondary data, including Devious; old dice-based labels are not a conversion rule |
| `type`, `race`, `keywords` | Current role/race labels, including Big Guy; only these public labels are projected |
| `reRollCost`, `maxReRolls`, `apothecary` | Current Human price/eligibility plus drafting-wide limits |
| `maxBigGuys` | Human Ogre's explicit quantity 1 supplies the bound; no guessed global value |
| `portrait`, `iconSet`, `baseIconPath`, `logo`, icon indices, name generator, gender, shorthand | Not needed for M2a legality; absent from browser contract; no fabricated artwork or legacy defaults |
| `raisedPositionId`, `riotousPositionId`, `necromancer`, `undead`, `thrall`, `teamWithPositionId`, `replacesPosition` | No Human starter recruitment selection requires these legacy lifecycle fields; no general XML conversion or match assembly is implemented |
| League / Team Captain | Added explicitly; not inferred from legacy Human XML |

The current [FAQ](https://bloodbowlbase.ru/bb2025/core_rules/latest_faq/) confirms
Human Tier 2 and removes Mutation from the Human Ogre's Secondary access. The
struck-out `M` on the roster is excluded. The FAQ also confirms the four-copy
Elite limit is per purchased skill, not an aggregate limit across all Elite skills.

## Supported content and validation

Two rosters: `human` and `orc`. Human positions are `lineman`, `halfling`,
`catcher`, `thrower`, `blitzer`, `ogre`. Orc positions are `orc-lineman`,
`goblin-lineman`, `orc-thrower`, `orc-blitzer`, `big-un-blocker`, `troll`.
The [Orc roster](https://bloodbowlbase.ru/bb2025/teams/Orc/) and its
[readiness record](../.notes/overhaul-analysis/m6-orc-content-readiness.md)
pin its costs, stats, skill access, starting traits and accepted sprite mapping.
All listed base skills are mandatory catalog facts, never client
claims. The [BB2025 definitions](../ffb-server/src/main/java/com/fumbbl/ffb/server/team/bb2025/SkillDefinitions.java)
cover all 72 learnable core skills and 36 core traits. The 36 traits are
cataloged as base-only and cannot be purchased. Human positions can legally
purchase 59 of the 72 skills under their current categories and prerequisites:
the twelve Mutation skills have no Human recipient, and Saboteur requires a
Secret Weapon starting trait that no Human position has.

Access is checked against each position's Primary/Secondary categories and
the source's prerequisites and incompatible starting skills. Block, Dodge,
Guard and Mighty Blow are Elite. A player cannot buy a skill already in their
base profile, including an Ogre's Mighty Blow. Unknown IDs fail explicitly.
The [Skills & Traits page](https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/)
supplies category semantics and Elite markings. Its HTML headings were inspected
because the text reader omits empty-alt Elite icons. Java's existing skill factory
supplies canonical names/categories; no gameplay skill effect is reimplemented.

The [drafting rules](https://bloodbowlbase.ru/bb2025/core_rules/drafting_a_blood_bowl_team/)
supply the 11–16 player range and resource limits. Resources are re-rolls (0–8),
assistant coaches (0–6), cheerleaders (0–6), apothecary (0–1), dedicated fans (0–3
for this exhibition preset). Costs are shown in the catalog. Fans start at zero
in Matched/Exhibition, unlike the league starting value of one.

[Exhibition](https://bloodbowlbase.ru/bb2025/core_rules/exhibition_play/) follows
[Matched drafting](https://bloodbowlbase.ru/bb2025/core_rules/matched_play/).
Human Tier 2 gets eight skill points; Primary costs one point, Secondary two,
with at most two Secondary purchases, one purchased skill per player, and at most
four purchases of each Elite skill. Purchased skills add no gold cost. Unspent
gold is lost; it is not treasury or an inducement allowance. The selected preset
supports a subset of purchases; it does not require spending exactly the budget.

The [Team Captain rule](https://bloodbowlbase.ru/bb2025/core_rules/the_teams/#team-captain)
permits a single optional non-Big-Guy captain and grants Pro without increasing
cost. The draft stores only the captain player ID; granted Pro is not a purchase
and cannot be purchased again. Frozen match conversion maps the captain to the
native Pro and Team Captain skills.

Content outside this catalog remains unsupported: other rosters; trait purchases;
star players; inducements; stat changes; injuries; league progression. Registering
an unused skill or trait does not prove its game effect or future roster mapping.
Parameterized traits such as Bloodlust, Animosity, Hatred and Loner still need
per-roster values and frozen conversion checks before those positions are added.
No future roster is activated by the skills registry alone.
