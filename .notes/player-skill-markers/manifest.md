# BB2025 core player skill marker manifest

The owner approved the text style and the illustrated size/color direction, then authorized completing both packs. The [complete text pack](text-full/README.md) and [complete illustrated pack](illustrated-full/README.md) now each cover all 108 identities. The illustrated pack includes the requested Secret Weapon, Dodge and Claws revisions and a distinct Put the Boot In design. The owner accepted both packs, including the corrected Eye Gouge, and authorized production integration. Both packs are now integrated; earlier sample rounds remain available for comparison.

The proposal contains exactly **108 core BB2025 marker identities**: **72 category skills and 36 traits**. Both packs use this same inventory. Text labels use **1–3 uppercase letters with no numbers**. The linked native implementations and categories match the curated core catalog.

Unique star-player abilities appear on the player profile card opened by click or hover. They do not receive pitch badges, including a generic star-ability badge. A star player's ordinary core skills use the same marker identities and filters as other players. Permanent stat changes and named temporary effects are outside these packs. Temporary gains of a core skill reuse the existing skill marker while possessed.

## Review decisions

1. The accepted abbreviations below are implemented. **B / D / G / T / MB** preserve the agreed priorities. Other familiar one-letter labels are used where collision-free. The proposed labels have no case-insensitive collisions.
2. The accepted palette is implemented. General blue and Agility yellow reuse exact MUTP accents; the approved text fills and deeper illustrated panels retain the seven category hues.
3. The approved full pack uses one unnumbered icon for **Loner** and **Bloodlust**. Loner values 2+, 3+, and 4+ have source evidence; no fixed number of Bloodlust variants is assumed. Text labels remain LO and BL. Mighty Blow and Dirty Player have one unnumbered text identity each and no +2 artwork.
4. **Animosity** and **Hatred** carry target keywords rather than numbers. Full targets stay in player details; the approved pack uses one unnumbered identity for each.
5. For badge ordering, the native negative-trait flag covers only Animal Savagery, Bloodlust, Bone Head, Really Stupid, Take Root, and Unchannelled Fury. It omits Loner and other restrictive traits. The production ordering explicitly adds **Always Hungry, Animosity, Loner, and Secret Weapon** to the first-priority group, followed by B / D / G / T / MB and stable identity ordering.

## Category palette

| Category | Color | Fill | Text | Notes |
| --- | --- | --- | --- | --- |
| General | Blue | `#49DFFF` | `#091726` | Existing MUTP home score accent in coach-match.css. |
| Agility | Yellow | `#FFE17B` | `#091726` | Existing MUTP gold accent in coach-match.css. |
| Strength | Red | `#E4777F` | `#091726` | Proposed; review with samples. |
| Mutation | Purple | `#B696DE` | `#091726` | Proposed; review with samples. |
| Passing | Green | `#7AC59C` | `#091726` | Proposed; review with samples. |
| Devious | Orange | `#E7AA6A` | `#091726` | Proposed; review with samples. |
| Core traits | Black | `#10141A` | `#D9E9F7` | Includes positive traits; pale edge distinguishes cards from the pitch. |

Use the MUTP font for the text pack. The illustrated pack retains the same category frame while using distinct original imagery. Portrait shape, border detail, final dimensions, contrast on the pitch, and illustrated variant treatments belong to the approved sample round.

## Core skills and traits

Every linked name points to the selected native implementation. Category identity is checked against [the curated core table](../../ffb-server/src/main/java/com/fumbbl/ffb/server/team/bb2025/SkillDefinitions.java). Black applies to all core traits, including positive traits.

### General blue

12 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Block](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Block.java) | **B** | Single-letter priority; rules Elite. |
| [Dauntless](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Dauntless.java) | **DA** |  |
| [Fend](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Fend.java) | **FE** |  |
| [Frenzy](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Frenzy.java) | **F** |  |
| [Kick](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Kick.java) | **K** |  |
| [Pro](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Pro.java) | **P** |  |
| [Steady Footing](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SteadyFooting.java) | **STF** | STF avoids Stand Firm SF. |
| [Strip Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StripBall.java) | **SB** |  |
| [Sure Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/SureHands.java) | **SH** |  |
| [Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tackle.java) | **T** | Single-letter priority agreed for markers; not rules Elite. |
| [Taunt](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Taunt.java) | **TA** |  |
| [Wrestle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Wrestle.java) | **W** |  |

### Agility yellow

12 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Catch.java) | **C** |  |
| [Defensive](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Defensive.java) | **DEF** |  |
| [Diving Catch](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DivingCatch.java) | **DC** |  |
| [Diving Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/DivingTackle.java) | **DT** |  |
| [Dodge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Dodge.java) | **D** | Single-letter priority; rules Elite. |
| [Hit And Run](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/HitAndRun.java) | **HR** |  |
| [Jump Up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/JumpUp.java) | **JU** |  |
| [Leap](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Leap.java) | **L** |  |
| [Safe Pair Of Hands](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SafePairOfHands.java) | **SPH** |  |
| [Sidestep](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Sidestep.java) | **SS** |  |
| [Sprint](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Sprint.java) | **SPR** |  |
| [Sure Feet](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SureFeet.java) | **SFE** | SFE avoids Stand Firm SF. |

### Strength red

12 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Arm Bar](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ArmBar.java) | **AB** |  |
| [Brawler](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Brawler.java) | **BR** |  |
| [Break Tackle](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BreakTackle.java) | **BT** |  |
| [Bullseye](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Bullseye.java) | **BE** |  |
| [Grab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Grab.java) | **GR** |  |
| [Guard](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Guard.java) | **G** | Single-letter priority; rules Elite. |
| [Juggernaut](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Juggernaut.java) | **J** |  |
| [Mighty Blow](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/MightyBlow.java) | **MB** | Keep MB; no numbered text or +2 variant. Internal default modifier is 1. |
| [Multiple Block](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/MultipleBlock.java) | **MUL** |  |
| [Stand Firm](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/StandFirm.java) | **SF** |  |
| [Strong Arm](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/StrongArm.java) | **SA** |  |
| [Thick Skull](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/ThickSkull.java) | **TS** |  |

### Mutation purple

12 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Big Hand](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BigHand.java) | **BH** | BH reserved here; Bone Head uses BHD. |
| [Claws](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Claws.java) | **CL** |  |
| [Disturbing Presence](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DisturbingPresence.java) | **DIS** | DIS avoids Dirty Player DP. |
| [Extra Arms](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/ExtraArms.java) | **EA** |  |
| [Foul Appearance](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/FoulAppearance.java) | **FA** |  |
| [Horns](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Horns.java) | **H** |  |
| [Iron Hard Skin](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/IronHardSkin.java) | **IHS** |  |
| [Monstrous Mouth](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/MonstrousMouth.java) | **MM** |  |
| [Prehensile Tail](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PrehensileTail.java) | **PT** |  |
| [Tentacles](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Tentacles.java) | **TE** |  |
| [Two Heads](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/TwoHeads.java) | **TH** |  |
| [Very Long Legs](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/VeryLongLegs.java) | **VLL** |  |

### Passing green

12 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Accurate](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Accurate.java) | **AC** |  |
| [Cannoneer](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Cannoneer.java) | **CAN** |  |
| [Cloud Burster](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/CloudBurster.java) | **CB** |  |
| [Dump-Off](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/DumpOff.java) | **DO** |  |
| [Give and Go](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/GiveAndGo.java) | **GG** |  |
| [Hail Mary Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/HailMaryPass.java) | **HMP** |  |
| [Leader](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Leader.java) | **LE** |  |
| [Nerves of Steel](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/NervesOfSteel.java) | **NOS** |  |
| [On The Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/OnTheBall.java) | **OTB** |  |
| [Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/common/Pass.java) | **PS** | PS avoids the PA stat label. |
| [Punt](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Punt.java) | **PU** |  |
| [Safe Pass](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SafePass.java) | **SP** |  |

### Devious orange

12 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Dirty Player](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/DirtyPlayer.java) | **DP** | No numbered text or +2 variant. |
| [Eye Gouge](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/EyeGouge.java) | **EG** |  |
| [Fumblerooski](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Fumblerooski.java) | **FUM** |  |
| [Lethal Flight](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/LethalFlight.java) | **LF** |  |
| [Lone Fouler](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/LoneFouler.java) | **LFO** |  |
| [Pile Driver](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/PileDriver.java) | **PD** |  |
| [Put the Boot In](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/PutTheBootIn.java) | **PBI** |  |
| [Quick Foul](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/QuickFoul.java) | **QF** |  |
| [Saboteur](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Saboteur.java) | **SAB** |  |
| [Shadowing](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Shadowing.java) | **SHA** |  |
| [Sneaky Git](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/SneakyGit.java) | **SG** |  |
| [Violent Innovator](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/ViolentInnovator.java) | **VI** |  |

### Traits black

36 entries.

| Skill or trait | Text | Review note |
| --- | --- | --- |
| [Always Hungry](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/AlwaysHungry.java) | **AH** |  |
| [Animal Savagery](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/AnimalSavagery.java) | **AS** |  |
| [Animosity](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Animosity.java) | **ANI** | Target keywords or all; retain targets in details; one ANI text identity. |
| [Ball and Chain](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BallAndChain.java) | **BC** |  |
| [Bloodlust](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Bloodlust.java) | **BL** | Numeric threshold; native default 2. Text stays BL; illustrated variants need review. |
| [Bombardier](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Bombardier.java) | **BOM** |  |
| [Bone Head](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BoneHead.java) | **BHD** |  |
| [Breathe Fire](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/BreatheFire.java) | **BF** |  |
| [Chainsaw](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Chainsaw.java) | **CHA** |  |
| [Decay](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Decay.java) | **DEC** |  |
| [Drunkard](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Drunkard.java) | **DRU** |  |
| [Hatred](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Hatred.java) | **HAT** | Target keywords; retain targets in details; one HAT text identity. |
| [Hypnotic Gaze](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/HypnoticGaze.java) | **HG** | Engine supports threshold formatting, default 0; no extra numeric variant proposed. |
| [Insignificant](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Insignificant.java) | **INS** |  |
| [Kick Team-Mate](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/KickTeamMate.java) | **KTM** |  |
| [Loner](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Loner.java) | **LO** | Numeric threshold; native default 4. Values 2, 3, and 4 observed across prayer/official stars; text stays LO. |
| [My Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/MyBall.java) | **MYB** |  |
| [No Ball](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/NoBall.java) | **NB** |  |
| [Pick-me-up](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PickMeUp.java) | **PMU** |  |
| [Plague Ridden](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/PlagueRidden.java) | **PR** |  |
| [Pogo](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Pogo.java) | **PG** |  |
| [Projectile Vomit](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/ProjectileVomit.java) | **PV** |  |
| [Really Stupid](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/ReallyStupid.java) | **RS** |  |
| [Regeneration](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Regeneration.java) | **REG** |  |
| [Right Stuff](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/RightStuff.java) | **RST** |  |
| [Secret Weapon](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/SecretWeapon.java) | **SW** | Engine supports threshold formatting, default 0; no extra numeric variant proposed. |
| [Stab](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Stab.java) | **STB** |  |
| [Stunty](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Stunty.java) | **STU** |  |
| [Swoop](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Swoop.java) | **SWO** |  |
| [Take Root](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/TakeRoot.java) | **TR** |  |
| [Throw Team-Mate](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/ThrowTeamMate.java) | **TTM** |  |
| [Timmm-ber!](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Timmmber.java) | **TIM** |  |
| [Titchy](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Titchy.java) | **TCH** |  |
| [Trickster](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/Trickster.java) | **TRI** |  |
| [Unchannelled Fury](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/mixed/UnchannelledFury.java) | **UF** |  |
| [Unsteady](../../ffb-common/src/main/java/com/fumbbl/ffb/skill/bb2025/Unsteady.java) | **UNS** |  |

## Parameter evidence and exclusions

- Loner: native default 4; BB2025 Bad Habits prayer grants 2; the official star supplement shows Black Gobbo with 3 and other stars with 4. These establish at least three illustrated-variant candidates, with LO on every text version. Ordinary core traits on stars remain part of the 108-entry inventory.
- Bloodlust: native default 2; the official supplement shows Captain Karina with 2. Review roster-backed variants before artwork; do not infer thresholds from the suggested number of illustrations.
- Mighty Blow: the native numeric modifier is 1; BB2025 cards list the skill without a numeric suffix. No +2 identity is included. Dirty Player likewise has no +2 identity.
- Hypnotic Gaze and Secret Weapon retain generic numeric evaluators in code with default 0. That API alone does not establish multiple BB2025 thresholds; no variant pack is requested for either.
- Animosity and Hatred may carry multiple keyword targets. They share one text identity per core trait.
- No unique star ability, stat advancement/reduction, or named temporary effect is included. Dodgy Snack, Greasy Cleats, and Iron Man do not receive marker assets in this scope. Prayers that grant a core skill reuse that skill's existing marker, without a second prayer-name badge.
- No BB2016-only or BB2020-only skill class is included. Mixed/common source paths are valid only because the BB2025 scanner selects their annotations. Native factory entries outside the curated core allowlist do not expand this manifest.

## Sources and verification

- [Agreed feature specification](feature-spec.md).
- [Tracking issue #293](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/293).
- [Machine-readable manifest](manifest.json), containing only the 108 core identities and their selected native metadata.
- [Curated core catalog](../../ffb-server/src/main/java/com/fumbbl/ffb/server/team/bb2025/SkillDefinitions.java) and [native skill selection](../../ffb-common/src/main/java/com/fumbbl/ffb/util/Scanner.java).
- [Official BB2025 supplementary star-player rules](https://assets.warhammer-community.com/eng_31-10_bb_starplayerslegends_2025-x9a5vmukgj-voazbjmkxq.pdf), used only to corroborate core-trait parameter examples on star rosters.
- [BB2025 prayers](../../ffb-common/src/main/java/com/fumbbl/ffb/inducement/bb2025/Prayer.java), including the temporary Loner threshold.
- [Verification record](verification.md) records the actual checks. Owner approval is pending; sample artwork is the next gated step.
