# M6 Orc roster and skill combination readiness

Status: **Orc source facts, catalog, validation, saved-team, match conversion, browser builder and sprite bindings are implemented on `codex/m6-orc-content`; release and live checks remain pending.** Source read on 2026-09-24 and rechecked on 2026-09-25 America/New_York. The replacement catalog is `bb2025-exhibition-2026-09-25.1`, shared by Human and Orc teams with preset `exhibition-1150`. The owner has authorized clearing all account saved teams, including older unusable drafts, when the replacement catalog is activated; saved-team migration is outside this slice.

## Accepted sprite pack and roster binding

The owner accepted `.notes/art-preview/orcs-team-64px-chibi-v1/` for this roster on 2026-09-25. The same 16 exported PNGs already exist at `browser-client/public/preview/orcs-64px-chibi-v1/`; `site/scripts/build.mjs` copies them to the site's Orc team sprite assets. The pack's `manifest.json` describes image dimensions and bounds, not roster rules. The Troll is 80x80 pixels; all other canvases are 64x64. Bind roster positions to filenames in roster content so the browser can render variants without defining gameplay facts:

| Orc position ID | Sprite filenames in accepted pack |
| --- | --- |
| `orc-lineman` | `08-line-orc-man.png` through `13-line-orc-woman.png` |
| `goblin-lineman` | `14-goblin-man.png` through `16-goblin-woman.png` |
| `orc-thrower` | `06-thrower-man.png`, `07-thrower-woman.png` |
| `orc-blitzer` | `02-blitzer-man.png`, `03-blitzer-woman.png` |
| `big-un-blocker` | `04-big-un-man.png`, `05-big-un-woman.png` |
| `troll` | `01-troll-man.png` |

The Java `RosterCatalog` now holds position limits, prices, stats, role/race tags, starting skills with values, and skill-category access. It validates skill mappings against the BB2025 factory. Browser sprite mappings bind the accepted pack to positions; saved teams record choices, and match teams freeze resolved facts. A single roster manifest that also includes sprite references remains a future consolidation.

## Pinned source facts

The project owner selected Blood Bowl Base BB2025 as the rules source for the Human catalog. The [Orc roster](https://bloodbowlbase.ru/bb2025/teams/Orc/) supplies these six positions and the 60,000-gold re-roll. The [May 2026 FAQ](https://bloodbowlbase.ru/bb2025/core_rules/latest_faq/) changes the Goblin Lineman's PA from 3+ to **4+** and lists Orc as Tier 2. `AG`, `PA`, and `AV` below are target numbers, not converted legacy ratings. `G/A/S/P/D` mean General/Agility/Strength/Passing/Devious access.

| Position (candidate ID) | Max | Cost | MA/ST/AG/PA/AV | Base skills and parameters | Primary / Secondary |
| --- | ---: | ---: | --- | --- | --- |
| Orc Lineman (`orc-lineman`) | 16 | 50,000 | 5/3/3+/4+/10+ | none | GS / AD |
| Goblin Lineman (`goblin-lineman`) | 4 | 40,000 | 6/2/3+/4+/8+ | Dodge, Right Stuff, Stunty | AD / GPS |
| Orc Thrower (`orc-thrower`) | 2 | 75,000 | 6/3/3+/3+/9+ | Pass, Sure Hands | GP / ASD |
| Orc Blitzer (`orc-blitzer`) | 2 | 85,000 | 6/3/3+/4+/10+ | Block, Break Tackle | GS / AD |
| Big Un Blocker (`big-un-blocker`) | 2 | 95,000 | 5/4/4+/6+/10+ | Mighty Blow (+1), Taunt, Thick Skull, Unsteady | GS / AD |
| Troll (`troll`) | 1 | 115,000 | 4/5/5+/5+/10+ | Always Hungry, Loner (4+), Mighty Blow (+1), Projectile Vomit, Really Stupid, Regeneration, Throw Team-Mate | S / AGP |

The Orc roster also declares Badlands Brawl, Brawlin' Brutes, Team Captain, an apothecary at 50,000, assistant coaches and cheerleaders at 10,000 each. The [team special rule](https://bloodbowlbase.ru/bb2025/core_rules/the_teams/#brawlin-brutes) changes SPP from casualties and touchdowns **during League Play**. The exhibition preset does not grant progression. One optional non-Big-Guy captain gains Pro under [Team Captain](https://bloodbowlbase.ru/bb2025/core_rules/the_teams/#team-captain). The existing 1,150,000-gold budget remains a project exhibition preset, not a roster rule.

Orc is Tier 2 under the FAQ, so the [Matched Play rules](https://bloodbowlbase.ru/bb2025/core_rules/matched_play/) give it eight skill points, up to two Secondary purchases, one purchased skill per player, and at most four copies of each Elite skill. [Exhibition Play](https://bloodbowlbase.ru/bb2025/core_rules/exhibition_play/) uses Matched drafting. The full registry now holds all 72 learnable core skills and 36 non-purchasable traits; Orc eligibility must be derived from each position's categories, base skills and source prerequisites. Star players, inducements and progression remain outside this slice.

## Declared acceptance tests for enabling this set

1. Pin an immutable Orc wire fixture containing every position, base skill, parameter and resource, with the shared 108-entry skill and trait registry. Assert the Java projection and browser decoder match it. Verify the Human roster in the replacement catalog; no migration of saved Human team documents is required.
2. Accept at least these combinations with server validation, save/load, and create/join revalidation: Orc Lineman + Block (Primary), Orc Lineman + Dodge (Secondary), Goblin Lineman + Tackle (Secondary), Orc Thrower + Block (Primary), Big Un Blocker + Dodge (Secondary), Troll + Block (Secondary). A simple 11-Lineman Orc team with two re-rolls and one apothecary costs 720,000 gold.
3. Reject a third Orc Thrower, third Big Un Blocker, second Troll, fifth Goblin Lineman, Troll captain, Orc Lineman + Pass (no P access), Orc Blitzer + Block and Orc Thrower + Pass (duplicate base skills), ninth Primary point, third Secondary purchase, fifth Elite Block purchase, and budget overrun.
4. Freeze Orc skill names and parameters into a match, restart at a pending decision, and verify native Orc actions and prompts. Check Human versus Orc as well as same-roster matches if the exhibition preset permits both; the current match compatibility check requires an identical catalog and preset version.
5. At activation, back up and clear account saved teams under the owner's authorization, including older unusable drafts. Verify the builder starts from an empty saved-team list and new Human and Orc teams can be saved. Keep previously frozen Human matches and result/replay metadata readable across the catalog change; saved-team deletion must not alter their frozen rosters.

The focused `OrcContentMappingTest` verifies that all 17 Orc base skill names resolve with expected categories in the BB2025 engine factory and that the Brawlin' Brutes identifier exists. The catalog, service, browser and native setup tests added for activation cover the remaining data path; the complete release verification and hosted gameplay checks are recorded separately.

Verification: the focused Java 21 Maven reactor command below passed with **1 test, 0 failures/errors/skips**. The first Java 8 attempt encountered Java 21 output already in `ffb-server/target`; the sandboxed Java 21 retry could not close a cached Netty JAR. The same offline Java 21 command passed with the required filesystem access. No clean build or integrated Orc match was run for this source and mapping slice.

```powershell
& ./.tools/apache-maven-3.9.9/bin/mvn.cmd --batch-mode --no-transfer-progress --settings .mvn/settings.xml --global-settings .mvn/settings.xml '-Dmaven.repo.local=.tools/repository' --offline -pl ffb-server -am '-Dtest=OrcContentMappingTest' '-Dsurefire.failIfNoSpecifiedTests=false' test
```

## Integration gates found during the source audit

- `RosterCatalog`, `TeamValidation`, `BrowserTeamJson`, the browser decoder and editor, and `SavedTeamService` assume one Human catalog. The catalog request has no roster selector. A replacement catalog needs explicit roster selection and a new catalog version. Saved-team migration is unnecessary because account saved teams may be cleared at activation; the data reset is a release step, not part of this source audit.
- `FrozenTeamEngineConverter` now maps every core skill ID, including Mutation access, but its frozen parameter check still assumes Human Loner 3+. Orc Troll requires Loner 4+ and additional base skills. Frozen parameters must be checked per resolved roster fact, not from a Human-wide constant.
- `MatchJson` accepts only the Human roster, while match pairing requires matching catalog and preset IDs. Result metadata decoding also fixes the Human version. These need explicit compatible-version policy and tests before cross-roster play.
- The engine contains the Orc base skill classes and Brawlin' Brutes identifier, but a factory mapping check is only the first level of verification. Native gameplay scenarios for Taunt, Unsteady, Really Stupid, Projectile Vomit and Throw Team-Mate remain required before public support.

This content work is independent of the M5 renderer comparison. The release requires a fresh package, account saved-team backup and clearing, backend and Hosting deployment in both environments, and live account and match checks. It requires no changes to the in-progress parity preview files.
