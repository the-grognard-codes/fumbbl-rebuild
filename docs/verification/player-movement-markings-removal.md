# Player movement markings rollback verification

Branch: `feat/move-markings-removal`. Baseline: `c4d411846`.
Spec: [player movement markings removal](../specs/player-movement-markings-removal.md).

## Result

The live match pitch has no own/opponent movement-range shading, adjacent Move or
Jump highlights, route-square risk shading, Dodge/Rush target labels, additional
movement-risk badges, legends or accessible forecast descriptions. The play UI
does not request movement ranges. Native forecast APIs and their strict decoders
remain compatible, and native game decisions and log records retain their checks.

Routes retain their line, arrow and unnumbered waypoint dots. Accessible route
descriptions and debug details list coordinates. Single-confirmation Move and
Blitz, waypoint-span undo and right-drag panning remain intact. Passing guidance,
selection/attack markers, stadium scenery, kickoff and setup guidance remain.

Older illustrative design demos are outside the live match changes from #230–234.

## Automated checks

- `npx.cmd --no-install tsc --noEmit`: passed.
- `npm.cmd run build:play`: passed, including asset synchronization and TypeScript.
- Focused Node tests: **42 passed** across `movement-interaction`,
  `movement-protocol`, `route-protocol`, `route-forecast`, `movement-checks` and
  `v2-client` tests. These retain native wire validation and stale/foreign-plan
  protection while removing the obsolete risk-presentation tests.
- `movement-flow-ui.mjs`: passed. Both coaches select own/opposing players without
  range requests or markings, including off-turn selection. Adjacent/distant Move
  and Blitz still use one confirmation; waypoint-span undo, cancellation, Space
  and repeated-confirm guards pass.
- `route-check-ui.mjs`: passed with native Dodge/Rush/safe-route fixtures in both
  coach views at 30°, 40°, 50° and top-down. No range/risk overlays or fallback
  movement highlights appear, with or without forecast data. Route lines, centered
  dots, canonical input, right-click undo and right-drag panning pass.
- `movement-checks-ui.mjs`: passed for 24 native pickup, ball-contact, reaction and
  Jump fixtures in both coach views at every camera preset. No risk badges or
  labels appear; native fixtures continue to decode.
- `pass-ranges-ui.mjs`: passed for both coaches, every camera preset and all
  weather states. Passing colors/targets and native movement remain available
  without movement overlays.
- `smart-pitch-ui.mjs`: passed. One confirmation still commits a Blitz approach
  and block, followed by the required native die choice.
- `pass-workflow-ui.mjs`: passed for both coaches, retaining movement, pickup,
  reroll, recipient selection and one confirmation of the offered throw.
- `reroll-choices-ui.mjs`: passed for 56 native fixture cases, including skill and
  resource icons, late dice, cameras, keyboard, narrow views, reconnect and retries.
- `native-check-log-ui.mjs`: passed for 36 native trait/check journeys, Pro source
  test chronology, all log controls and reload.
- Hosted production JavaScript/CSS scan: none of the removed range/risk renderer,
  label or legend elements remain in the built artifacts.
- Scoped `git diff --check`: passed.

## Self-review

The repository code-review skill reviewed the scoped uncommitted diff against
`c4d411846` along separate standards and specification axes. No source-code
standards violation or movement/route/Blitz behavior regression was found. Review
identified obsolete range/risk release-note claims and a missing verification
handoff; both are corrected in this change.

Final review: **Standards — 0 remaining findings; Spec — 0 remaining findings.**

Perspective and top-down screenshots of a native Dodge route were inspected
locally: the route line and waypoint dot remain, with no range shading or roll
labels. Scenery and selection remain visible. Local screenshots are under
`browser-client/test-output/movement-markings-removal/` (ignored test artifacts).

The diff leaves native route ranking, action commitment, engine execution and
interruption behavior unchanged. Existing stadium, asset and site work is
preserved. The obsolete coloring criteria in the original movement spec are
marked as superseded. The owner accepted the change after local review and
authorized committing it, opening a PR and merging once checks pass.

## Owner manual review

After rebuilding and publishing:

1. Select own and opposing players in both coach views, including off-turn. Check
   that no movement range or Dodge/Rush target labels appear.
2. Plan adjacent and distant movement, including a route requiring Dodge/Rush.
   Check that only the route line and waypoint dots appear. Confirm with Space or
   Confirmed once and check that native roll decisions and results still appear.
3. Add multiple waypoints; right-click to remove the latest span. Check keyboard
   undo/clear and held right-button panning.
4. Select an own player and opposing target for adjacent and distant Blitzes.
   Confirm once and review the native block-die, reroll, push and follow-up choices.
5. Check passing ranges, selection/target markers and scenery at each camera preset.

The owner accepted the change after local review. Browser interaction checks use
native-exported fixtures and mock transport; they do not replace live engine play.
