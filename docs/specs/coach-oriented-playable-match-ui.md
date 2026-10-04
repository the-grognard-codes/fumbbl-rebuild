# Coach-oriented playable match UI

Status: handoff approved by the owner on 2026-10-04. Tracking issue: [#101](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/101). Completed work was reconciled through [PR #100](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/100). The owner authorized branch/implement/review/test/commit/PR/checks/merge cycles for every slice and a final retrospective. [Baseline and affected checks](coach-oriented-match-ui-baseline.md) record the starting integration boundaries.

Implementation completed on 2026-10-04: all eight slices merged through PRs #102–#109 and passed the agreed real-server local gate. See the [outcome](coach-oriented-match-ui-outcome.md), [acceptance evidence](coach-oriented-match-ui-acceptance.md) and [retrospective](coach-oriented-match-ui-retrospective.md). The approved requirements below remain the record of the original plan. Hosted signed-in release acceptance is still separate.

Presentation decision: [ADR 0003](../adr/0003-coach-oriented-angled-pitch.md). Approved visual reference: [v4 travelling-pitch viewer](../adr/references/0003-angled-pitch-v4/viewer.html). This specification replaces the first pitch MVP's presentation requirements while retaining its authoritative gameplay and interaction contracts.

## Outcome

Replace the first-draft pitch in the existing match application with the approved MUTP presentation. A coach must be able to complete a real BB2025 Human-versus-Orc match through the new UI, including setup, kickoff, both halves, touchdowns, turnovers, injuries and required engine choices. Both coaches, spectators and replay viewers use the same projected pitch and player identities. The existing computer-opponent path remains supported.

The unattended implementation is complete only when real-server local acceptance passes and reviewable evidence is saved. Hosted signed-in account testing remains a separate release gate. Mock responses, replayed projection fixtures and screenshots cannot establish that a complete live match is playable.

## ADR review and settled decisions

| Area | Current position | Integration obligation |
| --- | --- | --- |
| Projection | 40-degree, zero-yaw perspective accepted; DOM/SVG remains the first implementation | Extract a shared projection service and use it for rendering and input |
| Tactical view | 90-degree orthographic, square cells, north–south scrolling | Preserve camera position, coach orientation, selected player and pending decisions when switching |
| Geometry | Reference checks cover 390 cells, both ends and 40 camera positions | Repeat with live players, routes, targeting, resizing, drag/drop and decision overlays |
| Scenery | Approved painted crowd, stands and turf travel with the camera | Reuse the approved art under the same camera; document painted-depth distortion/repetition as an MVP limitation |
| HUD | Layout and styling accepted for MVP | Replace every sample name, statistic, count, timer, turn, log entry and chat message with authoritative data |
| Gameplay | Existing `/browser/v2` match paths have broad action/prompt support | Adapt existing paths; close any reachable Human/Orc dead ends found during acceptance |
| Art | Existing reference has repeated standing cutouts | Deliver twelve position archetypes with poses and portraits |
| Verification | Camera/reference evidence exists; full new-view match acceptance does not | Complete the local real-server matrix below |

Owner answers from the requirements interview:

1. **Twelve position archetypes**, one complete pose/portrait set per Human and Orc position; individual jersey numbers and match-player identity remain separate.
2. **Confirm planned actions only**. Required engine decisions submit directly from their offered choices. Preserve existing reviewed multi-player selection/confirmation flows.
3. **Ivory/cyan dice**, using the reviewed block/d6 face artwork and short roll animation.
4. **Real-server local acceptance** completes the unattended run. Hosted signed-in acceptance is recorded separately.

The approved UI is the layout target. The 35/55-degree studies, yaw controls, Full 26 × 15 selector and reference toolbar do not become production match controls. Adjustable yaw, overtime gameplay, additional team artwork and a new stadium model remain later work. The 17–24 turn-track range remains a prepared presentation hook.

## Preserve the match application

Reuse the existing match entry points, transport, account/team ownership, frozen match teams, setup session, legal action generation, route planner, prompt handling and transcript/replay storage. Replace presentation without creating a second gameplay engine or a separate mock-only match application.

Preserve current working-tree changes. Before editing, record the baseline branch/revision, file status, relevant checks and existing failures. The working tree already contains first-draft improvements to names, clocks, player details, game menu, decisions and setup/server behavior. Integrate those changes; do not reset or silently replace them.

Keep normal match creation/joining, the computer-opponent flow, saved matches and resume, concession safeguards, spectators, results and replay reachable. Replay and spectator mode expose inspection and camera controls without mutation controls. Existing keyboard/text companions remain functional.

Use [the prior authoritative match specification](authoritative-match-window-and-gameplay.md), [browser pitch interactions](browser-pitch-interactions.md) and their current source implementations as the behavioral baseline. New visual arrangements supersede the old horizontal pitch and fixed sidebar/ribbon arrangement; they do not remove gameplay capabilities. Existing Last used recall can live inside Other action rather than adding another primary button.

### Existing integration boundaries

| Boundary | Current implementation | Change responsibility |
| --- | --- | --- |
| Shared pitch | `browser-client/src/LivePitch.tsx`, `LiveDugouts.tsx`, `PitchCompanion.tsx` | Replace rectangular rendering/input assumptions; retain canonical callbacks, off-pitch access and text controls |
| Match orchestration | `browser-client/src/SetupPanel.tsx`, `play-entry.tsx`, `v2-client.ts` | Preserve real transport, staging, route requests/commits, actor guards and reconnect while changing presentation |
| Projection contract | `browser-client/src/setup-protocol.ts`, `ffb-server/src/main/java/com/fumbbl/ffb/server/match/SetupSession.java` | Reuse existing projected facts; pair any necessary versioned extension with strict decoding and server tests |
| Action/choice generation | Native match action classes and `CorePromptActions.java` in the server match package | Keep the native engine authoritative; repair a reachable missing browser choice without inventing client legality |
| Live HUD | `LiveMatchScoreboard.tsx`, `PlayerHoverCard.tsx`, `MatchDecisionDialog.tsx`, `MatchEventLog.tsx`, `MatchHistory.tsx`, `GameMenu.tsx` | Adapt existing components and their clock/player/name helpers to the approved frames and live state |
| Art delivery | `assets/game/teams/*/team.json`, versioned source/master packs, `assets/game/scripts/sync-browser-assets.mjs` | Extend the catalog and strict copy/check contract for poses/portraits; retain existing roster IDs and variants |

File names in the HUD row are under `browser-client/src/`. New projection and sprite-resolution modules should expose a small canonical interface rather than leaking camera math or file-name rules into every HUD/control component.

## Shared camera and input boundary

- Keep canonical `x=0..25`, `y=0..14`: 26 length rows, 15 width columns, 390 squares, end zones at x=0/25, midfield boundary x=13 and wide-zone boundaries y=4/11.
- Choose the coach end from match membership. Home looks toward increasing canonical x; away reverses both ground axes. Turn/half changes do not flip the view. Spectators/replay viewers may choose either end.
- Own projection, inverse projection, clipping, camera-relative navigation and visible bounds in one instantiable, testable service. It accepts canonical coordinates and the actual pitch viewport; it does not own legality or transport.
- Perspective keeps elevation, height and lens fixed while travelling along the pitch. Fit/resize or an explicit user zoom may choose a new lens; scrolling never refits to the remaining finite pitch. Equal camera-relative distance produces equal apparent square size.
- Top-down uses the same longitudinal axis and opposing ends, constant scale and no vanishing point. It translates turf, markings, players, ball, sidelines and stands together.
- Position ground geometry, selection, shadows, routes, hazard indicators, push arrows, ball and actor anchors through that service. Sort upright bodies by camera depth with a stable identity tie-breaker.
- Standing sprites use visible-foot anchors in perspective and visible-artwork centers in top-down mode. Prone/stunned ground poses use a recorded ground-center anchor. Transparent source padding must not affect either placement.
- Convert viewport pointer coordinates to scene coordinates before inverse projection. Reject out-of-pitch targets. A player control selects its canonical player ID; artwork overhang does not change occupancy or redirect a ground-square intent.
- Drag-to-pan suppresses selection/commit. Setup/Solid Defence drags retain their separate canonical player/drop intent, reject occupied/illegal targets and remain distinguishable from camera dragging.
- Keyboard traversal follows camera-relative screen directions and announces canonical coordinates. Reveal offscreen keyboard targets. A required decision, selected target, ball or active player has an explicit reveal control; automatic reveal is limited to making a new required decision accessible, without continuous forced tracking.
- Projection switching and camera travel do not change match revision, action IDs, permissions, route identity, selected player or pending decisions. Reproject local overlays and dismiss/reposition transient hover cards as needed.

## Live HUD and interaction

Use the approved navy/cyan/gold frames, pixel theme and licensed MUTP typography. Recreate editable text/controls in HTML/SVG; baked reference names, statistics and Half/Turn text never appear underneath live text.

| Surface | Required live behavior |
| --- | --- |
| Names and score | Frozen match-team names and authoritative scores; fit long names without clipping or horizontal page overflow |
| Team resources | Available, positive resources only, no heading, icon/count hover and keyboard tooltip with help cursor; never retain illustrative bribes/kegs/wizards when absent |
| BANK / TURN | Beside the respective nameplates, BANK above TURN; reuse authoritative clock/reserve projection and existing pause/resume behavior |
| Turn tracks | Eight slots per team, 1–8 then 9–16 from authoritative per-team turn/half state; MUTP yellow current slot and faint completed slots; distinguish not-yet-started turn 0 from turn 1 |
| Weather area | Preserve the clear space below the central score; weather presentation remains a later addition |
| Player selection | Cyan ground-square highlight; no rectangular outline around the upright sprite |
| Player inspector | One player at a time, independent of selection, on hover/focus from pitch or dugout; portrait, identity/number, position, MA/ST/AG/PA/AV, skills and full authoritative status |
| Inspector dock | Above chat or event log on the side opposite the selected player's screen location; centered selection uses the left dock; never stale Alden/another player's summary |
| Primary actions | Move, Block, Blitz, Other action and End Turn; only legal server-offered actions can be prepared or committed |
| Other action | All currently eligible remaining actions and variants, not a hard-coded Pass/Hand-off/Foul list; matching expandable rows above Confirmed!, contained scrolling when needed |
| Confirmed! | Matching button above the dock; commits the current valid planned command/route through the existing guarded mutation path |
| Required choices | Contextual, focus-managed choices using offered IDs; block dice, rerolls, skills, push/chain-push and other prompts retain direct choice submission and actor isolation |
| Event log | Durable authoritative decisions/outcomes, existing log families and pagination; A/A/A controls retain small/medium/large, with current medium size |
| Chat | Real match transport, sender identity/history/reconnect; Enter reveals the entry, Escape preserves a draft, text stays escaped and editing cannot pan the field |
| Dugouts | Compact reserves/KO/casualty/sent-off/other access, hover/focus inspection and legal setup drag/click controls; real off-pitch identities remain reachable |
| Game menu | Existing save/resume, concession, interface and keyboard controls remain available; camera controls move here/into the match surface rather than retaining the study toolbar |

Resources, clocks, chat and event-log **backgrounds** default to 30% opacity; text and icons stay opaque. Use one shared presentation value. The requested opacity setting is a future hook, not an additional UI design workstream in this MVP.

If a reference resource is not present in the current projection, omit it until a native-backed field is added. Extend the protocol only when integration requires real information: version it deliberately, update strict decoders and both sides together, and test missing/invalid/unauthorized values. Never infer inventory from pictures or use a resource button to fabricate an engine action.

### Confirmed actions and routes

Preserve the existing select/confirm/response sequence. Selecting an offered Move/Stand, Block or Blitz stages its declaration. Confirmed! sends that declaration. Once the server establishes an active mover, read-only waypoint requests obtain a server-bound route preview; Confirmed! then commits the reviewed route. A single route commit executes its valid path through the existing engine mechanism, without confirming every ordinary step.

Target selection stages the server-offered target action. Preserve existing guarded smart-action continuation after a reviewed declaration, including the separate route review for distant Blitz/Foul, legal fallback destinations and interruption at required choices or changed legality. Do not add confirmation to every internal engine step.

Required engine response buttons and valid push arrows submit their offered response directly. Bounded multi-player selection retains its selection review and Confirm. End Turn retains the existing unactivated-player warning. Neither keyboard shortcuts nor smart targeting bypass these safeguards.

Disable Confirmed! for no valid proposal, wrong actor, stale revision, disconnect, suspended match, pending mutation or read-only mode. A proposal records canonical target/path and offered IDs, not screen coordinates. Guard double activation; reconcile from the accepted authoritative response and invalidate stale proposals/routes on unrelated revisions. Camera changes alone preserve a still-valid proposal.

### Dice and movement presentation

Use [ivory/cyan](../adr/references/0003-angled-pitch-v4/dice/index.html) block dice and d6. Preserve the six block-face distribution (including Push twice) and d6 pip counts. Display only server-revealed rolls/selected outcomes; the review's deterministic sample results and face-cycling timer are not a randomness source.

The roll effect is short and non-looping (440ms reference, at most 3px translation). The final face and any selectable offered die must correspond to the same authoritative event/choice. Reduced motion reveals the final outcome immediately. Avoid obscuring the acting player and avoid delaying a required choice or a newer state behind a decorative animation.

Movement consumes ordered confirmed transitions, including route pauses/reactions and resumes. Both coaches and spectators observe the same sequence from their own cameras. Reconnect/late subscription starts at the current snapshot; replay seeking restores recorded state rather than replaying engine commands. Reduced motion uses ordered discrete updates.

## Placeholder artwork delivery

Use [team-pixel-sprites](../../.agents/skills/team-pixel-sprites/SKILL.md), the [sprite standard](../../assets/game/standards/team-sprite-standard.md), and the existing accepted Human/Orc palettes and full-size anchors. The requested front/back/directional/prone views explicitly override the standard's default single three-quarter standing pose; record that exception in the batch.

| Human position | Size class | Orc position | Size class |
| --- | --- | --- | --- |
| Lineman | standard | Orc Lineman | standard |
| Blitzer | standard | Orc Blitzer | standard |
| Catcher | standard | Big Un Blocker | standard |
| Thrower | standard | Orc Thrower | standard |
| Ogre | big | Troll | big |
| Halfling | small | Goblin Lineman | small |

Each of the twelve archetypes has these source assets:

1. Upright front.
2. Upright back.
3. Front three-quarter at 45 degrees, horizontally mirrorable about the vertical Y axis for left/right.
4. Back three-quarter at 45 degrees, with the same left/right mirroring.
5. Side profile, mirrorable for the remaining lateral directions.
6. Face-up prone ground pose.
7. Face-down stunned/prone ground pose.
8. Separate head/shoulders portrait of the same character, suitable for inspection now and future team-builder reuse.

This is **84 body sprites and 12 portraits**, representing eight standing directions through five originals plus safe left/right mirrors. Use a mix of male/female archetypes, clear racial and positional silhouettes, simple connected pixel clusters and the established palettes. These are static placeholders, not a request for walk/block/throw animation cycles. Mirror-safe equipment/art has no baked names, numbers or readable text; rendered jersey numbers stay upright.

Prone uses the face-up pose; stunned uses the face-down pose. Distracted and other conditions use explicit status text/badges without changing legality. KO, injured, dead and sent-off players appear in their authoritative dugout category with a portrait/status; additional corpse/injury animation is not required. Unknown states retain an explicit text/token fallback.

Use a default facing toward the opponent's end, with deterministic action/movement-relative facing where supported by observed canonical transitions. Facing is local presentation, not a new engine rule or durable player state. Convert facing relative to the coach camera; do not mirror the entire scene or its labels. Top-down retains the centered upright placeholder style approved in the reference.

Standard/small source exports use a 64×64 canvas, with maximum 60×60 / 46×46 artwork; Ogre/Troll use the standard's 80×80 big-player canvas and maximum 76×76 artwork. Ground-pose and standing anchors are recorded separately. Portraits retain a full-size original and a crisp dedicated UI export; do not enlarge a native 64px body crop into a face portrait.

Preserve originals, exact prompts/references, manifests/alpha bounds/anchors, native and enlarged green-pitch contact sheets, validation and ZIP deliveries in new versioned batches. Promote the selected new pack under versioned canonical master paths, preserving the old pack. Extend the existing team/asset catalog and sync/check pipeline to distinguish archetype, pose, portrait and legacy variants; poses must not accidentally become random player variants. Browser delivery remains generated from `assets/game/`, with strict source/delivery checks.

An unavailable/failed asset falls back to a correctly anchored accessible team/number marker and cannot prevent a legal action. Do not bind player identity to a repeated archetype's name or portrait.

## Implementation slices

1. **Baseline and inventory.** Record existing working-tree ownership/checks, inspect current match actions/prompts and asset contracts, create the tracking issue/local mirror, and define the affected-test manifest. Capture old-view behavior needed for comparison without removing it first.
2. **Projection service.** Extract/adapt verified camera math into production TypeScript with canonical forward/inverse transforms, viewport handling, clipping, visible bounds and camera-relative navigation. Unit-check both ends/projections and boundary cases before wiring mutations.
3. **Art pack and resolver.** Generate representative Human/Orc samples, inspect at native pitch size, then produce the twelve pose/portrait sets. Deliver versioned originals/manifests/previews, extend resolution/sync and verify missing-art behavior.
4. **Live pitch replacement.** Adapt LivePitch/shared match scene to the service and new assets. Reproject setup, movement, routes, ball, push arrows and selection; replace legacy rectangular hit-testing and row ordering. Keep server command and legality paths intact.
5. **Live HUD binding.** Bind names/resources/clocks/turns, inspectors, compact dugouts, action tray/Confirmed!, menus, event log and chat. Reuse the existing player details, clock, team-name fitting and decision logic; remove sample-state dependencies.
6. **Playback, decisions and dice.** Connect the ivory/cyan presentation to authoritative dice/choice events and movement playback, both coach orientations, spectator and replay. Retain guarded route continuation and mandatory prompt handling.
7. **Real-server verification and repairs.** Run the matrix below, repair reachable gameplay/projection dead ends, verify negative permissions/stale commits and compile the acceptance evidence. Fixture-only success is insufficient.
8. **Cutover and outcome.** Make the new scene the default in existing match/spectator/replay entry points, remove the old renderer from normal navigation, retain historical fixtures, and write outcome/remaining hosted-release gates. Do not close work with a partial match or unresolved required local acceptance.

Slices are dependency ordered. Independent art work may proceed while projection work is validated. No unattended step requires repeated aesthetic approval after this handoff; representative native-size art QA is internal. Surface a real blocking requirement or missing external authorization instead of inventing a fallback rule.

## Required verification and evidence

| Gate | Acceptance |
| --- | --- |
| Geometry/input | All canonical cells and centers/corners, both ends, perspective/top-down, pan extremes, resizing and detail zoom; forward/inverse round trips, finite clipping, correct selected player/square, constant camera-relative scale, registered moving stadium and fixed HUD |
| Sprite/state | All twelve positions/all poses/portraits at 1× and integer enlargement; true alpha, uncut body bounds, correct size class/anchors, front/back and mirror-safe facing, prone/stunned, large adjacent players and crowded scrum |
| Setup and kickoff | Both coaches can arrange/confirm legal setups; pitch/reserve and Solid Defence drag/click behavior, rejected occupied/off-pitch drops, coin/receive/kickoff targets and reachable kickoff decisions |
| Planned play | Selection/staging/Confirmed!, adjacent Block and explicit Blitz, distant targets, waypoints/smart spans/manual routes/Undo/Clear, partial/repeated routes, special offered actions and End Turn; no unintended mutation from hover/camera/focus |
| Mandatory choices | Block dice, team/skill rerolls, push/chain push/follow-up, injuries/apothecary, interceptions, skill/opponent reactions and other reachable Human/Orc decisions; no unsupported-dialog dead end in the accepted scope |
| Full match | Genuine Human and Orc match teams; two independent browser coach clients connected to the real server; reach full time through both halves with native accepted decisions, not a fake FULL_TIME response, fixture-only transport or forced result |
| Scenario coverage | Focused real-engine scenarios cover touchdowns/drive reset, turnover, removal/KO/casualty/send-off, reroll/resource use, route interruption/resumption/invalidation and eligible Ogre/Troll/small-player interactions; test seeds may make these reproducible without replacing the native engine |
| Isolation/concurrency | Wrong coach and spectators cannot mutate; stale/fabricated IDs and routes rejected; double confirmation/pending requests guarded; opposite cameras address the same canonical intents and converge on state |
| Continuity | Disconnect/reconnect during a pending decision/route, save/accept/suspend/resume, durable chat/history, computer opponent support, current spectator snapshot, completed result and replay seeking |
| Presentation/accessibility | Selected perspective and top-down from both ends at 1920×1080, 1920×900, 1920×820 and 1280×660; real 100%/200% browser zoom, keyboard-only play/required prompts, focus reveal, text equivalents, reduced motion and unavailable art; narrow viewport retains an operable detail/text fallback |
| Browser/performance | Local Chrome and Edge smoke coverage; declared test machine/browser/viewport, foreground crowded-play and camera observations, input/frame-time/memory evidence; do not reuse old headless timings as new-view acceptance |
| Regression/build | Affected browser/unit/interaction/reconnect/replay tests, browser and hosted-play builds, asset sync/check, relevant site integration tests, appropriate server tests and required project checks; log any pre-existing failures separately |

The full-match harness must exercise UI intents through real transport, observe live authoritative revisions and retained transcripts, and independently assert both coaches/spectator agree. Use an isolated local server/database and dedicated test identities. Preserve existing environments and records; do not copy private account data or print credentials into evidence. If real authentication prevents unattended testing, stop at that concrete blocker rather than substituting a mock.

Collect scenario/seed identifiers, browser/server revisions and versions, assertion results, canonical match IDs suitable for test artifacts, screenshots/short recordings of both views, final result/transcript/replay evidence, rejected-intent checks and asset validation. Save a companion acceptance report and an outcome document beside this spec. An unfinished scenario is a failure/blocker, not an accepted feature limitation.

Use the repository's actual check commands: browser `npm run assets:check`, `npm test`, `npm run test:interaction`, `npm run test:reconnect-ui`, `npm run build` and `npm run build:play`; site `npm run check`, `npm test` and `npm run test:browser`; computer player `npm test`; and final Maven `mvn clean install`. Add the new real-server acceptance runner to the existing test tooling and document its invocation and isolated-server prerequisites. Run focused selectors while developing and the encompassing checks at cutover; avoid repeating a check already covered by an encompassing run unless a later change invalidates it. Browser tooling declares Node 24, while computer-player tooling declares Node 26 or newer: use the respective supported runtime or record and resolve a concrete toolchain constraint, rather than silently changing those contracts. Add a user-facing entry to the latest Java client `ChangeList` for the new match presentation, following repository instructions.

Production stadium refinement, hosted signed-in account acceptance, overtime, additional roster art, adjustable yaw and future team-builder portrait selection are reported separately and do not silently replace a failed required local gate. The owner subsequently authorized commit, push, PR creation, check/fix loops and merge for the reconciliation and each implementation slice. Preserve the repository's existing merge-triggered workflows; a separate manual hosted deployment is not part of this task.

## Unattended execution contract

First reconcile the previously completed UI/reference and gameplay improvements using a new working branch, self-review, tests, staged scoped changes, a standard commit message, a PR, passing automated checks and merge. Then create the new tracking issue and repeat that branch-to-merge cycle for implementation slices. Continue appropriate repair loops without routine approval pauses. Use current repository conventions/toolchains and resolve reversible implementation choices from this spec and ADR. Preserve unrelated work and keep the issue/local mirror current. Do not implement camera preferences as changes to match rules or durable engine state.

The owner permits starting, stopping and restarting dev-local, Google Cloud login for the designated project administrator and resetting Application Default Credentials if needed. Keep credentials and private account data out of evidence. Use that permission only when the local verification path requires it.

Deliver the playable local replacement, the complete twelve-archetype art pack, acceptance evidence and an honest outcome report. After all slices, use the retro skill to compare the outcome with ADR 0003, the specified functional requirements and the owner's intended presentation/playability, and assess improvements to the agent environment. Save and present that retrospective as a Markdown file. Hosted release testing remains open until separately performed.
