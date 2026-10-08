# Fifth match UI round: proposed tickets

Date: 2026-10-07. Product scope and ticket breakdown approved. Implementation, validation, per-slice PRs and merges, and a final retrospective are authorized.

GitHub is the canonical tracker. This document is the local design and handoff mirror. Tickets #185-#197 are published with `ready-for-agent`; the blocking relationships are also recorded natively on GitHub. No parent issue was supplied.

| Slice | GitHub issue | Blocked by | Delivery |
| --- | --- | --- | --- |
| T01 | [#185](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/185) | None | Merged in [#199](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/199) |
| T02 | [#186](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/186) | #185 | Merged in [#201](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/201) |
| T03 | [#187](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/187) | None | Merged in [#202](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/202) |
| T04 | [#188](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/188) | None | Merged in [#204](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/204) |
| T05 | [#189](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/189) | None | Merged in [#206](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/206) |
| T06 | [#190](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/190) | None | Implemented, reviewed and validated; PR pending |
| T07 | [#191](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/191) | None | Planned |
| T08 | [#192](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/192) | None | Planned |
| T09 | [#193](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/193) | None | Planned |
| T10 | [#194](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/194) | None | Planned |
| T11 | [#195](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/195) | None | Planned |
| T12 | [#196](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/196) | #195 | Planned |
| T13 | [#197](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/197) | #196 | Planned |

The existing match checkpoint, transcript, native rules, and canonical pitch remain authoritative. Each ticket delivers behavior through every affected layer and includes focused native/contract/browser verification as appropriate. Add a user-facing change-list entry for user-visible implementation changes. Preserve unaffected rulesets and the existing accepted-input, authorization, revision, and retry safeguards.

Older related issues have implementation history. The new tickets describe follow-up behavior and must preserve existing evidence and parent issue state. No speculative framework-only prefactoring ticket is proposed; any necessary small prefactoring belongs inside the behavior slice that verifies it.

Stadium structure, crowd, pitch padding/borders, corner overlap, and sideline artwork belong to the separate stadium chat. Concession-penalty warnings, setup cancellation, and review of unfinished-setup storage are deferred; the storage review remains in TODO.

The agreed sprite body-center rule refines the earlier camera decision's top-down alpha-bounds centering wording. T07 must reconcile that wording explicitly while preserving canonical occupancy, projection, camera behavior, and ground anchors.

## T01: List my unfinished matches on the game setup page

### What to build

A signed-in coach sees their unfinished matches on the game setup page and can resume an activated match or continue an unactivated setup without entering a match identifier manually.

### Acceptance criteria

- [ ] List unfinished matches involving the authenticated account, including awaiting-kickoff and disconnected matches; resolve ownership from durable authoritative membership/setup records.
- [ ] Show match-team names, opponent, and authoritative status, with Resume for activated matches and Continue setup for unactivated entries. Keep completed matches outside this current-games list.
- [ ] Refresh the list after relevant lifecycle changes and reconnect. Empty, loading, unavailable, and stale-entry states remain understandable.
- [ ] Resuming reaches the same accepted match checkpoint with the authenticated coach's existing role. Continuing setup restores the valid existing setup rather than creating a duplicate.
- [ ] Preserve account isolation and existing admission/retention rules; do not expose private match identifiers or ownership data from another account.
- [ ] Verify two accounts, multiple unfinished entries, unactivated/active/disconnected/completed cases, restart recovery, and a changed or unavailable entry.

### Blocked by

None (can start immediately).

T01 evidence: 42 focused client checks, 40 native checks (one opt-in live MariaDB verification skipped because the target is unconfigured), TypeScript/site build, and a controlled Playwright journey covering two accounts, two pages, setup continuation, kickoff state, unavailable entries, and lifecycle refresh during paging. Both independent review axes approved after fixes. Explicit index bootstrap is a rollout prerequisite.

## T02: Concede an activated match from the game setup page

### What to build

A coach can concede one of their activated current matches from its setup-page entry, using a confirmation prompt without launching the pitch.

### Acceptance criteria

- [ ] Offer Concede on activated matches in the current-games list, including before kickoff; unactivated entries retain Continue setup without a new cancellation feature.
- [ ] Require explicit confirmation. Cancelling the prompt makes no match change; preserve the existing generic irreversible-action warning without adding concession-penalty explanations.
- [ ] Resolve the authorized participant and current match revision and use the existing native concession/end-game behavior. Do not introduce new legality restrictions or change concession penalties.
- [ ] After acceptance, refresh the list and show completion clearly. No pitch window/tab is opened as part of conceding.
- [ ] A changed/completed match, unavailable connection, wrong account, double click, or uncertain retry cannot produce a second concession or bypass current-state checks. Handle failures without silently reporting success.
- [ ] Verify cancellation, successful concession while either team acts, before-kickoff concession, stale/completed state, reconnect, and exact-request retry behavior.

### Blocked by

T01: List my unfinished matches on the game setup page.

T02 evidence: 32 focused client checks, six native concession checks (both coaches before kickoff and all four coach/acting-team combinations during regular play), TypeScript/site build, and the controlled Playwright current-games journey pass. Cancellation sends no native request; uncertain retry retains the same request ID/revision, remains on setup, and refreshes the list after completion. The displayed preparation's subscription and reconnect selection are restored after concession replies; superseded preparation reads cannot clear the native match selection. Both independent review axes approve.

## T03: Open matches in the current tab and verify authenticated direct resume

### What to build

Launching or resuming a match uses the current browser tab by default, making the pitch usable for Codex browser annotations. A signed-in coach can resume through the full match URL using existing membership and recovery behavior.

### Acceptance criteria

- [ ] Default launch/resume navigates the current tab rather than opening a separate window. Retain an explicit optional new-window action.
- [ ] Verify a full match URL in a fresh browser context authenticated as the same account restores the permitted current match when membership/lifecycle data support resume.
- [ ] Reproduce and diagnose the reported NOT_FOUND path using local authorized test identities. Correct any admission/resume defect found; preserve genuine membership/lifecycle denials rather than relaxing access checks.
- [ ] Preserve the account's existing connection-replacement behavior, single authoritative mutation ordering, revision checks, request idempotency, and handling of uncertain pending requests. Add no Take control UI or simultaneous-control feature.
- [ ] Browser changes never automatically replay an uncertain action or fabricate a new participant. Display real unavailable/unauthorized/unknown-match failures clearly.
- [ ] Verify same-tab launch, explicit new-window behavior, fresh-context same-account resume, old-connection replacement, and wrong-account/unknown-match denials.

### Blocked by

None (can start immediately).

## T04: Check activation traits before Throw/Kick Team Mate movement and confirm teammate selection

### What to build

A coach declares Throw Team Mate or Kick Team Mate, resolves activation-trait checks, moves when permitted, selects a highlighted eligible adjacent teammate, confirms that teammate, and then chooses the landing square under the existing native rules.

### Acceptance criteria

- [ ] Resolve applicable activation-trait checks immediately after declaration and before movement or teammate selection; do not roll the same activation check again later in the sequence.
- [ ] Preserve each trait's native success/failure behavior, including restricted movement with any still-permitted action after Take Root. Required rerolls/reactions interrupt and resume correctly.
- [ ] Permit normal legal movement while the special action remains declared. Highlight currently adjacent eligible teammates with Right Stuff; refresh eligibility after accepted movement or changed authoritative state.
- [ ] Selecting a teammate stages a visible proposal. Before Confirm, the coach can change the teammate or cancel the proposal back to movement without committing the special action.
- [ ] Confirm commits the teammate selection and ends further movement; then offer native-valid landing squares and resolve the throw/kick normally. Keep the distinct throw/kick range and eligibility rules and later checks such as Always Hungry.
- [ ] End action remains available before teammate confirmation. Reject stale, ineligible, wrong-actor, duplicate, spectator, and replay submissions through the established command path.
- [ ] Verify stationary and move-then-action cases for both actions, trait failure/reroll, rooted-but-otherwise-legal behavior, no adjacent eligible target, cancellation, changed eligibility, and final landing/outcome against the native engine.

### Blocked by

None (can start immediately).

Related behavior: #114 and #170. This ticket adds the confirmed teammate-action sequence rather than changing the completed pass/movement contracts.

## T05: Use one skill reroll icon and test Pro before selecting the die

### What to build

Manual skill rerolls appear as one recognizable icon per offered source. Pro performs its test before the coach chooses the original die to reroll, and a single eligible die is handled automatically.

### Acceptance criteria

- [ ] Consolidate die-specific choices into one icon per manually offered skill source, including Pro and Brawler, with accessible names and hover/focus explanations. Preserve all concurrently eligible sources and keep/decline choices.
- [ ] Clicking Pro runs the native Pro test first. Keep original dice visible and show the Pro d6 in a separate location; any permitted reroll of the Pro test resolves through its own existing decision flow.
- [ ] A successful Pro test exposes the eligible original dice for selection, automatically rerolling when only one is eligible. Failed Pro preserves original outcomes and native restrictions on further reroll sources.
- [ ] Brawler rerolls its sole eligible die immediately; when more than one is eligible, select the die after clicking the single Brawler icon. Preserve native Both Down, activation, and Blitz eligibility restrictions.
- [ ] Preserve automatic skill rerolls, including movement Dodge; do not turn automatic behavior into a new manual decision. Actor ownership always follows the native offered prompt.
- [ ] Preserve prompt identity, usage accounting, exact retries, reconnect recovery, and stale/duplicate rejection across the new test-then-select state. Do not manufacture eligible choices in the browser.
- [ ] Verify one/multiple eligible dice, Pro success/failure and a permitted Pro-test reroll, Brawler eligibility, concurrent sources, uphill block ownership, automatic rerolls, and reconnect at each decision boundary.

### Blocked by

None (can start immediately).

Follow-up to #140 and #117: existing icons remain useful; the additional work is consolidation and the confirmed decision ordering.

T05 evidence: [native/manual-reroll verification](../verification/fifth-round-manual-rerolls.md). One native skill source produces one icon; source variants retain their exact commands in a local choice list. BB2025 Pro tests immediately and offers a permitted test retry afterward. Block Pro and Brawler then expose native eligible die choices, automatically resolving a sole candidate. Original dice, separate Pro d6, usage accounting, coach ownership, pending checkpoints, legacy commands, and automatic Dodge are covered. Both independent review axes approve.

## T06: Revise the pixel ball and its persistent pulsing highlight

### What to build

The loose ball has a readable MUTP pixel-art sprite and a coordinated circle/arrows highlight. A carried ball shows the highlight without an overlaid ball sprite.

### Acceptance criteria

- [ ] Preserve the accepted highlight color. The circle pulses over approximately 1.5 seconds, retaining faint visibility at its minimum.
- [ ] Inner arrows move inward/outward in synchronization with the circle and continue to point toward the ball position.
- [ ] Replace the placeholder ball with a coherent MUTP pixel-art asset using the established asset/provenance conventions.
- [ ] Show the sprite only for a loose ball; show the highlight for both loose and carried positions from authoritative public state.
- [ ] Align the marker across supported perspective/top-down modes, both coach ends, pan, zoom, and movement playback without intercepting pitch input.
- [ ] Preserve a readable static reduced-motion presentation and verify loose/carried transitions and representative crowded positions visually.

### Blocked by

None (can start immediately).

Follow-up to completed #178.

## T07: Correct residual player body and shadow centering

### What to build

Players' body centerlines align with the centerline of their assigned pitch squares, and their ground shadows align with the appropriate feet/ground anchor, across poses and camera modes.

### Acceptance criteria

- [ ] Reproduce representative off-center cases and determine whether each originates in sprite artwork/padding, pose metadata, projection, or shadow placement before changing it.
- [ ] Use the character's torso/feet body centerline for horizontal placement; asymmetrical weapons, extended limbs, and transparent export padding must not shift the body to a different apparent square center.
- [ ] Preserve perspective foot/ground placement and prone/stunned ground anchors. Reconcile the earlier top-down artwork-bounds wording with the newly agreed body-center rule explicitly.
- [ ] Align shadows with the canonical player/ground position without changing occupancy, hit testing, selection, or player identity.
- [ ] Follow the established team sprite workflow for any asset/metadata changes and preserve coherent native-size pixel art across affected poses and directional variants.
- [ ] Verify representative normal/large players, asymmetric artwork, standing/prone/stunned poses, both coach ends, all supported camera presets, and pan/zoom/playback with before/after centerline evidence.

### Blocked by

None (can start immediately).

Follow-up to #131 and #132, whose earlier implementation evidence must be preserved.

## T08: Color movement squares by native dodge and rush checks

### What to build

A coach can read each traversed square's dodge/rush difficulty directly from its color and target labels while constructing and reviewing a movement plan.

### Acceptance criteria

- [ ] Keep open no-roll movement squares light blue with a filled-square highlight, removing the dotted square border.
- [ ] Dodge colors reflect the applicable net penalty: yellow for no penalty/bonus, orange for -1, red for -2, and dark red for -3 or worse. Display the final required target in light lettering, such as 3+.
- [ ] Rush squares use slightly darker blue and show the actual native target, accounting for weather, Drunkard, Moles, and other applicable native modifiers.
- [ ] A square requiring dodge and rush uses the dodge color and shows both clearly identified targets. Do not color by reroll-adjusted probability.
- [ ] Color a square for the checks required when entering that square, not the hardest earlier check on the route. Preview earlier risks on the squares where they actually occur.
- [ ] Take forecasts/modifiers from the authoritative native route/action projection; extend that projection where needed without implementing a second rules engine in the browser or inventing percentage labels.
- [ ] Refresh indicators after changed waypoints, authoritative state, skill eligibility, or conditions. Keep labels/targets usable in both projections, both coach views, and keyboard interaction.
- [ ] Verify natural 2+/4+ agility cases, all specified dodge penalty bands, rush condition/skill changes, combined checks, and a safe destination reached through an earlier risky square.

### Blocked by

None (can start immediately).

Related completed route interaction: #170. Authoritative success percentages in #37 remain separate work.

## T09: Show additional movement checks as labeled pitch indicators

### What to build

Movement plans identify applicable checks beyond dodge/rush, including a ball pickup and movement-related skill reactions, at the squares where they occur.

### Acceptance criteria

- [ ] Inventory the currently supported native movement-related checks/reactions and project the applicable ones, including pickup on entering a loose-ball square, without changing their actual resolution.
- [ ] Add clearly named badges/indicators for those checks. Show a target only where the native mechanic supplies a meaningful target; contested/reaction behavior must not be reduced to a fabricated single d6 threshold.
- [ ] Preserve the agreed dodge/rush palette and allow multiple check labels to coexist without concealing either kind of risk.
- [ ] Indicators follow the actual planned route and square, update with authoritative conditions, and do not imply a safe path when an applicable additional check exists.
- [ ] Native forecast additions preserve access restrictions, canonical coordinates, actual command legality, and the versioned projection boundary; no hidden results or browser-only rule estimates are introduced.
- [ ] Verify a pickup route, representative supported skill reactions, overlapping checks, changed ball/skill state, interrupted movement, and readability in perspective/top-down modes.

### Blocked by

None (can start immediately). Coordinate the shared overlay with T08; its color changes are not a prerequisite for these independent badges.

## T10: Use team-only coach chat labels and numbered spectator speakers

### What to build

Coach chat displays only the match-team name. Spectators display stable Spectator1 through SpectatorN labels in a distinct MUTP-compatible color.

### Acceptance criteria

- [ ] Remove coach/internal-ID suffixes from coach speaker labels and resolve the correct match-team name from authoritative role/team identity.
- [ ] Assign spectator numbers by first posted message in the authoritative match chat history; retain each spectator account's number across reconnects and history reloads within that match.
- [ ] All viewers derive the same numbering from ordered history, including paged history; number allocation must not depend only on the currently visible page or a local connection count.
- [ ] Use one spectator speaker color that fits MUTP and is distinct from existing coach/system chat colors. Preserve readable contrast and text identity independent of color.
- [ ] System messages use Match. Add Home/Away only when coach team names collide; retain the team-only label otherwise.
- [ ] Verify both coaches, multiple spectators, repeat posts/reconnect, paging/late join, same-name teams, and unchanged authoritative chat ordering/deduplication.

### Blocked by

None (can start immediately).

## T11: Streamline action and committed-movement logs with persistent Game Log controls

### What to build

The Game Log distinguishes declarations from performed actions, gives readable primary action results and committed-movement summaries, and offers persistent Debug, Movement, and Roll modifiers checkboxes above the log.

### Acceptance criteria

- [ ] Log each declared player action as '<player> declares a <action>.' Format performed primary actions with the player, action, square/player target where applicable, actual roll, adjusted target, base target, and native outcome; include Secure the Ball and pass success/inaccurate/fumble examples.
- [ ] Replace raw team-choice/action-token sentences in the normal narrative with readable accepted action descriptions. Derive lines from authoritative transcript intent/reports rather than local guesses or replaying the engine.
- [ ] Add Debug OFF, Movement OFF, and Roll modifiers ON by default. Remember choices across browser restarts and apply them immediately to existing and new recorded history, including after reconnect.
- [ ] Debug adds a compact metadata line below the readable entry with relevant stable identifiers; it never replaces the readable sentence. Roll modifiers controls short modifier explanations while preserving the roll, final target, and base target.
- [ ] Movement shows one origin-to-actual-destination entry per committed movement action. One four-square plan produces one entry; four separately committed moves produce four. Interrupted plans report the reached endpoint without dropping the separate failure/check entries.
- [ ] Disabling Movement hides movement summaries/verbose movement choices while preserving declarations, rolls, rerolls, and outcomes. Keep existing readable non-player match-event messages.
- [ ] Establish reusable formatting and disclosure behavior while delivering these complete visible cases. Preserve authoritative history bounds, paging, retry deduplication, and canonical coordinates from either coach view.
- [ ] Verify declarations versus performance, successful/failed primary actions, single/multi-step/interrupted committed routes, all toggle combinations, preference reload, reconnect/history paging, and absence of identifiers/raw choices with Debug OFF.

### Blocked by

None (can start immediately).

## T12: Log activation checks, follow-up rolls, and reroll attempts chronologically

### What to build

The readable log records native activation checks, subsequent checks such as catch/pickup, and every original/rerolled attempt in its actual chronological order, using the delivered Game Log controls.

### Acceptance criteria

- [ ] Inventory the currently supported non-block native check/report families and give them accurate player, check/action, target, base threshold, adjusted threshold, modifier, and outcome wording where those fields apply.
- [ ] Do not infer a negative-trait or skill-test base from agility when its native mechanic uses a different base. Extend authoritative public report data if needed rather than guessing from browser stats.
- [ ] Keep activation checks, movement checks, pickup, catch, and other follow-up rolls in their actual order around the declared/performed action; do not duplicate a roll in both generic and specialized rows.
- [ ] Preserve the initial attempt and add a separate '<player> used <source> reroll.' entry followed by the new attempt/result. Represent automatic skill sources and rerolls of skill tests such as Pro accurately.
- [ ] Distinguish an individual failed attempt from a finalized turnover or other terminal consequence; show final consequences only when the native outcome establishes them.
- [ ] Use the shared Debug/Movement/Roll modifiers behavior on old and new history. Original attempts, reroll source, and resulting attempts remain understandable across live updates, reconnect, and paging.
- [ ] Verify native trait success/failure, altered thresholds, move/check/pickup and pass/catch sequences, automatic/manual rerolls, rerolled skill tests, exact retries, and transcript replay without engine execution.

### Blocked by

T11: Streamline action and committed-movement logs with persistent Game Log controls. This ticket extends that delivered narrative/disclosure behavior to the remaining non-block check families.

## T13: Explain block dice choices, skill use, pushes, and knockdowns in the log

### What to build

Block log entries show the rolled faces and chosen face with small dice images and readable names, followed by the actual player-specific skill decisions, pushes, knockdowns, and other native outcomes.

### Acceptance criteria

- [ ] Show the declared/performed block, attacker, defender, and actual initial block dice with face images and readable names, preserving all original and rerolled attempts under the chronological reroll conventions.
- [ ] Identify the actual chooser of the final die, including the opposing coach/player side in uphill blocks; never infer ownership from the attacking player alone.
- [ ] Log actual target/attacker outcomes, including push, knockdown, both down, both standing with relevant skills, and both prone through Wrestle, without combining distinct events into a misleading generic result.
- [ ] Log applicable native skill choices/use such as Dodge, Tackle, Grab, Brawler, and Wrestle with the correct acting player and target/source semantics; optional decisions remain distinct from automatic effects.
- [ ] Keep the chosen die, push selection/resolution, further reactions, and consequences in authoritative chronological order. Preserve the existing readable non-block/match-event log.
- [ ] Dice images have readable/accessibility fallbacks, and entries honor the delivered Debug/Movement/Roll modifiers controls across history reload and paging.
- [ ] Verify equal/uphill blocks, Brawler/Pro rerolls, Block/Dodge/Tackle/Wrestle interactions, chained pushes, and attacker/defender/both-player outcomes from native transcript fixtures.

### Blocked by

T12: Log activation checks, follow-up rolls, and reroll attempts chronologically. This ticket uses the delivered reroll narrative and inherited T11 settings/entry conventions for block outcomes.
