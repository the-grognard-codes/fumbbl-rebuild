# Player movement range perimeter verification

Branch: `feat/player-movement-range-perimeters`, based on `f0857a4e6`.
Owner manual review approved on 2026-10-10; publication and merge authorized.
Scope: approved issues [#240](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/240),
[#241](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/241) and
[#242](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/242).

Selecting a player shows solid MUTP blue normal range, solid MUTP yellow full
range and small rounded grey outline warnings in rush-only destinations, with
matching grey exclamation marks. Both lines are 2.25 pixels wide (75% of their
initial width) with 75% stroke opacity. Shared boundary segments show solid blue alone.
The perimeters omit enclosed holes and bridge player-shaped notches without
changing native destinations. The native forecast includes occupied-square
detours without ranking difficulty; Leap, Jump and Pogo shortcuts are excluded.
Actual special movement actions remain unchanged. Current active-team
movement and inactive-team next-activation forecasts are independent of the
viewing coach. Finished, pinned, stunned and otherwise immobile players show no
range. Stand-up cost, Jump Up, Sprint, extra rush bonuses and movement spent are
covered. Kickoff Return and Pass Block use native special movement restrictions;
other special turn modes omit ordinary range guidance.

The UI requests one new range after a committed route settles, including after
an authoritative interruption. Draft waypoints and intermediate playback squares
do not request forecasts. Selection, revisions, mandatory decisions and connection
changes invalidate guidance; superseded successes and errors cannot replace or
erase a newer read. Existing Move/Blitz confirmation, action targeting, routes,
undo, panning and keyboard behavior remain covered by regression checks.

## Automated evidence

| Check | Result | Evidence |
|---|---|---|
| Native route/session/adapter selection after solid-line and ordinary-movement refinements | 45 passed | `.tools/range-solid-walking-native.log`, `ffb-server/target/surefire-reports/` |
| Complete browser unit suite after latest refinements and native fixture regeneration | 251 passed | `.tools/range-solid-walking-browser-unit.log` |
| TypeScript and playable browser bundle after latest refinements | Passed | `.tools/range-solid-walking-build.log` |
| Movement range browser suite after latest refinements | Passed | `.tools/range-solid-walking-ui.log` |
| Movement flow and native pickup/reaction/jump browser regressions after latest refinements | Passed; 24 native check cases | `.tools/range-solid-walking-movement-flow.log`, `.tools/range-solid-walking-movement-checks.log` |
| Outer perimeter geometry after refinements | Six tests passed | `.tools/range-refinement-geometry.log` |
| Existing movement flow and passing ranges after refinements | Two suites passed | `.tools/range-refinement-movement-flow.log`, `.tools/range-refinement-pass-ranges.log` |
| Movement flow browser regression | Passed | `.tools/movement-flow-range.log` |
| Playback, route checks, smart pitch, passing workflow, teammate actions, setup drag, movement checks | Seven suites passed | `.tools/range-regression-*.log` |
| Browser validation inventory | Valid; new suite registered | `tools/validation/browser-shards.json` |
| Complete dev-local browser preflight after passing-mock repair, before perimeter refinements | 37 suites passed; no failures, errors or skips | `.tools/pass-range-full-preflight.log`, `.tools/validation/local-browser-aDLhQY/` |

Native command:

```powershell
mvn -pl ffb-server -am test '-Dtest=RoutePlannerTest,SetupSessionMovementTest,BrowserV2AdapterTest' '-Dsurefire.failIfNoSpecifiedTests=false' -q
```

Browser unit command, from `browser-client`:

```powershell
node --experimental-strip-types --test test/*.test.ts
```

The new browser suite uses exported native range/route snapshots with a controlled
WebSocket transport. It exercises both coach ends, perspective/top-down, blue/yellow
styling, input transparency, read-only selection, late responses/errors, disconnects
and actual single/multi-square playback before the endpoint refresh. Geometry tests
also cover 30/40/50-degree views, holes, empty ranges, shared boundaries and viewport
clipping. The refined display remains available for owner manual review.

The latest owner refinements make both perimeters solid, 75% of the initial
stroke width and 75% opaque. The forecast now searches ordinary adjacent-square
movement only, including legacy Pass Block continuation checks. Native tests
prove that legal Jump, Leap and Pogo shortcuts do not extend current- or next-turn
range, while walking detours still become reachable within the rush allowance.
Jump Up, Sprint, other movement allowances and committed movement remain covered.
The native fixture was regenerated, and the UI obstacle assertion now follows the
selected team rather than assuming one coin-toss winner. An initial concurrent
browser run hit a shared Vite cache rename conflict; the affected suite passed
when rerun sequentially. All final affected checks passed without skips.
Updated paired captures are in `.tools/range-solid-walking-review/`; root visual
review checked perspective and top-down examples. Root code self-review confirmed
that ordinary route previews, native jump action forecasts, movement commits and
perimeter geometry are unchanged by this follow-up. The browser contract retains
the same v2 structure. The latest Java/browser changes require a local rebuild.
The earlier 37-suite preflight was not repeated for these scoped refinements.

The preceding display refinements halve the warning triangle dimensions
and text limit, remove its fill, and match the exclamation color to the outline.
The outer perimeter now omits enclosed holes and bridges occupied boundary notches,
including consecutive players. Geometry checks retain true exterior concavities,
separate reachable regions, shared blue edges and native warning destinations.
The UI suite checks the rendered outline/color/size and absent obstacle edges in
both projections and coach views. Paired captures are in `.tools/range-refinement-review/`.
Root self-review confirmed that footprint bridging affects only the rendered edges;
warning membership still comes from the original full-minus-normal destination sets,
and native forecasting and movement input handlers were not changed. The complete
browser unit suite, TypeScript/bundle checks and three affected UI suites passed
after these refinements. The earlier 37-suite preflight was not repeated for this
presentation-only follow-up.

Optional paired captures are under `.tools/movement-range-review/`. They use the
existing local stadium work and do not approve or modify that unrelated artwork.

One existing paused-Blitz recovery test failed intermittently during the initial
native run, then passed alone and on rerun. The final affected selection passed
43/43 without skipping tests or changing that recovery assertion.

The first owner rebuild exposed a stale `rangeVersion: 1` mock in
`pass-ranges-ui.mjs`: the strict v2 decoder disconnected the mock socket, so the
suite timed out waiting for "Other action". A regression assertion first reproduced
the disconnect; the mock now returns the v2 normal/full destination sets, and the
passing suite passes. It also checks that inspecting the passer leaves the socket
connected and sends no action mutation. The public API range documentation was
updated to match. Production decoding and build validation gates remain unchanged.
The complete preflight was then rerun against this uncommitted working tree and
passed all 10 hosted and 27 interaction suites. This verifies the browser preflight;
the managed local services have not been rebuilt or restarted for this feature.

## Standards

The repository code-review workflow reviewed the scoped working-tree changes
against the branch's fixed base while the work was uncommitted.
One finding was corrected: the older release note contradicted the restored range
display. It now describes only the removed risk colors and roll targets. No other
actionable standards findings remained in the initial review.

## Spec

Review identified and corrected three cases: missing range during active standing-up
actions, ordinary allowances during limited special movements, and a null result
from legacy Pass Block continuation search. The final native checks cover standing
actions, both kickoff halves and skilled legacy players with reachable/unreachable
continuations. Root self-review verified the null-safe native result check and
preservation of ordinary route-preview logic. No identified finding remains open.

Review outcome: one standards finding and three spec findings addressed.

## Manual review and rebuild

The range response is now `rangeVersion: 2`, with authoritative normal/full sets.
Rebuild the Java game service and browser together. The existing local command
does both and runs the mandatory local browser preflight:

```powershell
node tools/dev-local.mjs --restart
```

For hosted delivery, rebuilding Hosting alone does not update the separate Java
game-service VM; it must also run this feature's server code. See the
[deployment guide](../../deployment/README.md).

Suggested manual cases:

1. Select active and inactive-team players from either coach view; clear the own
   selection before inspecting an opponent used as an action target.
2. Compare both coach ends in top-down and each perspective angle. Pan to a
   sideline and check shared edges and grey rush-only warnings.
3. Inspect prone/Jump Up, Sprint, rooted, stunned and finished active-team players.
   Check that Leap/Pogo players use walking reachability and that a legal jump
   shortcut over an occupied square does not extend either perimeter.
4. Commit one square and then a multi-square route. Check the new endpoint and
   remaining range after playback; draft waypoints should leave range unchanged.
5. Exhaust normal movement while rushes remain, finish the activation, and change
   turns. Inspect a player that spent movement on the now-inactive team.
6. Exercise a risky interrupted Move/Blitz, a required decision and reconnect.
   Confirm guidance resumes from the accepted position and existing action controls
   still work.

Unrelated working-tree files were checked against the saved hashes and preserved;
the unrelated changelist entry was preserved byte-for-byte. At the manual-review
handoff, nothing had been staged, committed, pushed, merged or deployed for this
feature. The owner subsequently approved staging, committing, pushing, opening a
PR and merging into main, followed by removal of the local feature branch.
