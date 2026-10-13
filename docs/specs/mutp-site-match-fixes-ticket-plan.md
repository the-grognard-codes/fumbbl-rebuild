# MUTP site and match fixes: ticket plan

Prepared 2026-10-11 on `fix/mutp-site-match-issues`, starting from
`main` at `69924beca9eb8e1f77d93bb0ec0dccb505a40e22`.

Status: ten tickets published on 2026-10-11 as #256-#265, all labelled
`ready-for-agent`. The owner approved the original nine drafts and explicitly
requested the tenth item below.
GitHub is the canonical tracker. This document is the local scope and handoff
mirror. The owner requested one new GitHub issue per numbered observation and
one shared branch. No parent issue was supplied.

Implementation and per-ticket self-validation are recorded in the
[manual validation handoff](../verification/mutp-site-match-fixes.md).
The owner accepted the implemented changes on 2026-10-12 and requested a scoped
commit, pull request and merge after successful checks. Actual local cleanup is
complete, and the owner's DEV/PROD inventories found no saved teams requiring
removal. Deployed timeout configuration and its live boundary await runtime
validation after deployment.

## Confirmed scope and proposed interpretations

- Preserve the owner's original nine-item breakdown and add the tenth reported
  issue as its own ticket. Each ticket delivers a complete,
  independently verifiable behavior; no additional prefactoring ticket is needed.
- No ticket in this batch blocks another. Shared code and related earlier issues
  provide implementation context, rather than mandatory sequencing.
- Idle disconnects occur after about five minutes in both local and deployed
  testing. The owner specified a fifteen-minute idle limit for both.
- The owner requested permanent deletion of obsolete teams in all environments.
  Scope the cleanup to saved teams created under incompatible earlier scaffolds,
  identify the qualifying records in each environment, and preserve current valid
  saved teams, frozen match teams, checkpoints, transcripts, and replays.
- Proposed routing interpretation: prefer a straight line among routes with
  equivalent movement cost and gameplay risk. Explicit waypoints remain binding.
- Proposed right-click priority: holding and dragging pans; a stationary click
  removes the latest waypoint when one exists; otherwise it clears the locally
  selected player and uncommitted proposal. Deselecting an activated player does
  not end its native activation or undo accepted game decisions.
- Existing normal-pass presentation and native rules define the teammate-range
  guidance. Do not invent a browser-only distance or difficulty calculation.
- In the streamlined target-based action flow, selecting an eligible adjacent
  opponent defaults to Block; selecting a distant opponent defaults to Blitz.
  The coach confirms the proposed action before it executes.

## Repository context

The domain glossary distinguishes account-owned **saved teams** from the frozen
**match teams** belonging to existing matches. The accepted team contract allows
saved-team deletion without changing existing match teams. This cleanup is an
owner-requested operation on obsolete scaffold records; the ongoing retention
policy for other retired catalogs remains governed by that contract.

The current top bar contains a permanent My account label plus a second identity
line with smaller typography. Game Menu contains Game Options, Game Settings,
Interface, Key Bindings, and Game Log. The game socket currently configures a
five-minute idle timeout; this matches the observation, but the complete
browser/service/proxy path still needs verification before assigning root cause.

Earlier context includes #115 (pass-range presentation), #130 (held right-button
pitch travel), #153 (proposal cancellation), #162 (Game Menu styling), #188
(Throw/Kick Team Mate activation and teammate confirmation), #233 (waypoints
and right-click undo), and #234 (target-based Blitz confirmation). These tickets
are context, not blockers for the new batch.
The new reports require their own issues as requested by the owner.

Implementation should follow the accepted coach-view projection and server-owned
rules conventions, preserve unrelated changes, run focused verification suited
to each behavior, and record user-visible changes in the latest ChangeList.
For the cleanup, record operational evidence without exposing private account or
game data in GitHub or this mirror. This ticket-preparation task does not perform
the cleanup or implement the product fixes.

## Approved breakdown

| Item | Title | Blocked by | GitHub |
| --- | --- | --- | --- |
| 1 | Show sign-in state as one account link in the MUTP top bar | None | [#256](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/256) |
| 2 | Fit every Game Menu option without horizontal scrolling | None | [#257](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/257) |
| 3 | Award and display both Get the Ref kickoff bribes | None | [#258](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/258) |
| 4 | Allow Throw Team Mate targets on occupied squares | None | [#259](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/259) |
| 5 | Prefer straight movement routes when paths are equivalent | None | [#260](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/260) |
| 6 | Extend idle match connections to fifteen minutes | None | [#261](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/261) |
| 7 | Permanently remove obsolete saved teams from earlier scaffolds | None | [#262](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/262) |
| 8 | Deselect a player with right click while preserving waypoint undo and pitch travel | None | [#263](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/263) |
| 9 | Show Throw Team Mate and Kick Team Mate difficulty ranges | None | [#264](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/264) |
| 10 | Default adjacent opponent targets to Block in the streamlined declaration flow | None | [#265](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/265) |

All ten issues use `ready-for-agent`. Labels and existing open issues were
checked through the authenticated GitHub CLI. No blocking links are required
because all ten tickets are independent. Implementation and product verification
remain open work.

## Ticket 1: Show sign-in state as one account link in the MUTP top bar

### What to build

Make the standardized top bar show a person silhouette followed by Sign in when
signed out, or the signed-in user's email address when signed in. The email is
the account-menu trigger and uses the same typography as other top-bar items.
The current two-line My account/identity presentation should become one line.

### Acceptance criteria

- [ ] Signed-out pages show the person silhouette and Sign in as one top-bar item; activating it enters the existing sign-in flow.
- [ ] Signed-in pages show the person silhouette and the current email as one top-bar item; activating the email exposes the existing account settings menu.
- [ ] Remove the extra My account label and second identity line. Email text matches neighboring navigation items in font family, size, weight, and alignment.
- [ ] Signing in, signing out, and reloading update the shared top-bar state consistently across pages using that header.
- [ ] Keyboard activation, focus behavior, and long email addresses remain usable without breaking the top-bar layout; use synthetic identities in verification evidence.

### Blocked by

None (can start immediately).

## Ticket 2: Fit every Game Menu option without horizontal scrolling

### What to build

Resize and lay out the Game Menu so every tab, option, label, and control is
reachable and readable. Vertical scrolling is permitted when content exceeds
the available height; horizontal scrolling should not be necessary.

### Acceptance criteria

- [ ] All Game Options, Game Settings, Interface, Key Bindings, and Game Log content fits the menu's available width, including the longest labels and existing settings controls.
- [ ] The menu stays within the visible viewport; wrapping and sizing prevent horizontal overflow without clipping or hiding content.
- [ ] Vertical scrolling exposes all content when required, including confirmation controls and the bottom of long logs.
- [ ] Tabs, close control, keyboard focus, and existing options remain usable while the content scrolls.
- [ ] Verify representative supported viewports, all tabs, larger game-log text, and long content. Include visual evidence of the corrected sizing.

### Blocked by

None (can start immediately).

## Ticket 3: Award and display both Get the Ref kickoff bribes

### What to build

When Get the Ref is resolved as a kickoff event, both teams receive the applicable
bribe and see it in their inducement/resource display. The report does not yet
establish whether the failure is in the native award, public projection, or UI;
trace the complete behavior and correct whichever parts are responsible.

### Acceptance criteria

- [ ] A controlled Get the Ref kickoff awards one additional bribe to each team's authoritative state under the applicable ruleset.
- [ ] Existing bribes are retained and incremented correctly; neither team is skipped, and retrying or refreshing does not award the event twice.
- [ ] Both teams' inducement/resource displays show the updated bribe totals immediately after event resolution, with consistent coach and permitted spectator views.
- [ ] The awarded bribes can be used through the native bribe decision flow and consumed correctly.
- [ ] Reconnect and checkpoint/resume preserve the award and its display. Record whether the confirmed defect was issuance, projection, presentation, or a combination.

### Blocked by

None (can start immediately).

## Ticket 4: Allow Throw Team Mate targets on occupied squares

### What to build

Allow a coach resolving Throw Team Mate to select an otherwise legal target
square even when another player occupies it. Occupancy alone must not prevent
target selection or submission. The native rules continue to determine the
throw, scatter, collision, and landing outcome.

### Acceptance criteria

- [ ] An otherwise legal occupied target square can be proposed and confirmed, whether occupied by a friendly or opposing player.
- [ ] Clicking the occupying player's sprite selects the intended square during this targeting step rather than switching to ordinary player selection.
- [ ] Mouse and keyboard targeting agree in both coach views and supported pitch projections.
- [ ] Existing teammate eligibility, range limits, ownership, and turn restrictions remain authoritative; illegal out-of-range or off-pitch targets remain rejected.
- [ ] Verify occupied and empty targets through browser interaction and native resolution, including the subsequent collision/landing behavior without moving the occupant merely to make the target selectable.

### Blocked by

None (can start immediately).

## Ticket 5: Prefer straight movement routes when paths are equivalent

### What to build

Make automatic route planning use straight lines wherever an equally short and
safe straight path is available. A clear horizontal or vertical destination
should not introduce gratuitous diagonal steps or zigzags. Respect the coach's
explicit waypoints and the native movement rules.

### Acceptance criteria

- [ ] On an unobstructed pitch, destinations on the same row or column produce straight routes without diagonal detours.
- [ ] Destinations on a clear diagonal use a direct diagonal route; other destinations avoid unnecessary changes of direction among equivalent alternatives.
- [ ] Straightness is a tie-break preference that preserves existing movement-cost and gameplay-risk priorities, including required dodge/rush checks and reactions.
- [ ] Occupied squares, pitch bounds, explicit waypoints, remaining movement, and required detours continue to determine legal routes.
- [ ] The displayed preview and confirmed movement follow the same selected route. Verify both coach ends and representative obstacles, risk differences, and waypoint cases.

### Blocked by

None (can start immediately).

## Ticket 6: Extend idle match connections to fifteen minutes

### What to build

Replace the approximately five-minute idle disconnect observed in both local
and deployed testing with a fifteen-minute idle window. Align the browser,
game-service, and deployment transport behavior so a quiet connected game does
not time out prematurely.

### Acceptance criteria

- [ ] An authenticated match connection with no user interaction remains usable throughout the first fifteen minutes of inactivity in both local and deployed environments.
- [ ] The effective idle limit is fifteen minutes, and normal accepted activity resets the idle window.
- [ ] No browser, service, or proxy idle limit disconnects the match earlier. Verify the cause and effective configuration along the actual connection path.
- [ ] Idle timeout remains distinct from authentication expiry, explicit disconnect, match pause, and game clocks; existing authorization and token-refresh behavior remain intact.
- [ ] Verify an idle period exceeding the former five-minute limit, the fifteen-minute boundary with reasonable timer tolerance, activity before expiry, and reconnect/resume with unchanged accepted match state.

### Blocked by

None (can start immediately).

## Ticket 7: Permanently remove obsolete saved teams from earlier scaffolds

### What to build

Identify and permanently delete the unusable saved teams created under obsolete
team scaffolds across all environments, as requested by the owner. Establish
the legacy schema/catalog incompatibility that qualifies a record for this
cleanup, rather than deleting teams solely because they are old.

### Acceptance criteria

- [ ] Inventory local, development, production, and any other configured environment containing saved teams, and document the obsolete scaffold/schema/catalog criteria and per-environment counts before deletion.
- [ ] Permanently delete the saved-team records and dependent saved-team-only data that match the obsolete-scaffold criteria. An archive or display-only filter does not satisfy the request.
- [ ] Current valid saved teams remain available to their owners and selectable when creating or joining matches.
- [ ] Frozen match teams, existing match checkpoints, transcripts, results, and replays remain intact and usable after their original obsolete saved team is removed.
- [ ] Verify each environment's team list and builder/play behavior after cleanup, and ensure repeating the cleanup safely reports no remaining qualifying teams.
- [ ] Record sanitized selection criteria, deletion counts, and verification evidence in the ticket and local mirror without publishing credentials, private account identifiers, or private game records.

### Blocked by

None (can start immediately).

## Ticket 8: Deselect a player with right click while preserving waypoint undo and pitch travel

### What to build

Add a short right click on the pitch to clear the locally selected player when
there is no movement waypoint to undo. Preserve right-click waypoint removal
during route planning and held right-button pitch travel. Clearing local
selection must not end an already accepted native activation.

### Acceptance criteria

- [ ] A short stationary right click deselects the locally selected player when no movement waypoint is available to undo, clearing selection highlights and any uncommitted proposal.
- [ ] When a movement path has waypoints, a short right click removes the latest waypoint and refreshes the route without also deselecting the player.
- [ ] Holding the right button and dragging continues to scroll the pitch; release after travel neither removes a waypoint nor deselects the player.
- [ ] The browser context menu is suppressed over the interactive pitch, and the gesture works consistently over player sprites and empty squares in both coach views.
- [ ] Deselecting does not submit a move, spend resources, end a native activation, or dismiss a required server decision. The player can be selected again using the existing eligibility rules.
- [ ] Verify selection, one/multiple/no waypoints, uncommitted proposals, already activated players, required decisions, and pitch travel as distinct input cases.

### Blocked by

None (can start immediately).

## Ticket 9: Show Throw Team Mate and Kick Team Mate difficulty ranges

### What to build

Show pitch range markings and difficulty guidance when choosing the target for
Throw Team Mate or Kick Team Mate. Follow normal pass presentation conventions
while applying the reduced range and action-specific difficulty supplied by
the native rules.

### Acceptance criteria

- [ ] Both teammate actions show range/difficulty guidance at the target-selection stage, using the correct acting player and current position.
- [ ] Markings follow the established normal-pass color, labeling, and interaction conventions while using each teammate action's native range bands, legal limits, and difficulty modifiers.
- [ ] Out-of-range squares are distinguished from legal targets; no normal-pass-only distance band is presented as a legal teammate target.
- [ ] Guidance refreshes after relevant movement, teammate/action selection, or authoritative state changes and clears when targeting ends or becomes invalid.
- [ ] Markings align with canonical pitch squares in both coach views, supported projections, pan, and zoom; they do not intercept square targeting, including occupied squares whenever offered as legal targets.
- [ ] Verify both actions at each native range boundary and with applicable modifiers, and confirm that the displayed guidance agrees with authoritative preview and resolution. Do not show locally invented success percentages.

### Blocked by

None (can start immediately).

## Ticket 10: Default adjacent opponent targets to Block in the streamlined declaration flow

### What to build

In the streamlined declaration flow, selecting a friendly player and then an
eligible adjacent opposing player should propose Block by default. Confirming
performs the block. Automatically propose Blitz only when the targeted opponent
is distant and movement is required to reach a blocking square.

### Acceptance criteria

- [ ] Selecting a friendly player and clicking an adjacent opponent eligible for a block selects and visibly proposes Block by default, including diagonal adjacency in canonical pitch coordinates.
- [ ] Confirming that proposal performs the native Block action against the selected target, without declaring or consuming the team's Blitz or adding movement.
- [ ] Selecting a distant opponent instead defaults to Blitz and retains the streamlined route preview and single-confirmation execution flow.
- [ ] Choosing the player or opponent only proposes the action; it does not execute the block or blitz before confirmation. Changing the target refreshes the inferred mode and clears stale proposals.
- [ ] Native eligibility and action availability remain authoritative. An adjacent target does not become an automatic Blitz merely because Blitz is offered; a legal adjacent Block remains available when the team's Blitz has already been used. An ineligible Block target is not falsely presented as legal.
- [ ] Explicit manual action choices continue to use their existing rules; this change governs automatic action inference and preserves mandatory native decisions.
- [ ] Verify adjacent and distant targets, diagonal adjacency, both coach views, changing targets, an already-used Blitz, unavailable targets, and confirmed native resolution. Record that an adjacent default Block leaves the Blitz allowance unchanged.

### Blocked by

None (can start immediately).
