# Player movement range perimeters

Status: implemented; automated validation and self-review complete;
owner manual review approved on 2026-10-10, with publication authorized.

Branch: `feat/player-movement-range-perimeters`, based on main `f0857a4e6`.

## Intended behavior

Selecting one on-pitch player displays the effective distance that player can
move. The normal movement perimeter is solid MUTP blue. The full movement
perimeter, including available rushes, is solid MUTP yellow. Both lines are
2.25 pixels wide (75% of the initial width) with 75% stroke opacity. Squares reachable
only with rushes carry a small, slightly transparent light-grey rounded warning
triangle outline with an exclamation mark in the same color. Render these as pitch overlays using the
existing camera projection and theme.

Use authoritative movement allowances and status. Prone players pay the native
standing cost; Jump Up removes it when the native rules allow. Stunned and rooted
players have no movement range. Sprint normally increases the rush allowance
from two squares to three. Movement already spent reduces the current player's
remaining range. Finished active-team players show no range. Inactive-team
inspection forecasts the next activation without spending movement or rolling
dice. These rules follow the match's active/inactive team, regardless of the
viewing coach: either coach sees the same range for the same selected player.

Include every destination reachable by any valid native ordinary movement path,
regardless of the difficulty of required rolls. Exclude special movement modes
such as Leap, Jump and Pogo from this range forecast. Compute the normal set under the effective
normal allowance and the full set under the effective total allowance. A normal
path's existence keeps its destination in the normal set even if native route
ranking also finds a different path that uses rushes. Honor all native bonuses
and restrictions, rather than hardcoding MA plus two/three as the entire rule.
Risk highlighting is a separate feature; this feature's warning triangles
identify rush-only destinations without grading route difficulty.

Refresh after an accepted movement commit reaches its actual destination or an
authoritative interruption stops it. A multi-square committed route refreshes
once at its settled destination, rather than on every playback square. Planned
waypoints do not consume movement. Clear stale overlays when selection, turn,
status, activation eligibility, or connection validity changes. Display only
the selected player's range.

Preserve single-confirmation Move and Blitz, unified routes, right-click undo,
right-drag panning, keyboard input, mandatory decisions, playback, and native
game behavior. Opponent inspection remains read-only; clicking an opponent while
planning an own player's action retains its existing action-target behavior.

## Confirmed decisions

The owner confirmed native ordinary path reachability including difficult valid routes,
all effective native movement bonuses/restrictions, and active/inactive-team
semantics independent of the viewing coach.

After manual review, the owner requested warning markers at about half their
initial size, with no triangle fill and matching grey outline/exclamation colors.
The two range lines show only the outer movement footprint: omit enclosed holes
and bridge occupied-square notches, including adjacent players along a boundary.
Retain exterior indentations caused by native reachability. This is presentation
only; filled footprint cells are not new reachable destinations or warning locations.
The owner's annotated `player-range-markings-corrections.png` shows the intended
perimeters; purple and orange are correction annotations, not replacement colors.

The latest owner refinement makes the blue normal perimeter solid to avoid its
dots mixing visually with wide-zone chalk. Both range lines use 75% of their
initial width and 75% opacity. It also excludes Leap, Jump and Pogo shortcuts
from the forecast, while retaining ordinary movement bonuses and restrictions,
including Jump Up's standing cost and Sprint's rush allowance. Actual special
movement actions remain unchanged.

If rush movement adds no reachable destination, the solid blue normal perimeter
is the limit. Zero-range behavior: omit a perimeter with no reachable destination;
omit all markings when no movement is available.

For example, near a sideline both normal and full reachable sets stop at the
pitch edge, while rushes extend the range elsewhere. Their outlines therefore
share part of that edge. Native
obstructions can also constrain both sets along common segments. The owner
approved normal-range marking alone on shared segments, then reversed
the initial color assignments: shared segments are therefore solid MUTP blue
under the latest line-style refinement.
Solid MUTP yellow marks the remaining full-range perimeter segments. The owner
also approved the three-ticket granularity and blocking edges below.

Three owner-supplied Blood Bowl 3 screenshots are available as visual references
for the ground-plane, square-aligned perimeters and irregular reachable shapes.
Use the owner's requested MUTP colors and warning triangles. Colored square
fills, difficulty numbers, and other risk indicators visible in the screenshots
are outside this feature's scope. Text and video overlays in the references do
not change the owner's instructions.

## Current implementation findings

The UI rollback removed range requests and markings, while retaining the
revision-bound native movement-range read and strict wire decoders. The prior
[#230](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/230) and
[#231](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/231) issue bodies
describe the superseded shaded-square and roll-target presentation. They will
remain unchanged while new tickets track this perimeter design.

The retained native calculator searches paths around occupied squares and
accounts for posture, movement spent, Sprint, and other native allowances.
Its response does not identify normal-budget membership reliably: it contains
one chosen entry step per destination and a total allowance including rushes.
The warning marker must represent a destination outside the normal reachable
set, rather than infer this from an entry roll or geometric distance.

The read-only native forecast also needs rooted-player coverage and explicit
active/inactive-team projection semantics. These are forecast corrections;
actual movement rules and game state must remain unchanged.

## Approved vertical slices

1. [#240: Show movement perimeters for selected active-team players](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/240).
   No blockers. Deliver authoritative normal/full range sets, the two perimeters and rush-only warning
   signs, native posture/skill allowances, and no range for finished or immobile
   players. Include native immutability, wire, and visual tests and a user-facing
   changelist entry.
2. [#241: Inspect inactive-team players with next-turn movement perimeters](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/241).
   Blocked by #240.
   Reuse the range display for next-turn inspection, reset spent movement when
   appropriate, retain posture and native restrictions, and preserve opponent
   action targeting and read-only permissions. Verify both viewing coaches.
3. [#242: Refresh movement perimeters after committed routes](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/242).
   Blocked by #240; independent of #241. Deliver remaining-range refresh at the
   actual endpoint of single and multi-square commits, interruption handling, activation/turn invalidation,
   and stale-response/reconnect protection. Include regression checks for the
   existing Move/Blitz and unified route flows.

GitHub owns ticket state; this document mirrors the ticket links and accepted
decisions. Native GitHub blocking relationships connect #241 and #242 to #240.
The three approved slices are implemented together on the feature branch.

## Delivery and verification

Preserve unrelated working-tree changes and existing repository conventions.
Stay within selected-player movement guidance and route presentation. Run
focused native, protocol, geometry, selection, and browser interaction checks
appropriate to each slice; verify both coach views and supported projections.
Self-review the implementation and provide a manual-review handoff. Do not
commit, push, merge, or deploy without explicit authorization. See the
[validation and manual-review handoff](../verification/player-movement-range-perimeters.md)
for implementation coverage, review findings and rebuild instructions.
