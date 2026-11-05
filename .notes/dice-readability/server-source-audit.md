# Native roll source audit

Scope: repository BB2025 roll producers and serialized reports; paired with browser-source-audit.md. This inventory records implementation evidence, not a fresh rules interpretation. Report class names below resolve under `ffb-common/src/main/java/com/fumbbl/ffb/report/` or its `bb2025/` package. Producer names resolve under `ffb-server/src/main/java/com/fumbbl/ffb/server/`.

## D3 sources

| Event | Producer / report | Notes |
| --- | --- | --- |
| Pre-match fan factor | `step/bb2025/start/StepSpectators`, `DiceRoller.rollFanFactor`, `ReportFanFactor` | D3, although browser currently treats its face as D6 |
| Post-match dedicated fans | `step/bb2025/end/StepDedicatedFans`, `ReportDedicatedFans` | D3 for conceding team, D6 otherwise; team rolls/modifiers serialized |
| Solid Defence | kickoff steps, `ReportSolidDefenceRoll` | Count roll |
| Quick Snap | kickoff steps, `ReportQuickSnapRoll` | Count roll |
| Blitz | kickoff steps, `ReportBlitzRoll` | Count roll |
| Pitch Invasion | kickoff steps, `ReportKickoffPitchInvasion` | D3 count plus D6 team comparisons |
| Dwarfen Wisdom | `step/bb2025/kickoff/StepDwarfenWisdom`, `ReportDwarfenWisdomRoll` | D3 roll + permitted player count, not a success/failure test; browser scalar allowlist currently labels geometry D6 |
| Swarming | `StepSwarming`, `ReportSwarmingRoll` | D3 player-count roll |
| Riotous Rookies | `ReportRiotousRookies` | Two D3 faces and resulting amount |
| Kick distance with Kick | `StepKickoffScatterRoll`, `ReportKickoffScatter` | D3 when Kick used, otherwise D6; source numeric-dice decorator comment incorrectly implies distance is always D3 |
| Corner throw-in direction | catch/scatter/throw-in steps, scatter reports | Direction category must not be guessed from a low face value |
| Bad Habits prayer target count | `AbstractBadHabitsHandler` | Internal D3 selection count; face is not published as a die result |

## D6 checks and grouped dice

The current scalar report IDs and proposed names are exhaustively listed in inventory-review.md (49 IDs). Native sources include movement, catching, passing, landing, traits, skill tests, special actions, inducements and reroll access tests. `ReportSkillRoll` commonly provides `roll`, `minimumRoll`, `successful`, `reRolled`, and modifiers; other reports implement their own serialization. Do not assume every listed report inherits that base class or provides every field.

- Movement/action/skill classes: `ReportAllYouCanEatRoll`, `ReportAlwaysHungryRoll`, `ReportAnimosityRoll`, `ReportBalefulHexRoll`, `ReportBloodLustRoll`, `ReportBreatheFire`, `ReportCatchOfTheDayRoll`, `ReportCatchRoll`, `ReportChainsawRoll`, `ReportChompRoll`, `ReportConfusionRoll`, `ReportDauntlessRoll`, `ReportDodgeRoll`, `ReportEscapeRoll`, `ReportFoulAppearanceRoll`, `ReportGettingEvenRoll`, `ReportGoForItRoll`, `ReportHypnoticGazeRoll`, `ReportInterceptionRoll`, `ReportJumpRoll`, `ReportJumpUpRoll`, `ReportLookIntoMyEyesRoll`, `ReportPassRoll`, `ReportPickupRoll`, `ReportProjectileVomit`, `ReportRegenerationRoll`, `ReportRightStuffRoll`, `ReportSaboteurRoll`, `ReportStandUpRoll`, `ReportSteadyFootingRoll`, `ReportTentaclesShadowingRoll`, `ReportThrowTeamMateRoll`.
- Other D6-associated reports: `ReportReRoll`, `ReportMascotUsed`, `ReportTeamCaptainRoll`, `ReportOldPro`, `ReportSpecialEffectRoll`, `ReportThrowAtPlayer`, `ReportThrowAtStallingPlayer`, `ReportTrapDoor`, `ReportDodgySnackRoll`, `ReportBribesRoll`, `ReportArgueTheCallRoll`.
- Traits sharing `ReportConfusionRoll`: Animal Savagery, Bone Head, Really Stupid, Take Root, Unchannelled Fury; each has a `skillbehaviour/bb2025/*Behaviour` producer and supplies `confusionSkill`.
- `ReportTentaclesShadowingRoll` is a scalar D6 in current BB2025, supplies `skill` and `successful`. The browser's array form is a compatibility path.
- `ReportSpecialEffectRoll` uses wire ID `spellEffectRoll` and a `specialEffect` discriminator. `SpecialEffect` defines Lightning, Fireball, Zap, Bomb. Use that identity rather than calling every special effect a spell.
- `ReportPassRoll` supplies test success independently of `PassResult`; flight result is Accurate, Inaccurate, Wildly inaccurate, Fumble, or Saved fumble. Later result-changing effects must not be mistaken for the original test.
- Weather: `ReportWeather` and `ReportWeatherMageRoll`, 2d6. Weather Mage result is separately reported.
- Kickoff: `ReportKickoffResult` 2d6; `ReportKickoffExtraReRoll`, `ReportCheeringFans`, `ReportKickoffPitchInvasion` team D6 comparisons; `ReportKickoffDodgySnack` and `ReportDodgySnackRoll` carry snack-related results.
- Foul/turn-end: `ReportSecretWeaponBan` 2d6; bribe and argue-the-call checks D6.
- Post-match: `ReportPenaltyShootout`, `ReportDefectingPlayers`, `ReportDedicatedFans` carry D6 results (dedicated-fans concession exception above).
- Master Chef: `ReportMasterChefRoll` has three D6 rolls; include in review although user listed 2d6 rather than 3d6.
- Punt and Swoop: `ReportPuntDirection`, `ReportPuntDistance`, `ReportSwoopDirection` carry D6 direction/distance facts. `ReportSwoopPlayer` records movement result rather than an explicitly typed raw die.
- Armor and injury: `ReportInjury` has 2d6 arrays and authoritative state/skip flags. Apothecary and casualty details below.

## D8 and D16

- `DiceRoller.rollScatterDirection()` supplies eight-direction rolls for kickoff, loose-ball bounce/scatter, missed passes, bombs, thrown players and Ball & Chain movement. Values appear in `ReportKickoffScatter`, `ReportScatterBall`, or `ReportScatterPlayer`, with context-dependent direction/distance and scatter flags.
- Correction during implementation: `scatterPlayer` contains D8 directions even when `isScatter=false`; it is not a direction/distance pair. Kickoff is the actual Deviation source. The user approved adding its D6/D3 distance beside the D8 direction, with explicit optional die-type metadata and no change to mechanics. See the implementation-audit correction in `inventory-review.md`.
- Active BB2025 casualty producer is `RollMechanic.rollCasualty`: D16 + D6, serialized through `ReportInjury` and `ReportApothecaryRoll`. Decay and apothecary repeat casualty stages. Existing browser parser splits stat detail only when native serious-injury facts identify it.
- `DiceRoller.rollCasualtyRenamed()` contains D6+D8 but has no active callers in the audit; exclude this unused legacy path from BB2025 asset requirements.

## Nonliteral and unreported randomness

- Prayer selection: `StepPrayers` shuffles/removes entries from `availablePrayerRolls`; `StepPrayer` publishes a selected index via `ReportPrayerRoll`. Do not animate that index as a new literal D16 roll without an explicit design decision. Bad Habits' internal D3 is separate.
- Overtime special kickoff selection: `StepKickoffResultRoll` can roll a D6 to select an entry, then report a synthetic 2d6 pair representing the chosen kickoff result. Do not misrepresent it as two physically rolled dice.
- Random player/card/coordinate selections are internal selection randomness, not necessarily published rule dice. No automatic new dice displays proposed.
- Some report classes inherit `NoDiceReport` despite carrying actual roll arrays (weather, injury, casualty and scatter examples). Dice statistics inheritance is not a sufficient inventory filter.
- Legacy wrapper methods without matching active callers are not independent current events. Production callers and report content, not method names alone, determine scope.

## Evidence entry points and limitations

Inspect `DiceRoller.java`, `mechanic/bb2025/RollMechanic.java`, `match/NumericDicePresentation.java`, `match/NativeRollPresentation.java`, `skillbehaviour/bb2025/`, `step/bb2025/{move,pass,shared,ttm,block,kickoff,start,end}/`, injury types and prayer handlers. Wire identities are in `ffb-common/.../report/ReportId.java`; report serialization defines available outcome facts.

This is a static source audit, not runtime coverage proof of every variant. Optional/legacy branches and special-action report identities require focused fixtures when included. Missing public die metadata is recorded as a review decision rather than inferred from observed face values.
