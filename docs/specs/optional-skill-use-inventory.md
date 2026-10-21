# Optional Skill Use Inventory

This review covers the browser client and BB2025. The selected toggle scope contains **18 use cases across 14 core skills and traits**. The defaults below preserve the user's inventory selections. All special abilities are excluded. Scope, defaults, and interaction decisions are agreed; the feature review is complete.

The core catalog contains **108** skills and traits: **83** are optional under the reference's unstarred classification and **25** are compulsory. The optional entries below expand into **121 use cases**. This broader core inventory records why other entries are outside the selected toggle scope.

The inventory distinguishes rule optionality from existing engine controls. Some optional effects currently have no use/decline prompt. Definition links establish the registered effect; native flow evidence below identifies confirmed controls. Complete runtime coverage and exact rules timing must be checked for each selected implementation slice.

## Agreed behavior

- Provide account-wide preferences across matches and devices, applying to all players owned by that coach. No player or team overrides in this release.
- Create an Automatic Skill Use section within Game Settings > Skills & Traits, with radio buttons for Always Use and Always Ask for each approved use case.
- Always Use accepts an eligible binary skill decision before opening a prompt or starting a decision deadline. It also operates while its coach is disconnected, subject to existing match pauses.
- Always Ask uses the existing server-owned timed decision and its normal timeout result. Newly exposed optional decisions need equivalent timed behavior.
- Live preference changes apply to the next eligible decision. They do not answer or restart an already-open prompt.
- An explicitly configured Always Use may consume a limited-use skill allowance. All special abilities are excluded. Grab still requires the normal push-square input. Pick-me-up is the agreed exception: Always Use attempts recovery for every eligible teammate, while Always Ask retains recipient selection. Other target, square, die, action, and resource selections stay manual.
- Declining a skill reroll skips only that skill for the current roll and retains other legal reroll sources. Do not automatically spend a team reroll or Pro.
- Under Always Ask, skip provably irrelevant applications without moving decisions past their legal timing or revealing extra dice.
- Keep native eligibility, skill cancellation, owner routing, and sequence order. Compulsory rules and compulsory subcases take precedence over preferences.
- Replays use recorded decisions and do not consult current preferences. Recovery preserves accepted decisions and an already-pending decision rather than applying it twice.
- Exclude UI / UX changes outside those required for presenting additional skill decisions and/or creating the new game settings menu options. Preserve MUTP themes and existing scaffolding.

## Selected toggle scope

| Use case | Included decision | Default |
| --- | --- | --- |
| `catch.1` | [Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Catch.java): Catch reroll | **Always Use** |
| `dodge.1` | [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java): Movement dodge reroll | **Always Use** |
| `dodge.2` | [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java): Avoid a Stumble knockdown during a block | **Always Use** |
| `sure-feet.1` | [Sure Feet](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SureFeet.java): Rush reroll | **Always Use** |
| `fend.1` | [Fend](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Fend.java): Prevent the attacker following up | **Always Ask** |
| `steady-footing.1` | [Steady Footing](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SteadyFooting.java): Attempt to avoid knockdown or falling over | **Always Use** |
| `strip-ball.1` | [Strip Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StripBall.java): Make a pushed ball carrier drop the ball | **Always Use** |
| `sure-hands.1` | [Sure Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/SureHands.java): Pickup reroll, excluding Secure the Ball | **Always Use** |
| `tackle.1` | [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java): Prevent an opponent using the Dodge movement reroll | **Always Use** |
| `tackle.2` | [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java): Prevent Dodge protecting against a block Stumble | **Always Use** |
| `taunt.1` | [Taunt](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Taunt.java): Require the attacker to follow up | **Always Ask** |
| `wrestle.1` | [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java): Use on Both Down as attacker | **Always Ask** |
| `wrestle.2` | [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java): Use on Both Down as defender | **Always Ask** |
| `pass.1` | [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java): Ball pass reroll | **Always Use** |
| `pass.2` | [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java): Bomb throw reroll | **Always Use** |
| `grab.1` | [Grab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Grab.java): Use expanded push destinations, retaining square selection | **Always Use** |
| `stand-firm.1` | [Stand Firm](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StandFirm.java): Decline a push, including a chain push | **Always Ask** |
| `pick-me-up.1` | [Pick-me-up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PickMeUp.java): Choose which nearby prone teammates attempt to stand | **Always Ask** |

Sure Hands is selected for its pickup reroll only; its separate Strip Ball immunity row was not selected. Pass includes the ball and bomb reroll rows explicitly marked in the inventory. Other unselected core rows are deferred.

## Inventory legend

The selected table records inclusion and defaults. The full core inventory retains the user's original selection wording. A use-case key identifies a review row, not a proposed persisted API identifier.

| Source structure | Meaning for a toggle |
| --- | --- |
| Native binary | A native yes/no or use/decline branch is identified. Some current paths still auto-resolve conditionally. |
| Effect | A modifier, cancellation, or other effect is registered. Exposing Always Ask requires a new decision at its applicable native boundary; a definition alone does not prove every runtime branch. |
| Reroll | A skill reroll source is registered. There are both automatic paths and source choosers. Do not automate competing resource or die selections. |
| Gate and input | Only use/decline can normally be automated. A player, destination, die, or other subsequent input remains manual. Pick-me-up is the agreed exception: Always Use selects every eligible recipient for an attempt. Where selection itself activates another skill, a separate binary gate is not yet identified. |
| Action or selection | The optionality is expressed by the coach choosing an action, target, or movement. Defer from binary-use toggles. |
| No separate decision | A reward or bookkeeping consequence. Defer from binary-use toggles. |

Unselected core rows are deferred from this release. Special abilities are excluded entirely from the toggle list.

## Core optional skills and traits

### Agility

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `catch.1` | [Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Catch.java): Catch reroll | Reroll | Yes include, default yes. |
| `diving-catch.1` | [Diving Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DivingCatch.java): Attempt an adjacent catch, retaining catcher selection | Gate and input | Defer |
| `diving-catch.2` | [Diving Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DivingCatch.java): Bonus for catching a pass in its target square | Effect | Defer |
| `diving-tackle.1` | [Diving Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/DivingTackle.java): Apply Diving Tackle to a dodge, retaining tackler selection when several qualify | Gate and input | Defer |
| `dodge.1` | [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java): Movement dodge reroll | Reroll | Yes include, default yes. |
| `dodge.2` | [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java): Avoid a Stumble knockdown during a block | Native binary | Yes include, default yes. |
| `defensive.1` | [Defensive](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Defensive.java): Cancel opposing Guard for block assists | Effect | Defer |
| `defensive.2` | [Defensive](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Defensive.java): Cancel opposing foul-assist skills | Effect | Defer |
| `hit-and-run.1` | [Hit And Run](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/HitAndRun.java): Choose a free move after a block or Stab | Action or selection | Defer |
| `jump-up.1` | [Jump Up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/JumpUp.java): Stand without the usual movement cost | Effect | Defer |
| `jump-up.2` | [Jump Up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/JumpUp.java): Declare a block while prone | Action or selection | Defer |
| `leap.1` | [Leap](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Leap.java): Choose a leap and its destination | Action or selection | Defer |
| `safe-pair-of-hands.1` | [Safe Pair Of Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SafePairOfHands.java): Place a dropped ball, retaining square selection | Gate and input | Defer |
| `sidestep.1` | [Sidestep](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Sidestep.java): Take control of a push destination, retaining square selection | Gate and input | Defer |
| `sprint.1` | [Sprint](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Sprint.java): Choose an additional rush through movement input | Action or selection | Defer |
| `sure-feet.1` | [Sure Feet](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SureFeet.java): Rush reroll | Reroll | Yes include, default yes. |

### Devious

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `dirty-player.1` | [Dirty Player](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/DirtyPlayer.java): Apply the foul armour modifier | Effect | Defer |
| `dirty-player.2` | [Dirty Player](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/DirtyPlayer.java): Apply the foul injury modifier | Effect | Defer |
| `eye-gouge.1` | [Eye Gouge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/EyeGouge.java): Apply the assist-removal condition after a push | Effect | Defer |
| `fumblerooski.1` | [Fumblerooski](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Fumblerooski.java): Choose to put the ball down during movement | Action or selection | Defer |
| `lethal-flight.1` | [Lethal Flight](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/LethalFlight.java): Apply the thrown-player collision armour modifier | Effect | Defer |
| `lethal-flight.2` | [Lethal Flight](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/LethalFlight.java): Apply the thrown-player collision injury modifier | Effect | Defer |
| `lethal-flight.3` | [Lethal Flight](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/LethalFlight.java): Award casualty SPP for a thrown-player collision | No separate decision | Defer |
| `lone-fouler.1` | [Lone Fouler](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/LoneFouler.java): Reroll an unassisted foul armour roll | Native binary | Defer |
| `pile-driver.1` | [Pile Driver](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/PileDriver.java): Take the follow-up foul, retaining victim selection where needed | Gate and input | Defer |
| `put-the-boot-in.1` | [Put the Boot In](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/PutTheBootIn.java): Provide a foul assist while marked | Effect | Defer |
| `quick-foul.1` | [Quick Foul](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/QuickFoul.java): Continue moving after a foul | Action or selection | Defer |
| `saboteur.1` | [Saboteur](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Saboteur.java): Use the attacking player branch when knocked down | Native binary | Defer |
| `saboteur.2` | [Saboteur](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Saboteur.java): Use the defending player branch when knocked down | Native binary | Defer |
| `shadowing.1` | [Shadowing](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Shadowing.java): Attempt to follow a departing opponent, retaining shadower selection | Gate and input | Defer |
| `sneaky-git.1` | [Sneaky Git](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SneakyGit.java): Avoid ejection for an unsuccessful foul armour double | Effect | Defer |
| `violent-innovator.1` | [Violent Innovator](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/ViolentInnovator.java): Award casualty SPP for a qualifying special action | No separate decision | Defer |

### General

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `block.1` | [Block](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Block.java): Avoid Both Down knockdown as attacker | Effect | Defer |
| `block.2` | [Block](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Block.java): Avoid Both Down knockdown as defender | Effect | Defer |
| `dauntless.1` | [Dauntless](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Dauntless.java): Attempt the strength-matching roll before blocking | Effect | Defer |
| `fend.1` | [Fend](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Fend.java): Prevent the attacker following up | Native binary | Yes include, default ask. |
| `kick.1` | [Kick](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Kick.java): Reduce kickoff deviation distance | Native binary | Defer |
| `kick.2` | [Kick](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Kick.java): Punt direction reroll | Reroll | Defer |
| `kick.3` | [Kick](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Kick.java): Punt distance reroll | Reroll | Defer |
| `pro.1` | [Pro](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Pro.java): Reroll a single-die test | Reroll | Defer |
| `pro.2` | [Pro](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Pro.java): Reroll a selected die from a pool, retaining die selection | Gate and input | Defer |
| `steady-footing.1` | [Steady Footing](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SteadyFooting.java): Attempt to avoid knockdown or falling over | Native binary | Yes include, default yes. |
| `strip-ball.1` | [Strip Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StripBall.java): Make a pushed ball carrier drop the ball | Effect | Yes include, default yes. |
| `sure-hands.1` | [Sure Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/SureHands.java): Pickup reroll, excluding Secure the Ball | Reroll | Yes include, default yes. |
| `sure-hands.2` | [Sure Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/SureHands.java): Prevent Strip Ball | Effect | Defer |
| `tackle.1` | [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java): Prevent an opponent using the Dodge movement reroll | Effect | Yes include, default yes. |
| `tackle.2` | [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java): Prevent Dodge protecting against a block Stumble | Effect | Yes include, default yes. |
| `taunt.1` | [Taunt](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Taunt.java): Require the attacker to follow up | Native binary | Yes include, default ask. |
| `wrestle.1` | [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java): Use on Both Down as attacker | Native binary | Yes include, default ask. |
| `wrestle.2` | [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java): Use on Both Down as defender | Native binary | Yes include, default ask. |

### Mutation

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `big-hand.1` | [Big Hand](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BigHand.java): Ignore pickup penalties | Effect | Defer |
| `claws.1` | [Claws](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Claws.java): Apply the armour-breaking effect on a block | Effect | Defer |
| `extra-arms.1` | [Extra Arms](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/ExtraArms.java): Apply the pickup modifier | Effect | Defer |
| `extra-arms.2` | [Extra Arms](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/ExtraArms.java): Apply the catch modifier | Effect | Defer |
| `extra-arms.3` | [Extra Arms](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/ExtraArms.java): Apply the interception modifier | Effect | Defer |
| `horns.1` | [Horns](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Horns.java): Apply the Blitz strength bonus | Effect | Defer |
| `iron-hard-skin.1` | [Iron Hard Skin](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/IronHardSkin.java): Prevent opposing armour modifiers | Effect | Defer |
| `iron-hard-skin.2` | [Iron Hard Skin](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/IronHardSkin.java): Prevent Claws | Effect | Defer |
| `monstrous-mouth.1` | [Monstrous Mouth](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/MonstrousMouth.java): Declare Chomp and choose its victim | Action or selection | Defer |
| `monstrous-mouth.2` | [Monstrous Mouth](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/MonstrousMouth.java): Prevent Strip Ball | Effect | Defer |
| `prehensile-tail.1` | [Prehensile Tail](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PrehensileTail.java): Apply the departure dodge penalty | Effect | Defer |
| `prehensile-tail.2` | [Prehensile Tail](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PrehensileTail.java): Apply the departure jump or leap penalty | Effect | Defer |
| `tentacles.1` | [Tentacles](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tentacles.java): Attempt to stop a dodge, retaining player selection | Gate and input | Defer |
| `tentacles.2` | [Tentacles](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tentacles.java): Attempt to stop a jump or leap, retaining player selection | Gate and input | Defer |
| `two-heads.1` | [Two Heads](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/TwoHeads.java): Apply the dodge modifier | Effect | Defer |
| `very-long-legs.1` | [Very Long Legs](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/VeryLongLegs.java): Apply the jump or leap modifier | Effect | Defer |
| `very-long-legs.2` | [Very Long Legs](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/VeryLongLegs.java): Apply the interception modifier | Effect | Defer |
| `very-long-legs.3` | [Very Long Legs](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/VeryLongLegs.java): Ignore Cloud Burster | Effect | Defer |

### Passing

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `accurate.1` | [Accurate](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Accurate.java): Apply the short-range passing modifier | Effect | Defer |
| `cannoneer.1` | [Cannoneer](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Cannoneer.java): Apply the long-range passing modifier | Effect | Defer |
| `cloud-burster.1` | [Cloud Burster](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/CloudBurster.java): Prevent an interception attempt | Effect | Defer |
| `dump-off.1` | [Dump-Off](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DumpOff.java): Start the reactive pass, retaining pass target selection | Gate and input | Defer |
| `give-and-go.1` | [Give and Go](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/GiveAndGo.java): Continue moving after a quick pass | Action or selection | Defer |
| `give-and-go.2` | [Give and Go](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/GiveAndGo.java): Continue moving after a handoff | Action or selection | Defer |
| `hail-mary-pass.1` | [Hail Mary Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/HailMaryPass.java): Declare the alternative pass or bomb action and its target | Action or selection | Defer |
| `leader.1` | [Leader](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Leader.java): Grant the extra reroll at the start of the half | Effect | Defer |
| `leader.2` | [Leader](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Leader.java): Choose to spend the granted reroll through existing resource controls | Action or selection | Defer |
| `nerves-of-steel.1` | [Nerves of Steel](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/NervesOfSteel.java): Ignore marking penalties when passing | Effect | Defer |
| `nerves-of-steel.2` | [Nerves of Steel](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/NervesOfSteel.java): Ignore marking penalties when catching | Effect | Defer |
| `on-the-ball.1` | [On The Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/OnTheBall.java): React to a pass, retaining player and movement choices | Gate and input | Defer |
| `on-the-ball.2` | [On The Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/OnTheBall.java): React to kickoff deviation, retaining player and movement choices | Gate and input | Defer |
| `pass.1` | [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java): Ball pass reroll | Reroll | Yes include, default yes. |
| `pass.2` | [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java): Bomb throw reroll | Reroll | Yes include, default yes. |
| `punt.1` | [Punt](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Punt.java): Declare a punt and choose its direction | Action or selection | Defer |
| `safe-pass.1` | [Safe Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SafePass.java): Retain the ball after a qualifying fumble | Native binary | Defer |
| `safe-pass.2` | [Safe Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SafePass.java): Handle a qualifying bomb fumble where supported by the native path | Native binary | Defer |

### Strength

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `arm-bar.1` | [Arm Bar](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ArmBar.java): Apply the failed-dodge armour modifier | Effect | Defer |
| `arm-bar.2` | [Arm Bar](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ArmBar.java): Apply the failed-dodge injury modifier | Effect | Defer |
| `arm-bar.3` | [Arm Bar](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ArmBar.java): Apply the failed-jump armour modifier | Effect | Defer |
| `arm-bar.4` | [Arm Bar](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ArmBar.java): Apply the failed-jump injury modifier | Effect | Defer |
| `brawler.1` | [Brawler](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Brawler.java): Reroll a Both Down die, retaining die selection | Gate and input | Defer |
| `break-tackle.1` | [Break Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BreakTackle.java): Apply the limited dodge modifier | Native binary | Defer |
| `bullseye.1` | [Bullseye](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Bullseye.java): Skip scatter for a superb teammate throw | Native binary | Defer |
| `grab.1` | [Grab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Grab.java): Use expanded push destinations, retaining square selection | Gate and input | Yes include, default yes. |
| `grab.2` | [Grab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Grab.java): Cancel the target player's Side Step | Effect | Defer |
| `guard.1` | [Guard](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Guard.java): Provide a block assist while marked | Effect | Defer |
| `juggernaut.1` | [Juggernaut](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Juggernaut.java): Convert Both Down to a push on a Blitz | Native binary | Defer |
| `juggernaut.2` | [Juggernaut](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Juggernaut.java): Cancel Fend on a Blitz | Effect | Defer |
| `juggernaut.3` | [Juggernaut](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Juggernaut.java): Cancel Stand Firm on a Blitz | Effect | Defer |
| `juggernaut.4` | [Juggernaut](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Juggernaut.java): Cancel Wrestle on a Blitz | Effect | Defer |
| `mighty-blow.1` | [Mighty Blow](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/MightyBlow.java): Apply the block armour modifier | Effect | Defer |
| `mighty-blow.2` | [Mighty Blow](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/MightyBlow.java): Apply the block injury modifier | Effect | Defer |
| `multiple-block.1` | [Multiple Block](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/MultipleBlock.java): Declare the multi-target block and choose victims | Action or selection | Defer |
| `stand-firm.1` | [Stand Firm](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StandFirm.java): Decline a push, including a chain push | Native binary | Yes include, default ask. |
| `strong-arm.1` | [Strong Arm](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/StrongArm.java): Apply the teammate-throw passing modifier | Effect | Defer |
| `thick-skull.1` | [Thick Skull](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/ThickSkull.java): Convert the relevant injury result | Effect | Defer |

### Trait

| Use case | Skill and decision | Current source structure | Include and default |
| --- | --- | --- | --- |
| `bombardier.1` | [Bombardier](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Bombardier.java): Declare a bomb action and choose its target | Action or selection | Defer |
| `breathe-fire.1` | [Breathe Fire](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BreatheFire.java): Declare the special attack and choose its target | Action or selection | Defer |
| `hypnotic-gaze.1` | [Hypnotic Gaze](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/HypnoticGaze.java): Declare the special action and choose its target | Action or selection | Defer |
| `kick-team-mate.1` | [Kick Team-Mate](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/KickTeamMate.java): Declare the kick and choose teammate and target | Action or selection | Defer |
| `pick-me-up.1` | [Pick-me-up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PickMeUp.java): Choose which nearby prone teammates attempt to stand | Gate and input | Yes include, default ask. |
| `plague-ridden.1` | [Plague Ridden](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PlagueRidden.java): Add the qualifying reserve lineman | Effect | Defer |
| `pogo.1` | [Pogo](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Pogo.java): Choose the special jump and its destination | Action or selection | Defer |
| `projectile-vomit.1` | [Projectile Vomit](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/ProjectileVomit.java): Declare the special attack and choose its target | Action or selection | Defer |
| `regeneration.1` | [Regeneration](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Regeneration.java): Attempt to save a casualty | Effect | Defer |
| `stab.1` | [Stab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Stab.java): Declare the special attack and choose its target | Action or selection | Defer |
| `swoop.1` | [Swoop](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Swoop.java): Choose alternative scatter, retaining direction selection | Gate and input | Defer |
| `swoop.2` | [Swoop](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Swoop.java): Landing reroll after using Swoop | Reroll | Defer |
| `throw-team-mate.1` | [Throw Team-Mate](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ThrowTeamMate.java): Declare the throw and choose teammate and target | Action or selection | Defer |
| `timmm-ber.1` | [Timmm-ber!](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Timmmber.java): Provide stand-up assistance | Effect | Defer |
| `trickster.1` | [Trickster](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Trickster.java): Reposition before the attack, retaining destination and any pickup choice | Gate and input | Defer |

## Compulsory core abilities

These 25 entries complete the core catalog coverage. Their compulsory use is excluded from the toggle proposal. A compulsory trait can still contain other decisions, such as choosing a victim or whether to spend a team reroll; that does not make the trait itself optional.

| Skill or trait | Classification |
| --- | --- |
| [Frenzy](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Frenzy.java) | Compulsory; exclude |
| [Disturbing Presence](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DisturbingPresence.java) | Compulsory; exclude |
| [Foul Appearance](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/FoulAppearance.java) | Compulsory; exclude |
| [Always Hungry](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/AlwaysHungry.java) | Compulsory; exclude |
| [Animal Savagery](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/AnimalSavagery.java) | Compulsory; exclude |
| [Animosity](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Animosity.java) | Compulsory; exclude |
| [Ball and Chain](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BallAndChain.java) | Compulsory; exclude |
| [Bloodlust](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Bloodlust.java) | Compulsory; exclude |
| [Bone Head](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BoneHead.java) | Compulsory; exclude |
| [Chainsaw](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Chainsaw.java) | Compulsory; exclude |
| [Decay](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Decay.java) | Compulsory; exclude |
| [Drunkard](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Drunkard.java) | Compulsory; exclude |
| [Hatred](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Hatred.java) | Compulsory; exclude |
| [Insignificant](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Insignificant.java) | Compulsory; exclude |
| [Loner](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Loner.java) | Compulsory; exclude |
| [My Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/MyBall.java) | Compulsory; exclude |
| [No Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/NoBall.java) | Compulsory; exclude |
| [Really Stupid](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/ReallyStupid.java) | Compulsory; exclude |
| [Right Stuff](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/RightStuff.java) | Compulsory; exclude |
| [Secret Weapon](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SecretWeapon.java) | Compulsory; exclude |
| [Stunty](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Stunty.java) | Compulsory; exclude |
| [Take Root](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/TakeRoot.java) | Compulsory; exclude |
| [Titchy](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Titchy.java) | Compulsory; exclude |
| [Unchannelled Fury](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/UnchannelledFury.java) | Compulsory; exclude |
| [Unsteady](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Unsteady.java) | Compulsory; exclude |

## Confirmed native flow evidence

| Use cases | Existing behavior and source |
| --- | --- |
| Dodge block | Conditional binary and automatic branches in [AbstractDodgingBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/mixed/AbstractDodgingBehaviour.java), bound to BB2025 by [DodgeBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/DodgeBehaviour.java), and [StepBlockDodge](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/mixed/StepBlockDodge.java). |
| Dodge movement and Break Tackle | [StepMoveDodge](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/move/StepMoveDodge.java) has reroll and modifier decisions. Audit each automatic branch as well as the visible dialog. |
| Catch and Sure Hands rerolls | [CatchBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/CatchBehaviour.java) supplies an automatic Catch reroll; [StepCatchScatterThrowIn](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/shared/StepCatchScatterThrowIn.java) also has combined choices. [StepPickUp](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/move/StepPickUp.java) automatically uses the pickup skill reroll outside Secure the Ball. |
| Fend and Taunt | Separate skill prompts in [StepFollowup](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/block/StepFollowup.java). |
| Stand Firm and Side Step | Native use/decline in [StandFirmBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/StandFirmBehaviour.java) and [SidestepBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/SidestepBehaviour.java); Side Step still needs a square. |
| Wrestle | [WrestleBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/WrestleBehaviour.java) asks attacker and defender separately, in native order. |
| Juggernaut and Grab | [JuggernautBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/JuggernautBehaviour.java) handles Both Down conversion. [GrabBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/GrabBehaviour.java) conditionally asks or enables Grab, then retains push-square input. Cancellation properties are separate effects. |
| Dauntless | [DauntlessBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/mixed/DauntlessBehaviour.java) starts its strength roll automatically. Its later skill-use prompt is for Indomitable, not Dauntless. |
| Lone Fouler | [LoneFoulerModification](../../ffb-server/src/main/java/com/fumbbl/ffb/server/injury/modification/bb2025/LoneFoulerModification.java) supplies an armour reroll through native injury-modification handling. |
| Bullseye | [ThrowTeamMateBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/ThrowTeamMateBehaviour.java) asks whether to skip scatter after a superb throw. |
| Kick | [StepKickoffScatterRoll](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/kickoff/StepKickoffScatterRoll.java) asks about kickoff distance. Punt direction and distance rerolls are distinct registrations on the skill. |
| Safe Pass | [StepPass](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/pass/StepPass.java) and [PassBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/PassBehaviour.java) contain fumble handling; the latter also includes the Hail Mary and bomb paths. |
| Saboteur | [SaboteurBehaviour](../../ffb-server/src/main/java/com/fumbbl/ffb/server/skillbehaviour/bb2025/SaboteurBehaviour.java) has separate attacker and defender prompts. The attacker branch needs rules confirmation before inclusion; it is an engine observation, not approval of that rule interpretation. |
| Pile Driver and Hit and Run | [StepEndBlocking](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/bb2025/block/StepEndBlocking.java) uses victim selection for Pile Driver and destination selection for Hit and Run. The nearby vomit yes/no is Putrid Regurgitation, not ordinary Projectile Vomit. |
| Pick-me-up | [StepPickMeUp](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/mixed/shared/StepPickMeUp.java) currently chooses recipient players, then rolls and stands successful recipients. |
| Other covered reactions | [Existing 19-entry native audit](bb2025-reactive-skill-decisions.md#native-audit) traces Diving Tackle, Tentacles, Shadowing, Arm Bar, Dump-Off, Trickster, Steady Footing, Safe Pair of Hands, On the Ball, and Diving Catch. Preserve player/target/square/movement inputs. |

## Contexts requiring care before implementation

- Armour and injury rows for Dirty Player, Mighty Blow, Lethal Flight, Arm Bar, and special modifiers are not independent allowances. Their native allocation and consumption limits must remain intact. Arm Bar can also require choosing among eligible players.
- Optionality can change in a compulsory context. The [Animal Savagery entry in the BB2025 reference](https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/#animal-savagery-passive) requires applicable Claws and Mighty Blow use against its teammate victim. An Always Ask preference must not offer an illegal decline there.
- Inherited registrations require an edition-specific runtime check. Diving Tackle registers jump effects and Nerves of Steel registers an interception modifier in shared classes; these are not additional approved BB2025 use cases merely because the property exists.
- Separate bomb and ball paths only where the native rules permit the skill. Recording a native bomb path in this inventory does not change its eligibility.

## Signoff

- Selected toggle rows and defaults: Agreed from the user-edited inventory and Q9 response; 18 use cases across 14 core skills and traits.
- Special abilities: Excluded by Q10 response.
- Interaction decisions Q11 through Q13: Agreed in the user's final response.
- Feature review and shared understanding: Complete. No design questions remain from this review.
- Implementation authorized on 20 October 2026 through the usual method; tracked in [the implementation spec](optional-skill-use.md). Commits and publication remain unauthorized.

### Agreed interaction decisions

- **Q11 - Declining a skill reroll:** Skip that skill for the current roll, then retain any other legal reroll sources. Do not automatically spend a team reroll or Pro. Current [reroll prompt projection](../../ffb-server/src/main/java/com/fumbbl/ffb/server/match/RerollPromptActions.java) can combine sources in one chooser; the new skill-use control must distinguish declining that skill from declining every reroll. A timeout at this skill gate counts as declining the skill, subject to the normal timing of any subsequent decision.
- **Q12 - Pick-me-up:** Always Ask keeps the current recipient-selection control. Always Use selects every eligible recipient for an attempt, then uses the native rolls; only successful recipients stand. This recipient automation is an explicit exception to the otherwise binary-only scope. The native [StepPickMeUp](../../ffb-server/src/main/java/com/fumbbl/ffb/server/step/mixed/shared/StepPickMeUp.java) currently selects recipients before rolling.
- **Q13 - Redundant prompts:** Under Always Ask, prompt when the optional application can affect the legal continuation. Skip provably irrelevant cases, without moving decisions past their legal timing or revealing extra dice. For example, do not ask whether to cancel an unavailable opposing Dodge skill.

## Implementation acceptance and validation

- Expose every selected use case and its agreed default in Automatic Skill Use. Keep movement/block and ball/bomb settings distinct as listed. Deferred core entries and special abilities receive no toggle.
- Verify automatic and timed-ask branches for all 18 selected use cases, including native branches that currently bypass a prompt. Preserve Grab square input and both Pick-me-up modes.
- Verify that declining or timing out a skill reroll retains other legal sources without spending them or offering the declined skill again for the same roll.
- Verify coach ownership, account isolation, persistence across matches/devices, and changes becoming effective at the next decision without altering a pending prompt.
- Check affected live-play, disconnected-coach, replay, reconnect, and recovery paths. Preserve recorded decisions and pending deadlines; prevent duplicate application and actionable historical prompts.
- Check affected layouts and existing MUTP themes before visual handoff. Update assertions tied to changed appearance or timing.
- After implementation, run focused regressions, the relevant unit and browser suites, and game-server build checks. Investigate failures until resolved or a concrete blocker or required user decision is identified. Record the exact commands, results, and any remaining verification gaps.

## Sources and verification

- Core names, stable catalog IDs, categories, and count: [BB2025 SkillDefinitions](../../ffb-server/src/main/java/com/fumbbl/ffb/server/team/bb2025/SkillDefinitions.java). All 108 catalog IDs are covered once at skill level: 83 optional entries and 25 compulsory exclusions. Multiple use cases deliberately repeat a skill.
- Core optionality and compulsory markers: [Blood Bowl Base BB2025 skills and traits](https://bloodbowlbase.ru/bb2025/core_rules/skills_and_traits/#skill-use), checked 19 October 2026. This community transcription distinguishes active/passive availability from optional/compulsory use; it is not the publisher.
- Official timing and exceptions checked against the [May 2026 Third Season FAQ](https://assets.warhammer-community.com/eng_20-05_blood_bowl_faq_errata-gytvlserev-ngihd3chox.pdf), notably reaction order and restrictions on Brawler, Grab, and Multiple Block. The [publisher download page](https://www.warhammer-community.com/en-gb/downloads/blood-bowl/) remains the update discovery point; its download list was not exposed in the text response, so this is not a claim that no newer PDF exists.
- Reference scope and source limitations: [BB2025 rules reference](bb2025-rules-reference.md). Full printed-rulebook certification is not established by this draft. Special profiles are outside the selected scope.
- Static verification: exact core catalog coverage, distinct use-case keys, preservation of all 18 user-selected rows and defaults, exclusion of the special-ability appendix, and existence of linked local source files. No gameplay, UI, or build code changed; unit, browser, and server builds were not run for this document-only review.
