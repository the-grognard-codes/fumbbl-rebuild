# Fifth round: native checks and reroll chronology (T12)

The readable Game Log retains each native attempt in report order. It names the player, action/check, native base and adjusted d6 threshold, modifier, square/target where supplied, and authoritative outcome. A failed attempt remains distinct from a native turn-end or other consequence. Existing Debug, Movement and Roll modifiers controls apply to recorded history and new entries.

## Native family inventory

| Families | Authoritative presentation |
| --- | --- |
| Dodge, rush, pickup/Secure the Ball, pass and catch | Existing native stat/fixed bases, actual modifiers and square; pass accuracy/fumble comes from `passResult`. |
| Bone Head, Really Stupid, Take Root, Unchannelled Fury, Animal Savagery | Native confusion skill distinguishes 2+ and 4+ bases; assistance/action bonuses use the actual minimum, rather than AG. Animal Savagery retains its named native victim. |
| Blood Lust | Native skill value and actual action-adjusted minimum. |
| Jump, Jump Up, landing, interception and Safe Throw | Native agility base, typed modifiers and actual minimum. |
| Hypnotic Gaze, stand up, throw/kick team-mate | Native fixed bases of 3+, 4+, 2+, respectively; stand-up modifier and throw range are preserved. Team-mate accuracy/fumble comes from its report. |
| Tentacles and Shadowing | Native reaction owner and moving player are frozen separately; Tentacles uses 6+ with native ST difference, Shadowing 4+. |
| Other typed skill checks, including Animosity, Foul Appearance, Always Hungry, regeneration and star checks | Native minimum and typed modifiers supply a conditional base; no AG inference. Actual skill/report names and success remain visible. |
| Pro and Loner | Native roll mechanic/skill supplies thresholds. Pro's failed test, permitted test reroll and eventual original-roll reroll stay separate. Loner reports permission or denial. |
| Team and automatic skill reroll sources | Separate named source entry followed by the actual rerolled report. A source report is not presented as a fabricated d6 test. |
| Referee, bribes, argue-the-call, apothecary, injury, KO recovery and match events | Existing specialized native report wording remains intact. |

Optional version-1 `logRoll`, `logActors` and `logTest` facts decorate public command copies. They do not mutate the native reports, execute the engine, consume dice, or change retry identity/checkpoint formats. Strict decoders bound each metadata shape; legacy history lacking it remains readable without invented trait bases. Native reactions are tested at the engine/projection boundary; this slice does not add new browser reaction actions.

## Verification

Native accepted-session fixtures cover 28 activation cases across both coaches and eight follow-up sequences: trait team rerolls, automatic Dodge followed by pickup, pass/Catch, and original pickup → failed Pro → Team/Loner → successful Pro test reroll → successful pickup. Exact retries append nothing. Separate native reaction/projection checks cover Tentacles, Shadowing, stand up and fixed Hypnotic Gaze bases, including preservation of source reports.

64 unique native tests were selected: 62 pass and two optional MariaDB cases skip. 215 client tests pass, including all eight log settings combinations, chronological source/test attempts, incremental replay, legacy metadata omission and malformed optional facts. The browser renders all 36 accepted native cases, exercises settings/reload and checks page errors; existing log, manual reroll, accounting and playback journeys also pass. TypeScript and the site build pass.

The two exact reroll fixture guards were refreshed from native exports. A recursive comparison proves every prior field/value is unchanged, allowing additions only under `logRoll`, `logTest` and `logActors`; prior `logRoll` values are also unchanged. All six dice/reroll guards pass. Focused native regression coverage includes manual rerolls and checkpoint recovery; two optional MariaDB tests are skipped locally. Logs and four focused native Pro screenshots are in `.tools/t12-*` and `.tools/fifth-round-evidence/T12/`.

Independent Standards and Spec reviews precede publication. No deployment is included.
