# Completed features and milestones

A condensed archive of completed Moles Under the Pitch work, grouped by area. Entries retain the original feature scope and important behavior; they are summaries, not a fresh audit of implementation or test results. Historical replacements and rollbacks are noted where relevant.

## Table of contents

- [Web delivery and team building](#web-delivery-and-team-building)
  - [Monorepo web integration](#monorepo-web-integration)
  - [Browser-only client support](#browser-only-client-support)
  - [Java 21 baseline](#java-21-baseline)
  - [DEV and PROD environments](#dev-and-prod-environments)
  - [CI/CD and release controls](#cicd-and-release-controls)
  - [Firebase-authenticated two-player session proof](#firebase-authenticated-two-player-session-proof)
  - [Team Builder MVP](#team-builder-mvp)
- [Movement and action planning](#movement-and-action-planning)
  - [Movement-range rollback](#movement-range-rollback)
  - [Replacement movement-range markings](#replacement-movement-range-markings)
  - [Single-confirmation movement and Blitz routes](#single-confirmation-movement-and-blitz-routes)
  - [Jump, Leap, and Pogo](#jump-leap-and-pogo)
  - [Streamlined pass and handoff declarations](#streamlined-pass-and-handoff-declarations)
  - [Hail Mary Pass](#hail-mary-pass)
- [Pitch targeting and player markers](#pitch-targeting-and-player-markers)
  - [Cursor square selection marker](#cursor-square-selection-marker)
  - [Opposing-player threat markings](#opposing-player-threat-markings)
  - [Kickoff targeting and ball placement](#kickoff-targeting-and-ball-placement)
  - [Block dice previews and presentation](#block-dice-previews-and-presentation)
  - [Block and Blitz assist visibility](#block-and-blitz-assist-visibility)
  - [Limited-use action tags](#limited-use-action-tags)
  - [Negative-condition markers](#negative-condition-markers)
- [Game interface and presentation](#game-interface-and-presentation)
  - [Smooth gameplay and predictable game speed](#smooth-gameplay-and-predictable-game-speed)
  - [Dice effects and visible duration](#dice-effects-and-visible-duration)
  - [Chat and game log sizing](#chat-and-game-log-sizing)
  - [Game log enhancements](#game-log-enhancements)
  - [Game phase tracker](#game-phase-tracker)
  - [Player action menu](#player-action-menu)
  - [Apothecary decisions](#apothecary-decisions)
  - [Camera perspective controls](#camera-perspective-controls)
- [Skills and traits](#skills-and-traits)
  - [Player skill markers](#player-skill-markers)
  - [Reactive skill decisions](#reactive-skill-decisions)
  - [Optional skill use](#optional-skill-use)
  - [Skill usage and reroll prompts](#skill-usage-and-reroll-prompts)
- [Computer coaches](#computer-coaches)
  - [Bogruk the Almost Clever](#bogruk-the-almost-clever)
  - [Gobbo "Wot Now?" Snotpick](#gobbo-wot-now-snotpick)
- [Stadium artwork](#stadium-artwork)
  - [Modular stadium, crowd, and accessories](#modular-stadium-crowd-and-accessories)
  - [Stadium and crowd removal](#stadium-and-crowd-removal)

## Web delivery and team building

### Monorepo web integration

Consolidated the original website DEV/PROD proposal and the subsequent monorepo integration milestone.

- Organized the imported website into `site/`, the independently buildable HTML5 client into `browser-client/`, and deployment support into `deployment/firebase/`, retaining the Java engine modules.
- Assembled a single Firebase Hosting artifact serving the public site at `/`, the client at `/play`, and authentication completion at `/login/complete`.
- Included project updates, privacy, support, and the educational project's non-affiliation statement in the public site.
- Recorded source provenance and imported-file destinations or exclusions before removing temporary import staging. Excluded nested Git metadata and secrets.

### Browser-only client support

- Retired Java desktop/WebStart clients in one cutover, removing their modules, packaging, transports, sessions, exclusive shared definitions, and obsolete server services.
- Made Browser V2 the normal server startup path; retained Browser V1 through explicit local diagnostic configuration. No historical game/save/replay compatibility is required.
- Preserved shared native rules, event logs, assets, and browser live play, spectating, recovery, and replay behavior. New databases receive browser tables only; existing local data is preserved.
- Updated current operational and agent guidance, CI, and clean container packaging. Historical references and attribution remain.
- Validated Java/browser builds and regression suites, V1 smoke, and a fresh authenticated two-coach match through full time. Actual JVM restarts preserved the suspended match and completed replay. See [issues #379?#381](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/379) and the [implementation outcome](../docs/specs/browser-only-support-outcome.md) for exact evidence.

### Java 21 baseline

- Established JDK 21 as the minimum for every Java module, with release-21 project bytecode and pinned Temurin 21.0.11+10 validation. Compatible third-party libraries may retain older bytecode.
- Unified bootstrap, both build launchers, Windows/Linux setup and CI around the Java 21 toolchain. Removed the older-JDK manifest and provisioning requirement, and replaced the Java 8 Maven container stage with checksum-verified Maven on Java 21.
- Made Mockito 5 the reactor default and updated current build, runtime and agent guidance while preserving historical documentation and stored-match compatibility boundaries.
- Preserved game mechanics, protocol, replay and recovery behavior. Validated native and game-service builds, browser unit/build and complete interaction/hosted suites, packaged startup, and isolated V2/JDBC recovery and completed replay. Exact opt-in limits are in the outcome report.
- Tracked the delivered scope in [#384](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/384), with [implementation and validation evidence](../docs/specs/java21-baseline-outcome.md). Optional source modernization remains backlogged separately in [#383](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/383).

### DEV and PROD environments

- Used one codebase with explicit environment selection, public configuration supplied at build time, and Firebase aliases in `.firebaserc`.
- Defined DEV as `dev.molesunderthepitch.org` / `dev-moles-under-the-pitch-org`, and PROD as `molesunderthepitch.org` / `moles-under-the-pitch-dot-org`.
- Separated authentication user stores, authorized domains, provider registrations, return URLs, credentials, and game-service token validation by environment.
- Kept production users and sessions out of DEV, rejected cross-environment tokens, and supported documented local emulators or test doubles.
- The original integration scope included Google, Microsoft, and email-link authentication; the later session-proof milestone deferred Microsoft.

### CI/CD and release controls

- Ran affected Java, browser-client, static-site, and Hosting-assembly checks for pull requests and `main` changes.
- Used short-lived feature/fix branches and stable integration on `main`, with verified `main` builds deploying to DEV.
- Defined immutable `moles-v*` production releases from `main`, explicit GitHub `production` environment approval, recorded release provenance, and a documented rollback path.
- Isolated deployment credentials and used GitHub OIDC with Google Workload Identity Federation rather than long-lived Firebase tokens or committed keys.
- Kept optional Hosting preview channels for visual review, with real authentication testing in persistent DEV.
- Documented local development, environment configuration, secrets, releases, and rollback in `docs/development-and-release.md`. The initial web-delivery milestone deferred Java deployment until a separate service host was selected.

### Firebase-authenticated two-player session proof

- Signed in through Google or email links at `/login`, then entered `/play`; signed-out users returned through a fixed, validated `/play` return path. Microsoft was deferred.
- Connected two independently authenticated accounts to a private session using an invite code/link, showing occupied slots, presence, connection state, and ordered shared chat/events.
- Used a production session WebSocket endpoint separate from local diagnostics, with TLS/WSS, matching-environment Origin checks, and environment-specific `gameWebSocketUrl` configuration.
- Sent a fresh Firebase ID token only in the initial authentication message. Verified signature, expiry, issuer, audience, and project before accepting a session; derived identity from the verified UID.
- Used provider-neutral internal accounts and identity links, enforcing one active player presence per account/session. Firebase bearer tokens were not described as one-time tickets.
- Validated message types, sizes, rates, and membership; bounded session history and treated chat as plain text. Kept tokens, raw UIDs, and email addresses out of opponent-visible data, logs, and URLs.
- Covered refreshed-token reconnects, rejection and expiry states, and cross-device email completion. Kept local diagnostic credentials in explicit local development only.
- Provisioned separate DEV/PROD Java service hosting; Firebase Hosting remained static hosting. This proof excluded game rules, teams, matchmaking, spectators, account linking/migration, and existing FUMBBL accounts.

### Team Builder MVP

- Added a branded `/teambuilder` page for Human and Orc rosters, replacing the embedded builder on the create/join game page.
- Displayed roster reference details with a remembered show/hide preference; supported player recruitment, names, sprites, ordering, unique integer numbers, and a team captain.
- Supported sideline staff, rerolls, fan factor, and up to five valid skill/stat advances per player, with accurate team-value calculation and no spending cap for the MVP.
- Validated rosters before enabling JSON download; generated a stored team UUID usable alongside JSON uploads on the create/join page, which also validated teams.
- Excluded league progression, star player point tracking, biographies, custom imagery, star-player recruitment, and inducements.

## Movement and action planning

### Movement-range rollback

Consolidated the duplicate "Roll back player range markings" and "Revise player movement range markings" entries.

- Removed the original translucent movement/risk overlays and Dodge/Rush target-number labels from issues #230 (own-player ranges) and #231 (opponent inspection).
- Preserved the movement improvements from #232 (single confirmation), #233 (unified routes and right-click undo), and #234 (fluid Blitz movement and block).
- This was a historical cleanup milestone preceding the replacement range presentation below; the copied acceptance criteria requesting the removed overlays were discarded.

### Replacement movement-range markings

- Marked normal movement with a MUTP-yellow dotted perimeter and maximum movement including rushes with a MUTP-blue solid perimeter.
- Used small, translucent grey caution triangles in rush-only squares; accounted for two rushes normally or three with Sprint.
- Calculated effective range from movement already used, posture, Rooted/Stunned status, Jump Up, and other relevant skills and traits.
- Supported selecting either team's players: active-team ranges reflected remaining movement, finished activations showed no range, and opponents showed their next-activation range.
- Redrew ranges after committed movement destinations rather than at every square of a queued route.

### Single-confirmation movement and Blitz routes

- Planned movement and actions before committing with one confirmation, retaining ordinary rules and game logging.
- Used dots for route waypoints, highlighted the planned action, and removed the most recent planned step with right-click.
- Preserved unified routes and combined Blitz movement/block execution during the range-overlay rollback.

### Jump, Leap, and Pogo

- Enabled jumping within movement and combined actions such as Blitz, Pass, and Foul, including a jump as the first movement after an explicit action declaration.
- Placed the jump control beside Move, with availability based on the player's position and Jump/Leap/Pogo eligibility.
- Used normal destination waypoints and curved route segments to depict jumps; confirmation executed the planned movement.
- Temporarily replaced normal threat overlays with landing difficulty, accounting for Leap/Pogo modifiers and relevant opposing skills, then restored normal overlays after selection, execution, or cancellation.

### Streamlined pass and handoff declarations

- Inferred Handoff when a selected friendly receiver was adjacent to the route endpoint, and Pass when the receiver was farther away.
- Supported a current ball carrier or a player whose planned route crossed the loose ball, including plays with no preceding movement.
- Highlighted the inferred action, allowed right-click undo of the target or latest waypoint, and committed the full play with one confirmation.
- Retained normal pickup, pass, catch, and turnover rules; a failed pickup prevented the planned throw. The pass-difficulty overlay remained required only for explicitly declared passes.

### Hail Mary Pass

- Added modal Hail Mary options beside normal Pass and Throw Bomb, with distinct icons and the same toggle behavior as Jump/Leap/Pogo.
- Exposed each option only to eligible players with Hail Mary Pass and, for bombs, Throw Bomb capability.
- Allowed any pitch square as the target, treated the test as a Long Bomb, converted accurate outcomes to inaccurate ones, and prevented interceptions.
- Consumed the normal per-turn Pass or Throw Bomb allowance as appropriate and updated the targeting overlay accordingly.

## Pitch targeting and player markers

### Cursor square selection marker

- Reused the selected-square graphic to follow pointer hover over selectable pitch squares.
- Hid the marker beneath interface panels and gave placement, follow-up, Sidestep, and other action-specific indicators priority.
- Applied the feature to pointer input rather than touch-only use.

### Opposing-player threat markings

- Showed opposing tackle zones when selecting a friendly player whose activation had not ended, counting only standing, non-distracted opponents.
- Colored overlapping zones green/yellow/orange/red for one/two/three/four-or-more zones, with translucent fills capped at 50% opacity.
- Used a small white caution triangle with a red T for Tackle, and diagonal transparent stripes for movement-affecting skills such as Prehensile Tail, Diving Tackle, and Tentacles. Combined both when applicable.
- Added Game Settings controls for tackle-zone visibility and individual skill overlays.

### Kickoff targeting and ball placement

- Replaced blanket receiving-half highlighting with a ball-and-circle marker that snapped to the hovered legal square.
- Kept the ball visible through target selection and deviation.
- For an eligible Kick skill decision, showed a distinct alternate landing marker and an arrow from the unmodified landing square toward the adjusted square.
- Used a clear Yes/No prompt for Kick without changing kickoff rules.

### Block dice previews and presentation

- Previewed one, two, or three hovering, rotating block dice before confirming a Block or Blitz, recalculating for a new target and clearing on deselection.
- Used a subtle shadow/smoke effect around dice and reroll icons in place of the containing box; uphill blocks received a red warning glow.
- Transitioned from preview into the actual roll and normal die selection when confirmed.

### Block and Blitz assist visibility

- Marked the blocking square and target from proposal through resolution, using the planned endpoint for a distant Blitz and clearing cancelled plans.
- Distinguished offensive and defensive assists through both shape and color, pointing toward the relevant target or blocking player.
- Used restrained animated indicators that remained visible above tackle-zone overlays, including when the opposing coach selected an uphill block result.

### Limited-use action tags

- Attached action-specific markers to players consuming limited actions such as Blitz, Pass, Handoff, or Throw Bomb, including implicit planned actions.
- Applied tags when the action allowance was consumed even if a failed trait roll prevented execution or changed the eventual action.
- Kept tags attached as players moved or were pushed, and cleared them at every turn end.

### Negative-condition markers

- Marked Distracted, Chomped, Rooted, Dodgy Snack, Greasy Cleats, and Eye Gouged conditions with icons styled consistently with limited-action tags.
- Arranged multiple condition/action markers in a centered horizontal row above the player, using dark circles, light-blue outlines, and red condition imagery.
- Applied and removed each marker with its condition, retaining it across turns when the condition persisted.
- Made markers visible to coaches and spectators, with a Game Settings visibility toggle.

## Game interface and presentation

### Smooth gameplay and predictable game speed

Consolidated the overlapping "Smooth gameplay" and "Game speed setting" entries.

- Reduced delays between confirmation and action execution and kept menus responsive.
- Presented consistent square-to-square player movement rather than variable-speed jumps or apparent teleporting.
- Paced consecutive dice results and ball deviations, scatters, and bounces so each event could be followed; isolated rolls could appear immediately.
- Coordinated engine/client processing and visual playback while retaining game rules and established MUTP styling.

### Dice effects and visible duration

- Added directional materialization on arrival and an evaporative fade on removal, with initial targets of 50 ms fade-in and 100 ms fade-out.
- Added small animated indicators for broken armor, Stunned, Knocked Out, casualty removal, Badly Hurt, MNG, Niggling Injury, stat reduction, and death.
- Doubled the normal display duration for broken-armor, injury, and casualty results independently of fade timing.
- The original artwork review covered both MUTP-color and event-appropriate color variants.

### Chat and game log sizing

- Added dugout-style minimize/expand controls beside each panel's text-size control.
- Collapsed panels to a title bar, restored their default size, or expanded them to the available space without overlapping inducements or game-menu elements.
- Repositioned the corresponding dugout with each panel and respected expanded-dugout space limits.

### Game log enhancements

- Standardized event wording, capitalization, punctuation, and detail using the fouling, drive-start, and block/injury examples in `.notes/art-preview/logging-improvements.md`.
- Kept the main Game Log and Game Settings log complete and consistent, addressing stalled visible updates and removing Earlier/Later pagination.
- Replaced legacy block icons and numeric results with current block, D3/D6, D8, and D16 dice imagery.
- Reduced each Small/Medium/Large font option by one size step and scaled dice accordingly.
- Highlighted chosen block results clearly, with red outlines for results chosen by the opponent on uphill blocks.

### Game phase tracker

- Displayed the drive-start sequence on the receiving team's side beneath inducements: secret-weapon send-offs, KO recovery, kicking setup, receiving setup, kick target, kickoff event, and receiving-player actions.
- Followed engine sequence state, omitted inapplicable phases, highlighted the current phase, and faded completed phases using turn-counter styling.
- Added an indented current step for High Kick, Solid Defense, Quick Snap, or Charge! decisions.
- Removed the tracker when normal drive actions began.

### Player action menu

- Replaced the large menu with compact action icons centered beneath the confirmation position and tailored to the selected player's abilities.
- Included eligible special actions such as Chainsaw, Throw Bomb, Throw Teammate, and Kick Teammate; faded consumed limited actions.
- Highlighted the selected action in yellow with a slight raised animation and faint light-blue glow.
- Moved End Turn beneath the relevant team's timer, added Backspace as a shortcut, and retained confirmation when players remained unactivated.
- Removed the server-actions menu.

### Apothecary decisions

- Presented the current injury or KO result alongside Use Apothecary, with an injury-specific icon and readable consequences such as stat loss, MNG, or Niggling Injury.
- Declining applied the original result and retained the apothecary; use presented the original and rerolled results for selection under normal rules.
- Reflected consumption in the inducements display and used consistent MUTP decision styling.

### Camera perspective controls

- Added main-screen controls for a 180-degree home/away perspective flip and a cycle through 30°, 40°, 50°, and overhead views; moved Debug to the opposite side of the same row.
- Updated icons and status messages to identify the perspective or angle, labeling the top-down mode "Overhead view."
- Preserved angle during a perspective flip and remembered the flip while overhead for the next perspective view.
- Mirrored pitch, players, and stadium presentation for coaches and spectators.

## Skills and traits

### Player skill markers

- Cataloged skills and traits with short abbreviations and both text-based portrait markers and distinct graphical icons anchored to players.
- Applied category colors: General blue, Agility yellow, Strength red, Mutation purple, Passing green, Devious orange, stat changes grey with green/red arrows, and negative traits/star-player skills black.
- Added a scrollable Skills & Traits settings tab with controls for own/opponent teams, base/acquired skills, traits, and Small/Medium/Large marker sizing.

### Reactive skill decisions

- Reviewed BB2025 skills requiring decisions outside the acting coach's normal flow, including Diving Tackle, Shadowing, Stand Firm, and Sidestep.
- Interrupted the sequence to prompt the appropriate coach, including active-team decisions arising from chain pushes.
- Enforced a server-side 30-second decision timeout with no response treated as decline, and showed relevant target numbers or roll consequences.
- Checked the identified reactive skill logic against the BB2025 references.

### Optional skill use

- Added Automatic Skill Use preferences under Game Settings > Skills & Traits for skills with optional usage.
- Offered Always Use and Always Ask for each supported decision, distinguishing different contexts for a skill where necessary, such as movement versus blocking.
- Applied automatic acceptance or the normal timed prompt according to the coach's preference.

### Skill usage and reroll prompts

- Replaced oversized prompts with compact circular decisions positioned to avoid obscuring the affected player.
- Placed the skill/decision in the center, Yes above, No below, and the timer around the perimeter, turning red for the final 20%.
- Retained a faded black outline and MUTP styling, omitted the unnecessary player name, and kept triggering dice in their usual pitch location.
- Preserved skill and reroll outcomes; the original design step compared three visual mockups.

## Computer coaches

### Bogruk the Almost Clever

Difficulty: **Weak**. Description: **"Loves a risky play, especially when there's a perfectly good safe one."**

- Added a distinct selectable policy within the existing `computer-player/` architecture and `/browser/v2` transport, alongside the random coach.
- Used BB2025-informed heuristics to pursue loose balls, advance toward the correct endzone, take available touchdowns, support teammates, pressure carriers, and choose useful blocks.
- Added bounded, reproducible mistakes through injected randomness: risky blocks, unnecessary dodges/rushes, poor action ordering, and low-value fouls, with centralized risk settings.
- Handled setup, kickoff, rerolls, skills, block choices, and unfamiliar mandatory prompts through legal fallbacks; kept server authority and decision work bounded.
- Reassessed after changed possession, turnovers, and reconnects; retained coach identity, request retry guarantees, and safe diagnostic reasons through recovery/save-resume.
- Kept other rulesets, transport/authentication, and the existing random policy outside the policy change.

### Gobbo "Wot Now?" Snotpick

Difficulty: **Random**. Description: **"Calls plays by throwing a squig at the playbook."**

- Rebranded Coach Bugman - Random in registration, opponent selection, and new-match presentation while retaining its random policy, setup behavior, and action limits.
- Preserved stable internal identities and reconnect/save-resume compatibility, historical completed-match names, operational credentials/configuration, and the team name **Bugman's Best**.
- Updated related documentation and display expectations, accounting for punctuation and narrow layouts.

## Stadium artwork

### Modular stadium, crowd, and accessories

- Established layered static and animated asset bundles for Old World Classic and Badlands Brawl, selected by the home team's league.
- Covered perspective and overhead views without objectionable stretching, retaining playable square size and pitch visibility.
- Used bowl-shaped stands with wall depth, roughly two squares of sideline space, benches, locker-room entrances, and themed sideline accessories.
- Represented Human/Dwarf/Halfling and Orc/Goblin/Ogre/Troll crowds with varied skin tones and genders, dense seating, visible upper bodies, and smooth, restrained cheering loops.
- Matched home/away crowd clothing to team palettes (Human blue and Orc orange/brown), with a themed divider at the line of scrimmage.

### Stadium and crowd removal

- Removed the then-current stadium and crowd graphics as a clean-slate step for a full visual overhaul.
- Retained the pitch and other game elements. This records a separate historical milestone from the modular stadium work above.
