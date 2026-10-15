# Numeric dice presentation inventory

Implementation reference for [the approved feature](polygon-numeric-dice-feature-request.md).

## Native reports and dice types

The browser identifies dice from the report and field contract. Values alone never select a die type. The following scalar `roll` reports contain an individual D6; only integer results from 1 through 6 are rendered.

| Family | Report IDs | Decisions and grouping |
| --- | --- | --- |
| Movement and ball handling | `goForItRoll`, `dodgeRoll`, `pickUpRoll`, `catchRoll`, `passRoll`, `leapRoll`, `jumpUpRoll`, `rightStuffRoll`, `interceptionRoll`, `safeThrowRoll`, `throwTeamMateRoll`, `kickTeamMateRoll`, `standUpRoll`, `escapeRoll` | Preserve native action/skill/team rerolls. Successive individual D6s for the same acting player accumulate in order, with separate labels and animation keys. |
| Traits and reaction tests | `bloodLustRoll`, `confusionRoll`, `hypnoticGazeRoll`, `alwaysHungryRoll`, `animosityRoll`, `dauntlessRoll`, `foulAppearanceRoll`, `regenerationRoll`, `tentaclesShadowingRoll` | Native choices remain authoritative. Modern Tentacles/Shadowing uses scalar `roll`; its legacy report uses the separate two-D6 `tentacleRoll` array. |
| Reroll tests | `reRoll` | Only a positive, valid raw D6 becomes artwork. Pro stays separate from the original action; after an action reroll appears, the earlier Pro test cannot replace that newer result. |
| Officials and kickoff effects | `bribesRoll`, `argueTheCall`, `officiousRefRoll`, `kickoffRiot`, `biasedRef`, `mascotUsed` | Retain offered native choices. No new decisions or automatic resource use. |
| Skills and special effects | `chainsawRoll`, `weepingDaggerRoll`, `cardEffectRoll`, `spellEffectRoll`, `dodgySnackRoll`, `steadyFootingRoll`, `teamCaptainRoll`, `gettingEvenRoll`, `saboteurRoll`, `chompRoll`, `lookIntoMyEyesRoll`, `dwarfenWisdomRoll`, `allYouCanEat`, `balefulHex`, `breatheFire`, `catchOfTheDay`, `projectileVomit`, `bombExplodesAfterCatch`, `oldPro`, `pickMeUp`, `thenIStartedBlastin`, `throwAtStallingPlayer`, `thrownKeg`, `trapDoor`, `throwAtPlayer` | The same scalar D6 contract and native decision handling apply. Report totals and effect counts are not faces. |

Grouped and directional reports require the following separate mappings.

| Report and field | Dice | Native source or interpretation |
| --- | --- | --- |
| `scatterBall.rolls` | D8 per entry | `DiceRoller.rollScatterDirection()` uses `DirectionDiceCategory`; these are raw rolls, not transformed direction enums. |
| `weather.weatherRoll` | D6 per entry | Native `rollWeather()` returns two D6s. |
| `throwIn.distanceRoll` | D6 per entry | Native throw-in distance retains its individual D6s. Direction is omitted because corner throw-ins can use D3 and the public report does not identify that variant. |
| Legacy `tentaclesShadowingRoll.tentacleRoll` | D6 per entry | BB2016 reports retain both raw dice. Modern reports have the scalar D6 field instead. |
| `injury.armorRoll`, `injury.injuryRoll` | D6/D6 per group | Optional native presentation metadata honors `SkipInjuryParts` so repeated injury stages do not re-present omitted groups. |
| `injury.casualtyRoll`, `injury.casualtyRollDecay`, `apothecaryRoll.casualtyRoll` | BB2016: D6/D8; BB2020 and BB2025: D16/D6 | The native `RollMechanic` determines the pair, including when both values are below seven. Decay retains its own group label. Older reports without type metadata keep their text; casualty dice are omitted rather than guessed. |
| `kickoffScatter.rollScatterDirection` | D8 | Optional native metadata preserves the raw directional die. |
| `kickoffScatter.rollScatterDistance` | BB2016/BB2020: D6; BB2025: D3 omitted | Native metadata supplies the supported distance die only. Existing Kick/deviation markers and choice behavior remain intact. |
| `scatterPlayer.rolls` with `isScatter: true` | D8 per entry | Native metadata identifies actual player scatter. Other uses of this report are not inferred from a low value or a direction enum. |
| `blockRoll`, `blockReRoll`, `blockChoice` | Existing marked block cubes | Preserve the native six-face map, signed preview count, chooser, selected die, uphill warning, and exact offered action IDs. |

`NumericDicePresentation` decorates only the public report copy. It neither generates outcomes nor changes native report objects or gameplay. The optional field has this shape:

```json
{
  "numericDice": {
    "version": 1,
    "dice": [
      { "sides": 16, "value": 3, "label": "Casualty" },
      { "sides": 6, "value": 2, "label": "Casualty" }
    ]
  }
}
```

The browser accepts 6, 8, or 16 sides, validates each face, and preserves group order and labels. Missing, malformed, unsupported, or future-version presentation data yields no guessed die artwork; event text and native decisions remain available. Existing transcripts need no migration.

## Display surfaces and motion

| Surface | Behavior |
| --- | --- |
| Live pitch and numeric reroll choices | Physical D6/D8/D16 dice share `PolygonDie` with block cubes. D6 uses fixed pips with opposite faces totaling seven. D8 and D16 use closed bipyramids with fixed numeric faces and inverse landing rotations. |
| Original action and Pro test | Separate rows and identities preserve chronology. Typed face choices select the numeric variant explicitly. New choices and late transcripts do not restart an unchanged die. |
| Observers and main replay pitch | Same native results and types, through the body portal. Read-only viewers receive no action controls. Explicit replay seeks retain existing replay behavior. |
| Reconnect snapshot | Restores the pending numeric result without starting its old roll again. Newly received later revisions can still animate. |
| Required decision dialogs | Face-bearing options use the shared renderer in static mode. Existing modal shells, apothecary choices, and nonmodal Kick/follow-up behavior remain intact. |
| Event-log glyphs | Existing compact static `DiceFace` artwork remains unchanged. |
| Secondary replay summary | Keeps its existing compact block/D6 artwork. New D8/D16 groups are presented on the main pitch rather than sent to a renderer that cannot represent them. |

One shared motion lifecycle handles previews, pending native responses, actual results, and reduced motion. Only a new native result starts the 310 ms roll. Its two opposing diagonal half-turns overlap, then settle head-on without changing markings. Preview animation continues across confirmation. Animation does not send actions, delay available input, or alter movement timing. Result retention and group spacing are independent of that motion lifecycle.

Numeric pitch surfaces reuse the existing diffuse backing and icon styling. The primary dice row aligns at 65% of window width and vertical center, clamped to visible pitch/window bounds. Empty space remains click-through, and numeric failures do not acquire the block uphill warning.

## Deliberate exclusions

- D3 reports and counts, including kickoff activation counts, extra reroll counts, and BB2025 kick distance, do not become D6 merely because their value is at most six.
- Prayer table selections, modified totals, casualty codes, direction enums, and unknown report IDs are not treated as individual dice.
- Player-scatter report variants without an explicit supported type contract retain their existing text and movement presentation.
- No non-block potential-roll forecasts, gameplay changes, new reroll eligibility, or server-side random generation were added.

## Verification references

- Native `NumericDicePresentationTest` covers BB2016, BB2020, BB2025, omitted injury stages, and D3 kick-distance exclusion. Its optional `FFB_NUMERIC_DICE_FIXTURE` export produces `browser-client/test/fixtures/numeric-dice.json` from native report serializers.
- `dice-ui.mjs` invokes `numeric-dice-checks.mjs` within the registered suite. It checks all 30 numeric outcomes, fixed faces, landing continuity, 310 ms duration, per-die identity, appended action dice, Pro choices, pending guards, reduced motion, both coaches/cameras, responsive bounds, and native-exported D8/D16 reports.
- `playback-ui.mjs` covers reconnect restoration with a pending numeric result and keeps the existing chronology, retention, movement, and block checks.
- Hosted Play and replay tests exercise typed native numeric results through the actual built client and transcript transport.
- Visual evidence is retained under `.notes/polygon-dice-evidence/`, including `numeric-1440-home-perspective.png` and the corresponding away, top-down, and 390 px viewport captures.

## Validation results

| Check | Result |
| --- | --- |
| Browser unit suite | 288 passed |
| Site unit suite | 12 passed |
| Registered interaction inventory | All 32 scripts passed, including the corrected shared-surface assertion and native Pro phase journeys |
| Hosted browser inventory | All 19 checks passed across 10 suites against the final site build |
| Browser and site production builds | Passed, including the repository's supported TypeScript target |
| Full Java 21 verification | All Maven modules passed; the 44 native suites contained 254 cases, with 247 passed and seven existing opt-in skips |
| Native coverage validators | All four validated the actual full-run XML against the complete inventory and exact allowed-skip reasons; 12 validation-tool regression checks also passed |

Browser report copies and the checked inventory summary are in `.notes/polygon-dice-validation/`. Full logs are in `.notes/polygon-dice-*.log`.

The final Pro checks cover both directions of the lifecycle: a fresh native test animates once, while restoring the same prompt without a fresh moment remains static. A block reroll announcement preserves Pro during selective die choice; a subsequent numeric action result replaces the completed test. Skill IDs without a `Roll` suffix retain their original D6 through the same typed report lookup.

Visual evidence covers both coaches and both cameras in Windows Chrome at 1440 and 390 px viewport widths. Desktop and mobile-sized samples were inspected. Actual Android and Linux browser/device sessions were not run. Browser journeys use native-exported fixtures and controlled transports; the native engine is verified separately by the Java suite.

## Visual-review follow-up: roll pacing and D16 overflow

- Ordinary groups now stay visible for 1,200 ms each, with at least 350 ms between group arrivals. `DiceStream` owns only decorative timers; board playback and native decisions do not wait for it. These presentation intervals stay readable at replay speed changes and with reduced motion.
- Contiguous native die labels define simultaneous groups within a report: Armour's two D6 arrive together, followed by Injury's two D6, then any Casualty pair. Reports retain their original order. Visible captions explain the stage; stable group keys prevent surviving dice from remounting or rerolling when an earlier group expires.
- Required roll choices immediately replace the backlog and retain their result until resolved. Reconnects, match changes and replay seeks clear queued arrivals and expiry timers. Animated replay does not resurrect expired groups through its static fallback; snapshot inspection and Skip animations retain static results.
- D16 face planes have invisible rectangular bounds larger than the visible triangular faces. Those transformed rectangles previously enlarged the scroll area during a tumble. A non-flattening paint clip around each die, with space for vertices, shadows and preview drift, now contains that overflow. Content padding accommodates the paint margin while genuine long choice lists still scroll.
- This improvement is enabled now. Future player/action animations can coordinate with the same native report order without changing dice outcomes, choices or the board's authoritative state. No player movement animation was added in this follow-up.
- Regression entry points: `node browser-client/test/dice-stream-checks.mjs` (also included by registered `playback-ui.mjs`), `dice-stream.test.ts`, existing dice/choice/route interaction suites, and the hosted completed-replay journey. The controlled browser check samples all 16 D16 results at seven motion frames in both 1440 px and 390 px viewports, then checks group spacing, individual expiry, stable DOM, mandatory-choice priority, reconnect, replay seek and reduced motion.
- Follow-up verification passed: 290 browser unit tests, 12 site unit tests, all 32 registered interaction scripts, and 19 hosted checks across 10 suites, plus browser/site production builds and the exact browser coverage gate. Reports are in `.notes/dice-pacing-validation/`; logs are `.notes/dice-pacing-*.log`. Two brief-window preview checks were made deterministic after the broad run exposed timing sensitivity; the hosted numeric assertion now permits an older group to finish its independent lifetime. Affected suites passed on rerun.
- New inspected captures: `.notes/polygon-dice-evidence/d16-no-scrollbar-{1440,390}.png` and `armour-injury-stream-{1440,390}.png`. Validation used Windows Chrome; actual Android/Linux sessions were not run. This browser presentation follow-up did not change native dice generation; the initial feature's full Java verification above was not repeated.
