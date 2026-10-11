# Game phase tracker — tickets and implementation

Date: 2026-10-11.
Branch: `feature/game-phase-tracker`, created from local `main` with a clean working tree.
Status: approved and implemented on 2026-10-11. Automated validation and self-review passed. The owner approved committing, opening a PR and merging after required checks pass. Manual UI validation is owned by the user; no deployment is included.

- [#252 Base drive tracker](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/252) — no blockers.
- [#253 Automatic drive checks](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/253) — blocked by #252.
- [#254 Interactive kickoff rows](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/254) — blocked by #252, independent of #253.

## Feature and confirmed decisions

Help new coaches follow the start of each drive in the current BB2025 MUTP browser UI. Show a vertical stack of bars beneath the receiving team's inducement/resource box, on that team's existing left or right HUD side. Use the turn counter's typography, borders, colors, current-step highlight and completed-step fading. Keep upcoming bars visible in the normal inactive style.

The ordered labels are:

1. Send off secret weapons.
2. Wake up KO's
3. Kicking team setup.
4. Receiving team setup.
5. Choose kick target.
6. Kick off event.
7. Receiving player acts.

Only include the first two rows when players qualified for those checks in this drive. The owner accepts showing these automatic operations as completed from authoritative engine results, without introducing pauses or changing their sequence. Keep applicable completed rows faded until this drive's tracker disappears; do not re-evaluate their original applicability from the post-operation roster.

“Receiving player acts” is the final upcoming cue before the receiving team's first normal turn. Hide the entire tracker as soon as ordinary player actions become available; do not wait for the first submitted action or add a delay to display the final cue.

When High Kick, Solid Defense, Quick Snap or Charge! is rolled, insert its specific row immediately below “Kick off event.” and above “Receiving player acts.” Indent it toward the screen center: rightward in the left stack, leftward in the right stack. Highlight it during that event's decision phase and fade the generic kickoff row. Retain the specific row as completed if a later start-of-drive state remains visible. Do not treat Charge! actions as ordinary receiving-team play. Do not add other named decision rows.

The tracker is presentation only. It must read accepted engine state/results and preserve sequencing, legal actions, command identities, actor permissions and gameplay. Both coaches and spectators should see the same phase information and receiving-team HUD side. Camera direction and the currently acting coach must not determine the tracker side.

The screenshot referenced in the request was not attached to this conversation. The written layout and existing MUTP turn counter are sufficient for these tickets; the screenshot remains optional visual context for manual review.

## Codebase review

- The live HUD already renders turn-counter slots with current/past styling and team resource boxes. Its font is the existing MUTP font. Reuse these conventions rather than creating a separate theme.
- The public projection exposes broad setup/ready/play phases, acting team, legal actions and four kickoff decision presentations. Broad `PLAY` alone does not establish that ordinary play has begun: kickoff decisions also occur within it.
- Secret-weapon send-offs and KO recovery resolve inside end-turn processing before the next public state. They cannot be separately highlighted as live waiting phases under this feature's constraints. Existing accepted native reports include secret-weapon ban outcomes and KO recovery records, and the current transcript-enabled flow persists these with the corresponding revision snapshot. This provides a read-only source for completed rows without changing the sequence. Derivation must identify the current drive and distinguish unavailable older history from a complete history with no applicable checks.
- Additive presentation metadata may be necessary. Keep any server changes limited to reading existing sequence/state/results and publishing display information. Update strict protocol validation together with any public-field additions. Check checkpoint/resume compatibility if metadata must survive recovery; do not infer completed phases from browser visit history.
- The right resource box already has menu controls beneath it. Fit the tracker below that resource area while preserving access to the existing menu, prompts and pitch controls; no broader HUD redesign is included.
- The accepted live-publication and coach-view decisions apply. Preserve permitted viewer projection, canonical team identity and local camera behavior.

Evidence pointers (implementation context, not part of the publishable ticket bodies):

- `browser-client/src/LiveMatchScoreboard.tsx`, `hud-model.ts`, `coach-match.css` and `ui-round-four.css`: existing resource placement, turn styling and menu layout.
- `browser-client/src/setup-protocol.ts` and `match-status.ts`: public-state validation and existing kickoff guidance.
- `ffb-server` BB2025 kickoff sequence generator and end-turn step: native sequence and automatic pre-setup work.
- `ffb-server` match setup session, kickoff presentation and kickoff actions: authoritative public phase/action/event projection.
- `ffb-server` native outcome capture, persisted transcript and `browser-client/src/match-log.ts`: existing capture, recovery and presentation of send-off and KO outcomes.
- Accepted ADRs for active match publication and the coach-oriented pitch.

## Approved breakdown

### 1. Show the start-of-drive tracker for ordinary BB2025 drives

**What to build:** Coaches and spectators can follow kicking setup, receiving setup, kick-target selection and kickoff resolution before ordinary receiving-team play, in a MUTP stack on the receiving team's HUD side. This first slice is demoable on drives with no secret-weapon/KO checks and no interactive kickoff event.

**Blocked by:** None (can start immediately).

**Acceptance criteria:**

- [ ] The current BB2025 browser UI displays the ordered base rows: “Kicking team setup.”, “Receiving team setup.”, “Choose kick target.”, “Kick off event.” and “Receiving player acts.”
- [ ] Current and completed statuses follow authoritative engine sequence/state; upcoming rows retain the inactive style. Automatic transitions may complete between snapshots; no fake waiting phase or engine pause is introduced.
- [ ] Bars reuse the existing turn-counter typography, theme, current highlight and completed fading, with accessible current-step semantics.
- [ ] The tracker appears beneath the receiving team's resource area on its existing HUD side, updates correctly when receiving teams change between drives, and remains on that side while the acting coach changes.
- [ ] It appears during the start-of-drive sequence and disappears when ordinary receiving-team actions become available. The last row is an upcoming cue, not a requirement to wait for the coach's first action.
- [ ] Both coaches and spectators receive consistent presentation; reopening/reconnecting during setup restores the correct tracker without requiring earlier browser history.
- [ ] Existing menus, setup prompts, kick-target input and pitch controls remain usable at supported desktop and narrow layouts. All gameplay and existing UI behavior remain intact.
- [ ] Focused phase/protocol checks and representative browser layout checks pass, code is self-reviewed, and the required user-facing change-list entry is added. Manual acceptance remains with the owner.

### 2. Show applicable secret-weapon and KO checks as completed drive phases

**What to build:** On a later drive with players who qualify for secret-weapon send-off or KO recovery, show the applicable automatic checks at the top of the same tracker as completed rows. Omit checks with no qualifying players.

**Blocked by:** Ticket 1.

**Acceptance criteria:**

- [ ] “Send off secret weapons.” and “Wake up KO's” precede the base rows in that order only when their corresponding checks had qualifying players for this drive.
- [ ] Applicability and completion come from authoritative engine state/results. Neither current post-check player counts nor local UI history are used to guess that the check occurred.
- [ ] A KO recovery check still appears as completed when all recovery rolls fail. Secret-weapon applicability includes an existing send-off check even when an existing rule/inducement prevents the ultimate removal.
- [ ] Applicable rows arrive completed and faded because these operations resolve automatically. Their original applicability remains stable for the rest of that drive's tracker, including a refresh or resume.
- [ ] A new drive resets applicability so rows from a previous drive do not linger. No qualifying players means no corresponding bar or reserved blank space.
- [ ] Any added metadata is presentation only, preserves permitted public views and checkpoint/resume compatibility, and leaves native sequence order, rolls, decisions and game behavior unchanged.
- [ ] Older snapshots/checkpoints without sufficient outcome history remain readable. Unknown applicability does not produce invented completed rows or get classified as a confirmed empty check.
- [ ] Focused checks cover neither/one/both applicable rows, successful and failed KO recovery, the send-off cases supported by BB2025, drive reset and recovery. Code is self-reviewed and manual-review scenarios are documented.

### 3. Track the four interactive kickoff events inside the drive stack

**What to build:** Coaches and spectators can identify and follow High Kick, Solid Defense, Quick Snap and Charge! as specific decision rows within the kickoff portion of the tracker, until the engine completes that event.

**Blocked by:** Ticket 1. Ticket 2 is not a blocker.

**Acceptance criteria:**

- [ ] Rolling High Kick, Solid Defense, Quick Snap or Charge! adds exactly one row with that label between “Kick off event.” and “Receiving player acts.” Other events do not add a named row.
- [ ] The row is indented toward the pitch center on either HUD side; the tracker remains on the receiving team's side even when the kicking coach acts.
- [ ] While the event requires a decision, its specific row receives the current-step highlight and the generic kickoff row is faded.
- [ ] Selection, movement/redeployment, confirmation and event completion follow existing authoritative kickoff presentation/actions. A UI selection or a broad `PLAY` phase cannot prematurely complete the row.
- [ ] Once the event completes, advance to the next existing start-of-drive state. Preserve the completed event row if the tracker is still visible, and hide the entire stack when ordinary receiving-team play becomes available.
- [ ] Charge! movement/Blitz opportunities leave the tracker visible until the kickoff event ends. Existing touchback or other kickoff handling is preserved without adding unrequested rows or altering its decisions.
- [ ] Reconnecting/resuming during selection or movement restores the correct row/status, and the event does not carry into a later drive.
- [ ] Focused state/protocol checks and browser checks exercise all four events, both receiving sides, passive viewers and ordinary-play handoff. Code is self-reviewed and scenarios are ready for owner manual review.

## Publication and completion

Published one GitHub issue per approved ticket, in dependency order, using `ready-for-agent`. Both extension tickets have native blocking links to #252 and reference it in their bodies. No parent issue was supplied; no pre-existing issue was modified or closed. The delivery PR links all three feature tickets and closes them on merge.

The owner approved all three slices and their dependencies and requested implementation with self-review and automated checks. GitHub publication succeeded using the refreshed login outside the sandbox. This document retains the approved issue breakdown, and temporary ticket staging files were removed after publication.

## Implementation and validation

The server publishes optional version-1 `driveTracker` metadata while the native start-of-drive sequence is pending. It reads native steps, the current drive's persisted transcript and pending public native reports before transcript append. It publishes no extra game command and stores no new private engine state or checkpoint envelope field. The browser validates the metadata and renders the stacked bars in the live scoreboard. Older checkpoints without the optional field remain readable.

The tracker reuses turn-counter colors, borders, MUTP typography, completed fading and current-step semantics. It reserves space beneath resources and the existing right-side menu. In short windows, the stack scrolls above the dugout/history and reveals its current phase; narrow setup instructions retain a separate readable area. The latest user-facing change list records the feature.

| Check | Result |
| --- | --- |
| Browser focused phase/protocol/HUD tests | 24 passed |
| `npm.cmd test` in browser-client | 266 passed; no failures or skips |
| `npm.cmd run build:play` in browser-client | TypeScript, asset synchronization and production build passed |
| New drive tracker browser harness | Both receiving sides, 1920×1080 / 1280×720 / 640×330 / 375×300, all four events and all viewer roles, optional rows, current-row visibility, menu/dugout/instruction separation, refresh and normal-play handoff passed |
| Existing coach HUD and Game Menu browser harnesses | Passed |
| Reroll-choice and accounting browser harnesses | 56 and 22 passed; mutation replies are held until pending duplicate input and exact retries have been checked, removing the reported timing failure |
| Validation tooling inventory checks | 15 passed; new browser harness registered in the interaction manifest |
| Server reactor: DriveTrackerPresentationTest, SetupSessionPlacementTest, MatchServiceTest | 35 passed; no failures or skips |
| Native reactor: SetupSessionTest, RecoverySessionTest, SpectatorProjectionTest | 29 passed; no failures or skips; client logic also compiled |
| Self-review and independent correctness review | No remaining actionable findings; queued-step guards and short-window layout issues addressed |
| `git diff --check` | Passed |

Native integration extends the existing test of all kickoff totals (2–12) to check the tracker phase, receiving side, named-event agreement and disappearance before the first ordinary action. Automatic check unit coverage includes failed KO recovery, a handled weapon check, pending native reports and reset between drives. Recovery coverage includes current projections and older checkpoints without the new field. The native suites required normal filesystem access because sandboxed javac could not read an installed dependency jar; the tests passed outside that boundary.

Local screenshots are generated under `test-output/game-phase-tracker/` by the browser harness. They are fixture-based UI evidence, not signed-in hosted play or owner manual acceptance.

Manual validation remains for the owner:

1. Start a BB2025 drive with each receiving team; confirm side placement, base labels, fading and highlight against the turn counter.
2. Start another drive with secret weapons and KOs, including failed recovery; confirm only applicable completed rows remain and reset for subsequent drives.
3. Exercise High Kick, Solid Defense, Quick Snap and Charge!, including selection, redeployment/movement and interrupted decisions; confirm the event row stays current until it completes.
4. Reconnect or resume during setup and a kickoff decision; confirm side, optional checks and event progress are restored.
5. Check desktop and short/narrow windows, stack scrolling, setup instructions and menu/dugout access.
6. Confirm the tracker disappears when ordinary receiving-team actions become available, before submitting the first normal action.
