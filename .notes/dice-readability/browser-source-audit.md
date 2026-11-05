# Browser dice source audit

Scope: browser adapters and presentation path only. This records what the browser currently recognizes; it is not a claim that this covers every BB2025 roll produced by the server. Server-side producers and reports need a separate cross-check before deciding to add adapters. Line references below point to the current checkout.

## Current non-block adapters

The parser is `browser-client/src/dice-presentation.ts`.

### Scalar D6 allowlist

For these report IDs, the parser accepts an integer `roll` from 1–6. It derives a display name from the report ID (with `goForItRoll` renamed Rush), appends `minimumRoll` as “N+ needed” when present, and appends success/failure only when native `successful` is boolean (`dice-presentation.ts:28-31,215-221`). It does not include roll modifiers or base target in the dice caption.

```text
goForItRoll, dodgeRoll, pickUpRoll, catchRoll, passRoll, leapRoll,
jumpUpRoll, rightStuffRoll, interceptionRoll, bloodLustRoll, confusionRoll,
hypnoticGazeRoll, throwTeamMateRoll, kickTeamMateRoll, standUpRoll, reRoll,
alwaysHungryRoll, animosityRoll, dauntlessRoll, foulAppearanceRoll,
regenerationRoll, bribesRoll, argueTheCall, chainsawRoll, spellEffectRoll,
dodgySnackRoll, steadyFootingRoll, teamCaptainRoll, gettingEvenRoll,
saboteurRoll, chompRoll, lookIntoMyEyesRoll, dwarfenWisdomRoll, escapeRoll,
allYouCanEat, balefulHex, breatheFire, catchOfTheDay, projectileVomit,
mascotUsed, oldPro, pickMeUp, thenIStartedBlastin, throwAtStallingPlayer,
thrownKeg, trapDoor, throwAtPlayer, biasedRef, tentaclesShadowingRoll
```

### Other non-block adapters

| Report ID / shape | Current dice display | Outcome data exposed to dice UI |
| --- | --- | --- |
| Any ID with `numericDice` | One or more labeled dice, if the payload validates. Supports `sides` 3, 6, 8, 16; 1–32 dice; integer face in range; label is producer-supplied, nonempty, max 100 chars. | Only injury/apothecary IDs interpret report outcomes. Other IDs retain labels and faces only. |
| `fanFactor` / `dedicatedFansRoll` | One D6, label “Fan factor”. | No outcome text/icon. |
| `injury` / legacy fields | D6 armor and injury arrays; casualty and decay-casualty arrays are D16 with later array entries treated as D6. Native `skipInjuryParts` suppresses stages. | `armorBroken` controls armor-broken icon; injury state classifies stun, KO, or casualty; casualty/serious-injury names and states classify bad hurt, miss next game, niggling injury, stat reduction, or dead. Apothecary has its own labels/state handling. See `dice-presentation.ts:45-63,179-201` and `dice-outcomes.ts:17-33`. |
| `apothecaryRoll` / legacy fields | Same legacy stage adapter; numeric metadata can instead provide labels and die sizes. | Uses authoritative `playerState` and serious-injury fields for casualty classification. |
| `scatterBall` / `rolls[]` | One or more D8s, each labeled “Ball scatter”. | No outcome semantics beyond the rolls. |
| `weather` / `weatherRoll[]` | One or more D6s, each labeled “Weather”. | No outcome semantics beyond the rolls. |
| `throwIn` / `distanceRoll[]` | One or more D6s, each labeled “Throw-in distance”. | No outcome semantics beyond the rolls. |
| `tentaclesShadowingRoll` / `tentacleRoll[]` | One or more D6s, each labeled “Reaction test”. | No outcome semantics beyond the rolls. |

The numeric parser maps a 3-sided die to `kind: 'd6'`, so current geometry/accessibility identifies it as a D6 even though its face value is 1–3 (`dice-presentation.ts:83-94`). Numeric D8/D16 are identified as such. `2d6` is not a separate die kind: it appears as two same-label D6 rolls and stays together as one group.

## Grouping, rerolls, and identity

`diceRollGroups` groups adjacent rolls with the same label, keeping their faces together; label changes split stages (`dice-presentation.ts:17-27`). Playback applies that grouping to each report, so armor, injury, casualty, and decay stages in one report can appear sequentially while two same-label dice stay simultaneous (`use-pitch-playback.ts:204-207`).

`reportedDice` retains the report ID, marks successful movement checks as continuous, and copies valid `rerolledIndexes` (`dice-presentation.ts:95-108`). `blockReRoll` has special support for the full post-reroll block pool. Reroll indexes affect which dice animate; other roll metadata such as scalar `reRolled` or `logTest.rerolled` is not copied into the dice moment (`dice-presentation.ts:95-119`). The Game Log separately describes rerolls and modifier details (`match-log.ts:112-138`).

## Live, replay, and recovery

Live playback and replay use `usePitchPlayback`; replay obtains event dice from `recordDice`, which scans each transcript record’s native `reportList.reports` (`dice-presentation.ts:227-238`, `HostedResult.tsx:113-138`). It does not reconstruct dice from state changes or event names. The replay compact summary is out of scope for this feature and currently filters out non-D6 dice (`HostedResult.tsx:121-138`).

On reconnect/recovery, playback restores the latest response dice result when available and intentionally does not replay its old animation/backlog (`use-pitch-playback.ts:86-103`). Missing transcript reports therefore mean no historical dice moment to restore from the record; a current offered block choice is separately reconstructed from authoritative actions, outside this non-block audit.

## Limits and safe wording proposals

- Numeric `label` is caller-supplied display text, not a normalized event identity. Unknown report IDs carrying `numericDice` can display their supplied label and faces, but the browser has no event icon identity or generally authoritative outcome mapping for them.
- Unknown/unsupported legacy reports without a supported parser shape produce no dice moment. `recordDice` requires native `reportList.reports` (`dice-presentation.ts:227-238`).
- Do not infer success from die faces. For known scalar checks, proposed short text is `Event · Success` / `Event · Failed` only when `successful` is present; omit result when absent. Current parser exposes no scalar reroll marker, modifier, or base target in the dice moment.
- For injury-family rolls, retain the current explicit outcome semantics; concise proposed text may use the existing outcome labels (“Armor broken”, “Stunned”, “Knocked out”, “Badly hurt”, “Miss next game”, “Niggling injury”, “Stat reduction”, “Dead”). These remain proposals for feature copy, not a reviewed catalog.
- For numeric rolls outside the injury family, show event identity and faces only unless the native report supplies an explicitly supported outcome field. Unknown identity: preserve the existing producer label if text is enabled and omit a new icon.
- The scalar allowlist is the browser’s recognized set, not proof every ID is currently emitted by BB2025 or that every BB2025 roll has an adapter. Compare against server producers before final inclusion/exclusion decisions.

## Source references

- `browser-client/src/dice-presentation.ts`: parsed moment shape, allowlist, report adapters, labels, native report scan.
- `browser-client/src/dice-outcomes.ts`: supported injury/casualty outcome classification.
- `browser-client/src/use-pitch-playback.ts`: live/replay sequencing and recovery restoration.
- `browser-client/src/HostedResult.tsx`: replay playback and compact summary behavior.
- `browser-client/src/match-log.ts`: richer target/modifier/reroll text already available in Game Log.
