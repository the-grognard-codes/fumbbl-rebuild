# Non-block dice inventory and wording review

Status: reviewed with user selections below and confirmed clarifications at the end. Tracks #449 under #448. Samples approved with Catch v3; remaining icons delivered for integration.

This review combines the [browser adapter audit](browser-source-audit.md) and the [server source audit](server-source-audit.md). A recognized report shape does not mean every variant currently produces visible dice. See the coverage gaps below before approving inclusion.

## Decisions requested

1. Mark excluded events or families. Default proposal: improve existing on-pitch roll displays; do not silently add new dice animations for missing adapters. Deviation is explicitly requested but currently needs a display-coverage decision.
2. Approve or edit event names and result wording below. Every name is a proposal. `Success / Failed` means append that result only when the native report explicitly supplies test success; absence means event name only.
3. For pass and throw-team-mate, prefer the native descriptive result (such as Accurate, Inaccurate, Fumble) over flattening it to Success / Failed. This is a wording proposal, not an approved change.
4. Direction/scatter/distance rolls: propose event-only captions; dice already show values. Do not invent binary outcomes.
5. Generic skill reports: use the skill/event discriminator, not the internal report ID. Review any missing discriminator as a metadata gap.

## Currently recognized scalar report families

All rows below use the current scalar D6 adapter when a valid `roll` is present. This is parser coverage, not a claim that every producer is active or physically rolls a D6: Dwarfen Wisdom is actually D3. Shared reports need distinct event/icon identities; rerolls retain the event icon and append `(reroll)` to text when authoritatively marked.

| Report ID | Proposed event text / icon identity | Proposed resolved text |
| --- | --- | --- |
| `goForItRoll` | Rush | Success / Failed |
| `dodgeRoll` | Dodge | Success / Failed |
| `pickUpRoll` | Pick up | Success / Failed |
| `catchRoll` | Catch | Success / Failed |
| `passRoll` | Pass / Throw Bomb / Hail Mary Pass / Hail Mary Bomb | Accurate / Inaccurate / Fumble / Recovered Fumble {yes, distinguish between the different pass and hail mary pass rolls, I only know of those four.  Wildly Innacurate was removed from BB2025, it can remain in the code without issue for now.  Hail Mary pass/bombs cannot be accurate by definition, just a callout.  I am assuming Saved fumble is for safe hands?  I would revise it to Recovered Fumble } |
| `leapRoll` | Jump; use Leap only when the event identifies it {Agree}| Success / Failed |
| `jumpUpRoll` | Jump Up | Success / Failed |
| `rightStuffRoll` | Landing | Success / Failed |
| `interceptionRoll` | Interception | Success / Failed |
| `bloodLustRoll` | Bloodlust {this is one word} | Success / Failed |
| `confusionRoll` | Named trait from `confusionSkill`: Bone Head, Really Stupid, Animal Savagery, Take Root, Unchannelled Fury {Yes, we should present the `confusionSkill` name and have icons specific to each | Success / Failed |
| `hypnoticGazeRoll` | Hypnotic Gaze | Success / Failed |
| `throwTeamMateRoll` | Throw Team-mate | Native flight result where available; otherwise explicit Success / Failed |
| `kickTeamMateRoll` | Kick Team-mate | Native result where available; otherwise explicit Success / Failed |
| `standUpRoll` | Stand up | Success / Failed |
| `reRoll` | Pro / Loner / named rolled reroll source; not every reroll use rolls a die | Success / Failed |
| `alwaysHungryRoll` | Always Hungry | Success / Failed |
| `animosityRoll` | Animosity | Success / Failed |
| `dauntlessRoll` | Dauntless | Success / Failed |
| `foulAppearanceRoll` | Foul Appearance | Success / Failed |
| `regenerationRoll` | Regeneration | Success / Failed |
| `bribesRoll` | Bribe | Success / Failed |
| `argueTheCall` | Argue the Call | Success / Failed |
| `chainsawRoll` | Chainsaw | Success / Failed |
| `spellEffectRoll` | Lightning / Fireball / Zap / Bomb from `specialEffect` {Yes, distinguish the icon and text based on the `specialEffect`}; otherwise retain existing label | Success / Failed |
| `dodgySnackRoll` | Dodgy Snack | Success / Failed |
| `steadyFootingRoll` | Steady Footing | Success / Failed |
| `teamCaptainRoll` | Team Captain | Success / Failed |
| `gettingEvenRoll` | Getting Even | Success / Failed |
| `saboteurRoll` | Saboteur | Success / Failed |
| `chompRoll` | Chomp | Success / Failed |
| `lookIntoMyEyesRoll` | Look Into My Eyes | Success / Failed |
| `dwarfenWisdomRoll` | Dwarfen Wisdom (physical D3) | Event only, or approved native player-count wording; no boolean test |
| `escapeRoll` | Escape | Success / Failed |
| `allYouCanEat` | All You Can Eat | Success / Failed |
| `balefulHex` | Baleful Hex | Success / Failed |
| `breatheFire` | Breathe Fire | Success / Failed |
| `catchOfTheDay` | Catch of the Day | Success / Failed |
| `projectileVomit` | Projectile Vomit | Success / Failed |
| `mascotUsed` | Mascot | Success / Failed |
| `oldPro` | Old Pro | Success / Failed |
| `pickMeUp` | Pick-me-up | Success / Failed |
| `thenIStartedBlastin` | Then I Started Blastin' | Success / Failed |
| `throwAtStallingPlayer` | Stalling throw | Success / Failed |
| `thrownKeg` | Thrown Keg | Success / Failed |
| `trapDoor` | Trap Door | Success / Failed |
| `throwAtPlayer` | Throw at player | Success / Failed |
| `biasedRef` | Biased Referee | Success / Failed |
| `tentaclesShadowingRoll` | Tentacles / Shadowing, selected by native `skill` | Success / Failed from the named skill's perspective |

## Existing grouped and outcome displays

| Source / report | Dice | Proposed event text | Proposed outcome wording / grouping |
| --- | --- | --- | --- |
| `weather` | 2d6 | Weather | Sweltering Heat / Very Sunny / Nice / Pouring Rain / Blizzard, from native weather enum |
| `scatterBall` | d8 list | Ball scatter (or Bounce where authoritatively distinguished) {If we can capture east/west/etc we should do so and turn that into an icon, if not we can just present a crosshaird direction icon and then list the text} | Event only; preserve grouping |
| `throwIn` distance | 2d6 | Throw-in distance | Event only; direction is a separate currently absent display |
| `kickoffScatter` numeric direction | d8 | Kick direction  | Event only; current numeric producer omits distance (d3 with Kick, d6 otherwise) |
| `scatterPlayer` numeric scatter | d8 list | Player scatter | Event only; current numeric producer omits deviation |
| `fanFactor` | Physical d3, currently displayed with d6 geometry | Fan factor | Pre-match count event; no Success / Failed. Post-match Dedicated fans is a separate report below |
| `injury` armor stage | 2d6 | Armor {Preserve our animated graphics, revise the text to what is here if it isn't already}| Broken / Held when authoritative `armorBroken` is present |
| `injury` injury stage {Preserve our animated graphics, revise the text to what is here if it isn't already} | 2d6 | Injury | Stunned / Knocked out / Casualty, from native injury state |
| `injury` casualty stage | d16 + d6 in native roll array {I believe the extra d6 roll here is a legacy BB2020 or BB2016 aspect.  BB2025 only uses a single d16 for determining casualty category, decay adds +1 to the roll, as does every niggling injury } | Casualty | Badly Hurt! / Miss Next Game! / Niggling Injury! / Stat Reduction! / Dead, from native result |
| `injury` stat-detail stage | d6 when split by current parser | Stat Reduced | {If we can pull the descriptive name such as "Head Injury (-1 AV)" that is ideal} Named stat reduction if available; otherwise Stat reduction |
| `injury` decay stages | d16 + d6 { I don't believe this is needed in BB2025 ruleset, please review and confirm, but no need to explicitly remove logic for it at this time. } | Decay casualty / Decay serious injury | Same native casualty result vocabulary |
| `apothecaryRoll` | Native injury/casualty arrays, skip flags respected | Apothecary casualty / Apothecary serious injury (and other emitted stages) {the heading for this should be "Apothecary Result"} | Same native result vocabulary; preserve existing stage ordering |
| Legacy `tentacleRoll[]` | d6 list | Named reaction if identifiable; otherwise existing text | No guessed result; compatibility fallback only |
| Other valid `numericDice` | Explicit sides 3/6/8/16 | Existing supplied label unless identity is known | No invented icon/outcome; preserve current fallback |

## Additional server sources and absent display coverage

These are explicitly inventoried for exclusions. Except rows marked partial, the current browser parser has no dedicated adapter for these report IDs. Proposed default is defer new animations until explicitly included; all text remains proposed.

| Event / wire report | Physical dice or reported data | Proposed label/result if included | Current gap / decision |
| --- | --- | --- | --- |
| Deviation / `scatterPlayer` with non-scatter flag | d8 + d6 | Deviation; event only | Explicit sample requested; numeric decorator currently excludes this case |
| Kick distance / `kickoffScatter` | d3 with Kick, d6 otherwise | Kick distance | Partial: direction only displayed; do not infer die size from face |
| Throw-in direction / scatter reports | d3 at corners; context-specific direction elsewhere | Throw-in direction | Partial: ordinary throw-in distance already displayed |
| Ball & Chain / `scatterPlayer` | d8 direction | Ball & Chain | Verify native scatter discriminator before assigning event icon |
| Punt direction / `puntDirectionRoll` | d6 | Punt direction | No adapter |
| Punt distance / `puntDistanceRoll` | d6 | Punt distance | No adapter |
| Swoop direction / `swoopDirectionRoll` | d6 | Swoop direction | No adapter |
| Swoop movement / `swoopPlayer` | Derived distance/direction | Swoop | Do not invent raw die from derived movement |
| Kickoff table / `kickoffResult` | 2d6 normally; special overtime selector caveat | Kickoff - named event | No adapter; special overtime can serialize synthetic pair |
| Solid Defence / `solidDefenceRoll` | d3 | Solid Defence | No adapter; count result |
| Quick Snap / `quickSnapRoll` | d3 | Quick Snap | No adapter; count result |
| Blitz / `blitzRoll` | d3 | Blitz | No adapter; count result |
| Pitch Invasion / `kickoffPitchInvasion` | Team d6 comparisons + d3 count | Pitch Invasion | No adapter; preserve team identity and distinguish count stage |
| Brilliant Coaching / `extraReRoll` | Team d6 rolls | Brilliant Coaching | No adapter; native team outcome, not generic success |
| Cheering Fans / `cheeringFans` | Team d6 rolls | Cheering Fans | No adapter; native team outcome |
| Dodgy Snack kickoff / `kickoffDodgySnack` | Related kickoff outcome; individual checks via `dodgySnackRoll` | Dodgy Snack | Individual scalar check covered; don't duplicate summary as extra dice |
| Swarming / `swarmingPlayersRoll` | d3 | Swarming | No adapter; count result |
| Riotous Rookies / `riotousRookies` | 2d3 | Riotous Rookies | No adapter; count result |
| Weather Mage / `weatherMageRoll` + `weatherMageResult` | 2d6 + separate resolved weather | Weather Mage - named weather | No adapter; must correlate result without inventing it |
| Master Chef / `masterChefRoll` | 3d6 | Master Chef | No adapter; each die contributes, not a summed 2d6 test |
| Secret Weapon / `secretWeaponBan` | 2d6 | Secret Weapon - native ban result | No adapter |
| Dedicated fans / `dedicatedFans` | Team d6; conceding team d3 | Dedicated fans - native change | No adapter; distinct from pre-match fan factor |
| Penalty shootout / `penaltyShootout` | Team d6 rolls | Penalty shootout | No adapter; score/winner from native report |
| Defecting players / `defectingPlayers` | Player-associated d6 rolls | Defection - native result | No adapter |
| Prayer selection / `prayerRoll` | Selected table index from shuffled pool | Prayer - named prayer | Not a literal fresh D16 roll; recommend exclude from animated dice |
| Bad Habits target count | Internal d3, no published face | Bad Habits | Recommend exclude internal selection |
| Random player/card/coordinate selection | Internal randomness | No proposed label | Recommend exclude; no reported rule die |
| Legacy casualty wrapper | Unused d6+d8 method | No proposed label | Exclude; active BB2025 casualty is d16+d6 |

## Presentation and compatibility constraints

- Both text and icons default on; either or both may be hidden. Existing outcome animations obey the icon toggle.
- New event icons are static. No tooltip. Accessible names remain.
- Event name during rolling; outcome after resolution; fade with existing dice lifecycle. Existing grouping/timing must remain unchanged.
- Targets and modifiers remain in Game Log. Reroll text needs native `reRolled` / `logTest` facts carried into presentation.
- No binary result inferred from die faces. Keep pass-test success distinct from flight result and any subsequent skill-modified result.
- A d3 is currently represented by D6 geometry with values 1-3. Changing die geometry/behavior is outside this feature unless separately approved.
- Recovery must restore current visible results/preferences without replaying old animations. Old transcripts may lack fields; apply agreed conservative fallback.
- Skill effects that only modify another roll, automatic skill uses, and no-roll choices do not require independent die icons unless an actual roll is emitted.

## Eight artwork samples after inventory approval

| Sample | Identity |
| --- | --- |
| Dodge | Action event; may resemble existing Dodge skill art but remains distinct |
| Rush | Action event |
| Pass | Action event |
| Catch | Action event |
| Tentacles | Skill event; resembles existing skill icon |
| Weather | Weather roll event, rather than one particular resulting weather condition |
| Deviation | One shared event identity for direction d8 and distance d6; current display gap needs approval |
| Scatter | Scatter event; consider shared artwork for ball/player variants while text distinguishes them |

## Validation status

Source audit only. No runtime changes, new art, product tests, game-server build, or dev-local restart yet. These remain in #450/#451 after the explicit inventory and artwork approval gates.

## Confirmed clarifications after annotated review

The user's brace comments above are preserved as review history. These decisions supersede conflicting original proposals:

- Use the selected spelling/capitalization and outcome text, including Bloodlust, Recovered Fumble, casualty exclamations, Stat Reduced, and Apothecary Result.
- Distinguish Pass, Throw Bomb, Hail Mary Pass, and Hail Mary Bomb from native flags. Preserve compatibility handling for Wildly Inaccurate without presenting it as a normal BB2025 result. Hail Mary final flight is never labeled Accurate.
- Recovered Fumble corresponds to Safe Pass. Distinguish confusion traits and special effects using their native identities and separate icons.
- Preserve existing animated injury artwork. Show native descriptive stat injury names, such as Head Injury (-1 AV).
- Show the casualty D16; show the extra D6 stat-detail stage only when it contributes to the result. Keep server generation and stored-report compatibility unchanged.
- Current BB2025 Decay adds +1, as does each niggling injury; no current skill activates the retained second-casualty path. Preserve compatibility logic without new legacy artwork requirements.
- For multi-direction scatter, use one shared event label with a direction arrow beside each die, oriented to the displayed pitch. Use a generic direction icon if native direction data is missing. These direction arrows are separate from the shared Scatter event artwork sample.
- Add Deviation as the only new previously absent dice display. Defer the other items in Additional server sources and absent display coverage. This scope was explicitly confirmed after clarifying a truncated user message.
- User authorized proceeding with the eight samples. See art-samples/index.html and art-review.md. Sample-art approval remains required before remaining assets and runtime integration.
- Subsequent approval: user selected Catch v3 and approved the first round. Final approved selection uses Weather v1 and the other six v3 samples. Remaining icons are delivered in assets/game/ui/dice-events-v1; see remaining-art-report.md. The sample-art review gate is satisfied.

## Implementation audit correction

The earlier Deviation row incorrectly classified `scatterPlayer` with `isScatter=false` as D8+D6. Inspection of `UtilThrowTeamMateSequence.scatterPlayer` shows those values are all D8 direction rolls, used while finding a valid landing square. They must not be interpreted as a direction/distance pair. The actual direction/distance producer is kickoff `ReportKickoffScatter`: D8 plus D6, or D3 when the before-roll Kick choice applies. The after-roll Kick variant still rolls D6 before applying its distance adjustment. The user explicitly approved showing kickoff Deviation with its actual D8 + D6/D3 dice. An optional `scatterDistanceSides` fact now preserves that distinction through reporting, recovery, and coach transforms; legacy reports without it retain their direction-only display. Mechanics and generated values are unchanged.
